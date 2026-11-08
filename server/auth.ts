// Sessions are signed JWTs kept in HttpOnly, Secure, SameSite=Strict cookies (not readable by page scripts).
import { SignJWT, jwtVerify } from "jose";
import { scrypt as _scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { requireEnv, appEnv } from "./env.ts";
import { ApiError, getCookie, cookieHeader } from "./http.ts";
import { one } from "./db.ts";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const RESELLER_COOKIE = "ps_r";
export const ADMIN_COOKIE = "ps_a";
const RESELLER_TTL = 60 * 60 * 24 * 30; // 30 days – resellers stay logged in on their phone
const ADMIN_TTL = 60 * 60 * 10; // 10 hours

function key() {
  const s = requireEnv("JWT_SECRET");
  if (s.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

const secureCookies = () => appEnv() !== "development";

async function sign(payload: Record<string, unknown>, ttl: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setIssuer("proserve")
    .sign(key());
}

async function verify(token: string) {
  const { payload } = await jwtVerify(token, key(), { issuer: "proserve", algorithms: ["HS256"] });
  return payload;
}

export async function resellerCookie(id: number, tokenVersion: number) {
  const t = await sign({ sub: String(id), typ: "r", v: tokenVersion }, RESELLER_TTL);
  return cookieHeader(RESELLER_COOKIE, t, RESELLER_TTL, secureCookies());
}
export async function adminCookie(id: number, tokenVersion: number) {
  const t = await sign({ sub: String(id), typ: "a", v: tokenVersion }, ADMIN_TTL);
  return cookieHeader(ADMIN_COOKIE, t, ADMIN_TTL, secureCookies());
}
export const clearCookie = (name: string) => cookieHeader(name, "", 0, secureCookies());

export interface ResellerSession {
  id: number;
  phone: string;
  partner_id: string | null;
  name: string | null;
  address: string | null;
  area: string | null;
  pin: string | null;
  lang: string;
  status: string;
}

export async function requireReseller(req: Request): Promise<ResellerSession> {
  const tok = getCookie(req, RESELLER_COOKIE);
  if (!tok) throw new ApiError(401, "NOT_LOGGED_IN");
  let p;
  try {
    p = await verify(tok);
  } catch {
    throw new ApiError(401, "NOT_LOGGED_IN");
  }
  if (p.typ !== "r") throw new ApiError(401, "NOT_LOGGED_IN");
  const r = await one<ResellerSession & { token_version: number }>(
    "SELECT id, phone, partner_id, name, address, area, pin, lang, status, token_version FROM resellers WHERE id = $1",
    [Number(p.sub)],
  );
  if (!r || r.token_version !== p.v) throw new ApiError(401, "NOT_LOGGED_IN");
  if (r.status !== "active") throw new ApiError(403, "ACCOUNT_BLOCKED", "Your account is blocked. Please contact support.");
  return r;
}

export interface AdminSession {
  id: number;
  email: string;
  name: string;
  role: "admin" | "staff";
}

export async function requireAdmin(req: Request, role: "admin" | "staff" = "staff"): Promise<AdminSession> {
  const tok = getCookie(req, ADMIN_COOKIE);
  if (!tok) throw new ApiError(401, "NOT_LOGGED_IN");
  let p;
  try {
    p = await verify(tok);
  } catch {
    throw new ApiError(401, "NOT_LOGGED_IN");
  }
  if (p.typ !== "a") throw new ApiError(401, "NOT_LOGGED_IN");
  const a = await one<AdminSession & { active: boolean; token_version: number }>(
    "SELECT id, email, name, role, active, token_version FROM admins WHERE id = $1",
    [Number(p.sub)],
  );
  if (!a || !a.active || a.token_version !== p.v) throw new ApiError(401, "NOT_LOGGED_IN");
  if (role === "admin" && a.role !== "admin") throw new ApiError(403, "FORBIDDEN", "Only an admin can do this");
  return a;
}

// Password hashing (scrypt, random salt)
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const h = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === h.length && timingSafeEqual(expected, h);
}

/** Hash for OTP codes (short-lived). Includes the phone and server secret so codes can't be reversed from the DB. */
export function otpHash(phone: string, code: string): string {
  return createHash("sha256").update(`${requireEnv("JWT_SECRET")}:${phone}:${code}`).digest("hex");
}
