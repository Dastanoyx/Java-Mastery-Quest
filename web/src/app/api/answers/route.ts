import { z } from "zod";
import { json, parseBody, handle, HttpError } from "@/server/http";
import { tx } from "@/server/db";
import { getFullQuestion } from "@/server/services/questions";
import { recordAnswer, followUpQuestion } from "@/server/services/answers";
import { afterLearningEvent } from "@/server/services/gamification";
import { totalXp } from "@/server/services/learner";
import { validateResponse } from "@/server/domain/scoring";
import { assertNotInOpenExam } from "@/server/services/examLock";

const schema = z.object({
  questionId: z.string().min(1).max(100),
  response: z.union([z.object({ options: z.array(z.string()).max(8) }), z.object({ text: z.string().max(2000) })]),
  mode: z.enum(["practice", "review", "lesson_check", "timed"]),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).default(null),
  timeMs: z.number().int().min(0).max(3_600_000).nullable().default(null),
  hintUsed: z.boolean().default(false),
  sessionId: z.number().int().positive().nullable().optional(),
});

/** Records an answer in a learning mode and returns full feedback. (Strict exams use /api/exams/*.) */
export const POST = handle(async (req: Request) => {
  const body = await parseBody(req, schema);
  await assertNotInOpenExam([body.questionId]);
  const q = await getFullQuestion(body.questionId);
  if (!q) throw new HttpError(404, "question not found");
  const err = validateResponse(q.type, q.options.map((o) => o.key), body.response);
  if (err) throw new HttpError(400, err);
  const xpBefore = await totalXp();
  const outcome = await tx((c) => recordAnswer(c, { question: q, response: body.response, mode: body.mode, confidence: body.confidence, timeMs: body.timeMs, hintUsed: body.hintUsed, sessionId: body.sessionId ?? null }));
  const followUpId = await followUpQuestion(undefined, q.id, q.objectiveId);
  const rewards = await afterLearningEvent(xpBefore);
  return json({ ...outcome, followUpId, rewards });
});
