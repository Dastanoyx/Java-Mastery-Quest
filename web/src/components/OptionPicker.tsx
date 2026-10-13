"use client";
// Answer input without feedback — used where correctness must stay hidden until submission
// (lesson mastery quizzes and strict exams).
import { clsx } from "clsx";
import type { PublicQuestion } from "@/server/services/questions";
import { Md } from "./Md";
import { chooseText } from "./format";

export type Picked = { options?: string[]; text?: string };

export function OptionPicker({ q, value, onChange, disabled, name }: { q: PublicQuestion; value: Picked | null; onChange: (v: Picked) => void; disabled?: boolean; name: string }) {
  const multi = q.type === "multi";
  const selected = value?.options ?? [];
  if (q.type === "text") {
    return (
      <div className="mt-4">
        <label htmlFor={`${name}-text`} className="text-[13px] text-muted">Your answer</label>
        <input id={`${name}-text`} value={value?.text ?? ""} disabled={disabled} onChange={(e) => onChange({ text: e.target.value })} autoComplete="off" spellCheck={false}
          className="mt-1.5 h-10 w-full rounded-[8px] border border-line bg-sunken px-3 font-mono text-[14px] text-ink outline-none focus:border-ion" />
      </div>
    );
  }
  const toggle = (key: string) => {
    if (disabled) return;
    onChange({ options: multi ? (selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]) : [key] });
  };
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-[13px]">{multi ? <span className="font-medium text-ink">{chooseText(q.choose)}{q.choose ? <span className="ml-2 font-normal text-faint">{selected.length} selected</span> : null}</span> : <span className="text-muted">Select one answer</span>}</legend>
      <div className="flex flex-col gap-2" role={multi ? "group" : "radiogroup"}>
        {q.options.map((o, i) => {
          const on = selected.includes(o.key);
          return (
            <button key={o.key} type="button" role={multi ? "checkbox" : "radio"} aria-checked={on} disabled={disabled} onClick={() => toggle(o.key)}
              data-option={String.fromCharCode(65 + i)}
              className={clsx("flex w-full items-start gap-3 rounded-[10px] border px-3.5 py-3 text-left transition-colors disabled:cursor-default",
                on ? "border-ion bg-ion-soft" : "border-line bg-sunken hover:border-line-strong")}>
              <span className={clsx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center text-[12px] font-semibold", multi ? "rounded-[6px]" : "rounded-full",
                on ? "bg-ion text-white" : "border border-line-strong text-muted")}>{String.fromCharCode(65 + i)}</span>
              <span className="min-w-0 flex-1 text-[14.5px] text-ink"><Md>{o.textMd}</Md></span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function isAnswered(q: PublicQuestion, v: Picked | null | undefined): boolean {
  if (!v) return false;
  return q.type === "text" ? Boolean(v.text?.trim()) : (v.options?.length ?? 0) > 0;
}
