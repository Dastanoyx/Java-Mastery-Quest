import { json, parseBody, handle } from "@/server/http";
import { listNotes, createNote, noteSchema } from "@/server/services/journal";

export const GET = handle(async () => json(await listNotes()));
export const POST = handle(async (req: Request) => json(await createNote(await parseBody(req, noteSchema)), 201));
