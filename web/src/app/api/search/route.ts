import { json, handle } from "@/server/http";
import { search } from "@/server/services/journal";

export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json(await search(q));
});
