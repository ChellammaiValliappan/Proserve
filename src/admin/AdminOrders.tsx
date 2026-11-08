import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { get, post } from "../api";
import { rupees } from "../../shared/rules";
import { useAdmin, errText } from "./AdminApp";

const LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment", payment_failed: "Payment failed", paid: "Paid – to pack", packing: "Packing",
  dispatched: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled", expired: "Expired",
};
const TONE: Record<string, string> = { paid: "yellow", packing: "yellow", dispatched: "", delivered: "", pending_payment: "warn", payment_failed: "warn", cancelled: "grey", expired: "grey" };
export const StatusTag = ({ s }: { s: string }) => <span className={"status " + (TONE[s] ?? "grey")}>{LABEL[s] || s}</span>;
const dt = (v: string) => new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const d = (v: string) => (v ? new Date(v.length === 10 ? v + "T00:00:00+05:30" : v).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "");

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const [q, setQ] = useState(params.get("q") || "");
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const load = useCallback(() => {
    setRows(null);
    get(`/api/admin/orders?status=${encodeURIComponent(status)}&q=${encodeURIComponent(params.get("q") || "")}`).then((r) => setRows(r.orders)).catch((e) => setErr(errText(e)));
  }, [status, params]);
  useEffect(load, [load]);
  const tabs: Array<[string, string]> = [["", "All"], ["active", "Active"], ["paid", "To pack"], ["packing", "Packing"], ["dispatched", "Out for delivery"], ["delivered", "Delivered"], ["pending_payment", "Awaiting payment"], ["payment_failed", "Payment failed"], ["cancelled", "Cancelled"], ["refunds", "Refunds pending"]];
  return (
    <>
      <h1>Orders & delivery</h1>
      <div className="toolbar">
        {tabs.map(([k, l]) => <button key={k} className={"a-btn" + (status === k ? " primary" : "")} onClick={() => setParams(k ? { status: k } : {})}>{l}</button>)}
      </div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); const p: any = {}; if (status) p.status = status; if (q) p.q = q; setParams(p); }}>
        <input className="a-input" style={{ width: 280 }} placeholder="Search order no, phone, name, partner ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="a-btn">Search</button>
        <button type="button" className="a-btn" onClick={load}>Refresh</button>
      </form>
      {err && <div className="notice err">{err}</div>}
      {!rows ? <div className="spinner" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Placed</th><th>Partner</th><th>Area / PIN</th><th className="num">Items</th><th className="num">Total</th><th>Status</th><th>Delivery</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="muted center">No orders</td></tr>}
              {rows.map((o) => (
                <tr key={o.id} className="click" onClick={() => nav(`/admin/orders/${o.id}`)}>
                  <td><strong>{o.order_no}</strong>{o.tier === "premium" && <span className="status yellow" style={{ marginLeft: 6 }}>★</span>}</td>
                  <td>{dt(o.created_at)}</td>
                  <td>{o.name || "—"}<br /><span className="tiny muted">{o.phone} · {o.partner_id}</span></td>
                  <td>{o.area}<br /><span className="tiny muted">{o.pin}</span></td>
                  <td className="num">{o.item_count}</td>
                  <td className="num">{rupees(o.total_paise)}</td>
                  <td><StatusTag s={o.status} />{o.refund_status === "pending" && <span className="status err" style={{ marginLeft: 4 }}>Refund due</span>}</td>
                  <td>{d(o.revised_delivery || o.expected_delivery)}{o.revised_delivery && <span className="status warn" style={{ marginLeft: 4 }}>delayed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const { admin, flash } = useAdmin();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dp, setDp] = useState({ person: "", phone: "" });
  const [delay, setDelay] = useState({ date: "", note: "" });
  const [cancelNote, setCancelNote] = useState("");
  const load = useCallback(() => { get(`/api/admin/orders/${id}`).then((r) => { setData(r); setDp({ person: r.order.delivery_person || "", phone: r.order.delivery_phone || "" }); }).catch((e) => setErr(errText(e))); }, [id]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      flash(r?.found === false ? "No captured payment found at Razorpay" : ok);
      load();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (err && !data) return <div className="notice err">{err}</div>;
  if (!data) return <div className="spinner" />;
  const o = data.order;
  const a = o.address || {};
  const next: string[] = data.nextStatuses;
  const btnLabel: Record<string, string> = { packing: "Start packing", dispatched: "Mark dispatched", delivered: "Mark delivered" };

  return (
    <>
      <div className="toolbar"><Link to="/admin/orders" className="a-btn">← Orders</Link><button className="a-btn" onClick={() => window.print()}>Print packing slip</button></div>
      <div className="row" style={{ flexWrap: "wrap" }}><h1>{o.order_no}</h1><StatusTag s={o.status} />{o.refund_status && <span className={"status " + (o.refund_status === "pending" ? "err" : "")}>Refund {o.refund_status}</span>}<span className="status grey">{o.tier}</span></div>
      {err && <div className="notice err">{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div className="panel">
          <h2>Deliver to</h2>
          <div><strong>{a.name}</strong> · <a href={`tel:${a.phone}`}>+91 {a.phone}</a><br />{a.address}<br />{a.area} – {a.pin}</div>
          <div className="small muted">Partner {o.partner_id} · Placed {dt(o.created_at)}{o.paid_at ? ` · Paid ${dt(o.paid_at)}` : ""}</div>
          <div><strong>Expected delivery:</strong> {d(o.revised_delivery || o.expected_delivery)}{o.revised_delivery && <span className="status warn" style={{ marginLeft: 6 }}>revised</span>}</div>
        </div>

        <div className="panel">
          <h2>Fulfilment</h2>
          {next.includes("dispatched") && (
            <div className="form-grid">
              <label className="a-field">Delivery person<input className="a-input" value={dp.person} onChange={(e) => setDp({ ...dp, person: e.target.value })} maxLength={80} /></label>
              <label className="a-field">Delivery phone<input className="a-input" value={dp.phone} onChange={(e) => setDp({ ...dp, phone: e.target.value.replace(/[^0-9+ ]/g, "") })} maxLength={15} /></label>
            </div>
          )}
          <div className="toolbar">
            {next.filter((s) => s !== "cancelled").map((s) => (
              <button key={s} className="a-btn primary" disabled={busy || (s === "dispatched" && !dp.person)} onClick={() => act(() => post(`/api/admin/orders/${o.id}/status`, { status: s, deliveryPerson: dp.person || undefined, deliveryPhone: dp.phone || undefined }), "Status updated")}>{btnLabel[s]}</button>
            ))}
            {next.length === 0 && <span className="muted small">No further fulfilment steps.</span>}
          </div>
          {["paid", "packing", "dispatched"].includes(o.status) && (
            <div className="toolbar">
              <input className="a-input" type="date" value={delay.date} onChange={(e) => setDelay({ ...delay, date: e.target.value })} aria-label="New delivery date" />
              <input className="a-input" placeholder="Reason (shown to partner)" value={delay.note} onChange={(e) => setDelay({ ...delay, note: e.target.value })} maxLength={300} />
              <button className="a-btn" disabled={busy || !delay.date} onClick={() => act(() => post(`/api/admin/orders/${o.id}/delay`, delay), "Partner will see the new date")}>Set new delivery date</button>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Payment</h2>
          {data.payments.length === 0 && <span className="muted small">No payment attempts yet.</span>}
          {data.payments.map((p: any) => (
            <div key={p.id} className="small"><span className={"status " + (p.status === "paid" ? "" : p.status === "failed" ? "err" : "grey")}>{p.status}</span> {p.provider} · {rupees(p.amount_paise)} {p.method ? `· ${p.method}` : ""} · {dt(p.created_at)}<br /><span className="tiny muted">{p.provider_payment_id || p.provider_order_id}{p.error ? ` – ${p.error}` : ""}</span></div>
          ))}
          <div className="toolbar">
            {["pending_payment", "payment_failed", "expired", "cancelled"].includes(o.status) && data.payments.some((p: any) => p.provider === "razorpay") && (
              <button className="a-btn" disabled={busy} onClick={() => act(() => post(`/api/admin/orders/${o.id}/verify-payment`), "Payment found – order confirmed")}>Check payment with Razorpay</button>
            )}
            {o.refund_status === "pending" && admin.role === "admin" && (
              <>
                {data.payments.some((p: any) => p.provider === "razorpay" && p.provider_payment_id) && <button className="a-btn primary" disabled={busy} onClick={() => confirm("Refund the full amount through Razorpay?") && act(() => post(`/api/admin/orders/${o.id}/refund`, { method: "gateway" }), "Refund sent")}>Refund via Razorpay</button>}
                <button className="a-btn" disabled={busy} onClick={() => { const note = prompt("How was the refund made? (e.g. UPI ref no.)"); if (note) act(() => post(`/api/admin/orders/${o.id}/refund`, { method: "manual", note }), "Marked refunded"); }}>Mark refunded manually</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Items ({o.item_count})</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>✓</th><th>Product</th><th>Pack</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th></tr></thead>
            <tbody>
              {data.items.map((i: any) => <tr key={i.id}><td><input type="checkbox" aria-label="Packed" /></td><td>{i.name_en}<br /><span className="tiny muted">{i.name_ta}</span></td><td>{i.pack_size}</td><td className="num"><strong>{i.qty}</strong></td><td className="num">{rupees(i.price_paise)}</td><td className="num">{rupees(i.line_total_paise)}</td></tr>)}
              <tr><td colSpan={5} className="num">Subtotal</td><td className="num">{rupees(o.subtotal_paise)}</td></tr>
              <tr><td colSpan={5} className="num">Delivery fee</td><td className="num">{o.delivery_fee_paise ? rupees(o.delivery_fee_paise) : "Free"}</td></tr>
              <tr><td colSpan={5} className="num"><strong>Total</strong></td><td className="num"><strong>{rupees(o.total_paise)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>History</h2>
        {data.events.map((e: any) => <div key={e.id} className="small"><strong>{LABEL[e.status] || e.status}</strong> · {dt(e.created_at)} · <span className="muted">{e.actor}</span>{e.note ? ` – ${e.note}` : ""}</div>)}
      </div>

      {admin.role === "admin" && ["pending_payment", "payment_failed", "paid", "packing"].includes(o.status) && (
        <div className="panel">
          <h2>Cancel order</h2>
          <span className="small muted">Stock goes back automatically. Paid orders are marked “refund pending”.</span>
          <div className="toolbar">
            <input className="a-input" style={{ minWidth: 260 }} placeholder="Reason (required)" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={300} />
            <button className="a-btn danger" disabled={busy || cancelNote.trim().length < 2} onClick={() => confirm("Cancel this order?") && act(() => post(`/api/admin/orders/${o.id}/cancel`, { note: cancelNote }), "Order cancelled")}>Cancel order</button>
          </div>
        </div>
      )}
    </>
  );
}
