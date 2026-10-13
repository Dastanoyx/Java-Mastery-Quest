import { json, handle } from "@/server/http";
import { revealSolution } from "@/server/services/exercises";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return json(await revealSolution(id));
});
