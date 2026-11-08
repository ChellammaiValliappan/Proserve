import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "./store";
import { T } from "../i18n";
import { BottomNav, ProductRow, Spinner, TopBar, ErrorBox } from "./ui";
import { IconSearch } from "../components/Icons";

export default function Products() {
  const { t, categories, products, catalogLoaded, loadCatalog } = useStore();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "all";
  const [q, setQ] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (!catalogLoaded) loadCatalog().catch(() => setFailed(true)); }, [catalogLoaded, loadCatalog]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => (cat === "all" || p.categoryId === cat) && (!s || p.name_en.toLowerCase().includes(s) || p.name_ta.includes(q.trim())));
  }, [products, cat, q]);

  const current = categories.find((c) => c.id === cat);
  const title = current ? ([current.name_ta, current.name_en] as const) : T.allItems;

  return (
    <>
      <main className="screen">
        <TopBar title={title} back="/" />
        <div className="stack" style={{ background: "#fff", padding: "0 16px 12px", gap: 12, boxShadow: "0 1px 0 var(--line)" }}>
          <label className="row" style={{ height: 50, borderRadius: 14, background: "var(--bg)", padding: "0 12px" }}>
            <IconSearch size={22} stroke="#4A584D" />
            <span className="sr-only">Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(T.search).p} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", outline: "none", fontSize: 17 }} />
          </label>
          <div className="chips" role="group" aria-label={t(T.categories).p}>
            <button className="chip" aria-pressed={cat === "all"} onClick={() => setParams({})}>{t(T.allItems).p}</button>
            {categories.map((c) => (
              <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setParams({ cat: c.id })}>{t([c.name_ta, c.name_en]).p}</button>
            ))}
          </div>
        </div>
        <div className="stack" style={{ padding: "12px 16px", gap: 10 }}>
          {failed ? <ErrorBox onRetry={() => { setFailed(false); loadCatalog().catch(() => setFailed(true)); }} /> : !catalogLoaded ? <Spinner /> : list.length === 0 ? (
            <p className="center muted" style={{ padding: 40 }}>{t(T.noMatch).p} · {t(T.noMatch).s}</p>
          ) : list.map((p) => <ProductRow key={p.id} p={p} />)}
        </div>
      </main>
      <BottomNav strip />
    </>
  );
}
