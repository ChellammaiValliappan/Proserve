import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "./store";
import { T, fmtDate } from "../i18n";
import { get } from "../api";
import { rupees } from "../../shared/rules";
import { BottomNav, ProductRow, Spinner, ErrorBox, StatusPill } from "./ui";
import { IconSearch, IconTruck, IconNext, IconUser, ProductArt } from "../components/Icons";

export default function Home() {
  const { t, me, setLang, lang, categories, products, catalogLoaded, loadCatalog, config } = useStore();
  const nav = useNavigate();
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<any | null>(null);

  useEffect(() => {
    if (!catalogLoaded) loadCatalog().catch(() => setFailed(true));
    get("/api/orders").then((r) => setActive(r.orders.find((o: any) => ["paid", "packing", "dispatched", "pending_payment", "payment_failed"].includes(o.status)) || null)).catch(() => undefined);
  }, [catalogLoaded, loadCatalog]);

  const best = [...products].filter((p) => p.stock > 0 && p.mrp).sort((a, b) => (b.mrp! - b.price) / b.mrp! - (a.mrp! - a.price) / a.mrp!).slice(0, 4);
  const name = me?.name || (lang === "ta" ? "பார்ட்னர்" : "Partner");

  return (
    <>
      <main className="screen">
        <div className="hero">
          <div className="row between">
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <h1>{t(T.welcome).p}, {name}!</h1>
              <span className="small" style={{ opacity: 0.9 }}>Partner ID · <strong>{me?.partnerId}</strong></span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="pill-btn" aria-label={t(T.language).p} onClick={() => setLang(lang === "ta" ? "en" : "ta")}>அ / A</button>
              <Link className="pill-btn" style={{ display: "inline-flex", alignItems: "center", padding: "0 10px" }} to="/profile" aria-label={t(T.profile).p}><IconUser size={22} /></Link>
            </div>
          </div>
          <button onClick={() => nav("/products")} style={{ height: 56, borderRadius: 16, border: 0, background: "#fff", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", textAlign: "left" }}>
            <IconSearch stroke="#4A584D" />
            <span className="grow" style={{ fontSize: 17, color: "var(--muted)" }}>{t(T.search).p}</span>
          </button>
        </div>

        <div className="notice info" style={{ margin: "14px 16px 0" }}>
          <IconTruck size={36} stroke="#8A5A00" />
          <span style={{ display: "flex", flexDirection: "column" }}><span className="strong">{t(T.promise).p}</span><span className="small" style={{ fontWeight: 500 }}>{t(T.promise).s}</span></span>
        </div>

        {active && (
          <Link to={`/orders/${active.id}`} className="card row" style={{ margin: "12px 16px 0", border: "2px solid var(--green)", textDecoration: "none", color: "inherit" }}>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="row" style={{ gap: 8 }}><strong>{active.orderNo}</strong><StatusPill status={active.status} /></span>
              <span className="small muted">{t(T.deliveryOn).p} · {fmtDate(active.expectedDelivery, lang)}</span>
            </span>
            <IconNext stroke="#1E7B3A" />
          </Link>
        )}

        {me && me.pinServiceable === false && (
          <Link to="/profile/edit" className="notice err" style={{ margin: "12px 16px 0", textDecoration: "none" }}>{t(T.pinBad).p} · {t(T.change).p}</Link>
        )}

        <div className="section-title"><h2>{t(T.categories).p}</h2><span className="small muted">{t(T.categories).s}</span></div>
        {failed ? <ErrorBox onRetry={() => { setFailed(false); loadCatalog().catch(() => setFailed(true)); }} /> : !catalogLoaded ? <Spinner /> : (
          <div className="cat-grid">
            <button className="cat-tile" style={{ background: "#fff" }} onClick={() => nav("/products")}>
              <ProductArt kind="all" /><b>{t(T.allItems).p}</b><small>{t(T.allItems).s}</small>
            </button>
            {categories.map((c) => {
              const n = t([c.name_ta, c.name_en]);
              return (
                <button key={c.id} className="cat-tile" style={{ background: c.tint }} onClick={() => nav(`/products?cat=${c.id}`)}>
                  <ProductArt kind={c.kind} /><b>{n.p}</b><small>{n.s}</small>
                </button>
              );
            })}
          </div>
        )}

        {config && (
          <>
            <div className="section-title"><h2>{t(T.plans).p}</h2><span className="small muted">{t(T.plans).s}</span></div>
            <div className="plans">
              <div className="plan"><span className="small strong muted">{t(T.trial).p}</span><b>{rupees(config.min_order_paise)}</b><span className="tiny strong" style={{ color: "var(--warn)" }}>+ {t(T.deliveryFee).p} {rupees(config.delivery_fee_paise)}</span></div>
              <div className="plan growth"><span className="small strong" style={{ color: "var(--green)" }}>{t(T.growth).p}</span><b>{rupees(config.free_delivery_paise)}</b><span className="tiny strong" style={{ color: "var(--green-dark)" }}>{t(T.freeDel).p}</span></div>
              <div className="plan premium"><span className="small strong" style={{ color: "var(--yellow)" }}>★ {t(T.premium).p}</span><b>{rupees(config.premium_paise)}</b><span className="tiny strong">{t(T.freeDel).p}</span></div>
            </div>
          </>
        )}

        {best.length > 0 && (
          <>
            <div className="section-title"><h2>{t(T.bestPrices).p}</h2><span className="small muted">{t(T.bestPrices).s}</span></div>
            <div className="stack pad" style={{ gap: 10 }}>{best.map((p) => <ProductRow key={p.id} p={p} />)}</div>
          </>
        )}
      </main>
      <BottomNav strip />
    </>
  );
}
