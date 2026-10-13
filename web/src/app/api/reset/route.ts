import { z } from "zod";
import { json, parseBody, handle } from "@/server/http";
import { resetProgress } from "@/server/services/settings";

export const POST = handle(async (req: Request) => {
  const b = await parseBody(req, z.object({ phrase: z.string().max(100), includeProfile: z.boolean().default(false) }));
  await resetProgress(b.phrase, b.includeProfile);
  return json({ ok: true });
});
