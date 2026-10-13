// Automatic mistake classification (the learner can always override it in the Mistake Journal).
import type { AttemptMode, Confidence } from "./types.ts";

export const MISTAKE_CATEGORIES = {
  knowledge_gap: "Knowledge gap",
  misread: "Misread question",
  rule_confusion: "Language-rule confusion",
  output_prediction: "Incorrect output prediction",
  compile_vs_runtime: "Compilation vs runtime confusion",
  time_pressure: "Time-pressure error",
  careless: "Careless selection",
  repeated_misconception: "Repeated misconception",
  unanswered: "Left unanswered",
} as const;
export type MistakeCategory = keyof typeof MISTAKE_CATEGORIES;

export interface ClassifyInput {
  format: string;
  mode: AttemptMode;
  confidence: Confidence;
  timeMs: number | null;
  estSeconds: number;
  previousWrongCount: number; // wrong answers on this question before this one
  chosenTexts: string[]; // text of the options the learner picked
  correctTexts: string[];
}

const COMPILE_RE = /compil|does not compile|fails to compile/i;
const RUNTIME_RE = /exception|is thrown|throws|runtime/i;

export function classifyMistake(i: ClassifyInput): MistakeCategory {
  if (i.previousWrongCount >= 1) return "repeated_misconception";
  const timed = i.mode === "exam" || i.mode === "timed" || i.mode === "boss";
  const est = i.estSeconds * 1000;
  if (timed && i.timeMs != null && i.timeMs > est * 1.6) return "time_pressure";
  const chosenCompile = i.chosenTexts.some((t) => COMPILE_RE.test(t));
  const chosenRuntime = i.chosenTexts.some((t) => RUNTIME_RE.test(t));
  const correctCompile = i.correctTexts.some((t) => COMPILE_RE.test(t));
  const correctRuntime = i.correctTexts.some((t) => RUNTIME_RE.test(t));
  if ((chosenCompile && correctRuntime && !correctCompile) || (chosenRuntime && correctCompile && !correctRuntime)) return "compile_vs_runtime";
  if (i.timeMs != null && i.timeMs < Math.min(est * 0.2, 15_000)) return "careless";
  if (i.format === "predict-output" || i.format === "trace") return "output_prediction";
  if (i.confidence === 3) return "rule_confusion";
  return "knowledge_gap";
}

/** A mistake is resolved after two correct answers on different days following the last wrong answer. */
export function mistakeResolved(correctSinceDays: string[]): boolean {
  return new Set(correctSinceDays).size >= 2;
}
