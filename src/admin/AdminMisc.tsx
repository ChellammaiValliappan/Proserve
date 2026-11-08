import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, post, put } from "../api";
import { rupees } from "../../shared/rules";
import { useAdmin, errText } from "./AdminApp";

const dt = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—");

export function ResellersPage() {
  const { admin, flash } = useAdmin();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback((s = "") => { get(`/api/admin/resellers?q=${encodeURIComponent(s)}`).then((r) => setRows(r.resellers)).catch((e) => setErr(errText(e))); }, []);
  useEffect(() => load(), [load]);
  return (
    <>
      <h1>Partners (resellers)</h1>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input className="a-input" style={{ width: 280 }} placeholder="Search name, phone, partner ID, area, PIN" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="a-btn">Search</button>
      </form>
      {err && <div className="notice err">{err}</div>}
      {!rows ? <div className="spinner" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Partner ID</th><th>Name</th><th>Phone</th><th>Area / PIN</th><th className="num">Paid orders</th><th className="num">Sales</th><th>Joined</th><th>Last login</th><th>Status</th>{admin.role === "admin" && <th></th>}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10} className="center muted">No partners yet</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.partner_id}</strong></td><td>{r.name || <span className="muted">(not filled)</span>}</td><td><a href={`tel:${r.phone}`}>{r.phone}</a></td>
                  <td>{r.area}<br /><span className="tiny muted">{r.pin}</span></td><td className="num">{r.orders}</td><td className="num">{rupees(r.sales)}</td>
                  <td>{dt(r.created_at)}</td><td>{dt(r.last_login_at)}</td>
                  <td>{r.status === "active" ? <span className="status">Active</span> : <span className="status err">Blocked</span>}</td>
                  {admin.role === "admin" && <td><button className={"a-btn" + (r.status === "active" ? " danger" : "")} onClick={async () => { const s = r.status === "active" ? "blocked" : "active"; if (!confirm(`${s === "blocked" ? "Block" : "Unblock"} ${r.name || r.phone}?`)) return; await post(`/api/admin/resellers/${r.id}/status`, { status: s }); flash("Updated"); load(q); }}>{r.status === "active" ? "Block" : "Unblock"}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const CTYPE: Record<string, string> = { damaged: "Damaged item", wrong_item: "Wrong item", missing_item: "Item missing", late: "Late delivery", payment: "Payment issue", other: "Other" };

export function ComplaintsPage() {
  const { flash } = useAdmin();
  const [rows, setRows] = useState<any[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { get("/api/admin/complaints").then((r) => setRows(r.complaints)).catch((e) => setErr(errText(e))); }, []);
  useEffect(load, [load]);
  return (
    <>
      <h1>Complaints & returns</h1>
      {err && <div className="notice err">{err}</div>}
      {!rows ? <div className="spinner" /> : rows.length === 0 ? <div className="panel muted">No complaints – all clear</div> : rows.map((c) => (
        <div key={c.id} className="panel" style={{ borderColor: c.status === "open" ? "var(--yellow)" : undefined }}>
          <div className="row between" style={{ flexWrap: "wrap" }}>
            <strong>{CTYPE[c.type]} {c.order_no && <>· <Link to={`/admin/orders/${c.order_id}`}>{c.order_no}</Link></>}</strong>
            <span className={"status " + (c.status === "open" ? "yellow" : "")}>{c.status}</span>
          </div>
          <div>{c.message}</div>
          <div className="small muted">{c.name} · <a href={`tel:${c.phone}`}>{c.phone}</a> · {c.partner_id} · {dt(c.created_at)}</div>
          {c.status === "open" ? (
            <div className="toolbar">
              <input className="a-input" style={{ minWidth: 300, flex: 1 }} placeholder="Resolution note (partner will see this)" value={notes[c.id] || ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} maxLength={500} />
              <button className="a-btn primary" disabled={(notes[c.id] || "").trim().length < 2} onClick={async () => { await post(`/api/admin/complaints/${c.id}/resolve`, { note: notes[c.id] }); flash("Resolved"); load(); }}>Resolve</button>
            </div>
          ) : <div className="small" style={{ color: "var(--green-dark)" }}>Resolved: {c.admin_note} ({dt(c.resolved_at)})</div>}
        </div>
      ))}
      <span className="small muted">For a refund on a delivered order, open the order and cancel/refund from there, or settle manually and note it here.</span>
    </>
  );
}

export function SettingsPage() {
  const { admin, flash } = useAdmin();
  const [f, setF] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    get("/api/admin/settings").then(({ settings: s }) => setF({
      min_order: s.min_order_paise / 100, free_delivery: s.free_delivery_paise / 100, premium: s.premium_paise / 100, delivery_fee: s.delivery_fee_paise / 100,
      serviceable_pins: s.serviceable_pins.join(", "), order_cutoff_hour: s.order_cutoff_hour, no_delivery_weekdays: s.no_delivery_weekdays,
      cancel_allowed_until: s.cancel_allowed_until, support_phone: s.support_phone, support_whatsapp: s.support_whatsapp,
    })).catch((e) => setErr(errText(e)));
  }, []);
  if (!f) return err ? <div className="notice err">{err}</div> : <div className="spinner" />;
  const ro = admin.role !== "admin";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  async function save() {
    setErr(null);
    try {
      await put("/api/admin/settings", {
        ...f, min_order: Number(f.min_order), free_delivery: Number(f.free_delivery), premium: Number(f.premium), delivery_fee: Number(f.delivery_fee),
        order_cutoff_hour: Number(f.order_cutoff_hour), serviceable_pins: String(f.serviceable_pins).split(/[\s,]+/).filter(Boolean),
      });
      flash("Settings saved – live for partners now");
    } catch (e) {
      setErr(errText(e));
    }
  }
  const N = (k: string, label: string) => <label className="a-field">{label}<input className="a-input" type="number" min="0" disabled={ro} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return (
    <>
      <h1>Configuration</h1>
      {ro && <div className="notice info">Only an admin can change these settings.</div>}
      <div className="panel">
        <h2>Order rules (₹)</h2>
        <div className="form-grid">
          {N("min_order", "Minimum order (Trial)")}
          {N("free_delivery", "Free delivery from (Growth)")}
          {N("premium", "Premium tier from")}
          {N("delivery_fee", "Delivery fee below free-delivery")}
        </div>
      </div>
      <div className="panel">
        <h2>Delivery</h2>
        <label className="a-field">Serviceable PIN codes – full PINs or prefixes, comma separated (e.g. 600 = all Chennai 600xxx)
          <input className="a-input" disabled={ro} value={f.serviceable_pins} onChange={(e) => setF({ ...f, serviceable_pins: e.target.value })} />
        </label>
        <div className="form-grid">
          <label className="a-field">Order cut-off hour (IST, 0–23) – later orders deliver a day later<input className="a-input" type="number" min="0" max="23" disabled={ro} value={f.order_cutoff_hour} onChange={(e) => setF({ ...f, order_cutoff_hour: e.target.value })} /></label>
          <label className="a-field">Partners may cancel until
            <select className="a-input" disabled={ro} value={f.cancel_allowed_until} onChange={(e) => setF({ ...f, cancel_allowed_until: e.target.value })}><option value="paid">Packing starts</option><option value="packing">Dispatch</option></select>
          </label>
        </div>
        <div className="a-field">No delivery on
          <div className="toolbar">{days.map((d, i) => <label key={d} className="row" style={{ gap: 4, color: "var(--ink)" }}><input type="checkbox" disabled={ro} checked={f.no_delivery_weekdays.includes(i)} onChange={(e) => setF({ ...f, no_delivery_weekdays: e.target.checked ? [...f.no_delivery_weekdays, i] : f.no_delivery_weekdays.filter((x: number) => x !== i) })} />{d}</label>)}</div>
        </div>
      </div>
      <div className="panel">
        <h2>Support contacts (shown in the partner app)</h2>
        <div className="form-grid">
          <label className="a-field">Support phone<input className="a-input" disabled={ro} value={f.support_phone} onChange={(e) => setF({ ...f, support_phone: e.target.value })} /></label>
          <label className="a-field">WhatsApp number (with 91, digits only)<input className="a-input" disabled={ro} value={f.support_whatsapp} onChange={(e) => setF({ ...f, support_whatsapp: e.target.value.replace(/\D/g, "") })} /></label>
        </div>
      </div>
      {err && <div className="notice err">{err}</div>}
      {!ro && <div><button className="a-btn primary" onClick={save}>Save configuration</button></div>}
    </>
  );
}

export function ReportsPage() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setR(null); get(`/api/admin/reports?days=${days}`).then(setR).catch((e) => setErr(errText(e))); }, [days]);
  if (err) return <div className="notice err">{err}</div>;
  const s = r?.summary;
  const max = r ? Math.max(1, ...r.daily.map((d: any) => d.sales)) : 1;
  function csv(name: string, rows: any[]) {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const blob = new Blob([[cols.join(","), ...rows.map((x) => cols.map((c) => esc(x[c])).join(","))].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${days}d.csv`;
    a.click();
  }
  return (
    <>
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <h1>Reports</h1>
        <div className="toolbar">{[7, 30, 90, 365].map((d) => <button key={d} className={"a-btn" + (days === d ? " primary" : "")} onClick={() => setDays(d)}>{d === 365 ? "1 year" : `${d} days`}</button>)}</div>
      </div>
      {!r ? <div className="spinner" /> : (
        <>
          <div className="kpis">
            <div className="kpi"><span>Total sales</span><b>{rupees(s.sales)}</b></div>
            <div className="kpi"><span>Paid orders</span><b>{s.orders}</b></div>
            <div className="kpi"><span>Average order value</span><b>{rupees(s.avg_order)}</b></div>
            <div className="kpi"><span>₹3,000+ orders</span><b>{s.orders_3000}</b></div>
            <div className="kpi"><span>₹5,000+ orders</span><b>{s.orders_5000}</b></div>
            <div className="kpi"><span>Registered partners</span><b>{s.resellers}</b></div>
            <div className="kpi"><span>First-time buyers</span><b>{s.first_time_buyers}</b></div>
            <div className="kpi"><span>Repeat buyers</span><b>{s.repeat_buyers}</b></div>
            <div className="kpi"><span>Delivery success</span><b>{s.orders ? Math.round((s.delivered / s.orders) * 100) : 0}%</b></div>
            <div className="kpi"><span>Gross margin (costed items)</span><b>{s.costed_sales ? Math.round(((s.costed_sales - s.goods_cost) / s.costed_sales) * 100) + "%" : "—"}</b></div>
            <div className="kpi"><span>Complaints</span><b>{s.complaints}</b></div>
            <div className="kpi"><span>Refunds / cancelled</span><b>{s.refunds} / {s.cancelled}</b></div>
          </div>
          <div className="panel">
            <h2>Daily sales</h2>
            {r.daily.length === 0 ? <span className="muted">No sales in this period.</span> : (
              <>
                <div className="bars" role="img" aria-label="Daily sales chart">{r.daily.map((d: any) => <div key={d.day} title={`${d.day}: ${rupees(d.sales)} (${d.orders} orders)`} style={{ height: `${(d.sales / max) * 100}%` }} />)}</div>
                <div className="row between tiny muted"><span>{r.daily[0].day}</span><span>{r.daily[r.daily.length - 1].day}</span></div>
              </>
            )}
          </div>
          <div className="panel">
            <div className="row between"><h2>Product-wise sales</h2><button className="a-btn" onClick={() => csv("products", r.products)}>Download CSV</button></div>
            <div className="table-wrap"><table><thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Sales</th><th className="num">Margin</th></tr></thead>
              <tbody>{r.products.map((p: any) => <tr key={p.product_id}><td>{p.name_en} · {p.pack_size}</td><td className="num">{p.qty}</td><td className="num">{rupees(p.sales)}</td><td className="num">{p.margin != null ? rupees(p.margin) : "—"}</td></tr>)}</tbody></table></div>
          </div>
          <div className="panel">
            <div className="row between"><h2>Top partners</h2><button className="a-btn" onClick={() => csv("partners", r.resellers)}>Download CSV</button></div>
            <div className="table-wrap"><table><thead><tr><th>Partner</th><th>Area</th><th className="num">Orders</th><th className="num">Sales</th><th>Last order</th></tr></thead>
              <tbody>{r.resellers.map((p: any) => <tr key={p.id}><td>{p.name} <span className="tiny muted">{p.partner_id}</span></td><td>{p.area}</td><td className="num">{p.orders}</td><td className="num">{rupees(p.sales)}</td><td>{dt(p.last_order)}</td></tr>)}</tbody></table></div>
          </div>
        </>
      )}
    </>
  );
}

export function TeamPage() {
  const { flash, admin } = useAdmin();
  const [admins, setAdmins] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [f, setF] = useState({ email: "", name: "", role: "staff", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    get("/api/admin/admins").then((r) => setAdmins(r.admins)).catch((e) => setErr(errText(e)));
    get("/api/admin/audit").then((r) => setAudit(r.entries)).catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  return (
    <>
      <h1>Team & audit log</h1>
      <div className="panel">
        <h2>Staff accounts</h2>
        <span className="small muted">Staff can process orders, update stock and resolve complaints. Admins can also change prices, settings, refunds and accounts.</span>
        <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th></th></tr></thead>
          <tbody>{admins.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.email}</td><td>{a.role}</td><td>{dt(a.last_login_at)}</td><td>{a.id !== admin.id && <button className="a-btn" onClick={async () => { await post(`/api/admin/admins/${a.id}/active`, { active: !a.active }); load(); }}>{a.active ? "Disable" : "Enable"}</button>}</td></tr>)}</tbody></table></div>
        <div className="form-grid">
          <label className="a-field">Name<input className="a-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="a-field">Email<input className="a-input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="a-field">Role<select className="a-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
          <label className="a-field">Temporary password (min 10)<input className="a-input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        </div>
        {err && <div className="notice err">{err}</div>}
        <div><button className="a-btn primary" onClick={async () => { setErr(null); try { await post("/api/admin/admins", f); setF({ email: "", name: "", role: "staff", password: "" }); flash("Account created"); load(); } catch (e) { setErr(errText(e)); } }}>Add team member</button></div>
      </div>
      <div className="panel">
        <h2>Recent admin actions</h2>
        <div className="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>What</th></tr></thead>
          <tbody>{audit.map((l) => <tr key={l.id}><td>{dt(l.created_at)}</td><td>{l.email}</td><td>{l.action}</td><td>{l.entity} {l.entity_id}</td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}
