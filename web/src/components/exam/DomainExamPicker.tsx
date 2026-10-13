"use client";
import { useState } from "react";
import { StartExamButton } from "../StartExamButton";

export function DomainExamPicker({ domains }: { domains: { id: string; short: string }[] }) {
  const [domainId, setDomainId] = useState(domains[0]?.id ?? "D1");
  const [count, setCount] = useState(12);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="dom-exam">Domain</label>
        <select id="dom-exam" value={domainId} onChange={(e) => setDomainId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-[8px] border border-line bg-sunken px-2 text-[14px] text-ink">
          {domains.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.short}</option>)}
        </select>
        <label className="sr-only" htmlFor="dom-count">Questions</label>
        <select id="dom-count" value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-9 rounded-[8px] border border-line bg-sunken px-2 text-[14px] text-ink">
          {[8, 12, 20].map((n) => <option key={n} value={n}>{n} questions</option>)}
        </select>
      </div>
      <StartExamButton config={{ kind: "domain", domainId, count }} className="w-full">Start domain exam</StartExamButton>
    </div>
  );
}
