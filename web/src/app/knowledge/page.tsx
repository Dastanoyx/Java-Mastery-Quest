import type { Metadata } from "next";
import { vaultData } from "@/server/services/knowledge";
import { domains as loadDomains } from "@/server/config";
import { PageHeader } from "@/components/ui";
import { KnowledgeVault } from "@/components/knowledge/KnowledgeVault";

export const metadata: Metadata = { title: "Knowledge Vault" };
type Props = { searchParams: Promise<{ tab?: string; new?: string; note?: string; q?: string }> };

export default async function KnowledgePage({ searchParams }: Props) {
  const sp = await searchParams;
  const [data, doms] = await Promise.all([vaultData(), loadDomains()]);
  const tab = sp.new === "1" || sp.note ? "notes" : (["notes", "rules", "pairs", "bookmarks", "search"] as const).find((t) => t === sp.tab) ?? "rules";
  return (
    <>
      <PageHeader title="Knowledge Vault"
        description="Your reference shelf: every key rule and exam trap from the lessons, the pairs of concepts the exam loves to mix up, your notes and your bookmarks — all searchable." />
      <KnowledgeVault data={JSON.parse(JSON.stringify(data))} domains={doms.map((d) => ({ id: d.id, short: d.short }))}
        initialTab={tab} openNew={sp.new === "1"} focusNote={sp.note ? Number(sp.note) : null} initialQuery={sp.q ?? ""} />
    </>
  );
}
