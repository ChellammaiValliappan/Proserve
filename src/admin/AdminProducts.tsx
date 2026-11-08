import { useCallback, useEffect, useState } from "react";
import { get, post, put, del } from "../api";
import { rupees } from "../../shared/rules";
import { ProductArt } from "../components/Icons";
import { useAdmin, errText } from "./AdminApp";

const KINDS = ["sack", "dal", "oil", "sugar", "flour", "salt"];
const empty = { id: 0, sku: "", categoryId: "rice", name_ta: "", name_en: "", packSize: "", mrp: "", price: "", cost: "", stock: "0", maxPerOrder: "", kind: "sack", active: true };

/** Shrinks a photo in the browser to max 600px WebP so uploads stay small and cheap to serve. */
async function resize(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/webp", 0.82);
}

export function ProductsPage() {
  const { admin, flash } = useAdmin();
  const [data, setData] = useState<{ products: any[]; categories: any[] } | null>(null);
  const [edit, setEdit] = useState<typeof empty | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stockEdit, setStockEdit] = useState<Record<number, string>>({});
  const canEdit = admin.role === "admin";
  const load = useCallback(() => { get("/api/admin/products").then(setData).catch((e) => setErr(errText(e))); }, []);
  useEffect(load, [load]);

  async function saveProduct() {
    if (!edit) return;
    setErr(null);
    const num = (v: string) => (v === "" ? null : Number(v));
    const payload = {
      sku: edit.sku || null, categoryId: edit.categoryId, name_ta: edit.name_ta, name_en: edit.name_en, packSize: edit.packSize,
      mrp: num(edit.mrp), price: Number(edit.price), cost: num(edit.cost), stock: Number(edit.stock), maxPerOrder: num(edit.maxPerOrder), kind: edit.kind, active: edit.active,
    };
    try {
      if (edit.id) await put(`/api/admin/products/${edit.id}`, payload);
      else await post("/api/admin/products", payload);
      setEdit(null);
      flash("Product saved");
      load();
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function setStock(id: number, mode: "set" | "add") {
    const v = Number(stockEdit[id]);
    if (!Number.isInteger(v)) return;
    try {
      await post(`/api/admin/products/${id}/stock`, { mode, value: v });
      setStockEdit({ ...stockEdit, [id]: "" });
      flash("Stock updated");
      load();
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function upload(id: number, file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await resize(file);
      await post(`/api/admin/products/${id}/image`, { dataUrl });
      flash("Photo uploaded");
      load();
    } catch (e) {
      setErr(errText(e));
    }
  }

  if (!data) return err ? <div className="notice err">{err}</div> : <div className="spinner" />;
  const r = (p: number | null) => (p == null ? "" : String(p / 100));
  return (
    <>
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <h1>Products, pricing & stock</h1>
        {canEdit && <button className="a-btn primary" onClick={() => setEdit({ ...empty, categoryId: data.categories[0]?.id || "rice" })}>+ Add product</button>}
      </div>
      <span className="small muted">Prices are in rupees. Changes apply to new orders immediately; partners with an older price in their cart are asked to confirm the new total.</span>
      {err && <div className="notice err">{err}</div>}

      {edit && (
        <div className="panel" style={{ borderColor: "var(--green)" }}>
          <h2>{edit.id ? "Edit product" : "New product"}</h2>
          <div className="form-grid">
            <label className="a-field">Name (English)<input className="a-input" value={edit.name_en} onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} /></label>
            <label className="a-field">Name (Tamil)<input className="a-input" value={edit.name_ta} onChange={(e) => setEdit({ ...edit, name_ta: e.target.value })} /></label>
            <label className="a-field">Pack size<input className="a-input" placeholder="1 kg" value={edit.packSize} onChange={(e) => setEdit({ ...edit, packSize: e.target.value })} /></label>
            <label className="a-field">Category<select className="a-input" value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</select></label>
            <label className="a-field">Wholesale price ₹<input className="a-input" type="number" min="0" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></label>
            <label className="a-field">MRP ₹ (optional)<input className="a-input" type="number" min="0" step="0.01" value={edit.mrp} onChange={(e) => setEdit({ ...edit, mrp: e.target.value })} /></label>
            <label className="a-field">Cost ₹ (for margin reports, hidden)<input className="a-input" type="number" min="0" step="0.01" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} /></label>
            <label className="a-field">Stock<input className="a-input" type="number" min="0" step="1" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} /></label>
            <label className="a-field">Max per order (optional)<input className="a-input" type="number" min="1" step="1" value={edit.maxPerOrder} onChange={(e) => setEdit({ ...edit, maxPerOrder: e.target.value })} /></label>
            <label className="a-field">SKU (optional)<input className="a-input" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /></label>
            <label className="a-field">Picture style<select className="a-input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
            <label className="a-field" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20 }}><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Visible to partners</label>
          </div>
          <div className="toolbar"><button className="a-btn primary" onClick={saveProduct}>Save</button><button className="a-btn" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">MRP</th><th className="num">Margin*</th><th className="num">Stock</th><th>Update stock</th><th>Status</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {data.products.map((p) => (
              <tr key={p.id}>
                <td>{p.image ? <img src={p.image} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: "cover" }} /> : <ProductArt kind={p.kind} size={36} />}</td>
                <td><strong>{p.name_en}</strong> · {p.packSize}<br /><span className="tiny muted">{p.name_ta}</span></td>
                <td>{data.categories.find((c) => c.id === p.categoryId)?.name_en}</td>
                <td className="num"><strong>{rupees(p.price)}</strong></td>
                <td className="num">{p.mrp ? rupees(p.mrp) : "—"}</td>
                <td className="num">{p.cost != null ? rupees(p.price - p.cost) : "—"}</td>
                <td className="num"><span className={"status " + (p.stock === 0 ? "err" : p.stock <= 5 ? "warn" : "")}>{p.stock}</span></td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <input className="a-input" style={{ width: 70 }} type="number" aria-label="Stock amount" value={stockEdit[p.id] ?? ""} onChange={(e) => setStockEdit({ ...stockEdit, [p.id]: e.target.value })} />
                    <button className="a-btn" onClick={() => setStock(p.id, "add")} title="Add received stock">+ Add</button>
                    <button className="a-btn" onClick={() => setStock(p.id, "set")} title="Set exact count">Set</button>
                  </div>
                </td>
                <td>{p.active ? <span className="status">Visible</span> : <span className="status grey">Hidden</span>}</td>
                {canEdit && (
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="a-btn" onClick={() => setEdit({ id: p.id, sku: p.sku || "", categoryId: p.categoryId, name_ta: p.name_ta, name_en: p.name_en, packSize: p.packSize, mrp: r(p.mrp), price: r(p.price), cost: r(p.cost), stock: String(p.stock), maxPerOrder: p.maxPerOrder ? String(p.maxPerOrder) : "", kind: p.kind, active: p.active })}>Edit</button>
                      <label className="a-btn" style={{ display: "inline-flex", alignItems: "center" }}>Photo<input type="file" accept="image/*" hidden onChange={(e) => upload(p.id, e.target.files?.[0])} /></label>
                      <button className="a-btn danger" onClick={async () => { if (!confirm(`Remove ${p.name_en}? (Products with past orders are hidden instead.)`)) return; try { await del(`/api/admin/products/${p.id}`); flash("Removed"); load(); } catch (e) { setErr(errText(e)); } }}>Remove</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="tiny muted">*Margin = wholesale price − cost (only when cost is entered).</span>
    </>
  );
}
