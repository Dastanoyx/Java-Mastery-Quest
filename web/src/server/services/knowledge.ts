// Knowledge Vault: rules and exam traps harvested from lessons, confusable pairs, notes and bookmarks.
import { query } from "../db.ts";
import { splitCallouts } from "../../content/segments.ts";
import { loadConfusables, type Confusable } from "../../content/confusables.ts";
import { listNotes, bookmarks, type Note } from "./journal.ts";

export interface LessonRules { lessonId: string; title: string; domainId: string; rules: string[]; traps: { title: string | null; md: string }[] }

export async function vaultData(): Promise<{ lessons: LessonRules[]; confusables: Confusable[]; notes: Note[]; bookmarks: Awaited<ReturnType<typeof bookmarks>> }> {
  const rows = await query<{ id: string; title: string; domain_id: string; key_rules: string[]; body_md: string }>(
    `SELECT l.id, l.title, l.domain_id, l.key_rules, l.body_md FROM lesson l JOIN exam_domain d ON d.id = l.domain_id
     WHERE NOT l.retired ORDER BY d.ordinal, l.ordinal`);
  const lessons = rows.map((r) => ({
    lessonId: r.id, title: r.title, domainId: r.domain_id, rules: r.key_rules,
    traps: splitCallouts(r.body_md).flatMap((p) => (p.kind === "callout" && (p.type === "TRAP" || p.type === "WARNING") ? [{ title: p.title, md: p.md }] : [])),
  }));
  const [notes, bms] = await Promise.all([listNotes(), bookmarks()]);
  return { lessons, confusables: loadConfusables(), notes, bookmarks: bms };
}
