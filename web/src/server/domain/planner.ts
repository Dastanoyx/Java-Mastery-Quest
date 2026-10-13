// Daily study-session planner and evidence-based next-step recommendations.
// The plan follows the methodology's session shape (retrieval → learning → practice → exam-style → reflection)
// scaled to the learner's daily minutes, and re-prioritised by actual evidence (due reviews, weak objectives,
// repeated mistakes, time since last study).
export interface PlannerObjective { id: string; domainId: string; title: string; score: number | null; evidenceWeight: number; status: string }
export interface PlannerInput {
  dailyMinutes: number;
  dueReviews: number;
  overdueReviews: number;
  daysSinceLastStudy: number | null; // null = never studied
  nextLesson: { id: string; title: string; minutes: number; domainId: string; inProgress: boolean } | null;
  weakObjectives: PlannerObjective[]; // sorted weakest first, only objectives with evidence
  repeatedMistakeObjectives: { objectiveId: string; title: string; lessonId: string | null; lessonTitle: string | null; count: number }[];
  exercise: { id: string; title: string } | null;
  modePreference: "learning" | "balanced" | "exam";
  hasCompletedAnyLesson: boolean;
}

export type BlockKind = "review" | "lesson" | "exercise" | "practice" | "exam" | "reflect";
export interface PlanBlock { kind: BlockKind; minutes: number; title: string; detail: string; href: string }
export interface DailyPlan { headline: string; reentry: boolean; blocks: PlanBlock[]; totalMinutes: number }

const SHAPE = { review: 5, lesson: 20, practice: 15, exam: 15, reflect: 5 }; // per 60 minutes

export function planDay(p: PlannerInput): DailyPlan {
  const scale = p.dailyMinutes / 60;
  const m = (x: number) => Math.max(3, Math.round(x * scale));
  const reentry = p.daysSinceLastStudy != null && p.daysSinceLastStudy >= 3;
  const blocks: PlanBlock[] = [];

  // 1. Retrieval first — overdue material is the most consequential gap after a break.
  if (p.dueReviews > 0) {
    const reviewMin = reentry ? m(SHAPE.review * 3) : m(SHAPE.review + Math.min(10, p.dueReviews * 0.5));
    blocks.push({ kind: "review", minutes: reviewMin, title: `Retrieval warm-up: ${p.dueReviews} due`, detail: reentry ? "You've been away — recall comes first, it protects what you already learned." : "Mixed-domain spaced review before new material.", href: "/review" });
  }
  // 2. Focused learning (fixing a repeated misconception beats new material)
  const repeated = p.repeatedMistakeObjectives[0];
  if (repeated?.lessonId && repeated.count >= 2) {
    blocks.push({ kind: "lesson", minutes: m(SHAPE.lesson), title: `Revisit: ${repeated.lessonTitle}`, detail: `${repeated.count} repeated mistakes on “${repeated.title}”. Re-read the rules and traps, then retry.`, href: `/lessons/${repeated.lessonId}` });
  } else if (p.nextLesson && p.modePreference !== "exam") {
    blocks.push({ kind: "lesson", minutes: Math.min(m(SHAPE.lesson * (p.modePreference === "learning" ? 1.4 : 1)), p.nextLesson.minutes), title: `${p.nextLesson.inProgress ? "Continue" : "Start"}: ${p.nextLesson.title}`, detail: "Read actively — write a prediction before every reveal.", href: `/lessons/${p.nextLesson.id}` });
  }
  // 3. Coding / tracing
  if (p.exercise) blocks.push({ kind: "exercise", minutes: m(SHAPE.practice), title: `Code: ${p.exercise.title}`, detail: "Write real Java and run it in the sandbox.", href: `/exercises/${p.exercise.id}` });
  // 4. Exam-style questions on the weakest objectives
  const weak = p.weakObjectives.slice(0, 2);
  if (weak.length) {
    blocks.push({ kind: "practice", minutes: m(SHAPE.exam * (p.modePreference === "exam" ? 1.5 : 1)), title: `Targeted practice: ${weak.map((w) => w.id).join(" & ")}`, detail: weak.map((w) => w.title).join(" · "), href: `/practice?objectives=${weak.map((w) => w.id).join(",")}&autostart=1` });
  } else if (p.hasCompletedAnyLesson) {
    blocks.push({ kind: "practice", minutes: m(SHAPE.exam), title: "Mixed exam-style questions", detail: "Unseen questions across what you have studied.", href: "/practice?mode=mixed&autostart=1" });
  }
  if (p.modePreference === "exam" && p.hasCompletedAnyLesson) blocks.push({ kind: "exam", minutes: m(20), title: "Short timed exam (15 questions)", detail: "Strict mode: no feedback until you submit.", href: "/exams?preset=short" });
  blocks.push({ kind: "reflect", minutes: m(SHAPE.reflect), title: "Reflect", detail: "Explain one rule you learned today in your own words (Knowledge Vault → New note).", href: "/knowledge?new=1" });

  const headline = p.daysSinceLastStudy == null
    ? "Your first session: learn something real, then prove it."
    : reentry
      ? `Welcome back. ${p.overdueReviews} overdue reviews first, then we pick up where you left off.`
      : p.dueReviews > 0 ? "Recall, learn, then test yourself on what is still fragile." : "Nothing is due — a good day for new ground.";
  return { headline, reentry, blocks, totalMinutes: blocks.reduce((s, b) => s + b.minutes, 0) };
}

export interface NextStepInput {
  sessionKind: "practice" | "review" | "exam" | "lesson";
  objectiveResults: { objectiveId: string; title: string; correct: number; total: number; lessonId: string | null; lessonTitle: string | null }[];
  confidentWrong: number;
  dueReviews: number;
  /** Optional, for timed attempts: per-domain results, unanswered count and score context. */
  domainResults?: { id: string; short: string; correct: number; total: number }[];
  unanswered?: number;
  percent?: number;
  passPercent?: number;
}

/** Concrete next step after a session, based on what the session actually showed. */
export function nextSteps(n: NextStepInput): string[] {
  const out: string[] = [];
  const weak = n.objectiveResults.filter((o) => o.total >= 2 && o.correct / o.total < 0.6).sort((a, b) => a.correct / a.total - b.correct / b.total);
  for (const w of weak.slice(0, 2)) out.push(w.lessonTitle ? `Revisit “${w.lessonTitle}” — ${w.correct}/${w.total} on ${w.objectiveId}.` : `Practise ${w.objectiveId} again — ${w.correct}/${w.total} correct.`);
  // A short exam rarely has two questions per objective: single misses are weaker evidence, so they are
  // grouped by domain and pointed at practice rather than presented as a diagnosis.
  const weakDomains = (n.domainResults ?? []).filter((d) => d.total >= 2 && d.correct / d.total < 0.6).sort((a, b) => a.correct / a.total - b.correct / b.total);
  for (const d of weakDomains.slice(0, 2)) {
    if (weak.some((w) => w.objectiveId.startsWith(d.id + "."))) continue;
    out.push(`${d.short} (${d.id}) is weak in this attempt — ${d.correct}/${d.total}. Run a ${d.id} practice session in learning mode before testing it again.`);
  }
  const singleMisses = n.objectiveResults.filter((o) => o.total === 1 && o.correct === 0 && o.lessonTitle && !weak.includes(o));
  if (singleMisses.length && out.length < 3) {
    const lessons = [...new Map(singleMisses.map((m) => [m.lessonId, m.lessonTitle])).values()].slice(0, 3);
    out.push(`Single misses (one question each, so treat them as hints, not verdicts): skim ${lessons.map((l) => `“${l}”`).join(", ")}.`);
  }
  if ((n.unanswered ?? 0) > 0) out.push(`${n.unanswered} question${n.unanswered! > 1 ? "s were" : " was"} left unanswered. There is no penalty for guessing — always answer, flag, and come back.`);
  if (n.confidentWrong > 0) out.push(`${n.confidentWrong} answer${n.confidentWrong > 1 ? "s were" : " was"} wrong with high confidence — read those explanations in the Mistake Journal first.`);
  const strong = n.objectiveResults.filter((o) => o.total >= 3 && o.correct === o.total);
  if (!weak.length && strong.length) out.push(`Solid on ${strong.map((s) => s.objectiveId).join(", ")}. These are now scheduled for spaced review — don't re-drill them today.`);
  if (n.percent != null && n.passPercent != null && n.percent < n.passPercent && n.sessionKind === "exam" && !out.some((o) => o.includes("lesson") || o.includes("“")))
    out.push("Below the pass mark: return to learning mode for the weakest region before the next timed attempt — repeated mocks without study mostly measure the same gaps.");
  if (n.dueReviews > 0) out.push(`${n.dueReviews} review item${n.dueReviews > 1 ? "s are" : " is"} due — a short review session keeps them from fading.`);
  if (!out.length) out.push("Take a short mixed-domain assessment to test transfer to unseen questions.");
  return out;
}
