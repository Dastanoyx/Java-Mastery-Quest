// Integration-test harness: a fresh schema in the test database, migrated and seeded with the real content.
import pg from "pg";
import { join } from "node:path";
import { migrate } from "../../scripts/migrate.ts";
import { seed } from "../../scripts/seed.ts";
import { loadContent } from "../../src/content/load.ts";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://jmq:jmq_dev_password@127.0.0.1:5432/jmq_test";

export async function freshDatabase() {
  if (!/test/.test(TEST_DB)) throw new Error("refusing to reset a database whose URL does not contain 'test'");
  process.env.DATABASE_URL = TEST_DB;
  process.env.CONTENT_DIR = join(process.cwd(), "..", "content");
  const c = new pg.Client({ connectionString: TEST_DB });
  await c.connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await c.end();
  await migrate(TEST_DB, join(process.cwd(), "..", "db", "migrations"), () => {});
  await seed(TEST_DB, loadContent(), () => {});
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: TEST_DB });
  await c.connect();
  try { return (await c.query(text, params)).rows as T[]; } finally { await c.end(); }
}
