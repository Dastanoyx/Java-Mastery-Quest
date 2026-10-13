import { Lock, Circle, CircleDot, CircleCheck, RotateCcw, Gem } from "lucide-react";
import { clsx } from "clsx";
import type { LessonStatus } from "@/server/services/lessons";

export const LESSON_STATUS: Record<LessonStatus, { label: string; cls: string; Icon: typeof Lock }> = {
  locked: { label: "Locked", cls: "text-faint", Icon: Lock },
  available: { label: "Available", cls: "text-muted", Icon: Circle },
  in_progress: { label: "In progress", cls: "text-ion-strong", Icon: CircleDot },
  completed: { label: "Completed", cls: "text-signal", Icon: CircleCheck },
  needs_review: { label: "Needs review", cls: "text-amber", Icon: RotateCcw },
  mastered: { label: "Mastered", cls: "text-signal", Icon: Gem },
};

export function LessonStatusIcon({ status, size = 16, className }: { status: LessonStatus; size?: number; className?: string }) {
  const s = LESSON_STATUS[status];
  return <s.Icon size={size} className={clsx(s.cls, "shrink-0", className)} aria-label={s.label} />;
}

export function VerificationBadge({ verification }: { verification: string }) {
  if (verification === "official") return <span className="text-[12px] text-signal">Official wording</span>;
  return (
    <span className="text-[12px] text-amber" title="Reconstructed from the 1Z0-830 objectives plus Java 22–25 features. Oracle's page was unreachable; see Settings → Exam blueprint.">
      Pending official verification
    </span>
  );
}
