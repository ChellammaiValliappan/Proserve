// Razorpay integration (UPI, cards, net banking) using its REST API directly – no SDK needed.
// Payment success is only accepted after verifying Razorpay's HMAC signature on the server.
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.ts";
import { ApiError } from "./http.ts";

function creds() {
  const id = env("RAZORPAY_KEY_ID");
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!id || !secret) throw new ApiError(500, "PAYMENTS_NOT_CONFIGURED", "Online payment is not set up yet");
  return { id, secret };
}

async function rzp(path: string, init: RequestInit = {}) {
  const { id, secret } = creds();
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Razorpay error", res.status, data);
    throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", "Payment service is busy. Please try again.");
  }
  return data as any;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string) {
  const o = await rzp("/orders", { method: "POST", body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, payment_capture: 1 }) });
  return { providerOrderId: o.id as string, keyId: creds().id };
}

export async function fetchRazorpayOrderPayments(providerOrderId: string) {
  const r = await rzp(`/orders/${encodeURIComponent(providerOrderId)}/payments`);
  return (r.items || []) as Array<{ id: string; status: string; method: string; amount: number }>;
}

export async function refundRazorpay(paymentId: string, amountPaise: number) {
  return rzp(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", body: JSON.stringify({ amount: amountPaise }) });
}

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function verifyCheckoutSignature(providerOrderId: string, paymentId: string, signature: string) {
  const { secret } = creds();
  const expected = createHmac("sha256", secret).update(`${providerOrderId}|${paymentId}`).digest("hex");
  return /^[a-f0-9]+$/i.test(signature) && safeEqualHex(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return /^[a-f0-9]+$/i.test(signature) && safeEqualHex(expected, signature);
}
