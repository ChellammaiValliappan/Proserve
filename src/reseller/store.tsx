import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { get, put } from "../api";
import { tr, type Lang, type Pair } from "../i18n";
import { deliveryFeeFor, tierFor, type PricingSettings } from "../../shared/rules";

export interface Me {
  phone: string;
  partnerId: string;
  name: string | null;
  address: string | null;
  area: string | null;
  pin: string | null;
  lang: Lang;
  profileComplete: boolean;
  pinServiceable: boolean | null;
}
export interface Category { id: string; name_ta: string; name_en: string; kind: string; tint: string }
export interface Product { id: number; categoryId: string; name_ta: string; name_en: string; packSize: string; mrp: number | null; price: number; stock: number; maxPerOrder: number | null; kind: string; image: string | null }
export interface Config extends PricingSettings { support_phone: string; support_whatsapp: string; cancel_allowed_until: string; order_cutoff_hour: number; no_delivery_weekdays: number[]; paymentMode: "mock" | "razorpay" }

interface Store {
  lang: Lang;
  setLang(l: Lang): void;
  t(p: Pair): { p: string; s: string };
  me: Me | null | undefined; // undefined = still checking
  setMe(m: Me | null): void;
  config: Config | null;
  categories: Category[];
  products: Product[];
  catalogLoaded: boolean;
  loadCatalog(): Promise<void>;
  cart: Record<number, number>;
  setQty(id: number, qty: number): void;
  replaceCart(c: Record<number, number>): void;
  clearCart(): void;
  totals: { subtotal: number; fee: number; total: number; count: number; tier: string };
  toast: string | null;
  showToast(msg: string): void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("Store missing");
  return s;
};

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => load<Lang>("ps_lang", "ta"));
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [config, setConfig] = useState<Config | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [cart, setCart] = useState<Record<number, number>>(() => load("ps_cart", {}));
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    get<{ me: Me }>("/api/me").then((r) => { setMe(r.me); if (r.me.lang) setLangState(r.me.lang); }).catch(() => setMe(null));
    get<Config>("/api/config").then(setConfig).catch(() => undefined);
  }, []);

  useEffect(() => { save("ps_cart", cart); }, [cart]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    save("ps_lang", l);
    if (me) put("/api/me/lang", { lang: l }).catch(() => undefined);
  }, [me]);

  const loadCatalog = useCallback(async () => {
    const r = await get<{ categories: Category[]; products: Product[] }>("/api/catalog");
    setCategories(r.categories);
    setProducts(r.products);
    setCatalogLoaded(true);
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setCart((c) => {
      const n = { ...c };
      if (qty <= 0) delete n[id];
      else n[id] = qty;
      return n;
    });
  }, []);

  const totals = useMemo(() => {
    let subtotal = 0, count = 0;
    for (const [id, qty] of Object.entries(cart)) {
      const p = products.find((x) => x.id === Number(id));
      if (p) { subtotal += p.price * qty; count += qty; }
    }
    const s = config || { min_order_paise: 100000, free_delivery_paise: 300000, premium_paise: 500000, delivery_fee_paise: 0 };
    const fee = deliveryFeeFor(subtotal, s);
    return { subtotal, fee, total: subtotal + fee, count, tier: tierFor(subtotal, s) };
  }, [cart, products, config]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const value: Store = {
    lang, setLang, t: (p) => tr(p, lang), me, setMe, config, categories, products, catalogLoaded, loadCatalog,
    cart, setQty, replaceCart: setCart, clearCart: () => setCart({}), totals, toast, showToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
