import { json, parseBody, handle } from "@/server/http";
import { updateMistake, updateMistakeSchema } from "@/server/services/journal";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ questionId: string }> }) => {
  const { questionId } = await ctx.params;
  await updateMistake(questionId, await parseBody(req, updateMistakeSchema));
  return json({ ok: true });
});
