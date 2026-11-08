import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra?: Record<string, unknown>) {
    super(message || code);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return json({ error: e.code, message: e.message, ...(e.extra || {}) }, e.status);
  }
  if (e instanceof z.ZodError) {
    return json({ error: "INVALID_INPUT", message: "Please check the details entered", issues: e.issues.map((i) => i.path.join(".")) }, 400);
  }
  console.error("Unhandled API error", e);
  return json({ error: "SERVER_ERROR", message: "Something went wrong. Please try again." }, 500);
}

export async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 1_000_000) throw new ApiError(413, "TOO_LARGE");
  let data: unknown = {};
  const text = await req.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(400, "INVALID_JSON");
    }
  }
  return schema.parse(data);
}

export function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function cookieHeader(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    `Max-Age=${maxAgeSec}`,
  ]
    .filter(Boolean)
    .join("; ");
}

/** Blocks cross-site form posts: state-changing requests must come from our own origin. */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (webhooks are verified by signature separately)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new ApiError(403, "BAD_ORIGIN");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(403, "BAD_ORIGIN");
  }
}
