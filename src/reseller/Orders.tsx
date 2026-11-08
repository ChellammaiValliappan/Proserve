import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "./store";
import { T, fmtDate } from "../i18n";
import { get, post, ApiFail } from "../api";
import { rupees } from "../../shared/rules";
import { BottomNav, Spinner, StatusPill, TopBar, Thumb, ErrorBox } from "./ui";
import { IconCheck, IconTruck, IconList } from "../components/Icons";

export function OrderDone() {
  const { id } = useParams();
  const { t, lang } = useStore();
  const [o, setO] = useState<any>(null);
  useEffect(() => { get(`/api/orders/${id}`).then((r) => setO(r.order)).catch(() => undefined); }, [id]);
  return (
    <main className="done-screen">
      <div className="stack center" style={{ alignItems: "center", padding: "64px 24px 32px", gap: 10 }}>
        <div className="check-circle"><IconCheck size={64} stroke="#1E7B3A" /></div>
        <h1 style={{ fontSize: 32, marginTop: 8 }}>{t(T.placed).p}</h1>
        <span style={{ opacity: 0.9 }}>{t(T.placed).s}</span>
      </div>
      {o ? (
        <div className="card stack" style={{ margin: "0 20px", color: "var(--ink)", borderRadius: 22, padding: 18 }}>
          <div className="row between"><span className="muted">{t(T.orderNo).p}</span><strong>{o.orderNo}</strong></div>
          <div className="row between"><span className="muted">{t(T.paid).p}</span><strong>{rupees(o.total)}</strong></div>
          <hr style={{ border: 0, height: 1, background: "var(--line)", width: "100%", margin: 0 }} />
          <div className="row" style={{ gap: 12 }}>
            <IconTruck size={34} stroke="#8A5A00" />
            <div style={{ display: "flex", flexDirection: "column" }}><span className="strong" style={{ fontSize: 18 }}>{t(T.deliveryOn).p}</span><span className="small muted">{fmtDate(o.expectedDelivery, lang)}</span></div>
          </div>
        </div>
      ) : <Spinner />}
      <div className="stack" style={{ padding: 20 }}>
        <Link className="btn pay big" to={`/orders/${id}`}>{t(T.track).p} · {t(T.track).s}</Link>
        <Link className="btn" style={{ border: "2px solid rgba(255,255,255,.7)", color: "#fff" }} to="/">{t(T.shopMore).p} · {t(T.shopMore).s}</Link>
      </div>
    </main>
  );
}

export function Orders() {
  const { t, lang } = useStore();
  const [orders, setOrders] = useState<any[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { setFailed(false); get("/api/orders").then((r) => setOrders(r.orders)).catch(() => setFailed(true)); }, []);
  useEffect(load, [load]);
  return (
    <>
      <main className="screen">
        <TopBar title={T.myOrders} />
        {failed ? <ErrorBox onRetry={load} /> : !orders ? <Spinner /> : orders.length === 0 ? (
          <div className="stack center" style={{ alignItems: "center", padding: "80px 24px" }}>
            <IconList size={80} stroke="#1E7B3A" />
            <h2 style={{ fontSize: 21 }}>{t(T.noOrders).p}</h2>
            <span className="muted">{t(T.noOrders).s}</span>
            <Link className="btn primary" to="/products">{t(T.browse).p}</Link>
          </div>
        ) : (
          <div className="stack" style={{ padding: "14px 16px", gap: 10 }}>
            {orders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="card" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="row between"><strong style={{ fontSize: 17 }}>{o.orderNo}</strong><StatusPill status={o.status} /></div>
                <span className="small muted">{o.itemCount} {t(T.items).p} · {rupees(o.total)} · {fmtDate(o.createdAt, lang, false)}</span>
                {["paid", "packing", "dispatched"].includes(o.status) && <span className="small strong" style={{ color: o.delayed ? "var(--warn)" : "var(--green-dark)" }}>{o.delayed ? t(T.delayed).p : t(T.deliveryOn).p}: {fmtDate(o.expectedDelivery, lang)}</span>}
              </Link>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </>
  );
}

const FLOW = ["paid", "packing", "dispatched", "delivered"] as const;

export function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { t, lang, replaceCart, products, loadCatalog, catalogLoaded, config, showToast } = useStore();
  const [o, setO] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setFailed(false); get(`/api/orders/${id}`).then((r) => setO(r.order)).catch(() => setFailed(true)); }, [id]);
  useEffect(load, [load]);
  useEffect(() => { if (!catalogLoaded) loadCatalog().catch(() => undefined); }, [catalogLoaded, loadCatalog]);

  if (failed) return <main className="screen"><TopBar title={T.myOrders} back="/orders" /><ErrorBox onRetry={load} /></main>;
  if (!o) return <main className="screen"><TopBar title={T.myOrders} back="/orders" /><Spinner /></main>;

  const idx = FLOW.indexOf(o.status);
  const cancellable = ["pending_payment", "payment_failed", "paid", ...(config?.cancel_allowed_until === "packing" ? ["packing"] : [])].includes(o.status);
  const at = (s: string) => o.events.find((e: any) => e.status === s)?.at;

  function reorder() {
    const c: Record<number, number> = {};
    for (const it of o.items) {
      const p = products.find((x) => x.id === it.productId);
      if (p && p.stock > 0) c[p.id] = Math.min(it.qty, p.stock);
    }
    replaceCart(c);
    nav("/cart");
  }

  async function cancel() {
    setBusy(true);
    try {
      const r = await post(`/api/orders/${o.id}/cancel`);
      setConfirmCancel(false);
      showToast(r.refundPending ? t(T.refundNote).p : t(T.status.cancelled).p);
      load();
      loadCatalog().catch(() => undefined);
    } catch (e) {
      showToast(e instanceof ApiFail ? e.message : t(T.errorGeneric).p);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <TopBar title={[o.orderNo, o.orderNo]} back="/orders" right={<StatusPill status={o.status} />} />
      <div className="stack" style={{ padding: "14px 16px" }}>
        {["pending_payment", "payment_failed"].includes(o.status) && (
          <div className="notice warn" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <span>{t(T.payFailed).p}</span>
            <Link className="btn pay" to={`/checkout?order=${o.id}`}>{t(T.retryPay).p} · {rupees(o.total)}</Link>
          </div>
        )}
        {o.delayed && ["paid", "packing", "dispatched"].includes(o.status) && <div className="notice warn">{t(T.delayed).p}: {fmtDate(o.expectedDelivery, lang)}</div>}
        {o.status === "cancelled" && o.refundStatus && <div className={"notice " + (o.refundStatus === "refunded" ? "ok" : "info")}>{o.refundStatus === "refunded" ? t(T.refunded).p : t(T.refundNote).p}</div>}

        {idx >= 0 && (
          <div className="card stack">
            <div className="timeline">
              {FLOW.map((s, i) => {
                const st = i <= idx ? "done" : i === idx + 1 ? "cur" : "todo";
                const label = t(T.status[s]);
                const when = at(s);
                return (
                  <div key={s} className={"tl " + st}>
                    <div className="rail"><div className="node">{st === "done" && <IconCheck size={16} stroke="#fff" />}</div>{i < FLOW.length - 1 && <div className="bar" />}</div>
                    <div className="lbl">
                      <b>{label.p}</b>
                      <span className="tiny muted">{label.s}{when ? " · " + new Date(when).toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : s === "delivered" ? " · " + fmtDate(o.expectedDelivery, lang) : ""}</span>
                      {s === "dispatched" && o.deliveryPerson && i <= idx && <span className="small">{t(T.deliveryBy).p}: {o.deliveryPerson}{o.deliveryPhone ? <> · <a href={`tel:${o.deliveryPhone}`}>{o.deliveryPhone}</a></> : null}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="card stack" style={{ gap: 10 }}>
          {o.items.map((it: any) => {
            const n = t([it.name_ta, it.name_en]);
            const p = products.find((x) => x.id === it.productId);
            return (
              <div key={it.productId} className="row">
                <Thumb p={{ kind: it.kind, image: p?.image, categoryId: p?.categoryId }} small />
                <span className="grow" style={{ display: "flex", flexDirection: "column" }}><span className="strong">{n.p}</span><span className="tiny muted">{it.pack_size} × {it.qty} · {rupees(it.price)}</span></span>
                <strong>{rupees(it.lineTotal)}</strong>
              </div>
            );
          })}
          <hr style={{ border: 0, height: 1, background: "var(--line)", width: "100%", margin: 0 }} />
          <div className="bill">
            <div className="line"><span>{t(T.items).p} ({o.itemCount})</span><span>{rupees(o.subtotal)}</span></div>
            <div className="line"><span>{t(T.deliveryFee).p}</span><span>{o.deliveryFee === 0 ? t(T.free).p : rupees(o.deliveryFee)}</span></div>
            <div className="line"><strong>{t(T.toPay).p}</strong><strong style={{ fontSize: 20 }}>{rupees(o.total)}</strong></div>
            {o.paymentMethod && <div className="line small muted"><span>{t(T.paid).p}</span><span>{String(o.paymentMethod).toUpperCase()}</span></div>}
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <Link className="btn ghost grow" to={`/help?order=${o.id}`}>{t(T.complaint).p}</Link>
          <button className="btn primary grow" onClick={reorder}>↻ {t(T.reorder).p}</button>
        </div>
        {cancellable && <button className="btn danger" onClick={() => setConfirmCancel(true)}>{t(T.cancelOrder).p} · {t(T.cancelOrder).s}</button>}
      </div>

      {confirmCancel && (
        <div className="modal-back" role="dialog" aria-modal="true">
          <div className="modal">
            <h2 style={{ fontSize: 22 }}>{t(T.cancelConfirm).p}</h2>
            <span className="muted">{t(T.cancelConfirm).s}</span>
            {["paid", "packing"].includes(o.status) && <div className="notice info">{t(T.refundNote).p} · {t(T.refundNote).s}</div>}
            <button className="btn danger big" disabled={busy} onClick={cancel}>{t(T.yesCancel).p}</button>
            <button className="btn ghost" onClick={() => setConfirmCancel(false)}>{t(T.no).p}</button>
          </div>
        </div>
      )}
    </main>
  );
}
