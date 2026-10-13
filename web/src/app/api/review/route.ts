import { z } from "zod";
import { json, parseBody, handle } from "@/server/http";
import { reviewQueue } from "@/server/services/practice";
import { getLearner } from "@/server/services/learner";

export const POST = handle(async (req: Request) => {
  const body = await parseBody(req, z.object({ limit: z.number().int().min(1).max(100).optional() }));
  const learner = await getLearner();
  return json(await reviewQueue(body.limit ?? learner.reviewBatchSize));
});
