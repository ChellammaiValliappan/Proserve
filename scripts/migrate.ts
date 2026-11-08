// Applies db/migrations/*.sql in order, once each. Usage: DATABASE_URL=... npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../server/db.ts";

const dir = join(import.meta.dirname, "..", "db", "migrations");
const p = await pool();
await p.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const done = new Set((await p.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query(readFileSync(join(dir, f), "utf8"));
    await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    await c.query("COMMIT");
    console.log("applied", f);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("failed", f, e);
    process.exit(1);
  } finally {
    c.release();
  }
}
console.log("migrations up to date");
process.exit(0);
