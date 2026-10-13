import { json } from "@/server/http";
import { one } from "@/server/db";
import { runnerHealth } from "@/server/services/runner";

export const dynamic = "force-dynamic";

/** Liveness + dependency status. Returns 200 when the database is reachable (the runner is optional). */
export async function GET() {
  let db: { ok: boolean; migrations?: number; questions?: number; error?: string };
  try {
    const r = await one<{ m: number; q: number }>("SELECT (SELECT count(*)::int FROM schema_migrations) AS m, (SELECT count(*)::int FROM question WHERE NOT retired) AS q");
    db = { ok: true, migrations: r?.m, questions: r?.q };
  } catch (e) {
    db = { ok: false, error: (e as Error).message.split("\n")[0] };
  }
  const runner = await runnerHealth();
  return json({ status: db.ok ? "ok" : "degraded", db, runner, time: new Date().toISOString() }, db.ok ? 200 : 503);
}
