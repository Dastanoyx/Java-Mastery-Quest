import { json, parseBody, handle } from "@/server/http";
import { toggleBookmark, bookmarkSchema } from "@/server/services/journal";

export const POST = handle(async (req: Request) => json({ bookmarked: await toggleBookmark(await parseBody(req, bookmarkSchema)) }));
