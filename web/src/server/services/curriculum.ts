// Learning-World data: regions (domains) with their missions (lessons), objective mastery and boss status.
import { query, LEARNER_ID } from "../db.ts";
import { computeProgress, type DomainProgress } from "./progress.ts";
import { listLessons, nextLessonFor, type LessonCard } from "./lessons.ts";
import { listExercises } from "./exercises.ts";

export type RegionState = "untouched" | "exploring" | "needs_review" | "mastered";

export interface RegionView extends DomainProgress {
  lessons: LessonCard[];
  state: RegionState;
  boss: { attempts: number; bestPercent: number | null; defeated: boolean };
  exercises: { id: string; title: string; difficulty: string; passed: boolean }[];
}

function regionState(d: DomainProgress, lessons: LessonCard[], bossDefeated: boolean): RegionState {
  const touched = d.attempted || lessons.some((l) => l.status !== "available" && l.status !== "locked");
  if (!touched) return "untouched";
  if (d.dueReviews > 0 || d.unresolvedMistakes > 0) return "needs_review";
  if (d.allMastered && bossDefeated) return "mastered";
  return "exploring";
}

export async function worldData(): Promise<{ regions: RegionView[]; next: LessonCard | null; totals: { lessons: number; completed: number; objectives: number; mastered: number } }> {
  const [progress, lessons, bosses, exercises, next] = await Promise.all([
    computeProgress(),
    listLessons(),
    query<{ domain_id: string; attempts: number; best: number | null; defeated: boolean }>(
      `SELECT config->>'domainId' AS domain_id, count(*)::int AS attempts, max(score_percent) AS best, bool_or(passed) AS defeated
       FROM exam_attempt WHERE learner_id = $1 AND kind = 'boss' AND submitted_at IS NOT NULL GROUP BY 1`, [LEARNER_ID]),
    listExercises(),
    nextLessonFor(),
  ]);
  const bossBy = new Map(bosses.map((b) => [b.domain_id, b]));
  const regions = progress.domains.map((d) => {
    const ls = lessons.filter((l) => l.domainId === d.id);
    const b = bossBy.get(d.id);
    const boss = { attempts: b?.attempts ?? 0, bestPercent: b?.best ?? null, defeated: Boolean(b?.defeated) };
    return {
      ...d, lessons: ls, boss, state: regionState(d, ls, boss.defeated),
      exercises: exercises.filter((e) => e.domainId === d.id).map((e) => ({ id: e.id, title: e.title, difficulty: e.difficulty, passed: e.passed })),
    };
  });
  return {
    regions,
    next,
    totals: {
      lessons: lessons.length,
      completed: lessons.filter((l) => ["completed", "needs_review", "mastered"].includes(l.status)).length,
      objectives: progress.objectives.length,
      mastered: progress.objectives.filter((o) => o.mastery.status === "mastered").length,
    },
  };
}

export async function regionData(domainId: string): Promise<RegionView | null> {
  const { regions } = await worldData();
  return regions.find((r) => r.id === domainId) ?? null;
}
