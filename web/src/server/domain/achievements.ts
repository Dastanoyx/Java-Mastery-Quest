// Achievement conditions, evaluated from aggregated persisted events only.
export interface AchievementStats {
  lessonsCompleted: number;
  exercisesPassed: number;
  predictionsWritten: number;
  bestStreak: number;
  longestNoHintUnseenCorrectRun: number;
  dueReviewsCompleted: number;
  mistakesResolved: number;
  bossesDefeated: number;
  domainsFullyMastered: number;
  objectivesTotal: number;
  objectivesWith3Questions: number;
  fullMocksCompleted: number;
  fullMocksPassed: number;
  readinessLevel: string;
}

export const ACHIEVEMENT_RULES: Record<string, (s: AchievementStats) => boolean> = {
  "first-lesson": (s) => s.lessonsCompleted >= 1,
  "first-exercise": (s) => s.exercisesPassed >= 1,
  predictor: (s) => s.predictionsWritten >= 25,
  "streak-7": (s) => s.bestStreak >= 7,
  "no-hint-20": (s) => s.longestNoHintUnseenCorrectRun >= 20,
  "review-100": (s) => s.dueReviewsCompleted >= 100,
  "mistake-recovery-10": (s) => s.mistakesResolved >= 10,
  "first-boss": (s) => s.bossesDefeated >= 1,
  "domain-mastery": (s) => s.domainsFullyMastered >= 1,
  "all-objectives-covered": (s) => s.objectivesTotal > 0 && s.objectivesWith3Questions >= s.objectivesTotal,
  "first-mock": (s) => s.fullMocksCompleted >= 1,
  "mock-pass": (s) => s.fullMocksPassed >= 1,
  "sustained-ready": (s) => s.readinessLevel === "consistently_ready",
};

export function earnedAchievements(s: AchievementStats): string[] {
  return Object.entries(ACHIEVEMENT_RULES).filter(([, rule]) => rule(s)).map(([id]) => id);
}

/** Longest run of consecutive correct, hint-free answers to never-seen questions (attempts in time order). */
export function longestRun(attempts: { correct: boolean; seenBefore: boolean; hintUsed: boolean }[]): number {
  let best = 0, run = 0;
  for (const a of attempts) {
    if (a.seenBefore) continue; // only unseen questions count, repeats neither extend nor break the run
    if (a.correct && !a.hintUsed) { run++; best = Math.max(best, run); } else run = 0;
  }
  return best;
}
