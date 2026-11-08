// End-to-end API tests against a real Postgres (local). Run: npm test
// Requires DATABASE_URL pointing at a disposable test database with migrations applied.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.APP_ENV ||= "development";
process.env.OTP_MODE ||= "dev";
process.env.PAYMENT_MODE ||= "mock";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret-123";

const { handle } = await import("../server/router.ts");
const { q } = await import("../server/db.ts");
const { hashPassword } = await import("../server/auth.ts");

const BASE = "http://localhost:8888";
function client() {
  const jar: Record<string, string> = {};
  return async (method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) => {
    const headers = new Headers({ "content-type": "application/json", host: "localhost:8888", ...extraHeaders });
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("cookie", cookie);
    const res = await handle(new Request(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), "127.0.0.1");
    for (const c of (res.headers as any).getSetCookie?.() || []) {
      const [kv] = c.split(";");
      const [k, ...v] = kv.split("=");
      jar[k] = v.join("=");
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

const phone = "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");

async function login(api: ReturnType<typeof client>, ph = phone) {
  const o = await api("POST", "/api/auth/otp", { phone: ph });
  assert.equal(o.status, 200);
  assert.match(o.data.devCode, /^\d{4}$/);
  const v = await api("POST", "/api/auth/verify", { phone: ph, code: o.data.devCode });
  assert.equal(v.status, 200);
  return v.data;
}

test("reseller full journey", async () => {
  const api = client();

  // Not logged in
  assert.equal((await api("GET", "/api/catalog")).status, 401);
  // Bad phone
  assert.equal((await api("POST", "/api/auth/otp", { phone: "12345" })).status, 400);

  // Wrong OTP then right OTP
  const o = await api("POST", "/api/auth/otp", { phone });
  const wrong = o.data.devCode === "0000" ? "1111" : "0000";
  assert.equal((await api("POST", "/api/auth/verify", { phone, code: wrong })).data.error, "OTP_WRONG");
  const v = await api("POST", "/api/auth/verify", { phone, code: o.data.devCode });
  assert.equal(v.status, 200);
  assert.equal(v.data.isNew, true);
  assert.match(v.data.me.partnerId, /^PSG-\d{5}$/);

  // Same phone again = same account (no duplicates)
  const again = await login(client());
  assert.equal(again.isNew, false);
  assert.equal(again.me.partnerId, v.data.me.partnerId);

  // Profile with non-serviceable PIN is saved but flagged
  let p = await api("PUT", "/api/me", { name: "Lakshmi", address: "12 Gandhi St", area: "Velachery", pin: "110001" });
  assert.equal(p.data.me.pinServiceable, false);
  p = await api("PUT", "/api/me", { name: "Lakshmi", address: "12 Gandhi St", area: "Velachery", pin: "600042" });
  assert.equal(p.data.me.pinServiceable, true);

  const cat = await api("GET", "/api/catalog");
  assert.equal(cat.status, 200);
  const byName = (n: string) => cat.data.products.find((x: any) => x.name_en === n);
  const toor = byName("Toor Dal");
  const rice = byName("Ponni Rice");
  const moong = byName("Moong Dal");
  assert.equal(moong.stock, 0);

  // Below minimum
  let qt = await api("POST", "/api/cart/quote", { lines: [{ productId: toor.id, qty: 2 }] });
  assert.equal(qt.data.quote.tier, "below_min");
  assert.equal(qt.data.quote.ok, false);
  const below = await api("POST", "/api/orders", { lines: [{ productId: toor.id, qty: 2 }], idempotencyKey: randomUUID(), expectedTotal: qt.data.quote.total_paise });
  assert.equal(below.data.error, "BELOW_MINIMUM");

  // Out of stock
  const oos = await api("POST", "/api/cart/quote", { lines: [{ productId: moong.id, qty: 1 }, { productId: rice.id, qty: 1 }] });
  assert.equal(oos.data.quote.lines.find((l: any) => l.productId === moong.id).problem, "OUT_OF_STOCK");

  // Trial order (delivery fee applies)
  qt = await api("POST", "/api/cart/quote", { lines: [{ productId: rice.id, qty: 1 }] });
  assert.equal(qt.data.quote.tier, "trial");
  assert.ok(qt.data.quote.delivery_fee_paise > 0);

  // Growth: ≥ ₹3,000 → free delivery
  const lines = [{ productId: rice.id, qty: 2 }, { productId: toor.id, qty: 4 }];
  qt = await api("POST", "/api/cart/quote", { lines });
  assert.equal(qt.data.quote.tier, "growth");
  assert.equal(qt.data.quote.delivery_fee_paise, 0);

  // Price tampering → PRICE_CHANGED
  const tamper = await api("POST", "/api/orders", { lines, idempotencyKey: randomUUID(), expectedTotal: 100 });
  assert.equal(tamper.data.error, "PRICE_CHANGED");

  // Place order; double click returns the same order
  const stockBefore = (await q("SELECT stock FROM products WHERE id = $1", [rice.id]))[0].stock;
  const key = randomUUID();
  const ord = await api("POST", "/api/orders", { lines, idempotencyKey: key, expectedTotal: qt.data.quote.total_paise });
  assert.equal(ord.status, 201);
  const dup = await api("POST", "/api/orders", { lines, idempotencyKey: key, expectedTotal: qt.data.quote.total_paise });
  assert.equal(dup.data.duplicate, true);
  assert.equal(dup.data.orderId, ord.data.orderId);
  const stockAfter = (await q("SELECT stock FROM products WHERE id = $1", [rice.id]))[0].stock;
  assert.equal(stockAfter, stockBefore - 2);

  // Another reseller cannot see this order
  const other = client();
  await login(other, "8" + phone.slice(1));
  assert.equal((await other("GET", `/api/orders/${ord.data.orderId}`)).status, 404);

  // Payment fails, then retry succeeds
  let pay = await api("POST", `/api/orders/${ord.data.orderId}/pay`);
  assert.equal(pay.data.mode, "mock");
  await api("POST", `/api/orders/${ord.data.orderId}/mock-pay`, { providerOrderId: pay.data.providerOrderId, outcome: "fail", method: "upi" });
  let detail = await api("GET", `/api/orders/${ord.data.orderId}`);
  assert.equal(detail.data.order.status, "payment_failed");
  pay = await api("POST", `/api/orders/${ord.data.orderId}/pay`);
  const ok = await api("POST", `/api/orders/${ord.data.orderId}/mock-pay`, { providerOrderId: pay.data.providerOrderId, outcome: "success", method: "upi" });
  assert.equal(ok.data.ok, true);
  detail = await api("GET", `/api/orders/${ord.data.orderId}`);
  assert.equal(detail.data.order.status, "paid");
  assert.equal(detail.data.order.items.length, 2);

  // Paying twice is rejected
  assert.equal((await api("POST", `/api/orders/${ord.data.orderId}/pay`)).data.error, "NOT_PAYABLE");

  // Complaint
  const c = await api("POST", "/api/complaints", { orderId: ord.data.orderId, type: "damaged", message: "One packet torn" });
  assert.equal(c.status, 201);

  // Second order, then cancel (stock returned, refund pending)
  const key2 = randomUUID();
  const qt2 = await api("POST", "/api/cart/quote", { lines: [{ productId: rice.id, qty: 1 }] });
  const ord2 = await api("POST", "/api/orders", { lines: [{ productId: rice.id, qty: 1 }], idempotencyKey: key2, expectedTotal: qt2.data.quote.total_paise });
  const pay2 = await api("POST", `/api/orders/${ord2.data.orderId}/pay`);
  await api("POST", `/api/orders/${ord2.data.orderId}/mock-pay`, { providerOrderId: pay2.data.providerOrderId, outcome: "success", method: "card" });
  const before = (await q("SELECT stock FROM products WHERE id = $1", [rice.id]))[0].stock;
  const cancel = await api("POST", `/api/orders/${ord2.data.orderId}/cancel`);
  assert.equal(cancel.data.refundPending, true);
  const after = (await q("SELECT stock FROM products WHERE id = $1", [rice.id]))[0].stock;
  assert.equal(after, before + 1);

  // ---- Admin ----
  const admin = client();
  const email = `admin-${randomUUID().slice(0, 6)}@test.local`;
  await q("INSERT INTO admins (email, name, role, password_hash) VALUES ($1, 'T', 'admin', $2)", [email, await hashPassword("CorrectHorse#1")]);
  assert.equal((await admin("GET", "/api/admin/dashboard")).status, 401);
  assert.equal((await admin("POST", "/api/admin/login", { email, password: "wrong-password" })).status, 401);
  // A reseller cookie cannot open admin APIs
  assert.equal((await api("GET", "/api/admin/dashboard")).status, 401);
  assert.equal((await admin("POST", "/api/admin/login", { email, password: "CorrectHorse#1" })).status, 200);
  const dash = await admin("GET", "/api/admin/dashboard");
  assert.ok(dash.data.metrics.orders >= 1);

  // Fulfilment flow with invalid jump rejected
  const id = ord.data.orderId;
  assert.equal((await admin("POST", `/api/admin/orders/${id}/status`, { status: "delivered" })).data.error, "BAD_TRANSITION");
  assert.equal((await admin("POST", `/api/admin/orders/${id}/status`, { status: "packing" })).status, 200);
  assert.equal((await admin("POST", `/api/admin/orders/${id}/delay`, { date: "2030-01-02", note: "Rain" })).status, 200);
  assert.equal((await admin("POST", `/api/admin/orders/${id}/status`, { status: "dispatched", deliveryPerson: "Ravi", deliveryPhone: "9876500000" })).status, 200);
  assert.equal((await admin("POST", `/api/admin/orders/${id}/status`, { status: "delivered" })).status, 200);
  detail = await api("GET", `/api/orders/${id}`);
  assert.equal(detail.data.order.status, "delivered");
  assert.equal(detail.data.order.delayed, true);

  // Manual refund of the cancelled order
  const ref = await admin("POST", `/api/admin/orders/${ord2.data.orderId}/refund`, { method: "manual", note: "UPI refund" });
  assert.equal(ref.status, 200);

  // Settings: free-delivery threshold change affects quotes
  const s = await admin("GET", "/api/admin/settings");
  const base = { min_order: 1000, free_delivery: 3000, premium: 5000, delivery_fee: 60, serviceable_pins: ["600"], order_cutoff_hour: 20, no_delivery_weekdays: [0], cancel_allowed_until: "paid", support_phone: "", support_whatsapp: "" };
  assert.ok(s.data.settings.min_order_paise);
  assert.equal((await admin("PUT", "/api/admin/settings", { ...base, min_order: 4000 })).status, 400); // min > free
  assert.equal((await admin("PUT", "/api/admin/settings", base)).status, 200);

  // Price change is picked up by next quote
  await admin("PUT", `/api/admin/products/${toor.id}`, { categoryId: "dal", name_ta: toor.name_ta, name_en: "Toor Dal", packSize: "1 kg", mrp: 180, price: 150, cost: 130, stock: 40, kind: "dal", active: true });
  const q3 = await api("POST", "/api/cart/quote", { lines: [{ productId: toor.id, qty: 1 }] });
  assert.equal(q3.data.quote.lines[0].price_paise, 15000);

  // Block reseller → logged out
  const resellers = await admin("GET", `/api/admin/resellers?q=${phone}`);
  const rid = resellers.data.resellers[0].id;
  await admin("POST", `/api/admin/resellers/${rid}/status`, { status: "blocked" });
  assert.equal((await api("GET", "/api/me")).status, 401);
  await admin("POST", `/api/admin/resellers/${rid}/status`, { status: "active" });

  const rep = await admin("GET", "/api/admin/reports?days=30");
  assert.equal(rep.status, 200);
  assert.ok(rep.data.summary.orders >= 1);

  // Cross-site request blocked
  const evil = await api("PUT", "/api/me/lang", { lang: "en" }, { origin: "https://evil.example" });
  assert.equal(evil.status, 403);
});

test("OTP is rate limited", async () => {
  const api = client();
  const ph = "7" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  let last = 0;
  for (let i = 0; i < 7; i++) last = (await api("POST", "/api/auth/otp", { phone: ph })).status;
  assert.equal(last, 429);
});

test("mock payments refused in production", async () => {
  const { paymentMode, otpMode } = await import("../server/env.ts");
  process.env.APP_ENV = "production";
  assert.throws(() => paymentMode());
  assert.throws(() => otpMode());
  process.env.APP_ENV = "development";
});

after(async () => {
  const { pool } = await import("../server/db.ts");
  await (await pool() as any).end?.();
});
