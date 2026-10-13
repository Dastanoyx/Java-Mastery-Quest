import { json, parseBody, handle } from "@/server/http";
import { onboardingSchema, updateSettings } from "@/server/services/settings";

export const POST = handle(async (req: Request) => {
  await updateSettings(await parseBody(req, onboardingSchema), { completeOnboarding: true });
  return json({ ok: true });
});
