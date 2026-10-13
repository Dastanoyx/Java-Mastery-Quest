import { json, parseBody, handle } from "@/server/http";
import { settingsSchema, updateSettings } from "@/server/services/settings";
import { getLearner } from "@/server/services/learner";

export const GET = handle(async () => json(await getLearner()));
export const PATCH = handle(async (req: Request) => {
  await updateSettings(await parseBody(req, settingsSchema));
  return json(await getLearner());
});
