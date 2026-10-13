"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui";
import { api } from "./rewards";

export type ExamConfig =
  | { kind: "full" }
  | { kind: "short"; count?: number }
  | { kind: "domain"; domainId: string; count?: number }
  | { kind: "boss"; domainId: string }
  | { kind: "custom"; filter: Record<string, unknown>; title?: string };

/** Creates a strict, timed attempt and opens it. Optional `confirm` text shows a confirmation step first. */
export function StartExamButton({ config, children, variant = "secondary", size = "md", confirm, className }: {
  config: ExamConfig; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" | "lg"; confirm?: string; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await api<{ attemptId: number }>("/api/exams", { json: config });
      router.push(`/exams/${r.attemptId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  if (asking && confirm) {
    return (
      <div className="well flex flex-col gap-3 p-3 text-[13.5px] sm:flex-row sm:items-center" role="alertdialog" aria-label="Confirm start">
        <span className="flex-1 text-muted">{confirm}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={start} disabled={busy} autoFocus>{busy ? "Preparing…" : "Start now"}</Button>
        </div>
      </div>
    );
  }
  return <Button variant={variant} size={size} className={className} disabled={busy} onClick={() => (confirm ? setAsking(true) : start())}>{busy ? "Preparing…" : children}</Button>;
}
