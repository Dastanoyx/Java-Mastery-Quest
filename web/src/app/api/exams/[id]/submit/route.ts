import { json, handle, intParam } from "@/server/http";
import { submitExam } from "@/server/services/exams";
import { afterLearningEvent } from "@/server/services/gamification";
import { totalXp } from "@/server/services/learner";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const xpBefore = await totalXp();
  const r = await submitExam(intParam(id), "learner");
  const rewards = r.alreadySubmitted ? null : await afterLearningEvent(xpBefore);
  return json({ ...r, rewards });
});
