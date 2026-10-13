"use client";
// CodeMirror 6 Java editor (bundled locally — no CDN). Ctrl/Cmd+Enter triggers onRun.
import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap, EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";

export function CodeEditor({ value, onChange, onRun, height = "420px" }: { value: string; onChange: (v: string) => void; onRun?: () => void; height?: string }) {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const read = () => {
      const t = document.documentElement.dataset.theme;
      setDark(t === "light" ? false : t === "system" ? !window.matchMedia("(prefers-color-scheme: light)").matches : true);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const extensions = useMemo(() => [
    java(),
    EditorView.theme({ "&": { fontSize: "13.5px", backgroundColor: "var(--code-bg)" }, ".cm-gutters": { backgroundColor: "var(--code-bg)", borderRight: "1px solid var(--border)", fontFamily: "var(--font-mono)" }, ".cm-content": { fontFamily: "var(--font-mono)" } }),
    Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => { onRun?.(); return true; } }])),
  ], [onRun]);
  return (
    <CodeMirror value={value} onChange={onChange} height={height} theme={dark ? oneDark : "light"} extensions={extensions}
      basicSetup={{ tabSize: 4, foldGutter: false }} aria-label="Java code editor" />
  );
}
