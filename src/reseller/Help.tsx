import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "./store";
import { T, fmtDate } from "../i18n";
import { get, post, ApiFail } from "../api";
import { BottomNav, TopBar } from "./ui";
import { IconPhone, IconChat, IconAlert, IconUser } from "../components/Icons";

const HOW: Array<readonly [string, string]> = [
  ["பொருளைத் தேர்ந்தெடுங்கள்", "Pick your products"],
  ["+ அழுத்தி கூடையில் சேருங்கள்", "Tap + to add to cart"],
  ["குறைந்தபட்ச தொகை ஆனதும் செலுத்துங்கள்", "Pay once the minimum is reached"],
  ["நாளை வீட்டில் பெறுங்கள்", "Receive at home tomorrow"],
];

export default function Help() {
  const { t, lang, config, me, showToast } = useStore();
  const [params] = useSearchParams();
  const orderParam = params.get("order");
  const [open, setOpen] = useState(Boolean(orderParam));
  const [orders, setOrders] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [form, setForm] = useState({ orderId: orderParam || "", type: "damaged", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    get("/api/orders").then((r) => setOrders(r.orders)).catch(() => undefined);
    get("/api/complaints").then((r) => setComplaints(r.complaints)).catch(() => undefined);
  };
  useEffect(load, []);

  async function submit() {
    setErr(null);
    if (form.message.trim().length < 3) return setErr(t(T.describe).p);
    setBusy(true);
    try {
      await post("/api/complaints", { type: form.type, message: form.message.trim(), ...(form.orderId ? { orderId: Number(form.orderId) } : {}) });
      setOpen(false);
      setForm({ orderId: "", type: "damaged", message: "" });
      showToast(t(T.complaintSent).p);
      load();
    } catch (e) {
      setErr(e instanceof ApiFail ? e.message : t(T.errorGeneric).p);
    } finally {
      setBusy(false);
    }
  }

  const phone = config?.support_phone;
  const wa = config?.support_whatsapp;

  return (
    <>
      <main className="screen">
        <TopBar title={T.help} right={<Link className="icon-btn" to="/profile" aria-label={t(T.profile).p}><IconUser /></Link>} />
        <div className="stack" style={{ padding: "14px 16px" }}>
          <span className="small muted">Partner ID · {me?.partnerId}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
            <a className="btn primary" style={{ height: 112 }} href={phone ? `tel:${phone}` : undefined} aria-disabled={!phone}><IconPhone size={34} stroke="#fff" />{t(T.call).p}</a>
            <a className="btn soft" style={{ height: 112 }} href={wa ? `https://wa.me/${wa}` : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!wa}><IconChat size={34} stroke="#17602C" />WhatsApp</a>
          </div>
          <h2 style={{ fontSize: 20, marginTop: 8 }}>{t(T.howTo).p} <span className="small muted" style={{ fontWeight: 500 }}>· {t(T.howTo).s}</span></h2>
          {HOW.map((h, i) => (
            <div key={i} className="card row" style={{ gap: 14 }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--yellow)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--head)", fontSize: 22, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ display: "flex", flexDirection: "column" }}><span className="strong" style={{ fontSize: 17 }}>{t(h).p}</span><span className="small muted">{t(h).s}</span></span>
            </div>
          ))}
          <button className="btn ghost" style={{ flexDirection: "row", gap: 10, justifyContent: "flex-start" }} onClick={() => setOpen(true)}>
            <IconAlert stroke="#B45309" /> {t(T.complaint).p} · <span className="muted" style={{ fontWeight: 500 }}>{t(T.complaint).s}</span>
          </button>
          {complaints.length > 0 && (
            <>
              <h2 style={{ fontSize: 18, marginTop: 8 }}>{t(T.myComplaints).p}</h2>
              {complaints.map((c) => (
                <div key={c.id} className="card stack" style={{ gap: 4 }}>
                  <div className="row between"><strong>{t(T.complaintTypes[c.type] || [c.type, c.type]).p}{c.order_no ? ` · ${c.order_no}` : ""}</strong><span className={"status " + (c.status === "open" ? "yellow" : "")}>{c.status === "open" ? (lang === "ta" ? "நிலுவையில்" : "Open") : (lang === "ta" ? "தீர்க்கப்பட்டது" : "Resolved")}</span></div>
                  <span className="small">{c.message}</span>
                  {c.admin_note && <span className="small" style={{ color: "var(--green-dark)" }}>ProServe: {c.admin_note}</span>}
                  <span className="tiny muted">{fmtDate(c.created_at, lang, false)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </main>
      <BottomNav />

      {open && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label={t(T.complaint).p}>
          <div className="modal">
            <h2 style={{ fontSize: 22 }}>{t(T.complaint).p}</h2>
            <label className="field">
              <span>{t(T.orderNo).p} <em>· {t(T.orderNo).s}</em></span>
              <select className="input" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
                <option value="">—</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.orderNo}</option>)}
              </select>
            </label>
            <span className="strong">{t(T.problemType).p} <span className="small muted" style={{ fontWeight: 500 }}>· {t(T.problemType).s}</span></span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              {Object.entries(T.complaintTypes).map(([k, pair]) => (
                <button key={k} className="choice" style={{ fontSize: 15, height: 52 }} aria-pressed={form.type === k} onClick={() => setForm({ ...form, type: k })}>{t(pair).p}</button>
              ))}
            </div>
            <label className="field">
              <span>{t(T.describe).p} <em>· {t(T.describe).s}</em></span>
              <textarea className="input" maxLength={1000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </label>
            {err && <div className="notice err">{err}</div>}
            <button className="btn primary big" disabled={busy} onClick={submit}>{t(T.send).p} · {t(T.send).s}</button>
            <button className="btn ghost" onClick={() => setOpen(false)}>{t(T.no).p}</button>
          </div>
        </div>
      )}
    </>
  );
}
