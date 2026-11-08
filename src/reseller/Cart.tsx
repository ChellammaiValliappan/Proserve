import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "./store";
import { T } from "../i18n";
import { rupees } from "../../shared/rules";
import { Bi, TopBar, TierBar, tierMessage, Thumb, QtyControl, Spinner, BottomNav } from "./ui";
import { ProductArt } from "../components/Icons";

export default function Cart() {
  const { t, lang, cart, products, catalogLoaded, loadCatalog, totals, config, me } = useStore();
  const nav = useNavigate();
  useEffect(() => { if (!catalogLoaded) loadCatalog().catch(() => undefined); }, [catalogLoaded, loadCatalog]);

  const items = products.filter((p) => cart[p.id]);
  if (!catalogLoaded) return <main className="screen"><TopBar title={T.cart} back="/" /><Spinner /></main>;

  if (items.length === 0)
    return (
      <>
        <main className="screen">
          <TopBar title={T.cart} back="/" />
          <div className="stack" style={{ alignItems: "center", padding: "60px 24px", textAlign: "center" }}>
            <ProductArt kind="all" size={88} />
            <h2 style={{ fontSize: 22 }}>{t(T.empty).p}</h2>
            <span className="muted">{t(T.empty).s}</span>
            <Link className="btn primary" to="/products">{t(T.browse).p}</Link>
          </div>
        </main>
        <BottomNav />
      </>
    );

  const msg = config ? tierMessage(totals.subtotal, config, lang) : null;
  const canPay = totals.tier !== "below_min" && items.every((p) => p.stock >= cart[p.id]);

  return (
    <main className="screen" style={{ paddingBottom: 0 }}>
      <TopBar title={T.cart} back="/" />
      <div className="stack" style={{ padding: "14px 16px", flex: 1 }}>
        {msg && (
          <div className="card stack">
            <span className="strong" style={{ color: msg.tone === "warn" ? "var(--warn)" : msg.tone === "ok" ? "var(--green-dark)" : "var(--ink)" }}>{msg.p}</span>
            <span className="tiny muted" style={{ marginTop: -8 }}>{msg.s}</span>
            <TierBar />
          </div>
        )}
        {items.map((p) => {
          const n = t([p.name_ta, p.name_en]);
          const q = cart[p.id];
          return (
            <div key={p.id} className="product">
              <Thumb p={p} small />
              <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
                <span className="p-name" style={{ fontSize: 16 }}>{n.p}</span>
                <span className="tiny muted">{p.packSize} × {q} · {rupees(p.price)}</span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{rupees(p.price * q)}</span>
                {p.stock < q && <span className="tiny" style={{ color: "var(--danger)", fontWeight: 800 }}>{p.stock <= 0 ? t(T.out).p : `${p.stock} ${t(T.onlyLeft).p}`}</span>}
              </div>
              <QtyControl p={p} />
            </div>
          );
        })}
        <Link to="/products" className="btn ghost" style={{ borderStyle: "dashed", borderColor: "var(--green)", color: "var(--green-dark)" }}>+ {t(T.addMore).p} · {t(T.addMore).s}</Link>
        <div className="card bill">
          <div className="line"><span>{t(T.items).p} ({totals.count})</span><strong>{rupees(totals.subtotal)}</strong></div>
          <div className="line"><span>{t(T.deliveryFee).p}</span><strong style={{ color: totals.fee === 0 ? "var(--green-dark)" : undefined }}>{totals.fee === 0 ? t(T.free).p : rupees(totals.fee)}</strong></div>
          <div className="line small muted"><span>{t(T.gst).p}</span></div>
          <hr />
          <div className="line" style={{ alignItems: "baseline" }}><span className="strong" style={{ fontSize: 17 }}>{t(T.toPay).p}</span><span className="total">{rupees(totals.total)}</span></div>
        </div>
      </div>
      <div className="action-bar">
        {!me?.profileComplete ? (
          <Link className="btn pay big block" to="/register">{t(T.addressNeeded).p}</Link>
        ) : canPay ? (
          <button className="btn primary big block" style={{ flexDirection: "row", justifyContent: "space-between" }} onClick={() => nav("/checkout")}>
            <span style={{ fontSize: 22 }}>{rupees(totals.total)}</span>
            <Bi pair={[T.continuePay[0] + " →", T.continuePay[1]]} />
          </button>
        ) : (
          <div className="notice warn" style={{ flexDirection: "column", textAlign: "center", justifyContent: "center", minHeight: 64 }}>
            <span style={{ fontSize: 17 }}>{msg?.tone === "warn" ? msg.p : t(T.stockChanged).p}</span>
            {config && <span className="tiny" style={{ fontWeight: 500 }}>{t(T.minRule).p} {rupees(config.min_order_paise)} · {t(T.minRule).s} {rupees(config.min_order_paise)}</span>}
          </div>
        )}
      </div>
    </main>
  );
}
