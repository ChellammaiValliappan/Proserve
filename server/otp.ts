// One-time passwords for mobile login.
// dev mode: the code is returned to the app so testers can log in without SMS (blocked in production).
// msg91 mode: the code is sent by SMS through MSG91 (Indian DLT-compliant SMS provider).
import { randomInt, timingSafeEqual } from "node:crypto";
import { one, q } from "./db.ts";
import { otpHash } from "./auth.ts";
import { env, otpMode } from "./env.ts";
import { ApiError } from "./http.ts";
import { rateLimit } from "./ratelimit.ts";

const OTP_TTL_SEC = 5 * 60;
const MAX_ATTEMPTS = 5;

export async function sendOtp(phone: string, ip: string): Promise<{ devCode?: string }> {
  await rateLimit(`otp:phone:${phone}`, 5, 15 * 60);
  await rateLimit(`otp:ip:${ip}`, 20, 15 * 60);
  const code = String(randomInt(0, 10000)).padStart(4, "0");
  await q(
    `INSERT INTO otp_codes (phone, code_hash, expires_at, attempts) VALUES ($1, $2, now() + make_interval(secs => $3), 0)
     ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = now()`,
    [phone, otpHash(phone, code), OTP_TTL_SEC],
  );
  const mode = otpMode();
  if (mode === "dev") return { devCode: code };
  await sendSmsMsg91(phone, code);
  return {};
}

async function sendSmsMsg91(phone: string, code: string) {
  const authKey = env("MSG91_AUTH_KEY");
  const templateId = env("MSG91_TEMPLATE_ID");
  if (!authKey || !templateId) throw new ApiError(500, "SMS_NOT_CONFIGURED", "SMS is not set up yet");
  const res = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { authkey: authKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ template_id: templateId, short_url: "0", recipients: [{ mobiles: `91${phone}`, otp: code }] }),
  });
  if (!res.ok) {
    console.error("MSG91 error", res.status, await res.text().catch(() => ""));
    throw new ApiError(502, "SMS_FAILED", "Could not send OTP. Please try again.");
  }
}

export async function verifyOtp(phone: string, code: string): Promise<void> {
  const row = await one<{ code_hash: string; attempts: number; expired: boolean }>(
    "SELECT code_hash, attempts, expires_at < now() AS expired FROM otp_codes WHERE phone = $1",
    [phone],
  );
  if (!row || row.expired) throw new ApiError(400, "OTP_EXPIRED", "OTP expired. Please request a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "OTP_LOCKED", "Too many wrong attempts. Please request a new OTP.");
  const a = Buffer.from(row.code_hash, "hex");
  const b = Buffer.from(otpHash(phone, code), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await q("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1", [phone]);
    throw new ApiError(400, "OTP_WRONG", "Wrong OTP. Please try again.");
  }
  await q("DELETE FROM otp_codes WHERE phone = $1", [phone]);
}
