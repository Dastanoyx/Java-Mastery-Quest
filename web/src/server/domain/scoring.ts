// Deterministic answer checking. Multiple-select questions are all-or-nothing, as on the real exam.
import type { QuestionType } from "./types.ts";

export type Answer = { options: string[] } | { text: string[] };
export type Response = { options: string[] } | { text: string };

export function normalizeText(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[  ]/g, " ").trim().replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").toLowerCase();
}

export function isCorrect(type: QuestionType, answer: Answer, response: Response | null | undefined): boolean {
  if (!response) return false;
  if (type === "text") {
    if (!("text" in answer) || !("text" in response) || typeof response.text !== "string") return false;
    const r = normalizeText(response.text);
    return r.length > 0 && answer.text.some((a) => normalizeText(a) === r);
  }
  if (!("options" in answer) || !("options" in response) || !Array.isArray(response.options)) return false;
  const chosen = [...new Set(response.options)].sort();
  const expected = [...answer.options].sort();
  if (type === "single" && chosen.length !== 1) return false;
  return chosen.length === expected.length && chosen.every((k, i) => k === expected[i]);
}

/** Validates a response's shape against the question's options; returns an error message or null. */
export function validateResponse(type: QuestionType, optionKeys: string[], response: unknown): string | null {
  if (!response || typeof response !== "object") return "response must be an object";
  if (type === "text") {
    const t = (response as { text?: unknown }).text;
    if (typeof t !== "string") return "text response required";
    if (t.length > 2000) return "text response too long";
    return null;
  }
  const opts = (response as { options?: unknown }).options;
  if (!Array.isArray(opts) || opts.some((o) => typeof o !== "string")) return "options[] required";
  if (opts.length === 0) return "select at least one option";
  if (opts.some((o) => !optionKeys.includes(o as string))) return "unknown option key";
  if (type === "single" && opts.length !== 1) return "select exactly one option";
  return null;
}
