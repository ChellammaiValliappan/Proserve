// Reads configuration from Netlify environment variables (or process.env locally).
declare const Netlify: { env: { get(k: string): string | undefined } } | undefined;

export function env(key: string): string | undefined {
  try {
    if (typeof Netlify !== "undefined" && Netlify?.env) {
      const v = Netlify.env.get(key);
      if (v !== undefined) return v;
    }
  } catch {
    /* not running on Netlify */
  }
  return process.env[key];
}

export function requireEnv(key: string): string {
  const v = env(key);
  if (!v) throw new Error(`Missing required environment variable ${key}`);
  return v;
}

export const appEnv = () => (env("APP_ENV") || "development") as "development" | "dev" | "production";
export const isProduction = () => appEnv() === "production";

/** Dev-only conveniences (on-screen OTP, mock payments) are hard-blocked in production. */
export function otpMode(): "dev" | "msg91" {
  const m = env("OTP_MODE") === "msg91" ? "msg91" : "dev";
  if (isProduction() && m !== "msg91") throw new Error("OTP_MODE=dev is not allowed in production");
  return m;
}

export function paymentMode(): "mock" | "razorpay" {
  const m = env("PAYMENT_MODE") === "razorpay" ? "razorpay" : "mock";
  if (isProduction() && m !== "razorpay") throw new Error("PAYMENT_MODE=mock is not allowed in production");
  return m;
}
