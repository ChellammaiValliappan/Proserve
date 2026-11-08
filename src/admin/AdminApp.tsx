import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, Link } from "react-router-dom";
import { get, post, ApiFail } from "../api";
import { rupees } from "../../shared/rules";
import { Logo } from "../components/Icons";
import { OrdersPage, OrderPage } from "./AdminOrders";
import { ProductsPage } from "./AdminProducts";
import { ResellersPage, ComplaintsPage, SettingsPage, ReportsPage, TeamPage } from "./AdminMisc";

export interface Admin { id: number; email: string; name: string; role: "admin" | "staff" }
const AdminCtx = createContext<{ admin: Admin; flash(m: string): void } | null>(null);
export const useAdmin = () => useContext(AdminCtx)!;

export function errText(e: unknown) {
  return e instanceof ApiFail ? e.message : "Something went wrong";
}

function Login({ onDone }: { onDone: (a: Admin) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await post("/api/admin/login", { email, password });
      onDone(r.admin);
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#f6f8f5" }}>
      <form onSubmit={submit} className="panel" style={{ width: "100%", maxWidth: 380 }}>
        <div className="row"><Logo size={44} /><div><h1 style={{ fontSize: 22 }}>ProServe Admin</h1><span className="small muted">Staff sign-in</span></div></div>
        <label className="a-field">Email<input className="a-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="a-field">Password<input className="a-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <div className="notice err">{err}</div>}
        <button className="a-btn primary" disabled={busy} style={{ height: 46 }}>Sign in</button>
      </form>
    </main>
  );
}

function Dashboard() {
  const [m, setM] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get("/api/admin/dashboard").then((r) => setM(r.metrics)).catch((e) => setErr(errText(e))); }, []);
  if (err) return <div className="notice err">{err}</div>;
  if (!m) return <div className="spinner" />;
  const K = ({ label, value, to, alert }: { label: string; value: ReactNode; to?: string; alert?: boolean }) => {
    const body = <><span>{label}</span><b>{value}</b></>;
    return to ? <Link to={to} className={"kpi" + (alert ? " alert" : "")} style={{ textDecoration: "none", color: "inherit" }}>{body}</Link> : <div className={"kpi" + (alert ? " alert" : "")}>{body}</div>;
  };
  return (
    <>
      <h1>Dashboard</h1>
      <h2 style={{ fontSize: 16 }} className="muted">Today</h2>
      <div className="kpis">
        <K label="Orders today" value={m.orders_today} />
        <K label="Sales today" value={rupees(m.sales_today)} />
        <K label="To pack (new paid)" value={m.to_pack} to="/admin/orders?status=paid" alert={m.to_pack > 0} />
        <K label="Packing" value={m.packing} to="/admin/orders?status=packing" />
        <K label="Out for delivery" value={m.out_for_delivery} to="/admin/orders?status=dispatched" />
      </div>
      <h2 style={{ fontSize: 16 }} className="muted">Needs attention</h2>
      <div className="kpis">
        <K label="Open complaints" value={m.open_complaints} to="/admin/complaints" alert={m.open_complaints > 0} />
        <K label="Refunds pending" value={m.refunds_pending} to="/admin/orders?status=refunds" alert={m.refunds_pending > 0} />
        <K label="Low stock (≤5)" value={m.low_stock} to="/admin/products" alert={m.low_stock > 0} />
      </div>
      <h2 style={{ fontSize: 16 }} className="muted">All time</h2>
      <div className="kpis">
        <K label="Registered partners" value={m.resellers} to="/admin/resellers" />
        <K label="New partners (7 days)" value={m.new_resellers_7d} />
        <K label="Paid orders" value={m.orders} />
        <K label="Total sales" value={rupees(m.sales)} to="/admin/reports" />
      </div>
    </>
  );
}

function ChangePassword() {
  const { flash } = useAdmin();
  const [f, setF] = useState({ current: "", next: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      <h2>Change password</h2>
      <label className="a-field">Current password<input className="a-input" type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></label>
      <label className="a-field">New password (min 10 characters)<input className="a-input" type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></label>
      {err && <div className="notice err">{err}</div>}
      <button className="a-btn primary" onClick={async () => { setErr(null); try { await post("/api/admin/password", f); setF({ current: "", next: "" }); flash("Password changed"); } catch (e) { setErr(errText(e)); } }}>Update password</button>
    </div>
  );
}

export default function AdminApp() {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { document.title = "ProServe Admin"; get("/api/admin/me").then((r) => setAdmin(r.admin)).catch(() => setAdmin(null)); }, []);
  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(null), 2500); };
  if (admin === undefined) return <div className="spinner" />;
  if (!admin) return <Login onDone={setAdmin} />;
  const links: Array<[string, string, boolean?]> = [
    ["/admin", "Dashboard", true], ["/admin/orders", "Orders & delivery"], ["/admin/products", "Products & stock"], ["/admin/resellers", "Partners"],
    ["/admin/complaints", "Complaints"], ["/admin/reports", "Reports"], ["/admin/settings", "Configuration"], ["/admin/account", "My account"],
  ];
  if (admin.role === "admin") links.splice(7, 0, ["/admin/team", "Team & audit"]);
  return (
    <AdminCtx.Provider value={{ admin, flash }}>
      <div className="admin">
        <aside className="admin-side">
          <div className="brand"><Logo size={34} />ProServe Admin</div>
          <nav>{links.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}</nav>
          <div style={{ marginTop: "auto", padding: "16px 8px 0", fontSize: 13, color: "#b8c7bb" }}>
            {admin.name} · {admin.role}
            <button className="a-btn" style={{ marginTop: 8, width: "100%" }} onClick={async () => { await post("/api/admin/logout").catch(() => undefined); setAdmin(null); }}>Sign out</button>
          </div>
        </aside>
        <main className="admin-main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="resellers" element={<ResellersPage />} />
            <Route path="complaints" element={<ComplaintsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="account" element={<ChangePassword />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
        {msg && <div className="toast">{msg}</div>}
      </div>
    </AdminCtx.Provider>
  );
}
