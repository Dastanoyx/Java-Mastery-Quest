import { z } from "zod";
import { json, parseBody, handle } from "@/server/http";
import { runExercise } from "@/server/services/exercises";
import { afterLearningEvent } from "@/server/services/gamification";
import { totalXp } from "@/server/services/learner";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, z.object({ code: z.string().max(60_000), submit: z.boolean().default(false) }));
  const xpBefore = await totalXp();
  const r = await runExercise(id, body.code, body.submit);
  const rewards = body.submit ? await afterLearningEvent(xpBefore) : null;
  return json({ ...r, rewards });
});
