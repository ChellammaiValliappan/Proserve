import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "./store";
import { T } from "../i18n";
import { post, ApiFail } from "../api";
import { Bi } from "./ui";
import { Logo, IconRupee, IconTruck, IconShield, IconBack } from "../components/Icons";

export default function Login() {
  const { t, lang, setLang, setMe } = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    setErr(null);
    if (!/^[6-9][0-9]{9}$/.test(phone)) return setErr(t(T.validPhone).p + " · " + t(T.validPhone).s);
    setBusy(true);
    try {
      const r = await post<{ devCode?: string }>("/api/auth/otp", { phone });
      setDevCode(r.devCode || null);
      setCode("");
      setStep("otp");
    } catch (e) {
      setErr(e instanceof ApiFail ? e.message : t(T.errorGeneric).p);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setErr(null);
    if (!/^\d{4}$/.test(code)) return setErr(t(T.wrongOtp).p);
    setBusy(true);
    try {
      const r = await post("/api/auth/verify", { phone, code, lang });
      setMe(r.me);
      nav(r.me.profileComplete ? "/" : "/register", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiFail ? (e.code === "OTP_WRONG" ? `${t(T.wrongOtp).p} · ${t(T.wrongOtp).s}` : e.message) : t(T.errorGeneric).p);
    } finally {
      setBusy(false);
    }
  }

  if (step === "otp")
    return (
      <main className="screen" style={{ padding: 20, gap: 20 }}>
        <button className="icon-btn" style={{ background: "#fff" }} aria-label={t(T.changeNumber).p} onClick={() => setStep("phone")}><IconBack /></button>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 30 }}>{t(T.enterOtp).p}</h1>
          <span className="muted">{t(T.enterOtp).s}</span>
          <span style={{ fontSize: 16, marginTop: 8 }}>{t(T.otpSent).p} <strong>+91 {phone}</strong></span>
        </div>
        <label className="sr-only" htmlFor="otp">OTP</label>
        <input id="otp" className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={4} autoFocus value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={(e) => e.key === "Enter" && verify()} placeholder="••••" />
        {devCode && <div className="notice info">Test mode OTP: <strong style={{ fontSize: 20, letterSpacing: 4 }}>{devCode}</strong></div>}
        {err && <div className="notice err" role="alert">{err}</div>}
        <button className="btn primary big" disabled={busy} onClick={verify}><Bi pair={T.verify} /></button>
        <button className="link-btn" disabled={busy} onClick={sendOtp}>{t(T.resend).p} · {t(T.resend).s}</button>
      </main>
    );

  return (
    <main className="screen" style={{ paddingBottom: 0 }}>
      <div style={{ background: "var(--green)", color: "#fff", padding: "36px 24px 72px", borderRadius: "0 0 32px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <Logo />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 24, lineHeight: 1 }}>ProServe</span>
            <span style={{ fontSize: 14, opacity: 0.9 }}>Grocery Partner</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
          <h1 style={{ fontSize: 34 }}>{t(T.welcome).p}</h1>
          <span style={{ fontSize: 17, lineHeight: 1.35 }}>{t(T.tagline).p}</span>
          <span style={{ fontSize: 13, opacity: 0.85 }}>{t(T.tagline).s}</span>
        </div>
      </div>
      <div className="card stack" style={{ margin: "-44px 20px 0", padding: 22, gap: 16, boxShadow: "0 10px 28px rgba(20,60,30,.14)", borderRadius: 24 }}>
        <div className="stack" style={{ gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#4A584D" }}>மொழி · Language</span>
          <div className="chip-row">
            <button className="choice" aria-pressed={lang === "ta"} onClick={() => setLang("ta")}>தமிழ்</button>
            <button className="choice" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label htmlFor="ph" style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{t(T.mobile).p}</span>
            <span className="small muted">{t(T.mobile).s}</span>
          </label>
          <div className="phone-box">
            <span style={{ fontSize: 20, fontWeight: 700, color: "#4A584D" }}>+91</span>
            <span style={{ width: 1, height: 28, background: "var(--line-strong)" }} />
            <input id="ph" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={phone}
              onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(-10)); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && sendOtp()} />
          </div>
          {err && <span role="alert" style={{ color: "var(--danger)", fontWeight: 700, fontSize: 14 }}>{err}</span>}
        </div>
        <button className="btn primary big" disabled={busy} onClick={sendOtp}><Bi pair={T.getOtp} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, padding: "22px 20px 24px" }}>
        {[[T.trust1, <IconRupee size={28} stroke="#1E7B3A" />, "#E2F1E6"], [T.trust2, <IconTruck size={28} stroke="#8A5A00" />, "#FFF1CC"], [T.trust3, <IconShield size={28} stroke="#2B5A8C" />, "#E6EEF8"]].map(([pair, icon, bg], i) => (
          <div key={i} className="center" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: bg as string, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon as any}</div>
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{t(pair as any).p}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
