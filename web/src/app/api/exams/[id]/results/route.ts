import { json, handle, intParam } from "@/server/http";
import { examResults } from "@/server/services/exams";

/** 409 until the attempt is submitted — answers are never revealed during a strict attempt. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return json(await examResults(intParam(id)));
});
