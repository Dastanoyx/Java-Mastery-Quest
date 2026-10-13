import { z } from "zod";
import { json, parseBody, handle } from "@/server/http";
import { saveReflection } from "@/server/services/lessons";

export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, z.object({ text: z.string().max(10000) }));
  await saveReflection(id, body.text);
  return json({ ok: true });
});
