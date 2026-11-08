import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "./store";
import { T } from "../i18n";
import { put, post, ApiFail } from "../api";
import { Bi, TopBar } from "./ui";
import { IconCheck } from "../components/Icons";

/** First-time registration and later profile editing share this screen. */
export default function Register({ edit = false }: { edit?: boolean }) {
  const { t, me, setMe, lang, setLang } = useStore();
  const nav = useNavigate();
  const [f, setF] = useState({ name: me?.name || "", address: me?.address || "", area: me?.area || "", pin: me?.pin || "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<boolean | null>(me?.pinServiceable ?? null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === "pin" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value;
    setF({ ...f, [k]: v });
    if (k === "pin") setChecked(null);
  };

  async function submit() {
    setErr(null);
    if (f.name.trim().length < 2 || f.address.trim().length < 3 || f.area.trim().length < 2 || !/^[1-9]\d{5}$/.test(f.pin)) {
      return setErr(`${t(T.fillAll).p} · ${t(T.fillAll).s}`);
    }
    setBusy(true);
    try {
      const r = await put("/api/me", { ...f, lang });
      setMe(r.me);
      setChecked(r.me.pinServiceable);
      if (r.me.pinServiceable) nav(edit ? "/profile" : "/", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiFail ? e.message : t(T.errorGeneric).p);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await post("/api/auth/logout").catch(() => undefined);
    setMe(null);
    nav("/login", { replace: true });
  }

  const Field = ({ k, pair, ...rest }: { k: keyof typeof f; pair: readonly [string, string] } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="field">
      <span>{t(pair).p} <em>· {t(pair).s}</em></span>
      <input className="input" value={f[k]} onChange={set(k)} {...rest} />
    </label>
  );

  return (
    <main className="screen">
      <TopBar title={edit ? T.profile : T.yourDetails} back={edit ? "/profile" : undefined} />
      <div className="stack" style={{ padding: 20, gap: 16 }}>
        {me && <div className="notice info">Partner ID · <strong>{me.partnerId}</strong> · +91 {me.phone}</div>}
        {Field({ k: "name", pair: T.name, autoComplete: "name", maxLength: 80 })}
        {Field({ k: "address", pair: T.address, autoComplete: "street-address", maxLength: 200 })}
        {Field({ k: "area", pair: T.area, autoComplete: "address-level2", maxLength: 80 })}
        {Field({ k: "pin", pair: T.pin, inputMode: "numeric", autoComplete: "postal-code", style: { fontWeight: 700, letterSpacing: 2, fontSize: 22 } })}
        {checked === true && <div className="notice ok"><IconCheck size={22} />{t(T.pinOk).p} · {t(T.pinOk).s}</div>}
        {checked === false && <div className="notice err" role="alert">{t(T.pinBad).p} · {t(T.pinBad).s}</div>}
        {err && <div className="notice err" role="alert">{err}</div>}
        <button className="btn primary big" disabled={busy} onClick={submit}><Bi pair={edit ? T.save : T.startShopping} /></button>
        {edit && (
          <>
            <button className="btn ghost" onClick={() => setLang(lang === "ta" ? "en" : "ta")}>அ/A · {t(T.language).p}</button>
            <button className="btn danger" onClick={logout}>{t(T.logout).p} · {t(T.logout).s}</button>
          </>
        )}
      </div>
    </main>
  );
}
