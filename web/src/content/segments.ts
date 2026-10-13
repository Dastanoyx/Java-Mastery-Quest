// Splits a lesson body into renderable segments: markdown, predict blocks, inline checks and exercises.
export type Segment =
  | { kind: "markdown"; md: string }
  | { kind: "predict"; index: number; code: string; output: string }
  | { kind: "check"; questionId: string }
  | { kind: "exercise"; exerciseId: string };

export interface OutlineItem { slug: string; title: string; level: 2 | 3 }

export function slugify(s: string): string {
  return s.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
}

export function lessonSegments(body: string): Segment[] {
  const out: Segment[] = [];
  const re = /```java[^\n]*\bpredict\b[^\n]*\n([\s\S]*?)```\s*\n```output\n([\s\S]*?)```|^::check\s+(\S+)\s*$|^::exercise\s+(\S+)\s*$/gm;
  let last = 0;
  let predictIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const before = body.slice(last, m.index);
    if (before.trim()) out.push({ kind: "markdown", md: before });
    if (m[1] !== undefined) out.push({ kind: "predict", index: predictIndex++, code: m[1].replace(/\n$/, ""), output: m[2].replace(/\n$/, "") });
    else if (m[3]) out.push({ kind: "check", questionId: m[3] });
    else if (m[4]) out.push({ kind: "exercise", exerciseId: m[4] });
    last = m.index + m[0].length;
  }
  const rest = body.slice(last);
  if (rest.trim()) out.push({ kind: "markdown", md: rest });
  return out;
}

export function lessonOutline(body: string): OutlineItem[] {
  const out: OutlineItem[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const h = /^(##|###)\s+(.+)$/.exec(line);
    if (!h) continue;
    const title = h[2].trim();
    let slug = slugify(title);
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    if (n) slug = `${slug}-${n + 1}`;
    out.push({ slug, title: title.replace(/`/g, ""), level: h[1].length as 2 | 3 });
  }
  return out;
}

export type MdPart = { kind: "md"; md: string } | { kind: "callout"; type: string; title: string | null; md: string };

/** Splits GitHub-style callouts (`> [!TRAP] optional title` + quoted lines) out of a markdown chunk. */
export function splitCallouts(md: string): MdPart[] {
  const lines = md.split("\n");
  const out: MdPart[] = [];
  let buf: string[] = [];
  let inFence = false;
  const flush = () => { if (buf.join("\n").trim()) out.push({ kind: "md", md: buf.join("\n") }); buf = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) inFence = !inFence;
    const m = !inFence ? /^>\s*\[!(RULE|TRAP|NOTE|J25|TIP|REAL|WARNING|IMPORTANT)\]\s*(.*)$/i.exec(line) : null;
    if (!m) { buf.push(line); continue; }
    flush();
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && /^>/.test(lines[j])) { body.push(lines[j].replace(/^>\s?/, "")); j++; }
    out.push({ kind: "callout", type: m[1].toUpperCase(), title: m[2]?.trim() || null, md: body.join("\n") });
    i = j - 1;
  }
  flush();
  return out;
}
