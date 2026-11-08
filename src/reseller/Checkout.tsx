import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "./store";
import { T, fmtDate } from "../i18n";
import { post, get, ApiFail } from "../api";
import { rupees, expectedDeliveryDate } from "../../shared/rules";
import { Bi, TopBar } from "./ui";
import { IconPin, IconCalendar, IconLock } from "../components/Icons";

declare global {
  interface Window { Razorpay?: any }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Could not load payment window"));
    document.body.appendChild(s);
  });
}

type Method = "upi" | "card" | "netbanking";

/**
 * Checkout. Also used to retry payment for an existing order (/checkout?order=123).
 * Flow: create order (server prices it; idempotency key stops double orders) → open payment → verify on server.
 */
export default function Checkout() {
  const { t, lang, me, cart, totals, config, clearCart, loadCatalog, showToast } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const retryOrderId = params.get("order") ? Number(params.get("order")) : null;
  const [method, setMethod] = useState<Method>("upi");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<{ id: number; total: number; orderNo?: string } | null>(null);
  const [priceQuote, setPriceQuote] = useState<any | null>(null);
  const [mockOpen, setMockOpen] = useState<{ providerOrderId: string } | null>(null);
  const idem = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (retryOrderId) get(`/api/orders/${retryOrderId}`).then((r) => setOrder({ id: r.order.id, total: r.order.total, orderNo: r.order.orderNo })).catch(() => nav("/orders"));
    else if (totals.count === 0) nav("/cart", { replace: true });
  }, [retryOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = order ? order.total : totals.total;
  const delivery = config ? expectedDeliveryDate(new Date(), config.order_cutoff_hour, config.no_delivery_weekdays) : null;

  async function ensureOrder(): Promise<{ id: number; total: number } | null> {
    if (order) return order;
    const lines = Object.entries(cart).map(([productId, qty]) => ({ productId: Number(productId), qty }));
    try {
      const r = await post("/api/orders", { lines, idempotencyKey: idem.current, expectedTotal: priceQuote ? priceQuote.total_paise : totals.total });
      const o = { id: r.orderId, total: r.total, orderNo: r.orderNo };
      setOrder(o);
      clearCart();
      return o;
    } catch (e) {
      if (e instanceof ApiFail && (e.code === "PRICE_CHANGED" || e.code === "CART_PROBLEM")) {
        await loadCatalog().catch(() => undefined);
        if (e.code === "PRICE_CHANGED") {
          setPriceQuote(e.data.quote);
          setErr(`${t(T.priceChanged).p} · ${t(T.priceChanged).s}`);
        } else {
          setErr(`${t(T.stockChanged).p}`);
          window.setTimeout(() => nav("/cart"), 1800);
        }
        idem.current = crypto.randomUUID();
        return null;
      }
      throw e;
    }
  }

  async function pay() {
    setErr(null);
    setBusy(true);
    try {
      const o = await ensureOrder();
      if (!o) return;
      const p = await post(`/api/orders/${o.id}/pay`);
      if (p.mode === "mock") {
        setMockOpen({ providerOrderId: p.providerOrderId });
        return;
      }
      await loadRazorpay();
      await new Promise<void>((resolve) => {
        const rz = new window.Razorpay({
          key: p.keyId,
          amount: p.amount,
          currency: "INR",
          name: "ProServe Grocery Partner",
          description: p.orderNo,
          order_id: p.providerOrderId,
          prefill: { ...p.prefill, method },
          theme: { color: "#1E7B3A" },
          handler: async (resp: any) => {
            try {
              await post(`/api/orders/${o.id}/verify`, resp);
              nav(`/done/${o.id}`, { replace: true });
            } catch {
              // Signature check failed or network issue: the webhook / admin "verify payment" will recover it.
              nav(`/orders/${o.id}`, { replace: true });
            }
            resolve();
          },
          modal: { ondismiss: () => { setErr(t(T.payFailed).p); resolve(); } },
        });
        rz.on("payment.failed", (r: any) => {
          post(`/api/orders/${o.id}/payment-failed`, { providerOrderId: p.providerOrderId, reason: r?.error?.description }).catch(() => undefined);
        });
        rz.open();
      });
    } catch (e) {
      setErr(e instanceof ApiFail ? e.message : t(T.errorGeneric).p);
    } finally {
      setBusy(false);
    }
  }

  async function mockResult(outcome: "success" | "fail") {
    if (!order || !mockOpen) return;
    setBusy(true);
    try {
      const r = await post(`/api/orders/${order.id}/mock-pay`, { providerOrderId: mockOpen.providerOrderId, outcome, method });
      setMockOpen(null);
      if (r.ok) nav(`/done/${order.id}`, { replace: true });
      else setErr(`${t(T.payFailed).p} · ${t(T.payFailed).s}`);
    } catch (e) {
      setErr(e instanceof ApiFail ? e.message : t(T.errorGeneric).p);
    } finally {
      setBusy(false);
    }
  }

  const methods: Array<{ id: Method; logo: string; pair: readonly [string, string]; note?: string }> = [
    { id: "upi", logo: "UPI", pair: ["UPI — GPay, PhonePe, Paytm", "UPI — GPay, PhonePe, Paytm"], note: lang === "ta" ? "பரிந்துரை · Recommended" : "Recommended" },
    { id: "card", logo: "CARD", pair: ["டெபிட் / கிரெடிட் கார்டு", "Debit / Credit card"] },
    { id: "netbanking", logo: "BANK", pair: ["நெட் பேங்கிங்", "Net banking"] },
  ];

  return (
    <main className="screen" style={{ paddingBottom: 0 }}>
      <TopBar title={T.confirmPay} back={retryOrderId ? `/orders/${retryOrderId}` : "/cart"} />
      <div className="stack" style={{ padding: "14px 16px", flex: 1 }}>
        <div className="card row" style={{ alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--green-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconPin stroke="#1E7B3A" /></div>
          <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="small muted strong">{t(T.deliverTo).p} · {t(T.deliverTo).s}</span>
            <span className="strong">{me?.name} · +91 {me?.phone}</span>
            <span style={{ fontSize: 14, lineHeight: 1.35 }}>{[me?.address, me?.area].filter(Boolean).join(", ")} – {me?.pin}</span>
          </div>
          {!order && <Link className="link-btn" to="/profile/edit">{t(T.change).p}</Link>}
        </div>
        {delivery && (
          <div className="notice info">
            <IconCalendar size={32} stroke="#8A5A00" />
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 17 }}>{t(T.deliveryOn).p} · {fmtDate(delivery, lang)}</span><span className="small" style={{ fontWeight: 500 }}>{t(T.deliveryOn).s}</span></span>
          </div>
        )}
        <div className="card bill">
          {!order && <div className="line"><span>{t(T.items).p} ({totals.count})</span><strong>{rupees(priceQuote ? priceQuote.subtotal_paise : totals.subtotal)}</strong></div>}
          {!order && <div className="line"><span>{t(T.deliveryFee).p}</span><strong>{(priceQuote ? priceQuote.delivery_fee_paise : totals.fee) === 0 ? t(T.free).p : rupees(priceQuote ? priceQuote.delivery_fee_paise : totals.fee)}</strong></div>}
          {order?.orderNo && <div className="line"><span>{t(T.orderNo).p}</span><strong>{order.orderNo}</strong></div>}
          <div className="line small muted"><span>{t(T.gst).p}</span></div>
          <hr />
          <div className="line" style={{ alignItems: "baseline" }}><span className="strong">{t(T.toPay).p}</span><span className="total" style={{ fontSize: 24 }}>{rupees(priceQuote ? priceQuote.total_paise : total)}</span></div>
        </div>
        <h2 style={{ fontSize: 20, marginTop: 4 }}>{t(T.payWith).p} <span className="small muted" style={{ fontWeight: 500 }}>· {t(T.payWith).s}</span></h2>
        {methods.map((m) => (
          <button key={m.id} className="pay-opt" aria-pressed={method === m.id} onClick={() => setMethod(m.id)}>
            <span className="logo">{m.logo}</span>
            <span className="grow" style={{ display: "flex", flexDirection: "column" }}><span className="strong" style={{ fontSize: 17 }}>{t(m.pair).p}</span><span className="tiny muted">{m.note || t(m.pair).s}</span></span>
            <span className="radio"><i /></span>
          </button>
        ))}
        <div className="row tiny" style={{ justifyContent: "center", color: "#4A584D" }}><IconLock size={16} stroke="#1E7B3A" />{t(T.secure).p} · {t(T.secure).s}</div>
        {err && <div className="notice err" role="alert">{err}</div>}
      </div>
      <div className="action-bar">
        <button className="btn pay big block" disabled={busy} onClick={pay}>
          {busy ? t(T.paying).p : <Bi pair={[`${rupees(priceQuote ? priceQuote.total_paise : total)} ${T.pay[0]}`, `${T.pay[1]} ${rupees(priceQuote ? priceQuote.total_paise : total)}`]} />}
        </button>
      </div>

      {mockOpen && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Test payment">
          <div className="modal">
            <div className="notice info">TEST MODE – no real money. Real UPI/card payments start once Razorpay keys are added.</div>
            <h2 style={{ fontSize: 22 }}>{rupees(total)} · {methods.find((m) => m.id === method)?.logo}</h2>
            <button className="btn primary big" disabled={busy} onClick={() => mockResult("success")}>Simulate success</button>
            <button className="btn danger" disabled={busy} onClick={() => mockResult("fail")}>Simulate failure</button>
            <button className="link-btn" onClick={() => { setMockOpen(null); showToast(t(T.payFailed).p); }}>Close</button>
          </div>
        </div>
      )}
    </main>
  );
}
