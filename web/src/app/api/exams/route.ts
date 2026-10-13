import { json, parseBody, handle } from "@/server/http";
import { createExam, createExamSchema } from "@/server/services/exams";

export const POST = handle(async (req: Request) => json({ attemptId: await createExam(await parseBody(req, createExamSchema)) }, 201));
