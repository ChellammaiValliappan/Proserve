// Business rules shared by the browser app and the API.
// The API is always the source of truth: the app uses these only to show
// live hints (e.g. "₹860 more for free delivery"); the server recalculates everything.

export interface PricingSettings {
  min_order_paise: number;
  free_delivery_paise: number;
  premium_paise: number;
  delivery_fee_paise: number;
}

export type Tier = "below_min" | "trial" | "growth" | "premium";

export function tierFor(subtotal: number, s: PricingSettings): Tier {
  if (subtotal < s.min_order_paise) return "below_min";
  if (subtotal >= s.premium_paise) return "premium";
  if (subtotal >= s.free_delivery_paise) return "growth";
  return "trial";
}

export function deliveryFeeFor(subtotal: number, s: PricingSettings): number {
  if (subtotal <= 0) return 0;
  return subtotal >= s.free_delivery_paise ? 0 : s.delivery_fee_paise;
}

export const ORDER_STATUSES = [
  "pending_payment",
  "payment_failed",
  "paid",
  "packing",
  "dispatched",
  "delivered",
  "cancelled",
  "expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed admin status transitions (fulfilment flow). */
export const ADMIN_TRANSITIONS: Record<string, OrderStatus[]> = {
  paid: ["packing", "cancelled"],
  packing: ["dispatched", "cancelled"],
  dispatched: ["delivered"],
};

/** Format paise as Indian rupees, e.g. 124000 -> "₹1,240". */
export function rupees(paise: number): string {
  const r = paise / 100;
  return "₹" + r.toLocaleString("en-IN", { maximumFractionDigits: r % 1 === 0 ? 0 : 2 });
}

/**
 * Expected delivery date (IST): next day, or the day after if ordered after the cut-off hour,
 * skipping configured no-delivery weekdays. Returns YYYY-MM-DD.
 */
export function expectedDeliveryDate(now: Date, cutoffHour: number, noDeliveryWeekdays: number[]): string {
  const istMs = now.getTime() + 5.5 * 3600 * 1000;
  const ist = new Date(istMs);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  let add = ist.getUTCHours() >= cutoffHour ? 2 : 1;
  d.setUTCDate(d.getUTCDate() + add);
  let guard = 0;
  while (noDeliveryWeekdays.includes(d.getUTCDay()) && guard++ < 7) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function isPinServiceable(pin: string, serviceable: string[]): boolean {
  if (!/^[1-9][0-9]{5}$/.test(pin)) return false;
  return serviceable.some((p) => p && pin.startsWith(p));
}
