import { json, parseBody, handle } from "@/server/http";
import { practiceFilterSchema, startPractice } from "@/server/services/practice";

export const POST = handle(async (req: Request) => json(await startPractice(await parseBody(req, practiceFilterSchema))));
