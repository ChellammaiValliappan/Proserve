import { z } from "zod";
import { randomUUID } from "node:crypto";
import { q, one, tx } from "../db.ts";
import { ApiError, body, json } from "../http.ts";
import { requireAdmin, adminCookie, clearCookie, ADMIN_COOKIE, verifyPassword, hashPassword, type AdminSession } from "../auth.ts";
import { rateLimit } from "../ratelimit.ts";
import { getSettings } from "../settings.ts";
import { cancelOrder, markPaid, releaseExpiredOrders } from "../orders.ts";
import { fetchRazorpayOrderPayments, refundRazorpay } from "../payments.ts";
import { putImage } from "../images.ts";
import { ADMIN_TRANSITIONS } from "../../shared/rules.ts";
import type { Route } from "../router.ts";

const text = (max: number) => z.string().trim().max(max);
const rupeesToPaise = z.number().nonnegative().max(10_000_000).transform((r) => Math.round(r * 100));

async function audit(a: AdminSession, action: string, entity: string, entityId: string | number | null, details?: unknown) {
  await q("INSERT INTO audit_log (admin_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)", [a.id, action, entity, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null]);
}

const productSchema = z.object({
  sku: text(40).optional().nullable(),
  categoryId: text(40).min(1),
  name_ta: text(120).min(1),
  name_en: text(120).min(1),
  packSize: text(40).min(1),
  mrp: rupeesToPaise.nullable().optional(),
  price: z.number().positive().max(10_000_000).transform((r) => Math.round(r * 100)),
  cost: rupeesToPaise.nullable().optional(),
  stock: z.number().int().min(0).max(1_000_000),
  maxPerOrder: z.number().int().positive().max(10_000).nullable().optional(),
  kind: z.enum(["sack", "dal", "oil", "sugar", "flour", "salt"]),
  active: z.boolean(),
  sort: z.number().int().min(0).max(100_000).optional(),
});

function productView(p: any) {
  return {
    id: Number(p.id), sku: p.sku, categoryId: p.category_id, name_ta: p.name_ta, name_en: p.name_en, packSize: p.pack_size,
    mrp: p.mrp_paise, price: p.price_paise, cost: p.cost_paise, stock: p.stock, maxPerOrder: p.max_per_order, kind: p.kind,
    active: p.active, sort: p.sort, image: p.image_key ? `/api/images/${encodeURIComponent(p.image_key)}` : null, updatedAt: p.updated_at,
  };
}

export const adminRoutes: Route[] = [
  ["POST", "/api/admin/login", async (req, ctx) => {
    const b = await body(req, z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(200) }));
    await rateLimit(`admin-login:ip:${ctx.ip}`, 10, 15 * 60);
    await rateLimit(`admin-login:email:${b.email}`, 10, 15 * 60);
    const a = await one("SELECT * FROM admins WHERE email = $1", [b.email]);
    const ok = a && a.active && (await verifyPassword(b.password, a.password_hash));
    if (!ok) throw new ApiError(401, "BAD_LOGIN", "Wrong email or password");
    await q("UPDATE admins SET last_login_at = now() WHERE id = $1", [a.id]);
    return json({ admin: { id: a.id, email: a.email, name: a.name, role: a.role } }, 200, { "set-cookie": await adminCookie(a.id, a.token_version) });
  }],

  ["POST", "/api/admin/logout", async () => json({ ok: true }, 200, { "set-cookie": clearCookie(ADMIN_COOKIE) })],

  ["GET", "/api/admin/me", async (req) => json({ admin: await requireAdmin(req) })],

  ["POST", "/api/admin/password", async (req) => {
    const a = await requireAdmin(req);
    const b = await body(req, z.object({ current: z.string().min(1).max(200), next: z.string().min(10, "Use at least 10 characters").max(200) }));
    const row = await one("SELECT password_hash FROM admins WHERE id = $1", [a.id]);
    if (!(await verifyPassword(b.current, row.password_hash))) throw new ApiError(400, "BAD_PASSWORD", "Current password is wrong");
    // Changing the password logs out every other session (token_version bump)
    const u = await one("UPDATE admins SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING token_version", [a.id, await hashPassword(b.next)]);
    await audit(a, "password_change", "admin", a.id);
    return json({ ok: true }, 200, { "set-cookie": await adminCookie(a.id, u.token_version) });
  }],

  ["GET", "/api/admin/admins", async (req) => {
    await requireAdmin(req, "admin");
    return json({ admins: await q("SELECT id, email, name, role, active, created_at, last_login_at FROM admins ORDER BY id") });
  }],

  ["POST", "/api/admin/admins", async (req) => {
    const a = await requireAdmin(req, "admin");
    const b = await body(req, z.object({ email: z.string().trim().toLowerCase().email().max(120), name: text(80).min(2), role: z.enum(["admin", "staff"]), password: z.string().min(10).max(200) }));
    const exists = await one("SELECT id FROM admins WHERE email = $1", [b.email]);
    if (exists) throw new ApiError(400, "EXISTS", "This email already has an account");
    const n = await one("INSERT INTO admins (email, name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id", [b.email, b.name, b.role, await hashPassword(b.password)]);
    await audit(a, "create", "admin", n.id, { email: b.email, role: b.role });
    return json({ ok: true }, 201);
  }],

  ["POST", "/api/admin/admins/:id/active", async (req, ctx) => {
    const a = await requireAdmin(req, "admin");
    const id = Number(ctx.params.id);
    if (id === a.id) throw new ApiError(400, "SELF", "You cannot disable your own account");
    const { active } = await body(req, z.object({ active: z.boolean() }));
    await q("UPDATE admins SET active = $2, token_version = token_version + 1 WHERE id = $1", [id, active]);
    await audit(a, active ? "enable" : "disable", "admin", id);
    return json({ ok: true });
  }],

  // ---------- Dashboard ----------
  ["GET", "/api/admin/dashboard", async (req) => {
    await requireAdmin(req);
    await releaseExpiredOrders();
    const PAID = "('paid','packing','dispatched','delivered')";
    const [m] = await q(`
      SELECT
        (SELECT count(*) FROM resellers)::int AS resellers,
        (SELECT count(*) FROM resellers WHERE created_at > now() - interval '7 days')::int AS new_resellers_7d,
        (SELECT count(*) FROM orders WHERE status IN ${PAID})::int AS orders,
        (SELECT coalesce(sum(total_paise),0) FROM orders WHERE status IN ${PAID})::bigint AS sales,
        (SELECT count(*) FROM orders WHERE status IN ${PAID} AND created_at::date = (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS orders_today,
        (SELECT coalesce(sum(total_paise),0) FROM orders WHERE status IN ${PAID} AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date)::bigint AS sales_today,
        (SELECT count(*) FROM orders WHERE status = 'paid')::int AS to_pack,
        (SELECT count(*) FROM orders WHERE status = 'packing')::int AS packing,
        (SELECT count(*) FROM orders WHERE status = 'dispatched')::int AS out_for_delivery,
        (SELECT count(*) FROM complaints WHERE status = 'open')::int AS open_complaints,
        (SELECT count(*) FROM orders WHERE refund_status = 'pending')::int AS refunds_pending,
        (SELECT count(*) FROM products WHERE active AND stock <= 5)::int AS low_stock
    `);
    return json({ metrics: { ...m, sales: Number(m.sales), sales_today: Number(m.sales_today) } });
  }],

  ["GET", "/api/admin/reports", async (req) => {
    await requireAdmin(req);
    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 365);
    const PAID = "('paid','packing','dispatched','delivered')";
    const [summary] = await q(`
      WITH paid AS (SELECT * FROM orders WHERE status IN ${PAID} AND created_at > now() - make_interval(days => $1)),
      per_reseller AS (SELECT reseller_id, count(*) AS n FROM orders WHERE status IN ${PAID} GROUP BY reseller_id)
      SELECT
        (SELECT count(*) FROM paid)::int AS orders,
        (SELECT coalesce(sum(total_paise),0) FROM paid)::bigint AS sales,
        (SELECT coalesce(round(avg(total_paise)),0) FROM paid)::bigint AS avg_order,
        (SELECT count(*) FROM paid WHERE subtotal_paise >= (SELECT (value)::int FROM settings WHERE key='free_delivery_paise'))::int AS orders_3000,
        (SELECT count(*) FROM paid WHERE subtotal_paise >= (SELECT (value)::int FROM settings WHERE key='premium_paise'))::int AS orders_5000,
        (SELECT count(*) FROM resellers)::int AS resellers,
        (SELECT count(*) FROM per_reseller WHERE n = 1)::int AS first_time_buyers,
        (SELECT count(*) FROM per_reseller WHERE n > 1)::int AS repeat_buyers,
        (SELECT count(*) FROM paid WHERE status = 'delivered')::int AS delivered,
        (SELECT count(*) FROM orders WHERE status = 'cancelled' AND created_at > now() - make_interval(days => $1))::int AS cancelled,
        (SELECT count(*) FROM complaints WHERE created_at > now() - make_interval(days => $1))::int AS complaints,
        (SELECT count(*) FROM orders WHERE refund_status IS NOT NULL AND created_at > now() - make_interval(days => $1))::int AS refunds,
        (SELECT coalesce(sum(oi.line_total_paise),0) FROM order_items oi JOIN paid ON paid.id = oi.order_id)::bigint AS goods_sales,
        (SELECT coalesce(sum(oi.cost_paise * oi.qty),0) FROM order_items oi JOIN paid ON paid.id = oi.order_id WHERE oi.cost_paise IS NOT NULL)::bigint AS goods_cost,
        (SELECT coalesce(sum(oi.line_total_paise),0) FROM order_items oi JOIN paid ON paid.id = oi.order_id WHERE oi.cost_paise IS NOT NULL)::bigint AS costed_sales
    `, [days]);
    const daily = await q(`
      SELECT to_char((created_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day, count(*)::int AS orders, sum(total_paise)::bigint AS sales
      FROM orders WHERE status IN ${PAID} AND created_at > now() - make_interval(days => $1)
      GROUP BY 1 ORDER BY 1`, [days]);
    const products = await q(`
      SELECT oi.product_id, max(oi.name_en) AS name_en, max(oi.pack_size) AS pack_size, sum(oi.qty)::int AS qty, sum(oi.line_total_paise)::bigint AS sales,
             sum(CASE WHEN oi.cost_paise IS NOT NULL THEN oi.line_total_paise - oi.cost_paise * oi.qty END)::bigint AS margin
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status IN ${PAID} AND o.created_at > now() - make_interval(days => $1)
      GROUP BY oi.product_id ORDER BY sales DESC LIMIT 50`, [days]);
    const resellers = await q(`
      SELECT r.id, r.partner_id, r.name, r.phone, r.area, count(o.id)::int AS orders, coalesce(sum(o.total_paise),0)::bigint AS sales, max(o.created_at) AS last_order
      FROM resellers r JOIN orders o ON o.reseller_id = r.id AND o.status IN ${PAID} AND o.created_at > now() - make_interval(days => $1)
      GROUP BY r.id ORDER BY sales DESC LIMIT 50`, [days]);
    const num = (o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && /^-?\d+$/.test(v) && k !== "day" && k !== "phone" ? Number(v) : v]));
    return json({ days, summary: num(summary), daily: daily.map(num), products: products.map(num), resellers: resellers.map(num) });
  }],

  // ---------- Products, pricing & inventory ----------
  ["GET", "/api/admin/products", async (req) => {
    await requireAdmin(req);
    const [products, categories] = await Promise.all([
      q("SELECT * FROM products ORDER BY sort, id"),
      q("SELECT * FROM categories ORDER BY sort, id"),
    ]);
    return json({ products: products.map(productView), categories });
  }],

  ["POST", "/api/admin/products", async (req) => {
    const a = await requireAdmin(req, "admin");
    const b = await body(req, productSchema);
    const p = await one(
      `INSERT INTO products (sku, category_id, name_ta, name_en, pack_size, mrp_paise, price_paise, cost_paise, stock, max_per_order, kind, active, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,(SELECT coalesce(max(sort),0)+1 FROM products))) RETURNING *`,
      [b.sku || null, b.categoryId, b.name_ta, b.name_en, b.packSize, b.mrp ?? null, b.price, b.cost ?? null, b.stock, b.maxPerOrder ?? null, b.kind, b.active, b.sort ?? null],
    );
    await audit(a, "create", "product", p.id, b);
    return json({ product: productView(p) }, 201);
  }],

  ["PUT", "/api/admin/products/:id", async (req, ctx) => {
    const a = await requireAdmin(req, "admin");
    const b = await body(req, productSchema);
    const before = await one("SELECT price_paise, mrp_paise, stock FROM products WHERE id = $1", [Number(ctx.params.id)]);
    if (!before) throw new ApiError(404, "NOT_FOUND");
    const p = await one(
      `UPDATE products SET sku=$2, category_id=$3, name_ta=$4, name_en=$5, pack_size=$6, mrp_paise=$7, price_paise=$8, cost_paise=$9,
         stock=$10, max_per_order=$11, kind=$12, active=$13, sort=COALESCE($14, sort), updated_at=now() WHERE id=$1 RETURNING *`,
      [Number(ctx.params.id), b.sku || null, b.categoryId, b.name_ta, b.name_en, b.packSize, b.mrp ?? null, b.price, b.cost ?? null, b.stock, b.maxPerOrder ?? null, b.kind, b.active, b.sort ?? null],
    );
    await audit(a, "update", "product", p.id, { before, after: { price: b.price, mrp: b.mrp, stock: b.stock } });
    return json({ product: productView(p) });
  }],

  ["POST", "/api/admin/products/:id/stock", async (req, ctx) => {
    const a = await requireAdmin(req);
    const b = await body(req, z.object({ mode: z.enum(["set", "add"]), value: z.number().int().min(-1_000_000).max(1_000_000) }));
    const p = await one(
      b.mode === "set"
        ? "UPDATE products SET stock = $2, updated_at = now() WHERE id = $1 AND $2 >= 0 RETURNING *"
        : "UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1 AND stock + $2 >= 0 RETURNING *",
      [Number(ctx.params.id), b.value],
    );
    if (!p) throw new ApiError(400, "BAD_STOCK", "Stock cannot go below zero");
    await audit(a, "stock_" + b.mode, "product", p.id, { value: b.value, now: p.stock });
    return json({ product: productView(p) });
  }],

  ["DELETE", "/api/admin/products/:id", async (req, ctx) => {
    const a = await requireAdmin(req, "admin");
    const id = Number(ctx.params.id);
    const used = await one("SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1", [id]);
    if (used) {
      await q("UPDATE products SET active = false, updated_at = now() WHERE id = $1", [id]); // keep history for past orders
      await audit(a, "deactivate", "product", id);
      return json({ ok: true, deactivated: true });
    }
    await q("DELETE FROM products WHERE id = $1", [id]);
    await audit(a, "delete", "product", id);
    return json({ ok: true, deleted: true });
  }],

  ["POST", "/api/admin/products/:id/image", async (req, ctx) => {
    const a = await requireAdmin(req, "admin");
    const b = await body(req, z.object({ dataUrl: z.string().max(700_000) }));
    const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(b.dataUrl);
    if (!m) throw new ApiError(400, "BAD_IMAGE", "Please upload a JPG, PNG or WebP image");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 500_000) throw new ApiError(400, "BAD_IMAGE", "Image is too large (max 500 KB)");
    const id = Number(ctx.params.id);
    const key = `p${id}-${randomUUID().slice(0, 8)}.${m[1].split("/")[1]}`;
    await putImage(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), m[1]);
    const p = await one("UPDATE products SET image_key = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, key]);
    await audit(a, "image", "product", id);
    return json({ product: productView(p) });
  }],

  ["PUT", "/api/admin/categories/:id", async (req, ctx) => {
    const a = await requireAdmin(req, "admin");
    const b = await body(req, z.object({ name_ta: text(80).min(1), name_en: text(80).min(1), active: z.boolean(), sort: z.number().int().min(0).max(1000) }));
    await q("UPDATE categories SET name_ta=$2, name_en=$3, active=$4, sort=$5 WHERE id=$1", [ctx.params.id, b.name_ta, b.name_en, b.active, b.sort]);
    await audit(a, "update", "category", ctx.params.id, b);
    return json({ ok: true });
  }],

  // ---------- Orders, delivery, payments & refunds ----------
  ["GET", "/api/admin/orders", async (req) => {
    await requireAdmin(req);
    await releaseExpiredOrders();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "";
    const search = (url.searchParams.get("q") || "").trim().slice(0, 40);
    const params: unknown[] = [];
    const where: string[] = [];
    if (status === "active") where.push("o.status IN ('paid','packing','dispatched')");
    else if (status === "refunds") where.push("o.refund_status = 'pending'");
    else if (status) { params.push(status); where.push(`o.status = $${params.length}`); }
    else where.push("o.status <> 'expired'");
    if (search) { params.push(`%${search}%`); where.push(`(o.order_no ILIKE $${params.length} OR r.phone ILIKE $${params.length} OR r.name ILIKE $${params.length} OR r.partner_id ILIKE $${params.length})`); }
    const rows = await q(
      `SELECT o.id, o.order_no, o.status, o.total_paise, o.item_count, o.tier, o.expected_delivery, o.revised_delivery, o.created_at, o.refund_status, o.payment_method,
              r.name, r.phone, r.partner_id, o.address->>'area' AS area, o.address->>'pin' AS pin
       FROM orders o JOIN resellers r ON r.id = o.reseller_id
       WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT 200`, params);
    return json({ orders: rows.map((o: any) => ({ ...o, id: Number(o.id) })) });
  }],

  ["GET", "/api/admin/orders/:id", async (req, ctx) => {
    await requireAdmin(req);
    const id = Number(ctx.params.id);
    const o = await one("SELECT o.*, r.partner_id, r.name AS reseller_name, r.phone AS reseller_phone FROM orders o JOIN resellers r ON r.id = o.reseller_id WHERE o.id = $1", [id]);
    if (!o) throw new ApiError(404, "NOT_FOUND");
    const [items, events, payments] = await Promise.all([
      q("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [id]),
      q("SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at", [id]),
      q("SELECT id, provider, provider_order_id, provider_payment_id, amount_paise, status, method, error, created_at FROM payments WHERE order_id = $1 ORDER BY created_at", [id]),
    ]);
    return json({ order: { ...o, id: Number(o.id) }, items, events, payments, nextStatuses: ADMIN_TRANSITIONS[o.status] || [] });
  }],

  ["POST", "/api/admin/orders/:id/status", async (req, ctx) => {
    const a = await requireAdmin(req);
    const id = Number(ctx.params.id);
    const b = await body(req, z.object({ status: z.enum(["packing", "dispatched", "delivered"]), note: text(300).optional(), deliveryPerson: text(80).optional(), deliveryPhone: z.string().regex(/^[0-9+ ]{0,15}$/).optional() }));
    await tx(async (db) => {
      const o = (await db.query<{ status: string }>("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [id])).rows[0];
      if (!o) throw new ApiError(404, "NOT_FOUND");
      if (!(ADMIN_TRANSITIONS[o.status] || []).includes(b.status)) throw new ApiError(400, "BAD_TRANSITION", `Cannot move an order from ${o.status} to ${b.status}`);
      await db.query(
        `UPDATE orders SET status = $2, updated_at = now(),
           delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END,
           delivery_person = COALESCE($3, delivery_person), delivery_phone = COALESCE($4, delivery_phone)
         WHERE id = $1`, [id, b.status, b.deliveryPerson || null, b.deliveryPhone || null]);
      await db.query("INSERT INTO order_events (order_id, status, note, actor) VALUES ($1,$2,$3,$4)", [id, b.status, b.note || null, `admin:${a.email}`]);
    });
    await audit(a, "status", "order", id, b);
    return json({ ok: true });
  }],

  ["POST", "/api/admin/orders/:id/delay", async (req, ctx) => {
    const a = await requireAdmin(req);
    const id = Number(ctx.params.id);
    const b = await body(req, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: text(300).optional() }));
    const u = await one("UPDATE orders SET revised_delivery = $2, updated_at = now() WHERE id = $1 AND status IN ('paid','packing','dispatched') RETURNING id", [id, b.date]);
    if (!u) throw new ApiError(400, "BAD_STATE", "Only active orders can be delayed");
    await q("INSERT INTO order_events (order_id, status, note, actor) VALUES ($1,'delayed',$2,$3)", [id, `New delivery date ${b.date}${b.note ? " – " + b.note : ""}`, `admin:${a.email}`]);
    await audit(a, "delay", "order", id, b);
    return json({ ok: true });
  }],

  ["POST", "/api/admin/orders/:id/cancel", async (req, ctx) => {
    const a = await requireAdmin(req, "admin");
    const id = Number(ctx.params.id);
    const b = await body(req, z.object({ note: text(300).min(2) }));
    const res = await cancelOrder(id, `admin:${a.email}`, b.note, ["pending_payment", "payment_failed", "paid", "packing"]);
    await audit(a, "cancel", "order", id, b);
    return json({ ok: true, ...res });
  }],

  // "Payment deducted but order not confirmed": ask Razorpay directly and recover the order.
  ["POST", "/api/admin/orders/:id/verify-payment", async (req, ctx) => {
    const a = await requireAdmin(req);
    const id = Number(ctx.params.id);
    const pays = await q("SELECT * FROM payments WHERE order_id = $1 AND provider = 'razorpay' ORDER BY created_at DESC", [id]);
    if (!pays.length) throw new ApiError(400, "NO_GATEWAY_PAYMENT", "No online payment was started for this order");
    for (const p of pays) {
      const items = await fetchRazorpayOrderPayments(p.provider_order_id);
      const captured = items.find((i) => i.status === "captured");
      if (captured) {
        const r = await markPaid(id, p.provider_order_id, captured.id, captured.method);
        await audit(a, "verify_payment", "order", id, { found: captured.id });
        return json({ ok: true, found: true, ...r });
      }
    }
    return json({ ok: true, found: false });
  }],

  ["POST", "/api/admin/orders/:id/refund", async (req, ctx) => {
    const a = await requireAdmin(req, "admin");
    const id = Number(ctx.params.id);
    const b = await body(req, z.object({ method: z.enum(["gateway", "manual"]), note: text(300).optional() }));
    const o = await one("SELECT * FROM orders WHERE id = $1", [id]);
    if (!o || o.refund_status !== "pending") throw new ApiError(400, "NO_REFUND_PENDING", "No refund is pending for this order");
    const pay = await one("SELECT * FROM payments WHERE order_id = $1 AND status = 'refund_pending' ORDER BY created_at DESC LIMIT 1", [id]);
    if (b.method === "gateway") {
      if (!pay || pay.provider !== "razorpay" || !pay.provider_payment_id) throw new ApiError(400, "NO_GATEWAY_PAYMENT", "This payment can't be refunded automatically – use manual refund");
      await refundRazorpay(pay.provider_payment_id, pay.amount_paise);
    }
    await tx(async (db) => {
      await db.query("UPDATE orders SET refund_status = 'refunded', updated_at = now() WHERE id = $1", [id]);
      if (pay) await db.query("UPDATE payments SET status = 'refunded', updated_at = now() WHERE id = $1", [pay.id]);
      await db.query("INSERT INTO order_events (order_id, status, note, actor) VALUES ($1,'refunded',$2,$3)", [id, b.note || (b.method === "gateway" ? "Refunded via Razorpay" : "Refunded manually"), `admin:${a.email}`]);
    });
    await audit(a, "refund_" + b.method, "order", id, b);
    return json({ ok: true });
  }],

  // ---------- Resellers ----------
  ["GET", "/api/admin/resellers", async (req) => {
    await requireAdmin(req);
    const search = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 40);
    const rows = await q(
      `SELECT r.id, r.partner_id, r.phone, r.name, r.area, r.pin, r.status, r.created_at, r.last_login_at,
              count(o.id) FILTER (WHERE o.status IN ('paid','packing','dispatched','delivered'))::int AS orders,
              coalesce(sum(o.total_paise) FILTER (WHERE o.status IN ('paid','packing','dispatched','delivered')),0)::bigint AS sales
       FROM resellers r LEFT JOIN orders o ON o.reseller_id = r.id
       WHERE ($1 = '' OR r.phone ILIKE '%'||$1||'%' OR r.name ILIKE '%'||$1||'%' OR r.partner_id ILIKE '%'||$1||'%' OR r.area ILIKE '%'||$1||'%' OR r.pin LIKE $1||'%')
       GROUP BY r.id ORDER BY r.created_at DESC LIMIT 300`, [search]);
    return json({ resellers: rows.map((r: any) => ({ ...r, id: Number(r.id), sales: Number(r.sales) })) });
  }],

  ["POST", "/api/admin/resellers/:id/status", async (req, ctx) => {
    const a = await requireAdmin(req, "admin");
    const { status } = await body(req, z.object({ status: z.enum(["active", "blocked"]) }));
    // Blocking also signs the reseller out everywhere
    await q("UPDATE resellers SET status = $2, token_version = token_version + 1 WHERE id = $1", [Number(ctx.params.id), status]);
    await audit(a, status === "blocked" ? "block" : "unblock", "reseller", ctx.params.id);
    return json({ ok: true });
  }],

  // ---------- Complaints ----------
  ["GET", "/api/admin/complaints", async (req) => {
    await requireAdmin(req);
    const rows = await q(
      `SELECT c.*, r.name, r.phone, r.partner_id, o.order_no FROM complaints c JOIN resellers r ON r.id = c.reseller_id LEFT JOIN orders o ON o.id = c.order_id
       ORDER BY (c.status = 'open') DESC, c.created_at DESC LIMIT 200`);
    return json({ complaints: rows.map((c: any) => ({ ...c, id: Number(c.id), order_id: c.order_id ? Number(c.order_id) : null })) });
  }],

  ["POST", "/api/admin/complaints/:id/resolve", async (req, ctx) => {
    const a = await requireAdmin(req);
    const b = await body(req, z.object({ note: text(500).min(2) }));
    await q("UPDATE complaints SET status = 'resolved', admin_note = $2, resolved_at = now() WHERE id = $1", [Number(ctx.params.id), b.note]);
    await audit(a, "resolve", "complaint", ctx.params.id, b);
    return json({ ok: true });
  }],

  // ---------- Configuration ----------
  ["GET", "/api/admin/settings", async (req) => {
    await requireAdmin(req);
    return json({ settings: await getSettings() });
  }],

  ["PUT", "/api/admin/settings", async (req) => {
    const a = await requireAdmin(req, "admin");
    const b = await body(req, z.object({
      min_order: z.number().int().min(1).max(1_000_000),
      free_delivery: z.number().int().min(1).max(1_000_000),
      premium: z.number().int().min(1).max(1_000_000),
      delivery_fee: z.number().int().min(0).max(10_000),
      serviceable_pins: z.array(z.string().regex(/^[1-9][0-9]{0,5}$/)).min(1).max(500),
      order_cutoff_hour: z.number().int().min(0).max(23),
      no_delivery_weekdays: z.array(z.number().int().min(0).max(6)).max(6),
      cancel_allowed_until: z.enum(["paid", "packing"]),
      support_phone: z.string().regex(/^[0-9+ ]{0,15}$/),
      support_whatsapp: z.string().regex(/^[0-9]{0,15}$/),
    }).refine((v) => v.min_order <= v.free_delivery && v.free_delivery <= v.premium, { message: "Thresholds must be minimum ≤ free delivery ≤ premium" }));
    const values: Record<string, unknown> = {
      min_order_paise: b.min_order * 100,
      free_delivery_paise: b.free_delivery * 100,
      premium_paise: b.premium * 100,
      delivery_fee_paise: b.delivery_fee * 100,
      serviceable_pins: b.serviceable_pins,
      order_cutoff_hour: b.order_cutoff_hour,
      no_delivery_weekdays: b.no_delivery_weekdays,
      cancel_allowed_until: b.cancel_allowed_until,
      support_phone: b.support_phone,
      support_whatsapp: b.support_whatsapp,
    };
    await tx(async (db) => {
      for (const [k, v] of Object.entries(values)) {
        await db.query("INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [k, JSON.stringify(v)]);
      }
    });
    await audit(a, "update", "settings", null, b);
    return json({ settings: await getSettings() });
  }],

  ["GET", "/api/admin/audit", async (req) => {
    await requireAdmin(req, "admin");
    const rows = await q("SELECT l.*, a.email FROM audit_log l LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.created_at DESC LIMIT 200");
    return json({ entries: rows });
  }],
];
