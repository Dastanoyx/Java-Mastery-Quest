// Syntax highlighting with Shiki, shared by the seed script (questions) and lesson rendering.
// Output uses CSS variables for both themes (see globals.css `.shiki`), so one HTML string serves dark & light.
// Only ever called with trusted curriculum content; Shiki escapes the code text it renders.
import { createHighlighter, type Highlighter } from "shiki";

const THEMES = { dark: "tokyo-night", light: "github-light-default" } as const;
const LANGS = ["java", "properties", "shellscript", "text", "yaml", "json"] as const;
type Lang = (typeof LANGS)[number];

let highlighterPromise: Promise<Highlighter> | null = null;
const cache = new Map<string, string>();

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [THEMES.dark, THEMES.light], langs: [...LANGS] });
  return highlighterPromise;
}

export function normalizeLang(lang: string | undefined): Lang {
  const l = (lang ?? "").toLowerCase();
  if (l === "java" || l.startsWith("java ")) return "java";
  if (l === "properties") return "properties";
  if (l === "sh" || l === "bash" || l === "shell" || l === "shellscript" || l === "console") return "shellscript";
  if (l === "yaml" || l === "yml") return "yaml";
  if (l === "json") return "json";
  return "text";
}

export async function highlight(code: string, lang: string | undefined = "java"): Promise<string> {
  const language = normalizeLang(lang);
  const key = language + "\u0000" + code;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = await getHighlighter();
  const html = h.codeToHtml(code.replace(/\n+$/, ""), { lang: language, themes: THEMES, defaultColor: false });
  if (cache.size > 2000) cache.clear();
  cache.set(key, html);
  return html;
}
