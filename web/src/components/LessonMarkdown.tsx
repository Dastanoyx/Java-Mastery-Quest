// Server-rendered lesson markdown: Shiki-highlighted code fences, callouts and anchored headings.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isValidElement, type ReactNode } from "react";
import { highlight } from "@/server/highlight";
import { splitCallouts, slugify } from "@/content/segments";
import { ShieldAlert, Scale, Sparkles, Info, Lightbulb, Building2 } from "lucide-react";

const CALLOUT: Record<string, { cls: string; label: string; Icon: typeof Info }> = {
  RULE: { cls: "callout-rule", label: "Language rule", Icon: Scale },
  TRAP: { cls: "callout-trap", label: "Exam trap", Icon: ShieldAlert },
  J25: { cls: "callout-j25", label: "Java 25", Icon: Sparkles },
  NOTE: { cls: "callout-note", label: "Note", Icon: Info },
  TIP: { cls: "callout-tip", label: "Tip", Icon: Lightbulb },
  REAL: { cls: "callout-real", label: "In real projects", Icon: Building2 },
  WARNING: { cls: "callout-trap", label: "Warning", Icon: ShieldAlert },
  IMPORTANT: { cls: "callout-rule", label: "Important", Icon: Scale },
};

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children);
  return "";
}

async function highlightFences(md: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const m of md.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)) {
    const lang = m[1].trim().split(/\s+/)[0] || "text";
    const code = m[2].replace(/\n$/, "");
    map.set(`${lang}\u0000${code}`, await highlight(code, lang));
  }
  return map;
}

function Render({ md, html }: { md: string; html: Map<string, string> }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        h2: ({ children }) => <h2 id={slugify(text(children))}>{children}</h2>,
        h3: ({ children }) => <h3 id={slugify(text(children))}>{children}</h3>,
        pre: ({ children }) => {
          const child = Array.isArray(children) ? children[0] : children;
          if (isValidElement(child)) {
            const props = child.props as { className?: string; children?: ReactNode };
            const lang = /language-(\S+)/.exec(props.className ?? "")?.[1] ?? "text";
            const code = text(props.children).replace(/\n$/, "");
            const h = html.get(`${lang}\u0000${code}`) ?? html.get(`text\u0000${code}`);
            if (h) return <div className="code-frame not-prose" dangerouslySetInnerHTML={{ __html: h }} />;
            return <pre className="code-frame code-plain">{code}</pre>;
          }
          return <pre className="code-frame code-plain">{children}</pre>;
        },
        a: ({ href = "", children }) => <a href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer noopener" } : {})}>{children}</a>,
      }}
    >{md}</ReactMarkdown>
  );
}

/** Renders a markdown chunk of a lesson. Shiki HTML is generated server-side from trusted curriculum code only. */
export async function LessonMarkdown({ md }: { md: string }) {
  const html = await highlightFences(md);
  const parts = splitCallouts(md);
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "md") return <Render key={i} md={p.md} html={html} />;
        const c = CALLOUT[p.type] ?? CALLOUT.NOTE;
        return (
          <aside key={i} className={`callout ${c.cls}`} aria-label={c.label}>
            <div className="callout-title"><c.Icon size={15} aria-hidden />{p.title ? `${c.label}: ${p.title}` : c.label}</div>
            <div className="callout-body"><Render md={p.md} html={html} /></div>
          </aside>
        );
      })}
    </>
  );
}

export async function CodeBlock({ code, lang = "java", numbered = false }: { code: string; lang?: string; numbered?: boolean }) {
  const h = await highlight(code, lang);
  return <div className={`code-frame ${numbered ? "code-numbered" : ""}`} dangerouslySetInnerHTML={{ __html: h }} />;
}
