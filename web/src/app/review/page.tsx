import type { Metadata } from "next";
import { one, query, LEARNER_ID } from "@/server/db";
import { dueCounts } from "@/server/services/practice";
import { DUE_SQL } from "@/server/domain/srs";
import { getLearner } from "@/server/services/learner";
import { PageHeader } from "@/components/ui";
import { ReviewSession } from "@/components/practice/ReviewSession";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const [due, learner, next, upcoming, stats] = await Promise.all([
    dueCounts(),
    getLearner(),
    one<{ at: Date | null }>(`SELECT min(due_at) AS at FROM review_item r JOIN question q ON q.id = r.question_id WHERE r.learner_id = $1 AND NOT r.suspended AND NOT q.retired AND NOT ${DUE_SQL}`, [LEARNER_ID]),
    query<{ day: string; n: number }>(
      `SELECT to_char((r.due_at AT TIME ZONE l.timezone)::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
       FROM review_item r JOIN question q ON q.id = r.question_id JOIN learner l ON l.id = r.learner_id
       WHERE r.learner_id = $1 AND NOT r.suspended AND NOT q.retired AND r.due_at <= now() + interval '14 days'
       GROUP BY 1 ORDER BY 1`, [LEARNER_ID]),
    one<{ n: number; ok: number }>("SELECT count(*)::int AS n, count(*) FILTER (WHERE grade >= 3)::int AS ok FROM review_log WHERE learner_id = $1 AND was_due AND reviewed_at >= now() - interval '30 days'", [LEARNER_ID]),
  ]);
  return (
    <>
      <PageHeader title="Review"
        description="Spaced retrieval: questions come back just as you are about to forget them. Domains are mixed on purpose. A correct answer pushes the next review further out; a miss brings it back in ten minutes." />
      <ReviewSession
        due={due} batchSize={learner.reviewBatchSize} askConfidence={learner.askConfidence}
        nextDueAt={next?.at ? new Date(next.at).toISOString() : null}
        upcoming={upcoming} recent={{ reviews: stats?.n ?? 0, recalled: stats?.ok ?? 0 }}
      />
    </>
  );
}
