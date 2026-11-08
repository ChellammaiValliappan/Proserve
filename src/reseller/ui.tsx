import { Link, NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useStore, type Product } from "./store";
import { T, type Pair } from "../i18n";
import { rupees } from "../../shared/rules";
import { ProductArt, IconBack, IconCheck, IconTruck, IconStar, IconHome, IconList, IconBasket, IconHelp } from "../components/Icons";

/** Bilingual label: chosen language big, the other small underneath. */
export function Bi({ pair, sub = true, className }: { pair: Pair; sub?: boolean; className?: string }) {
  const { t } = useStore();
  const x = t(pair);
  return (
    <span className={className} style={{ display: "inline-flex", flexDirection: "column" }}>
      <span>{x.p}</span>
      {sub && <span className="sub" style={{ fontSize: "0.62em", fontWeight: 500, opacity: 0.85 }}>{x.s}</span>}
    </span>
  );
}

export function TopBar({ title, back, right }: { title: Pair; back?: string | number; right?: ReactNode }) {
  const nav = useNavigate();
  const { t } = useStore();
  const x = t(title);
  return (
    <header className="topbar">
      {back !== undefined && (
        <button className="icon-btn" aria-label="Back" onClick={() => (typeof back === "number" ? nav(back) : nav(back))}>
          <IconBack />
        </button>
      )}
      <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
        <h1>{x.p}</h1>
        <span className="small muted">{x.s}</span>
      </div>
      {right}
    </header>
  );
}

export function Thumb({ p, small }: { p: { kind: string; image?: string | null; categoryId?: string }; small?: boolean }) {
  const { categories } = useStore();
  const tint = categories.find((c) => c.id === p.categoryId)?.tint || "#F4F7F0";
  return (
    <div className={"thumb" + (small ? " sm" : "")} style={{ background: tint }}>
      {p.image ? <img src={p.image} alt="" loading="lazy" /> : <ProductArt kind={p.kind} size={small ? 44 : 58} />}
    </div>
  );
}

export function QtyControl({ p, vertical }: { p: Product; vertical?: boolean }) {
  const { cart, setQty, t, showToast } = useStore();
  const q = cart[p.id] || 0;
  const max = Math.min(p.stock, p.maxPerOrder || Infinity);
  if (p.stock <= 0) return <span className="out-label">{t(T.out).p}</span>;
  if (!q) return <button className="add-btn" onClick={() => setQty(p.id, 1)}>+ {t(T.add).p}</button>;
  const inc = () => (q >= max ? showToast(`${max} ${t(T.onlyLeft).p}`) : setQty(p.id, q + 1));
  if (vertical)
    return (
      <div className="stepper" style={{ flexDirection: "column", height: "auto", width: 52 }}>
        <button aria-label="More" onClick={inc}>+</button>
        <span>{q}</span>
        <button aria-label="Less" onClick={() => setQty(p.id, q - 1)}>−</button>
      </div>
    );
  return (
    <div className="stepper">
      <button aria-label="Less" onClick={() => setQty(p.id, q - 1)}>−</button>
      <span>{q}</span>
      <button aria-label="More" onClick={inc}>+</button>
    </div>
  );
}

export function ProductRow({ p }: { p: Product }) {
  const { t, lang } = useStore();
  const n = t([p.name_ta, p.name_en]);
  return (
    <div className={"product" + (p.stock <= 0 ? " out" : "")}>
      <Thumb p={p} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="p-name">{n.p}</span>
        <span className="small muted">{n.s} · <strong style={{ color: "var(--ink)" }}>{p.packSize}</strong></span>
        <span className="row" style={{ gap: 6, alignItems: "baseline" }}>
          <span className="price">{rupees(p.price)}</span>
          {p.mrp && p.mrp > p.price && <span className="mrp">{lang === "ta" ? "MRP" : "MRP"} {rupees(p.mrp)}</span>}
        </span>
        {p.mrp && p.mrp > p.price && <span className="save">{t(T.profit).p} {rupees(p.mrp - p.price)}</span>}
        {p.stock > 0 && p.stock <= 5 && <span className="tiny" style={{ color: "var(--warn)", fontWeight: 700 }}>{p.stock} {t(T.onlyLeft).p}</span>}
      </div>
      <QtyControl p={p} vertical />
    </div>
  );
}

export function tierMessage(subtotal: number, s: { min_order_paise: number; free_delivery_paise: number; premium_paise: number }, lang: "ta" | "en") {
  const pick = (ta: string, en: string) => (lang === "ta" ? { p: ta, s: en } : { p: en, s: ta });
  if (subtotal < s.min_order_paise) { const r = rupees(s.min_order_paise - subtotal); return { ...pick(`ஆர்டர் செய்ய இன்னும் ${r} சேர்க்கவும்`, `Add ${r} more to place order`), tone: "warn" }; }
  if (subtotal < s.free_delivery_paise) { const r = rupees(s.free_delivery_paise - subtotal); return { ...pick(`இலவச டெலிவரிக்கு இன்னும் ${r}`, `${r} more for FREE delivery`), tone: "ink" }; }
  if (subtotal < s.premium_paise) { const r = rupees(s.premium_paise - subtotal); return { ...pick(`இலவச டெலிவரி கிடைத்தது! பிரீமியத்திற்கு ${r}`, `FREE delivery unlocked! ${r} to Premium`), tone: "ok" }; }
  return { ...pick("பிரீமியம் ஆர்டர் + இலவச டெலிவரி!", "Premium order + FREE delivery!"), tone: "ok" };
}

export function TierBar() {
  const { totals, config, t } = useStore();
  if (!config) return null;
  const max = config.premium_paise;
  const pos = (v: number) => `${(v / max) * 100}%`;
  const pct = Math.min(totals.subtotal / max, 1) * 100;
  return (
    <>
      <div className="tierbar" role="img" aria-label={`${rupees(totals.subtotal)} of ${rupees(max)}`}>
        <div className="track" />
        <div className="fill" style={{ width: pct + "%" }} />
        <div className={"dot" + (totals.subtotal >= config.min_order_paise ? " on" : "")} style={{ left: pos(config.min_order_paise) }}><IconCheck size={16} /></div>
        <div className={"dot" + (totals.subtotal >= config.free_delivery_paise ? " on" : "")} style={{ left: pos(config.free_delivery_paise) }}><IconTruck size={17} /></div>
        <div className={"dot" + (totals.subtotal >= config.premium_paise ? " on" : "")} style={{ left: "100%" }}><IconStar size={16} fill={totals.subtotal >= max ? "#F6B21B" : "currentColor"} /></div>
      </div>
      <div className="tier-labels">
        <span><b>{rupees(config.min_order_paise)}</b>{t(T.minShort).p}</span>
        <span><b>{rupees(config.free_delivery_paise)}</b>{t(T.freeDel).p}</span>
        <span style={{ textAlign: "right" }}><b>{rupees(config.premium_paise)}</b>{t(T.premium).p}</span>
      </div>
    </>
  );
}

export function BottomNav({ strip = false }: { strip?: boolean }) {
  const { t, totals, config, lang } = useStore();
  const nav = useNavigate();
  const msg = config ? tierMessage(totals.subtotal, config, lang) : null;
  return (
    <div className="bottom">
      {strip && totals.count > 0 && msg && config && (
        <button className="cart-strip" onClick={() => nav("/cart")}>
          <span className="row">
            <span className="grow" style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 13, color: "var(--yellow)", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.p}</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{totals.count} {t(T.items).p} · {rupees(totals.subtotal)}</span>
            </span>
            <span className="go">{t(T.cart).p} →</span>
          </span>
          <span className="mini"><i style={{ width: Math.min(totals.subtotal / config.premium_paise, 1) * 100 + "%" }} /></span>
        </button>
      )}
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end><IconHome size={26} />{t(T.home).p}</NavLink>
        <NavLink to="/orders"><IconList size={26} />{t(T.orders).p}</NavLink>
        <NavLink to="/cart"><IconBasket size={26} />{totals.count > 0 && <span className="badge">{totals.count}</span>}{t(T.cart).p}</NavLink>
        <NavLink to="/help"><IconHelp size={26} />{t(T.help).p}</NavLink>
      </nav>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const { t } = useStore();
  const pair = T.status[status] || [status, status];
  const cls = ["paid", "packing"].includes(status) ? "yellow" : status === "delivered" || status === "dispatched" ? "" : ["payment_failed", "pending_payment"].includes(status) ? "warn" : "grey";
  return <span className={"status " + cls}>{t(pair).p}</span>;
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function ErrorBox({ onRetry }: { onRetry: () => void }) {
  const { t } = useStore();
  return (
    <div className="stack pad" style={{ padding: 24, alignItems: "center" }}>
      <p className="center">{t(T.errorGeneric).p}</p>
      <button className="btn soft" onClick={onRetry}>{t(T.retry).p}</button>
    </div>
  );
}

export function BigLink({ to, children, className = "btn primary big block" }: { to: string; children: ReactNode; className?: string }) {
  return <Link className={className} to={to}>{children}</Link>;
}
