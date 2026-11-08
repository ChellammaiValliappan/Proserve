// Fixed-window rate limiting stored in Postgres (no extra paid service needed).
import { one } from "./db.ts";
import { ApiError } from "./http.ts";

export async function rateLimit(key: string, limit: number, windowSec: number, message?: string) {
  const row = await one<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING count`,
    [key, windowSec],
  );
  if (row && row.count > limit) {
    throw new ApiError(429, "TOO_MANY_REQUESTS", message || "Too many attempts. Please wait a few minutes and try again.");
  }
}
