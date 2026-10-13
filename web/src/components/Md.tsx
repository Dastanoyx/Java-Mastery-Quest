// Markdown for short content (prompts, options, explanations, notes). Raw HTML is never rendered (XSS-safe).
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { clsx } from "clsx";

export function Md({ children, className, inline }: { children: string; className?: string; inline?: boolean }) {
  // Multi-line text with no markdown code markers is program output: keep line breaks and use mono.
  if (/\n/.test(children.trim()) && !/`/.test(children) && !/^\s*[-*] /m.test(children)) {
    return <pre className={clsx("font-mono text-[13px] leading-6 whitespace-pre overflow-x-auto", className)}>{children.replace(/\n$/, "")}</pre>;
  }
  return (
    <div className={clsx("md-inline", inline && "[&>p]:inline", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          pre: ({ children }) => <pre className="code-frame code-plain my-2">{children}</pre>,
          img: ({ alt }) => <span className="text-faint">[image: {alt || "no description"}]</span>,
          code: ({ children, className: cn }) => cn ? <code>{children}</code> : <code>{children}</code>,
          a: ({ href = "", children }) => href.startsWith("/")
            ? <Link href={href} className="text-ion-strong underline underline-offset-2">{children}</Link>
            : <a href={href} target="_blank" rel="noreferrer noopener" className="text-ion-strong underline underline-offset-2">{children}</a>,
        }}
      >{children}</ReactMarkdown>
    </div>
  );
}
