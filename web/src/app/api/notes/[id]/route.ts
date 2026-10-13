import { json, parseBody, handle, intParam } from "@/server/http";
import { updateNote, deleteNote, noteSchema } from "@/server/services/journal";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return json(await updateNote(intParam(id), await parseBody(req, noteSchema.partial())));
});
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await deleteNote(intParam(id));
  return json({ ok: true });
});
