// Cart pricing, order creation and order state changes.
// Prices, stock, delivery fee and tier are ALWAYS computed here from the database – never trusted from the browser.
import { q, tx, type Queryable } from "./db.ts";
import { ApiError } from "./http.ts";
import { getSettings, type AppSettings } from "./settings.ts";
import { deliveryFeeFor, expectedDeliveryDate, isPinServiceable, tierFor } from "../shared/rules.ts";
import type { ResellerSession } from "./auth.ts";

export interface CartLine {
  productId: number;
  qty: number;
}

interface ProductRow {
  id: number;
  name_ta: string;
  name_en: string;
  pack_size: string;
  kind: string;
  price_paise: number;
  mrp_paise: number | null;
  cost_paise: number | null;
  stock: number;
  max_per_order: number | null;
  active: boolean;
}

export interface Quote {
  lines: Array<{ productId: number; name_ta: string; name_en: string; pack_size: string; kind: string; price_paise: number; mrp_paise: number | null; qty: number; line_total_paise: number; stock: number; problem?: "OUT_OF_STOCK" | "LOW_STOCK" | "UNAVAILABLE" | "MAX_PER_ORDER" }>;
  subtotal_paise: number;
  delivery_fee_paise: number;
  total_paise: number;
  tier: string;
  item_count: number;
  ok: boolean;
}

function mergeLines(lines: CartLine[]): CartLine[] {
  const m = new Map<number, number>();
  for (const l of lines) m.set(l.productId, (m.get(l.productId) || 0) + l.qty);
  return [...m.entries()].map(([productId, qty]) => ({ productId, qty }));
}

export async function quoteCart(lines: CartLine[], s?: AppSettings, db?: Queryable, lock = false): Promise<Quote & { _rows: ProductRow[] }> {
  const settings = s || (await getSettings());
  const merged = mergeLines(lines).filter((l) => l.qty > 0);
  const ids = merged.map((l) => l.productId);
  const sql = `SELECT id, name_ta, name_en, pack_size, kind, price_paise, mrp_paise, cost_paise, stock, max_per_order, active
               FROM products WHERE id = ANY($1::bigint[]) ORDER BY id ${lock ? "FOR UPDATE" : ""}`;
  const rows: ProductRow[] = ids.length ? (db ? (await db.query<ProductRow>(sql, [ids])).rows : await q<ProductRow>(sql, [ids])) : [];
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  let subtotal = 0;
  let count = 0;
  let ok = merged.length > 0;
  const out: Quote["lines"] = [];
  for (const l of merged) {
    const p = byId.get(l.productId);
    if (!p || !p.active) {
      ok = false;
      out.push({ productId: l.productId, name_ta: "", name_en: "", pack_size: "", kind: "sack", price_paise: 0, mrp_paise: null, qty: l.qty, line_total_paise: 0, stock: 0, problem: "UNAVAILABLE" });
      continue;
    }
    let problem: Quote["lines"][number]["problem"];
    if (p.stock <= 0) problem = "OUT_OF_STOCK";
    else if (l.qty > p.stock) problem = "LOW_STOCK";
    else if (p.max_per_order && l.qty > p.max_per_order) problem = "MAX_PER_ORDER";
    if (problem) ok = false;
    const line = p.price_paise * l.qty;
    subtotal += line;
    count += l.qty;
    out.push({ productId: Number(p.id), name_ta: p.name_ta, name_en: p.name_en, pack_size: p.pack_size, kind: p.kind, price_paise: p.price_paise, mrp_paise: p.mrp_paise, qty: l.qty, line_total_paise: line, stock: p.stock, problem });
  }
  const fee = deliveryFeeFor(subtotal, settings);
  const tier = tierFor(subtotal, settings);
  if (tier === "below_min") ok = false;
  return { lines: out, subtotal_paise: subtotal, delivery_fee_paise: fee, total_paise: subtotal + fee, tier, item_count: count, ok, _rows: rows };
}

export async function createOrder(r: ResellerSession, lines: CartLine[], idempotencyKey: string, expectedTotal: number) {
  // Double-tap on "Place order" → same idempotency key → return the existing order instead of creating a second one.
  const existing = await q<{ id: number; order_no: string; status: string; total_paise: number }>(
    "SELECT id, order_no, status, total_paise FROM orders WHERE reseller_id = $1 AND idempotency_key = $2",
    [r.id, idempotencyKey],
  );
  if (existing[0]) return { order: existing[0], duplicate: true };

  if (!r.name || !r.address || !r.pin) throw new ApiError(400, "PROFILE_INCOMPLETE", "Please add your name and address first");
  const s = await getSettings();
  if (!isPinServiceable(r.pin, s.serviceable_pins)) throw new ApiError(400, "PIN_NOT_SERVICEABLE", "Sorry, we don't deliver to your PIN code yet");

  await releaseExpiredOrders();

  return tx(async (db) => {
    const quote = await quoteCart(lines, s, db, true);
    if (quote.tier === "below_min") throw new ApiError(400, "BELOW_MINIMUM", "Minimum order not reached", { quote: strip(quote) });
    if (!quote.ok) throw new ApiError(409, "CART_PROBLEM", "Some items are not available in that quantity", { quote: strip(quote) });
    if (quote.total_paise !== expectedTotal) {
      throw new ApiError(409, "PRICE_CHANGED", "Prices have changed. Please check the new total.", { quote: strip(quote) });
    }
    // Reserve stock (conditional update guarantees we never go below zero, even with simultaneous orders)
    for (const l of quote.lines) {
      const upd = await db.query("UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2 AND stock >= $1", [l.qty, l.productId]);
      if (!upd.rowCount) throw new ApiError(409, "CART_PROBLEM", "Some items just went out of stock", { quote: strip(quote) });
    }
    const delivery = expectedDeliveryDate(new Date(), s.order_cutoff_hour, s.no_delivery_weekdays);
    const address = { name: r.name, phone: r.phone, address: r.address, area: r.area, pin: r.pin };
    const ins = await db.query<{ id: number; order_no: string; status: string; total_paise: number }>(
      `INSERT INTO orders (order_no, reseller_id, status, subtotal_paise, delivery_fee_paise, total_paise, tier, item_count, address, expected_delivery, idempotency_key)
       VALUES ('PS-' || nextval('order_no_seq'), $1, 'pending_payment', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, order_no, status, total_paise`,
      [r.id, quote.subtotal_paise, quote.delivery_fee_paise, quote.total_paise, quote.tier, quote.item_count, JSON.stringify(address), delivery, idempotencyKey],
    );
    const order = ins.rows[0];
    const rowById = new Map(quote._rows.map((p) => [Number(p.id), p]));
    for (const l of quote.lines) {
      await db.query(
        `INSERT INTO order_items (order_id, product_id, name_ta, name_en, pack_size, kind, price_paise, mrp_paise, cost_paise, qty, line_total_paise)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [order.id, l.productId, l.name_ta, l.name_en, l.pack_size, l.kind, l.price_paise, l.mrp_paise, rowById.get(l.productId)?.cost_paise ?? null, l.qty, l.line_total_paise],
      );
    }
    await db.query("INSERT INTO order_events (order_id, status, actor) VALUES ($1, 'pending_payment', 'reseller')", [order.id]);
    return { order, duplicate: false };
  });
}

export function strip(qt: Quote & { _rows?: unknown }): Quote {
  const { _rows, ...rest } = qt as any;
  return rest;
}

/** Return reserved stock for an order (once only). */
export async function releaseStock(db: Queryable, orderId: number) {
  const o = await db.query<{ stock_released: boolean }>("SELECT stock_released FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
  if (!o.rows[0] || o.rows[0].stock_released) return;
  await db.query(
    `UPDATE products p SET stock = p.stock + oi.qty, updated_at = now()
     FROM (SELECT product_id, sum(qty) AS qty FROM order_items WHERE order_id = $1 GROUP BY product_id) oi
     WHERE p.id = oi.product_id`,
    [orderId],
  );
  await db.query("UPDATE orders SET stock_released = true WHERE id = $1", [orderId]);
}

/** Unpaid orders older than 30 minutes give their reserved stock back. */
export async function releaseExpiredOrders() {
  const stale = await q<{ id: number }>(
    "SELECT id FROM orders WHERE status IN ('pending_payment','payment_failed') AND created_at < now() - interval '30 minutes' AND NOT stock_released LIMIT 50",
  );
  for (const s of stale) {
    await tx(async (db) => {
      const cur = await db.query<{ status: string }>("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [s.id]);
      if (!cur.rows[0] || !["pending_payment", "payment_failed"].includes(cur.rows[0].status)) return;
      await releaseStock(db, s.id);
      await db.query("UPDATE orders SET status = 'expired', updated_at = now() WHERE id = $1", [s.id]);
      await db.query("INSERT INTO order_events (order_id, status, note, actor) VALUES ($1, 'expired', 'Payment not completed in 30 minutes', 'system')", [s.id]);
    });
  }
}

/** Mark an order paid (idempotent). Used by payment verification, webhook and mock payments. */
export async function markPaid(orderId: number, providerOrderId: string, providerPaymentId: string, method: string | null) {
  return tx(async (db) => {
    const o = await db.query<{ status: string; total_paise: number; stock_released: boolean }>(
      "SELECT status, total_paise, stock_released FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = o.rows[0];
    if (!order) throw new ApiError(404, "NOT_FOUND");
    await db.query(
      "UPDATE payments SET status = 'paid', provider_payment_id = $2, method = $3, updated_at = now() WHERE provider_order_id = $1",
      [providerOrderId, providerPaymentId, method],
    );
    if (["paid", "packing", "dispatched", "delivered"].includes(order.status)) return { already: true };
    if (order.stock_released) {
      // Payment arrived after the order expired: try to re-reserve stock, otherwise flag for refund.
      const items = await db.query<{ product_id: number; qty: number }>("SELECT product_id, qty FROM order_items WHERE order_id = $1", [orderId]);
      let okAll = true;
      for (const it of items.rows) {
        const u = await db.query("UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1", [it.qty, it.product_id]);
        if (!u.rowCount) okAll = false;
      }
      if (!okAll) {
        await db.query("UPDATE orders SET status = 'cancelled', refund_status = 'pending', cancelled_at = now(), updated_at = now(), payment_method = $2 WHERE id = $1", [orderId, method]);
        await db.query("UPDATE payments SET status = 'refund_pending' WHERE provider_order_id = $1", [providerOrderId]);
        await db.query("INSERT INTO order_events (order_id, status, note, actor) VALUES ($1, 'cancelled', 'Paid after expiry but stock unavailable – refund pending', 'system')", [orderId]);
        return { already: false, refundNeeded: true };
      }
      await db.query("UPDATE orders SET stock_released = false WHERE id = $1", [orderId]);
    }
    await db.query("UPDATE orders SET status = 'paid', paid_at = now(), payment_method = $2, updated_at = now() WHERE id = $1", [orderId, method]);
    await db.query("INSERT INTO order_events (order_id, status, actor) VALUES ($1, 'paid', 'payment')", [orderId]);
    return { already: false };
  });
}

export async function markPaymentFailed(orderId: number, providerOrderId: string, error: string) {
  await tx(async (db) => {
    await db.query("UPDATE payments SET status = 'failed', error = $2, updated_at = now() WHERE provider_order_id = $1 AND status = 'created'", [providerOrderId, error.slice(0, 300)]);
    const u = await db.query("UPDATE orders SET status = 'payment_failed', updated_at = now() WHERE id = $1 AND status = 'pending_payment'", [orderId]);
    if (u.rowCount) await db.query("INSERT INTO order_events (order_id, status, note, actor) VALUES ($1, 'payment_failed', $2, 'payment')", [orderId, error.slice(0, 300)]);
  });
}

/** Reseller or admin cancels an order. Reserved stock goes back; paid orders get a pending refund. */
export async function cancelOrder(orderId: number, actor: string, note: string | null, allowedStatuses: string[]) {
  return tx(async (db) => {
    const o = await db.query<{ status: string }>("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
    const cur = o.rows[0];
    if (!cur) throw new ApiError(404, "NOT_FOUND");
    if (!allowedStatuses.includes(cur.status)) throw new ApiError(400, "CANNOT_CANCEL", "This order can no longer be cancelled");
    const wasPaid = ["paid", "packing"].includes(cur.status);
    await releaseStock(db, orderId);
    await db.query(
      "UPDATE orders SET status = 'cancelled', cancelled_at = now(), updated_at = now(), refund_status = $2 WHERE id = $1",
      [orderId, wasPaid ? "pending" : null],
    );
    if (wasPaid) await db.query("UPDATE payments SET status = 'refund_pending', updated_at = now() WHERE order_id = $1 AND status = 'paid'", [orderId]);
    await db.query("INSERT INTO order_events (order_id, status, note, actor) VALUES ($1, 'cancelled', $2, $3)", [orderId, note, actor]);
    return { refundPending: wasPaid };
  });
}
