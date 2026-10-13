"use client";
// Route-level error boundary. Shows a recovery path; the details stay in the server log (never a stack trace here).
import { useEffect } from "react";
import { TriangleAlert, RotateCcw } from "lucide-react";
import { Button, LinkButton } from "@/components/ui";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[page]", error.digest ?? "", error.message); }, [error]);
  const db = /ECONNREFUSED|database|DATABASE_URL|connect/i.test(error.message);
  return (
    <div className="mx-auto max-w-lg py-20">
      <TriangleAlert size={26} className="text-rose" aria-hidden />
      <h1 className="mt-3 text-[22px] font-semibold text-ink">{db ? "Lost contact with the database" : "This page hit an error"}</h1>
      <p className="mt-2 text-muted">
        {db ? "Your progress is safe in PostgreSQL — the app just can't reach it right now. Check that the database container is running (docker compose ps), then retry."
          : "Nothing you entered was lost: answers, notes and exam progress are saved as you go. Retry, and if it keeps happening check the server log (docker compose logs web)."}
      </p>
      {error.digest && <p className="mt-2 font-mono text-[12px] text-faint">Reference: {error.digest}</p>}
      <div className="mt-6 flex gap-2"><Button variant="primary" onClick={reset}><RotateCcw size={15} />Retry</Button><LinkButton href="/">Command Center</LinkButton></div>
    </div>
  );
}
