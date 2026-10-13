// "Confusable pairs" for the Knowledge Vault (content/confusables.yaml). Read at request time, validated with zod.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { contentDir } from "./load.ts";

const side = z.object({ name: z.string().min(1), points: z.array(z.string().min(5)).min(2) });
export const confusableSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), title: z.string().min(3), domains: z.array(z.string().regex(/^D\d{1,2}$/)).min(1),
  lessons: z.array(z.string()).min(1), a: side, b: side, rule: z.string().min(10),
}).strict();
export type Confusable = z.infer<typeof confusableSchema>;

export function loadConfusables(dir = contentDir()): Confusable[] {
  const f = join(dir, "confusables.yaml");
  if (!existsSync(f)) return [];
  return z.array(confusableSchema).parse(parse(readFileSync(f, "utf8")));
}
