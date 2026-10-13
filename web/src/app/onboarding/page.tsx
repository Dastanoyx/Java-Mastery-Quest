import type { Metadata } from "next";
import { getLearner } from "@/server/services/learner";
import { domains as loadDomains } from "@/server/config";
import { Onboarding } from "@/components/settings/Onboarding";

export const metadata: Metadata = { title: "Set up your plan" };

export default async function OnboardingPage() {
  const [learner, doms] = await Promise.all([getLearner(), loadDomains()]);
  return <Onboarding learner={JSON.parse(JSON.stringify(learner))} domains={doms.map((d) => ({ id: d.id, short: d.short, title: d.title }))} />;
}
