// Player titles. A title is earned by demonstrated learning, not by XP alone: most require domain
// mastery or exam evidence. The current title is the highest-ranked one earned.
export interface TitleContext {
  level: number;
  domainScores: Record<string, number>; // D1..D10 → 0..1 evidence-weighted mastery
  domainsMastered: number;
  bestFullMockPercent: number | null;
  readyTargetPercent: number;
  readinessLevel: string;
}

export interface TitleDef { id: string; title: string; requirement: string; earned: (c: TitleContext) => boolean }

export const TITLES: TitleDef[] = [
  { id: "apprentice", title: "Java Apprentice", requirement: "Begin the quest.", earned: () => true },
  { id: "explorer", title: "Bytecode Explorer", requirement: "Reach level 3.", earned: (c) => c.level >= 3 },
  { id: "craftsman", title: "Object-Oriented Craftsman", requirement: "Reach 70 % mastery in Object-Oriented Java (D3).", earned: (c) => (c.domainScores.D3 ?? 0) >= 0.7 },
  { id: "strategist", title: "Stream Strategist", requirement: "Reach 70 % mastery in Streams & Lambdas (D6).", earned: (c) => (c.domainScores.D6 ?? 0) >= 0.7 },
  { id: "concurrency", title: "Concurrency Specialist", requirement: "Reach 70 % mastery in Concurrency (D8).", earned: (c) => (c.domainScores.D8 ?? 0) >= 0.7 },
  { id: "scholar", title: "JVM Scholar", requirement: "Reach 60 % mastery in all ten domains.", earned: (c) => Object.keys(c.domainScores).length >= 10 && Object.values(c.domainScores).every((s) => s >= 0.6) },
  { id: "challenger", title: "OCP Exam Challenger", requirement: "Score at or above your personal target on a full mock exam.", earned: (c) => (c.bestFullMockPercent ?? 0) >= c.readyTargetPercent },
  { id: "master", title: "Java Master", requirement: "Reach the “Consistently Exam Ready” readiness level.", earned: (c) => c.readinessLevel === "consistently_ready" },
];

export function earnedTitles(c: TitleContext) {
  return TITLES.map((t) => ({ id: t.id, title: t.title, requirement: t.requirement, earned: t.earned(c) }));
}

export function currentTitle(c: TitleContext): string {
  const earned = TITLES.filter((t) => t.earned(c));
  return earned[earned.length - 1]?.title ?? TITLES[0].title;
}
