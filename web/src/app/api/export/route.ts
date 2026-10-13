import { handle } from "@/server/http";
import { exportData } from "@/server/services/settings";

export const GET = handle(async () => {
  const data = await exportData();
  const name = `java-mastery-quest-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
});
