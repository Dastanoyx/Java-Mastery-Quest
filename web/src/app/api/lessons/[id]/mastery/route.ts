import { z } from "zod";
import { json, parseBody, handle } from "@/server/http";
import { submitMasteryQuiz } from "@/server/services/lessons";
import { afterLearningEvent } from "@/server/services/gamification";
import { totalXp } from "@/server/services/learner";

const schema = z.object({
  answers: z.array(z.object({
    questionId: z.string().max(100),
    response: z.union([z.object({ options: z.array(z.string()).min(1).max(8) }), z.object({ text: z.string().max(2000) })]),
    confidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).default(null),
    timeMs: z.number().int().min(0).max(3_600_000).nullable().default(null),
  })).min(1).max(30),
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);
  const xpBefore = await totalXp();
  const result = await submitMasteryQuiz(id, body.answers);
  const rewards = await afterLearningEvent(xpBefore);
  return json({ ...result, rewards });
});
