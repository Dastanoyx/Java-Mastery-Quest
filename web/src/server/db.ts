// PostgreSQL access. All SQL is parameterised; no string interpolation of values anywhere.
import pg from "pg";

// NUMERIC → number, INT8 → number (ids and counts stay far below 2^53), DATE → "YYYY-MM-DD" string.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);

export type Db = pg.Pool | pg.PoolClient;

const globalForPg = globalThis as unknown as { __jmqPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForPg.__jmqPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured");
    globalForPg.__jmqPool = new pg.Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10), idleTimeoutMillis: 30_000 });
    globalForPg.__jmqPool.on("error", (e) => console.error("[db] idle client error:", e.message));
  }
  return globalForPg.__jmqPool;
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

/** Runs `fn` in a transaction (READ COMMITTED). Rolls back on any error. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Single local learner (docs/DECISIONS.md D-006). Every learner table still carries learner_id. */
export const LEARNER_ID = 1;
