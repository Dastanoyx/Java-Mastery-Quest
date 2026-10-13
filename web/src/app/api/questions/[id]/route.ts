import { json, handle, HttpError } from "@/server/http";
import { getFullQuestion, toPublic } from "@/server/services/questions";
import { assertNotInOpenExam } from "@/server/services/examLock";

/** Public (answer-free) question payload, e.g. for follow-up questions. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await assertNotInOpenExam([id]);
  const q = await getFullQuestion(id);
  if (!q || q.retired) throw new HttpError(404, "question not found");
  return json(toPublic(q));
});
