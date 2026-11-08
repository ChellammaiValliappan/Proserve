// Razorpay webhook: confirms payments even if the customer closed the app before returning
// ("payment deducted but order not confirmed" recovery). Verified by HMAC signature.
import { one } from "../db.ts";
import { json } from "../http.ts";
import { verifyWebhookSignature } from "../payments.ts";
import { markPaid, markPaymentFailed } from "../orders.ts";
import type { Route } from "../router.ts";

export const webhookRoutes: Route[] = [
  ["POST", "/api/payments/webhook", async (req) => {
    const raw = await req.text();
    const sig = req.headers.get("x-razorpay-signature") || "";
    if (raw.length > 200_000 || !verifyWebhookSignature(raw, sig)) return json({ error: "BAD_SIGNATURE" }, 400);
    const evt = JSON.parse(raw);
    const p = evt?.payload?.payment?.entity;
    if (!p?.order_id) return json({ ok: true });
    const pay = await one<{ order_id: number; amount_paise: number }>("SELECT order_id, amount_paise FROM payments WHERE provider_order_id = $1", [p.order_id]);
    if (!pay) return json({ ok: true });
    if ((evt.event === "payment.captured" || evt.event === "order.paid") && p.amount === pay.amount_paise) {
      await markPaid(Number(pay.order_id), p.order_id, p.id, p.method || null);
    } else if (evt.event === "payment.failed") {
      await markPaymentFailed(Number(pay.order_id), p.order_id, p.error_description || "Payment failed");
    }
    return json({ ok: true });
  }],
];
