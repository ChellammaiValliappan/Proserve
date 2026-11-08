// Database access. Uses Neon's serverless driver in the cloud and node-postgres locally.
// Both expose the same pg-compatible API. All queries are parameterised ($1, $2…) – never string-built.
import { requireEnv } from "./env.ts";

export interface Queryable {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}
interface PoolLike extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
}

let poolPromise: Promise<PoolLike> | null = null;

async function createPool(): Promise<PoolLike> {
  const url = requireEnv("DATABASE_URL");
  if (/neon\.tech/.test(url)) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const ws = (await import("ws")).default;
    neonConfig.webSocketConstructor = ws as any;
    return new Pool({ connectionString: url, max: 3 }) as unknown as PoolLike;
  }
  const pg = (await import("pg")).default;
  return new pg.Pool({ connectionString: url, max: 5 }) as unknown as PoolLike;
}

export function pool(): Promise<PoolLike> {
  if (!poolPromise) poolPromise = createPool();
  return poolPromise;
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = await pool();
  const r = await p.query<T>(text, params);
  return r.rows;
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Run work inside a transaction; rolls back on any error. */
export async function tx<T>(fn: (c: Queryable) => Promise<T>): Promise<T> {
  const p = await pool();
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    c.release();
  }
}
