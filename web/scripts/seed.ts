import { pathToFileURL } from "node:url";
// Validates curriculum content and upserts it into PostgreSQL. Idempotent; never touches learner history.
// Content that disappeared from /content is marked `retired` (kept for history), never deleted.
// Usage: npm run seed            (DATABASE_URL, CONTENT_DIR optional)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadContent, hashOf, type Content } from "../src/content/load.ts";
import { highlight } from "../src/server/highlight.ts";

interface VerificationResult { hash: string; ok: boolean; jdk: string }

function loadVerification(dir: string): Record<string, VerificationResult> {
  const f = join(dir, ".verification", "java-results.json");
  if (!existsSync(f)) return {};
  return (JSON.parse(readFileSync(f, "utf8")).results ?? {}) as Record<string, VerificationResult>;
}

export async function seed(databaseUrl: string, content: Content, log: (s: string) => void = console.log) {
  if (content.errors.length) throw new Error(`content has ${content.errors.length} errors; run content:validate`);
  const verification = loadVerification(content.dir);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const stats = { questions: 0, verified: 0, reviewed: 0, needsReview: 0, lessons: 0, exercises: 0, retired: 0 };
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(727002)");
    const bp = content.blueprint;

    await client.query(
      `INSERT INTO exam_blueprint(code, title, question_count, duration_minutes, passing_percent, ready_target_percent, verification, verification_note, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title, question_count=EXCLUDED.question_count,
         duration_minutes=EXCLUDED.duration_minutes, passing_percent=EXCLUDED.passing_percent,
         ready_target_percent=EXCLUDED.ready_target_percent, verification=EXCLUDED.verification,
         verification_note=EXCLUDED.verification_note, updated_at=now()`,
      [bp.exam.code, bp.exam.title, bp.exam.questions, bp.exam.durationMinutes, bp.exam.passingPercent,
        bp.exam.personalReadyTargetPercent, bp.exam.verification, bp.exam.verificationNote ?? null],
    );
    await client.query("DELETE FROM exam_blueprint WHERE code <> $1", [bp.exam.code]);

    // Domains get a temporary ordinal first to avoid unique-ordinal clashes when re-ordering.
    await client.query("UPDATE exam_domain SET ordinal = ordinal + 1000");
    for (const [i, d] of bp.domains.entries()) {
      await client.query(
        `INSERT INTO exam_domain(id, ordinal, title, short_title, region_name, summary, icon) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title, short_title=EXCLUDED.short_title,
           region_name=EXCLUDED.region_name, summary=EXCLUDED.summary, icon=EXCLUDED.icon`,
        [d.id, i + 1, d.title, d.short, d.region, d.summary, d.icon],
      );
      await client.query("UPDATE exam_objective SET ordinal = ordinal + 1000 WHERE domain_id = $1", [d.id]);
      for (const [j, o] of d.objectives.entries()) {
        await client.query(
          `INSERT INTO exam_objective(id, domain_id, ordinal, title, basis, verification, java_notes, mastery_threshold)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET domain_id=EXCLUDED.domain_id, ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
             basis=EXCLUDED.basis, verification=EXCLUDED.verification, java_notes=EXCLUDED.java_notes,
             mastery_threshold=EXCLUDED.mastery_threshold`,
          [o.id, d.id, j + 1, o.title, o.basis, o.verification, o.javaNotes ?? null, o.masteryThreshold ?? 0.85],
        );
      }
    }

    // ── lessons (without relations first) ──
    await client.query("UPDATE lesson SET ordinal = ordinal + 1000");
    for (const l of content.lessons) {
      const { file, ...def } = l;
      const hash = hashOf(def);
      const predictsVerified = l.predicts.filter((p) => {
        const v = verification[`lesson:${l.id}#${p.index}`];
        return v?.ok && v.hash === hashOf(p);
      }).length;
      await client.query(
        `INSERT INTO lesson(id, domain_id, ordinal, title, summary, minutes, body_md, learning_contract, key_rules, retrieval_prompts,
           supplementary, java_version, content_hash, predicts_total, predicts_verified, source_file, retired, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false, now())
         ON CONFLICT (id) DO UPDATE SET domain_id=EXCLUDED.domain_id, ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
           summary=EXCLUDED.summary, minutes=EXCLUDED.minutes, body_md=EXCLUDED.body_md,
           learning_contract=EXCLUDED.learning_contract, key_rules=EXCLUDED.key_rules, retrieval_prompts=EXCLUDED.retrieval_prompts,
           supplementary=EXCLUDED.supplementary, java_version=EXCLUDED.java_version,
           version = CASE WHEN lesson.content_hash <> EXCLUDED.content_hash THEN lesson.version + 1 ELSE lesson.version END,
           content_hash=EXCLUDED.content_hash, predicts_total=EXCLUDED.predicts_total, predicts_verified=EXCLUDED.predicts_verified,
           source_file=EXCLUDED.source_file, retired=false,
           updated_at = CASE WHEN lesson.content_hash <> EXCLUDED.content_hash THEN now() ELSE lesson.updated_at END`,
        [l.id, l.domain, l.order, l.title, l.summary, l.minutes, l.body, JSON.stringify(l.contract), JSON.stringify(l.keyRules),
          JSON.stringify(l.retrieval), l.supplementary, l.javaVersion, hash, l.predicts.length, predictsVerified, file],
      );
      stats.lessons++;
    }
    const lessonIds = content.lessons.map((l) => l.id);
    // Retired lessons move to the end so they never collide with active ordinals.
    const retiredLessons = await client.query(
      `UPDATE lesson SET retired = true, ordinal = ordinal + 100000 WHERE NOT (id = ANY($1)) AND (NOT retired OR ordinal < 100000) RETURNING id`,
      [lessonIds],
    );
    stats.retired += retiredLessons.rowCount ?? 0;

    // ── questions ──
    for (const q of content.questions) {
      const { file, ...def } = q;
      const hash = hashOf(def);
      const hasJava = Boolean(q.java || q.options?.some((o) => o.java));
      let status: "jdk-verified" | "reviewed" | "needs-review";
      let verifiedWith: string | null = null;
      if (q.manualReview) status = "needs-review";
      else if (hasJava) {
        const v = verification[`question:${q.id}`];
        const expected = hashOf({ code: q.code, java: q.java, options: q.options });
        if (v?.ok && v.hash === expected) { status = "jdk-verified"; verifiedWith = v.jdk; } else status = "needs-review";
      } else status = q.code ? "needs-review" : "reviewed";
      if (status === "jdk-verified") stats.verified++; else if (status === "reviewed") stats.reviewed++; else stats.needsReview++;

      const answer = q.type === "text" ? { text: q.accept } : { options: (q.options ?? []).filter((o) => o.correct).map((o) => o.key) };
      const codeHtml = q.code ? await highlight(q.code, "java") : null;
      await client.query(
        `INSERT INTO question(id, objective_id, type, format, difficulty, prompt_md, code, code_html, answer, explanation_md, rule_md,
           misconception_md, lesson_id, est_seconds, tags, java_version, verification, verified_with, exam_eligible, hint_md,
           content_hash, source_file, retired, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,false, now())
         ON CONFLICT (id) DO UPDATE SET objective_id=EXCLUDED.objective_id, type=EXCLUDED.type, format=EXCLUDED.format,
           difficulty=EXCLUDED.difficulty, prompt_md=EXCLUDED.prompt_md, code=EXCLUDED.code, code_html=EXCLUDED.code_html,
           answer=EXCLUDED.answer, explanation_md=EXCLUDED.explanation_md, rule_md=EXCLUDED.rule_md,
           misconception_md=EXCLUDED.misconception_md, lesson_id=EXCLUDED.lesson_id, est_seconds=EXCLUDED.est_seconds,
           tags=EXCLUDED.tags, java_version=EXCLUDED.java_version, verification=EXCLUDED.verification,
           verified_with=EXCLUDED.verified_with, exam_eligible=EXCLUDED.exam_eligible, hint_md=EXCLUDED.hint_md,
           version = CASE WHEN question.content_hash <> EXCLUDED.content_hash THEN question.version + 1 ELSE question.version END,
           content_hash=EXCLUDED.content_hash, source_file=EXCLUDED.source_file, retired=false,
           updated_at = CASE WHEN question.content_hash <> EXCLUDED.content_hash THEN now() ELSE question.updated_at END`,
        [q.id, q.objective, q.type, q.format, q.difficulty, q.prompt, q.code ?? null, codeHtml, JSON.stringify(answer), q.explanation,
          q.rule, q.misconception ?? null, q.lesson ?? null, q.estSeconds, q.tags, q.javaVersion, status, verifiedWith,
          q.examEligible && q.type !== "text", q.hint ?? null, hash, file],
      );
      await client.query("DELETE FROM question_option WHERE question_id = $1", [q.id]);
      for (const [i, o] of (q.options ?? []).entries()) {
        await client.query(
          "INSERT INTO question_option(question_id, key, ordinal, text_md, is_correct, why_md) VALUES ($1,$2,$3,$4,$5,$6)",
          [q.id, o.key, i + 1, o.text, o.correct, o.why],
        );
      }
      stats.questions++;
    }
    const retiredQ = await client.query(
      "UPDATE question SET retired = true WHERE NOT (id = ANY($1)) AND NOT retired RETURNING id",
      [content.questions.map((q) => q.id)],
    );
    stats.retired += retiredQ.rowCount ?? 0;

    // ── coding exercises ──
    for (const e of content.exercises) {
      const { file: _file, ...def } = e;
      const v = verification[`exercise:${e.id}`];
      const expected = hashOf({ s: e.solution, st: e.starter, h: e.harness });
      const status = v?.ok && v.hash === expected ? "jdk-verified" : "needs-review";
      await client.query(
        `INSERT INTO coding_exercise(id, objective_id, lesson_id, title, difficulty, kind, prompt_md, starter_code, solution_code,
           harness_code, file_name, explanation_md, hints, time_limit_ms, verification, content_hash, retired, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false, now())
         ON CONFLICT (id) DO UPDATE SET objective_id=EXCLUDED.objective_id, lesson_id=EXCLUDED.lesson_id, title=EXCLUDED.title,
           difficulty=EXCLUDED.difficulty, kind=EXCLUDED.kind, prompt_md=EXCLUDED.prompt_md, starter_code=EXCLUDED.starter_code,
           solution_code=EXCLUDED.solution_code, harness_code=EXCLUDED.harness_code, file_name=EXCLUDED.file_name,
           explanation_md=EXCLUDED.explanation_md, hints=EXCLUDED.hints, time_limit_ms=EXCLUDED.time_limit_ms,
           verification=EXCLUDED.verification, content_hash=EXCLUDED.content_hash, retired=false, updated_at=now()`,
        [e.id, e.objective, e.lesson ?? null, e.title, e.difficulty, e.kind, e.prompt, e.starter, e.solution, e.harness,
          e.fileName, e.explanation, JSON.stringify(e.hints), e.timeLimitMs, status, hashOf(def)],
      );
      stats.exercises++;
    }
    await client.query("UPDATE coding_exercise SET retired = true WHERE NOT (id = ANY($1))", [content.exercises.map((e) => e.id)]);

    // ── lesson relations (rebuilt) ──
    await client.query("DELETE FROM lesson_objective");
    await client.query("DELETE FROM lesson_prerequisite");
    await client.query("DELETE FROM lesson_question");
    for (const l of content.lessons) {
      for (const o of l.objectives) await client.query("INSERT INTO lesson_objective VALUES ($1,$2)", [l.id, o]);
      for (const p of l.prerequisites) await client.query("INSERT INTO lesson_prerequisite VALUES ($1,$2)", [l.id, p]);
      const checks = [...new Set([...l.embeddedChecks, ...l.checks])];
      for (const [i, qid] of checks.entries()) await client.query("INSERT INTO lesson_question VALUES ($1,$2,'check',$3)", [l.id, qid, i + 1]);
      for (const [i, qid] of l.mastery.entries()) await client.query("INSERT INTO lesson_question VALUES ($1,$2,'mastery',$3)", [l.id, qid, i + 1]);
    }

    // ── achievements ──
    for (const [i, a] of content.achievements.entries()) {
      await client.query(
        `INSERT INTO achievement(id, title, description, icon, xp_reward, ordinal) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, icon=EXCLUDED.icon,
           xp_reward=EXCLUDED.xp_reward, ordinal=EXCLUDED.ordinal`,
        [a.id, a.title, a.description, a.icon, a.xp, i + 1],
      );
    }
    await client.query("INSERT INTO learner(id, display_name) VALUES (1, 'Yassin') ON CONFLICT (id) DO NOTHING");
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
  log(`✓ seeded ${stats.lessons} lessons, ${stats.questions} questions (${stats.verified} JDK-verified, ${stats.reviewed} concept-reviewed, ` +
    `${stats.needsReview} needs-review), ${stats.exercises} exercises; ${stats.retired} retired`);
  return stats;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
  const c = loadContent();
  if (c.errors.length) {
    console.error(`✗ content has ${c.errors.length} errors:`);
    for (const e of c.errors.slice(0, 40)) console.error("  " + e);
    process.exit(1);
  }
  seed(url, c).catch((e) => { console.error("✗ seed failed: " + (e as Error).message); process.exit(1); });
}
