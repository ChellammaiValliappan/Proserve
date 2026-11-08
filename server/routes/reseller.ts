import { z } from "zod";
import { randomUUID } from "node:crypto";
import { q, one } from "../db.ts";
import { ApiError, body, json } from "../http.ts";
import { requireReseller, resellerCookie, clearCookie, RESELLER_COOKIE } from "../auth.ts";
import { sendOtp, verifyOtp } from "../otp.ts";
import { getSettings, publicSettings } from "../settings.ts";
import { quoteCart, createOrder, strip, markPaid, markPaymentFailed, cancelOrder, releaseExpiredOrders } from "../orders.ts";
import { paymentMode } from "../env.ts";
import { createRazorpayOrder, verifyCheckoutSignature, fetchRazorpayOrderPayments } from "../payments.ts";
import { isPinServiceable } from "../../shared/rules.ts";
import { getImage } from "../images.ts";
import type { Route } from "../router.ts";

const phoneSchema = z.string().regex(/^[6-9][0-9]{9}$/, "Enter a valid 10-digit mobile number");
const linesSchema = z.array(z.object({ productId: z.number().int().positive(), qty: z.number().int().min(1).max(500) })).min(1).max(100);
const text = (max: number) => z.string().trim().max(max);

function meView(r: any, s: { serviceable_pins: string[] }) {
  return {
    phone: r.phone,
    partnerId: r.partner_id,
    name: r.name,
    address: r.address,
    area: r.area,
    pin: r.pin,
    lang: r.lang,
    profileComplete: Boolean(r.name && r.address && r.pin),
    pinServiceable: r.pin ? isPinServiceable(r.pin, s.serviceable_pins) : null,
  };
}

async function orderForReseller(resellerId: number, id: number) {
  const o = await one("SELECT * FROM orders WHERE id = $1 AND reseller_id = $2", [id, resellerId]);
  if (!o) throw new ApiError(404, "NOT_FOUND", "Order not found");
  return o;
}

function orderView(o: any, items: any[] = [], events: any[] = []) {
  return {
    id: Number(o.id),
    orderNo: o.order_no,
    status: o.status,
    subtotal: o.subtotal_paise,
    deliveryFee: o.delivery_fee_paise,
    total: o.total_paise,
    tier: o.tier,
    itemCount: o.item_count,
    address: o.address,
    expectedDelivery: o.revised_delivery || o.expected_delivery,
    delayed: Boolean(o.revised_delivery),
    paymentMethod: o.payment_method,
    refundStatus: o.refund_status,
    deliveryPerson: o.delivery_person,
    deliveryPhone: o.delivery_phone,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    deliveredAt: o.delivered_at,
    items: items.map((i) => ({ productId: Number(i.product_id), name_ta: i.name_ta, name_en: i.name_en, pack_size: i.pack_size, kind: i.kind, price: i.price_paise, mrp: i.mrp_paise, qty: i.qty, lineTotal: i.line_total_paise })),
    events: events.map((e) => ({ status: e.status, note: e.note, at: e.created_at })),
  };
}

export const resellerRoutes: Route[] = [
  ["GET", "/api/health", async () => json({ ok: true })],

  ["GET", "/api/config", async () => {
    const s = await getSettings();
    return json({ ...publicSettings(s), paymentMode: paymentMode() });
  }],

  ["POST", "/api/auth/otp", async (req, ctx) => {
    const { phone } = await body(req, z.object({ phone: phoneSchema }));
    const r = await sendOtp(phone, ctx.ip);
    return json({ sent: true, ...(r.devCode ? { devCode: r.devCode } : {}) });
  }],

  ["POST", "/api/auth/verify", async (req) => {
    const { phone, code, lang } = await body(req, z.object({ phone: phoneSchema, code: z.string().regex(/^[0-9]{4}$/), lang: z.enum(["ta", "en"]).optional() }));
    await verifyOtp(phone, code);
    let r = await one("SELECT * FROM resellers WHERE phone = $1", [phone]);
    let isNew = false;
    if (!r) {
      // Duplicate registrations are impossible: phone is UNIQUE, so a racing insert just returns the existing row.
      r = await one(
        `INSERT INTO resellers (phone, lang) VALUES ($1, $2)
         ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING *`,
        [phone, lang || "ta"],
      );
      await q("UPDATE resellers SET partner_id = 'PSG-' || lpad(id::text, 5, '0') WHERE id = $1 AND partner_id IS NULL", [r.id]);
      r = await one("SELECT * FROM resellers WHERE id = $1", [r.id]);
      isNew = true;
    }
    if (r.status !== "active") throw new ApiError(403, "ACCOUNT_BLOCKED", "Your account is blocked. Please contact support.");
    await q("UPDATE resellers SET last_login_at = now() WHERE id = $1", [r.id]);
    const s = await getSettings();
    return json({ me: meView(r, s), isNew }, 200, { "set-cookie": await resellerCookie(Number(r.id), r.token_version) });
  }],

  ["POST", "/api/auth/logout", async () => json({ ok: true }, 200, { "set-cookie": clearCookie(RESELLER_COOKIE) })],

  ["GET", "/api/me", async (req) => {
    const r = await requireReseller(req);
    return json({ me: meView(r, await getSettings()) });
  }],

  ["PUT", "/api/me", async (req) => {
    const r = await requireReseller(req);
    const b = await body(req, z.object({
      name: text(80).min(2),
      address: text(200).min(3),
      area: text(80).min(2),
      pin: z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
      lang: z.enum(["ta", "en"]).optional(),
    }));
    const u = await one(
      "UPDATE resellers SET name = $2, address = $3, area = $4, pin = $5, lang = COALESCE($6, lang) WHERE id = $1 RETURNING *",
      [r.id, b.name, b.address, b.area, b.pin, b.lang ?? null],
    );
    return json({ me: meView(u, await getSettings()) });
  }],

  ["PUT", "/api/me/lang", async (req) => {
    const r = await requireReseller(req);
    const { lang } = await body(req, z.object({ lang: z.enum(["ta", "en"]) }));
    await q("UPDATE resellers SET lang = $2 WHERE id = $1", [r.id, lang]);
    return json({ ok: true });
  }],

  ["GET", "/api/catalog", async (req) => {
    await requireReseller(req);
    const [cats, products] = await Promise.all([
      q("SELECT id, name_ta, name_en, kind, tint FROM categories WHERE active ORDER BY sort, id"),
      q(`SELECT id, category_id, name_ta, name_en, pack_size, mrp_paise, price_paise, stock, max_per_order, kind, image_key
         FROM products WHERE active ORDER BY sort, id`),
    ]);
    return json({
      categories: cats,
      products: products.map((p: any) => ({
        id: Number(p.id), categoryId: p.category_id, name_ta: p.name_ta, name_en: p.name_en, packSize: p.pack_size,
        mrp: p.mrp_paise, price: p.price_paise, stock: p.stock, maxPerOrder: p.max_per_order, kind: p.kind,
        image: p.image_key ? `/api/images/${encodeURIComponent(p.image_key)}` : null,
      })),
    });
  }],

  ["GET", "/api/images/:key", async (_req, ctx) => {
    const key = ctx.params.key;
    if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(key)) throw new ApiError(404, "NOT_FOUND");
    const img = await getImage(key);
    if (!img) throw new ApiError(404, "NOT_FOUND");
    return new Response(img.data, { headers: { "content-type": img.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  }],

  ["POST", "/api/cart/quote", async (req) => {
    await requireReseller(req);
    const { lines } = await body(req, z.object({ lines: z.array(z.object({ productId: z.number().int().positive(), qty: z.number().int().min(1).max(500) })).max(100) }));
    return json({ quote: strip(await quoteCart(lines)) });
  }],

  ["POST", "/api/orders", async (req) => {
    const r = await requireReseller(req);
    const b = await body(req, z.object({ lines: linesSchema, idempotencyKey: z.string().uuid(), expectedTotal: z.number().int().positive() }));
    const { order, duplicate } = await createOrder(r, b.lines, b.idempotencyKey, b.expectedTotal);
    return json({ orderId: Number(order.id), orderNo: order.order_no, status: order.status, total: order.total_paise, duplicate }, duplicate ? 200 : 201);
  }],

  ["GET", "/api/orders", async (req) => {
    const r = await requireReseller(req);
    await releaseExpiredOrders();
    const orders = await q("SELECT * FROM orders WHERE reseller_id = $1 AND status <> 'expired' ORDER BY created_at DESC LIMIT 50", [r.id]);
    return json({ orders: orders.map((o) => orderView(o)) });
  }],

  ["GET", "/api/orders/:id", async (req, ctx) => {
    const r = await requireReseller(req);
    const o = await orderForReseller(r.id, Number(ctx.params.id));
    const [items, events] = await Promise.all([
      q("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [o.id]),
      q("SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at", [o.id]),
    ]);
    return json({ order: orderView(o, items, events) });
  }],

  // Start (or retry) payment for an order
  ["POST", "/api/orders/:id/pay", async (req, ctx) => {
    const r = await requireReseller(req);
    const o = await orderForReseller(r.id, Number(ctx.params.id));
    if (!["pending_payment", "payment_failed"].includes(o.status)) throw new ApiError(400, "NOT_PAYABLE", o.status === "expired" ? "This order expired. Please place it again." : "This order is already paid");
    if (o.stock_released) throw new ApiError(400, "NOT_PAYABLE", "This order expired. Please place it again.");
    const mode = paymentMode();
    if (mode === "mock") {
      const providerOrderId = `mock_${randomUUID()}`;
      await q("INSERT INTO payments (order_id, provider, provider_order_id, amount_paise, status) VALUES ($1, 'mock', $2, $3, 'created')", [o.id, providerOrderId, o.total_paise]);
      return json({ mode, providerOrderId, amount: o.total_paise });
    }
    const { providerOrderId, keyId } = await createRazorpayOrder(o.total_paise, o.order_no);
    await q("INSERT INTO payments (order_id, provider, provider_order_id, amount_paise, status) VALUES ($1, 'razorpay', $2, $3, 'created')", [o.id, providerOrderId, o.total_paise]);
    return json({ mode, providerOrderId, keyId, amount: o.total_paise, orderNo: o.order_no, prefill: { name: r.name, contact: `+91${r.phone}` } });
  }],

  ["POST", "/api/orders/:id/verify", async (req, ctx) => {
    const r = await requireReseller(req);
    const o = await orderForReseller(r.id, Number(ctx.params.id));
    const b = await body(req, z.object({ razorpay_order_id: z.string().max(64), razorpay_payment_id: z.string().max(64), razorpay_signature: z.string().max(256) }));
    const pay = await one("SELECT * FROM payments WHERE provider_order_id = $1 AND order_id = $2", [b.razorpay_order_id, o.id]);
    if (!pay) throw new ApiError(400, "PAYMENT_MISMATCH");
    if (!verifyCheckoutSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) throw new ApiError(400, "PAYMENT_SIGNATURE_INVALID", "Payment could not be verified");
    let method: string | null = null;
    try {
      const ps = await fetchRazorpayOrderPayments(b.razorpay_order_id);
      method = ps.find((p) => p.id === b.razorpay_payment_id)?.method || null;
    } catch {
      /* method is informational only */
    }
    const res = await markPaid(o.id, b.razorpay_order_id, b.razorpay_payment_id, method);
    return json({ ok: true, ...res });
  }],

  // Development-only simulated payment (hard-blocked in production by paymentMode())
  ["POST", "/api/orders/:id/mock-pay", async (req, ctx) => {
    if (paymentMode() !== "mock") throw new ApiError(404, "NOT_FOUND");
    const r = await requireReseller(req);
    const o = await orderForReseller(r.id, Number(ctx.params.id));
    const b = await body(req, z.object({ providerOrderId: z.string().startsWith("mock_"), outcome: z.enum(["success", "fail"]), method: z.enum(["upi", "card", "netbanking"]) }));
    const pay = await one("SELECT * FROM payments WHERE provider_order_id = $1 AND order_id = $2", [b.providerOrderId, o.id]);
    if (!pay) throw new ApiError(400, "PAYMENT_MISMATCH");
    if (b.outcome === "fail") {
      await markPaymentFailed(o.id, b.providerOrderId, "Simulated failure");
      return json({ ok: false });
    }
    const res = await markPaid(o.id, b.providerOrderId, `mockpay_${randomUUID().slice(0, 8)}`, b.method);
    return json({ ok: true, ...res });
  }],

  ["POST", "/api/orders/:id/payment-failed", async (req, ctx) => {
    const r = await requireReseller(req);
    const o = await orderForReseller(r.id, Number(ctx.params.id));
    const b = await body(req, z.object({ providerOrderId: z.string().max(64), reason: z.string().max(300).optional() }));
    const pay = await one("SELECT id FROM payments WHERE provider_order_id = $1 AND order_id = $2", [b.providerOrderId, o.id]);
    if (pay) await markPaymentFailed(o.id, b.providerOrderId, b.reason || "Payment failed");
    return json({ ok: true });
  }],

  ["POST", "/api/orders/:id/cancel", async (req, ctx) => {
    const r = await requireReseller(req);
    const o = await orderForReseller(r.id, Number(ctx.params.id));
    const s = await getSettings();
    const allowed = ["pending_payment", "payment_failed", "paid", ...(s.cancel_allowed_until === "packing" ? ["packing"] : [])];
    const res = await cancelOrder(Number(o.id), "reseller", "Cancelled by partner", allowed);
    return json({ ok: true, ...res });
  }],

  ["POST", "/api/complaints", async (req) => {
    const r = await requireReseller(req);
    const b = await body(req, z.object({
      orderId: z.number().int().positive().optional(),
      type: z.enum(["damaged", "wrong_item", "missing_item", "late", "payment", "other"]),
      message: text(1000).min(3),
    }));
    if (b.orderId) await orderForReseller(r.id, b.orderId);
    const c = await one("INSERT INTO complaints (reseller_id, order_id, type, message) VALUES ($1,$2,$3,$4) RETURNING id, created_at", [r.id, b.orderId ?? null, b.type, b.message]);
    return json({ ok: true, id: Number(c.id) }, 201);
  }],

  ["GET", "/api/complaints", async (req) => {
    const r = await requireReseller(req);
    const rows = await q(
      `SELECT c.id, c.type, c.message, c.status, c.admin_note, c.created_at, o.order_no
       FROM complaints c LEFT JOIN orders o ON o.id = c.order_id WHERE c.reseller_id = $1 ORDER BY c.created_at DESC LIMIT 30`,
      [r.id],
    );
    return json({ complaints: rows });
  }],
];
