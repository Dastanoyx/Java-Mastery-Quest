// Content schema shared by the seed, validation and Java-verification scripts.
// Kept free of Next.js imports so it runs under `node --experimental-strip-types`.
import { z } from "zod";

export const DIFFICULTIES = ["foundation", "intermediate", "advanced", "expert"] as const;
export const QUESTION_TYPES = ["single", "multi", "text"] as const;
export const QUESTION_FORMATS = [
  "concept", "predict-output", "does-it-compile", "compile-error", "runtime-exception", "select-valid",
  "overload-resolution", "polymorphism", "trace", "repair", "complete", "short-answer",
] as const;

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "ids may contain letters, digits, . _ -");

export const objectiveSchema = z.object({
  id: z.string().regex(/^D\d{1,2}\.\d{1,2}$/),
  title: z.string().min(10),
  basis: z.string(),
  verification: z.enum(["official", "secondary", "reconstructed"]),
  javaNotes: z.string().optional(),
  masteryThreshold: z.number().min(0.5).max(1).optional(),
});

export const domainSchema = z.object({
  id: z.string().regex(/^D\d{1,2}$/),
  title: z.string(),
  short: z.string(),
  region: z.string(),
  icon: z.string(),
  summary: z.string(),
  objectives: z.array(objectiveSchema).min(1),
});

export const blueprintSchema = z.object({
  exam: z.object({
    code: z.string(),
    title: z.string(),
    questions: z.number().int().positive(),
    durationMinutes: z.number().int().positive(),
    passingPercent: z.number().int().min(1).max(100),
    personalReadyTargetPercent: z.number().int().min(1).max(100),
    verification: z.string(),
    verificationNote: z.string().optional(),
    minQuestionsPerDomain: z.number().int().min(0).default(3),
  }),
  domains: z.array(domainSchema).min(1),
});
export type Blueprint = z.infer<typeof blueprintSchema>;

/** Expected behaviour of a Java program, checked by `npm run content:verify-java`. */
export const javaExpectSchema = z.object({
  compiles: z.boolean(),
  /** exact stdout (trailing whitespace of each line and of the whole output is ignored) */
  stdout: z.string().optional(),
  /** substring that must appear in stdout (for nondeterministic programs, use sparingly) */
  stdoutContains: z.array(z.string()).optional(),
  /** fully-qualified uncaught exception type, e.g. java.lang.ArithmeticException */
  exception: z.string().optional(),
  /** substring of a compiler error message, e.g. "might not have been initialized" */
  errorContains: z.string().optional(),
  /** line of the first compiler error (in the verified source) */
  errorLine: z.number().int().positive().optional(),
  exitCode: z.number().int().optional(),
});

/** A source or resource file. Plain checks: flat names only. Module checks may use paths ("com.app/module-info.java"). */
export const javaFileSchema = z.object({
  name: z.string().regex(/^(?!.*\.\.)[A-Za-z0-9_$][A-Za-z0-9_$.\-/]*\.(java|properties)$/),
  content: z.string(),
});

export const javaCheckSchema = z.object({
  /** complete compilation unit; defaults to the question's `code` */
  source: z.string().optional(),
  fileName: z.string().default("Main.java"),
  /** additional files for multi-file checks */
  files: z.array(javaFileSchema).optional(),
  stdin: z.string().optional(),
  expect: javaExpectSchema,
  /** check that the correct option agrees with the verified behaviour (predict-output etc.) */
  optionCheck: z.boolean().default(true),
  /**
   * Module mode (verification only, trusted content): `files` hold paths under a module source root, e.g.
   * "com.shop/module-info.java" and "com.shop/com/shop/Api.java". Compiled locally with
   * `javac --module-source-path` on JDK 25 and, if `mainModule` is set, run with `java -p out -m mainModule`.
   */
  modules: z.boolean().default(false),
  /** e.g. "com.app/com.app.Main" */
  mainModule: z.string().optional(),
  javacArgs: z.array(z.string()).optional(),
  javaArgs: z.array(z.string()).optional(),
});
export type JavaCheck = z.infer<typeof javaCheckSchema>;

export const optionSchema = z.object({
  key: z.string().regex(/^[a-h]$/),
  text: z.string().min(1),
  correct: z.boolean().default(false),
  why: z.string().min(8, "explain why every option is right or wrong"),
  /** optional per-option program, e.g. "which of these compiles?" */
  java: javaCheckSchema.optional(),
});

export const questionSchema = z
  .object({
    id,
    objective: z.string().regex(/^D\d{1,2}\.\d{1,2}$/),
    lesson: z.string().optional(),
    type: z.enum(QUESTION_TYPES),
    format: z.enum(QUESTION_FORMATS),
    difficulty: z.enum(DIFFICULTIES),
    estSeconds: z.number().int().min(15).max(600),
    tags: z.array(z.string()).default([]),
    prompt: z.string().min(10),
    code: z.string().optional(),
    options: z.array(optionSchema).optional(),
    /** accepted answers for `text` questions (compared after whitespace/case normalisation) */
    accept: z.array(z.string()).optional(),
    explanation: z.string().min(20),
    rule: z.string().min(10),
    misconception: z.string().optional(),
    hint: z.string().optional(),
    examEligible: z.boolean().default(true),
    /** whole-question program check (e.g. the snippet's actual output) */
    java: javaCheckSchema.optional(),
    /** set when the behaviour cannot be machine-verified (explain why in the explanation) */
    manualReview: z.boolean().default(false),
    javaVersion: z.string().default("25"),
  })
  .superRefine((q, ctx) => {
    if (q.type === "text") {
      if (!q.accept?.length) ctx.addIssue({ code: "custom", message: "text questions need accept[]" });
      if (q.examEligible) ctx.addIssue({ code: "custom", message: "text questions cannot be examEligible" });
    } else {
      const opts = q.options ?? [];
      if (opts.length < 2) ctx.addIssue({ code: "custom", message: "choice questions need ≥2 options" });
      const correct = opts.filter((o) => o.correct).length;
      if (correct === 0) ctx.addIssue({ code: "custom", message: "no correct option" });
      if (q.type === "single" && correct !== 1) ctx.addIssue({ code: "custom", message: "single needs exactly one correct option" });
      if (q.type === "multi" && correct < 2) ctx.addIssue({ code: "custom", message: "multi needs ≥2 correct options" });
      const keys = new Set(opts.map((o) => o.key));
      if (keys.size !== opts.length) ctx.addIssue({ code: "custom", message: "duplicate option keys" });
    }
  });
export type QuestionDef = z.infer<typeof questionSchema>;

export const exerciseSchema = z.object({
  id,
  objective: z.string().regex(/^D\d{1,2}\.\d{1,2}$/),
  lesson: z.string().optional(),
  title: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  kind: z.enum(["implement", "repair", "complete"]),
  prompt: z.string().min(20),
  fileName: z.string().default("Solution.java"),
  starter: z.string(),
  solution: z.string(),
  /** Main.java: prints one line per test: "PASS <name>" or "FAIL <name>: <detail>" */
  harness: z.string(),
  explanation: z.string().min(20),
  hints: z.array(z.string()).default([]),
  timeLimitMs: z.number().int().min(500).max(10000).default(5000),
});
export type ExerciseDef = z.infer<typeof exerciseSchema>;

export const lessonFrontSchema = z.object({
  id,
  domain: z.string().regex(/^D\d{1,2}$/),
  order: z.number().int().positive(),
  title: z.string().min(5),
  summary: z.string().min(20),
  minutes: z.number().int().positive(),
  objectives: z.array(z.string().regex(/^D\d{1,2}\.\d{1,2}$/)).min(1),
  prerequisites: z.array(z.string()).default([]),
  contract: z.array(z.string()).min(2),
  keyRules: z.array(z.string()).min(2),
  retrieval: z.array(z.string()).min(1),
  checks: z.array(z.string()).default([]),
  mastery: z.array(z.string()).min(3),
  supplementary: z.boolean().default(false),
  javaVersion: z.string().default("25"),
});
export type LessonFront = z.infer<typeof lessonFrontSchema>;

export const achievementSchema = z.object({
  id, title: z.string(), description: z.string(), icon: z.string(), xp: z.number().int().min(0),
});
