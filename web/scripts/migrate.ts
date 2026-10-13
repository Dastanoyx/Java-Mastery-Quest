import { pathToFileURL } from "node:url";
// Applies db/migrations/NNN_*.sql in order, once each, inside a transaction guarded by an advisory lock.
// A migration that was already applied but whose file changed aborts the run (checksum mismatch).
// Usage: npm run migrate          (DATABASE_URL must be set)
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

export async function migrate(databaseUrl: string, dir: string, log: (s: string) => void = console.log): Promise<number> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727001)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const applied = new Map<string, string>(
      (await client.query("SELECT version, checksum FROM schema_migrations")).rows.map((r) => [r.version, r.checksum]),
    );
    const files = readdirSync(dir).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
    let count = 0;
    for (const file of files) {
      const sql = readFileSync(join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);
      const prev = applied.get(file);
      if (prev) {
        if (prev !== checksum) throw new Error(`Migration ${file} was modified after being applied (checksum ${prev} → ${checksum}). Create a new migration instead.`);
        continue;
      }
      log(`→ applying ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        count++;
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
    log(count ? `✓ ${count} migration(s) applied` : "✓ database schema is up to date");
    return count;
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
    await client.end();
  }
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
  const dir = resolve(process.env.MIGRATIONS_DIR ?? join(process.cwd(), "..", "db", "migrations"));
  migrate(url, dir).catch((e) => { console.error("✗ " + (e as Error).message); process.exit(1); });
}
