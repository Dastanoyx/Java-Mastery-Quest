// Daily and weekly quest generation. Quests are generated from the learner's real state so they are always
// achievable (e.g. a "review N due items" quest never asks for more items than are due). Progress is NOT
// stored as a counter: it is recomputed from persisted events inside the quest window (see questService).
export type QuestKind =
  | "review_due" | "answer_new" | "no_hint_correct" | "complete_lesson" | "domain_correct" | "timed_challenge"
  | "fix_mistakes" | "pass_exercise" | "weekly_active_days" | "weekly_reviews" | "weekly_timed" | "weekly_lessons";

export interface QuestDef { kind: QuestKind; title: string; target: number; xp: number; params: Record<string, string | number> }

export interface QuestContext {
  dueReviews: number;
  unresolvedMistakes: number;
  nextLesson: { id: string; title: string } | null;
  weakestDomain: { id: string; short: string } | null;
  dailyMinutes: number;
  exerciseAvailable: boolean;
  studyDaysPerWeek: number;
}

export function dailyQuests(c: QuestContext): QuestDef[] {
  const q: QuestDef[] = [];
  const scale = Math.max(0.5, Math.min(2, c.dailyMinutes / 45));
  if (c.dueReviews >= 3) q.push({ kind: "review_due", title: `Recall ${Math.min(10, c.dueReviews)} due review items`, target: Math.min(10, c.dueReviews), xp: 30, params: {} });
  else {
    const n = Math.round(6 * scale);
    q.push({ kind: "answer_new", title: `Answer ${n} questions you have never seen`, target: n, xp: 30, params: {} });
  }
  if (c.nextLesson) q.push({ kind: "complete_lesson", title: `Complete “${c.nextLesson.title}”`, target: 1, xp: 40, params: { lessonId: c.nextLesson.id } });
  else q.push({ kind: "timed_challenge", title: "Finish a timed challenge (10+ questions)", target: 1, xp: 40, params: { minQuestions: 10 } });
  if (c.unresolvedMistakes >= 2) {
    const n = Math.min(3, c.unresolvedMistakes);
    q.push({ kind: "fix_mistakes", title: `Correctly answer ${n} questions from your Mistake Journal`, target: n, xp: 35, params: {} });
  } else if (c.weakestDomain) {
    q.push({ kind: "domain_correct", title: `Get 5 correct answers in ${c.weakestDomain.short}`, target: 5, xp: 35, params: { domainId: c.weakestDomain.id } });
  } else {
    q.push({ kind: "no_hint_correct", title: "Answer 5 new questions correctly without hints", target: 5, xp: 35, params: {} });
  }
  return q;
}

export function weeklyQuests(c: QuestContext): QuestDef[] {
  return [
    { kind: "weekly_active_days", title: `Study on ${Math.min(5, Math.max(2, c.studyDaysPerWeek))} days this week`, target: Math.min(5, Math.max(2, c.studyDaysPerWeek)), xp: 100, params: {} },
    { kind: "weekly_reviews", title: "Complete 40 spaced reviews this week", target: 40, xp: 80, params: {} },
    { kind: "weekly_timed", title: "Finish a timed exam or boss battle this week", target: 1, xp: 80, params: {} },
    ...(c.exerciseAvailable ? [{ kind: "pass_exercise" as const, title: "Pass a coding exercise this week", target: 1, xp: 60, params: {} }] : []),
  ];
}
