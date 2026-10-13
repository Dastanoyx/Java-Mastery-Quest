import { z } from "zod";
import { json, parseBody, handle } from "@/server/http";
import { recordLessonEvent } from "@/server/services/lessons";
import { afterLearningEvent } from "@/server/services/gamification";
import { totalXp } from "@/server/services/learner";

const schema = z.object({
  kind: z.enum(["opened", "section", "prediction", "retrieval"]),
  ref: z.string().max(120).nullable().default(null),
  payload: z.record(z.string(), z.union([z.string().max(5000), z.number(), z.boolean(), z.null()])).default({}),
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);
  const xpBefore = await totalXp();
  const r = await recordLessonEvent(id, body.kind, body.ref, body.payload);
  const rewards = body.kind === "prediction" ? await afterLearningEvent(xpBefore) : null;
  return json({ ...r, rewards });
});
