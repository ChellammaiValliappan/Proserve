// Single API function: every /api/* request is routed inside server/router.ts.
// One function keeps cold starts low and costs minimal on Netlify's free plan.
import type { Config, Context } from "@netlify/functions";
import { handle } from "../../server/router.ts";

export default async (req: Request, context: Context) => handle(req, context.ip || "unknown");

export const config: Config = {
  path: "/api/*",
};
