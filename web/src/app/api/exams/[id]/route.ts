import { json, handle, intParam, HttpError } from "@/server/http";
import { getAttemptForTaking } from "@/server/services/exams";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const r = await getAttemptForTaking(intParam(id));
  if (!r.view) throw new HttpError(404, "attempt not found");
  return json(r);
});
