import { json, parseBody, handle, intParam } from "@/server/http";
import { saveExamAnswer, saveAnswerSchema } from "@/server/services/exams";

/** Autosave for one exam question (answer, flag, confidence, time). Never returns correctness. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string; position: string }> }) => {
  const { id, position } = await ctx.params;
  return json(await saveExamAnswer(intParam(id), intParam(position, "position"), await parseBody(req, saveAnswerSchema)));
});
