import { z } from "zod";
import { json, parseBody, handle } from "@/server/http";
import { runJava } from "@/server/services/runner";

const schema = z.object({
  fileName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,63}\.java$/).default("Main.java"),
  code: z.string().min(1).max(60_000),
  stdin: z.string().max(16_000).optional(),
});

/** Playground: compile & run one source file in the isolated runner (used by lesson examples). */
export const POST = handle(async (req: Request) => {
  const b = await parseBody(req, schema);
  return json(await runJava([{ name: b.fileName, content: b.code }], { stdin: b.stdin, timeoutMs: 5000 }));
});
