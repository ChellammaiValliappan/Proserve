import { ApiError, assertSameOrigin, errorResponse, json } from "./http.ts";
import { resellerRoutes } from "./routes/reseller.ts";
import { adminRoutes } from "./routes/admin.ts";
import { webhookRoutes } from "./routes/webhook.ts";

export interface Ctx {
  params: Record<string, string>;
  ip: string;
}
export type Handler = (req: Request, ctx: Ctx) => Promise<Response>;
export type Route = [method: string, pattern: string, handler: Handler];

const compiled = [...webhookRoutes, ...resellerRoutes, ...adminRoutes].map(([method, pattern, handler]) => {
  const keys: string[] = [];
  const re = new RegExp(
    "^" + pattern.replace(/:([a-zA-Z]+)/g, (_m, k) => {
      keys.push(k);
      return "([^/]+)";
    }) + "/?$",
  );
  return { method, re, keys, handler, pattern };
});

export async function handle(req: Request, ip: string): Promise<Response> {
  try {
    const path = new URL(req.url).pathname;
    let methodMatched = false;
    for (const r of compiled) {
      const m = r.re.exec(path);
      if (!m) continue;
      methodMatched = true;
      if (r.method !== req.method) continue;
      if (!r.pattern.startsWith("/api/payments/webhook")) assertSameOrigin(req);
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      if (params.id !== undefined && !/^\d{1,12}$/.test(params.id) && !r.pattern.includes("categories")) throw new ApiError(404, "NOT_FOUND");
      return await r.handler(req, { params, ip });
    }
    return methodMatched ? json({ error: "METHOD_NOT_ALLOWED" }, 405) : json({ error: "NOT_FOUND" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}
