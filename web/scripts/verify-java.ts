// Compiles and runs every Java artefact in the curriculum on the target JDK (via the runner service)
// and checks it against the declared expectation. Writes content/.verification/java-results.json,
// which the seed uses to mark questions "jdk-verified".
//
// Usage: npm run content:verify-java [-- --only D3] [-- --id D3-OVL-001] [-- --verbose]
import { mkdirSync, writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { loadContent, hashOf, normalizeOutput, type QuestionWithFile } from "../src/content/load.ts";
import type { JavaCheck } from "../src/content/schema.ts";

const RUNNER = process.env.RUNNER_URL ?? "http://127.0.0.1:8090";
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const onlyId = args.includes("--id") ? args[args.indexOf("--id") + 1] : undefined;
const verbose = args.includes("--verbose");
const PARALLEL = Number(process.env.VERIFY_PARALLEL ?? 2);

interface RunResult {
  compile: { ok: boolean; diagnostics: { line: number; message: string; kind: string; file: string }[] };
  run?: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; exception?: { type: string; message?: string } };
}

interface Job { key: string; hash: string; label: string; exec: () => Promise<string[]> }

async function runJava(files: { name: string; content: string }[], stdin?: string, timeoutMs = 8000, mainClass?: string): Promise<RunResult> {
  const res = await fetch(`${RUNNER}/v1/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files, stdin, timeoutMs, mainClass }),
  });
  if (!res.ok) throw new Error(`runner HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as RunResult;
}

function describe(r: RunResult): string {
  if (!r.compile.ok) return "compile error: " + r.compile.diagnostics.filter((d) => d.kind === "ERROR").map((d) => `L${d.line} ${d.message.split("\n")[0]}`).join(" | ");
  const run = r.run!;
  return `exit=${run.exitCode} exception=${run.exception?.type ?? "-"} stdout=${JSON.stringify(run.stdout.slice(0, 400))}` +
    (run.stderr && !run.exception ? ` stderr=${JSON.stringify(run.stderr.slice(0, 200))}` : "");
}

const JDK = process.env.JDK25_HOME ?? "/opt/jdk25";

/**
 * Module-mode check: compiles a multi-module source tree locally with javac --module-source-path and
 * optionally runs it. Only used for trusted curriculum content at authoring time (never for learner code).
 */
function runModules(check: JavaCheck, fallbackCode?: string): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "jmq-mod-"));
  try {
    const src = join(dir, "src"), out = join(dir, "out");
    const files = [...(check.files ?? [])];
    if (check.source ?? fallbackCode) files.unshift({ name: check.fileName, content: (check.source ?? fallbackCode)! });
    const javaFiles: string[] = [];
    for (const f of files) {
      const p = join(src, f.name);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, f.content);
      if (f.name.endsWith(".java")) javaFiles.push(p);
    }
    const env = { ...process.env, JAVA_TOOL_OPTIONS: "" , LANG: "C.UTF-8" };
    delete (env as Record<string, string | undefined>).JAVA_TOOL_OPTIONS;
    const jc = spawnSync(join(JDK, "bin", "javac"), ["--module-source-path", src, "-d", out, "-proc:none", ...(check.javacArgs ?? []), ...javaFiles],
      { encoding: "utf8", env, timeout: 60000 });
    const diagnostics: RunResult["compile"]["diagnostics"] = [];
    const re = /^(.+?\.java):(\d+): (error|warning): (.*)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(jc.stderr))) diagnostics.push({ file: m[1].slice(src.length + 1), line: Number(m[2]), kind: m[3] === "error" ? "ERROR" : "WARNING", message: m[4] });
    const compileOk = jc.status === 0;
    if (!compileOk && !diagnostics.length) diagnostics.push({ file: "", line: 0, kind: "ERROR", message: jc.stderr.trim() || "javac failed" });
    const result: RunResult = { compile: { ok: compileOk, diagnostics } };
    if (!compileOk || !check.mainModule) return result;
    const jr = spawnSync(join(JDK, "bin", "java"), [...(check.javaArgs ?? []), "-Duser.language=en", "-Duser.country=US", "-Duser.timezone=UTC", "-p", out, "-m", check.mainModule],
      { encoding: "utf8", env, timeout: 30000, input: check.stdin });
    const ex = /Exception in thread "[^"]*" ([A-Za-z0-9_$.]+)(?:: ?(.*))?/.exec(jr.stderr);
    result.run = { exitCode: jr.status, stdout: jr.stdout, stderr: jr.stderr, timedOut: jr.error?.name === "Error" && /ETIMEDOUT/.test(String(jr.error)),
      exception: ex ? { type: ex[1], message: ex[2] } : undefined };
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Returns a list of problems (empty = verified). */
async function checkProgram(check: JavaCheck, fallbackCode: string | undefined): Promise<{ problems: string[]; result?: RunResult }> {
  const source = check.source ?? fallbackCode;
  if (!source && !check.modules) return { problems: ["no source to verify"] };
  const files = [{ name: check.fileName, content: source ?? "" }, ...(check.files ?? [])];
  const r = check.modules ? runModules(check, undefined) : await runJava(files, check.stdin);
  if (check.modules && !check.mainModule && r.compile.ok && check.expect.compiles) return { problems: [], result: r };
  const e = check.expect;
  const p: string[] = [];
  if (r.compile.ok !== e.compiles) {
    p.push(`expected compiles=${e.compiles}, got ${describe(r)}`);
    return { problems: p, result: r };
  }
  if (!e.compiles) {
    const errs = r.compile.diagnostics.filter((d) => d.kind === "ERROR");
    if (e.errorContains && !errs.some((d) => d.message.includes(e.errorContains!)))
      p.push(`expected compiler error containing "${e.errorContains}", got: ${errs.map((d) => d.message.split("\n")[0]).join(" | ")}`);
    if (e.errorLine && !errs.some((d) => d.line === e.errorLine))
      p.push(`expected an error on line ${e.errorLine}, got lines ${errs.map((d) => d.line).join(",")}`);
    return { problems: p, result: r };
  }
  const run = r.run!;
  if (run.timedOut) p.push("program timed out");
  if (e.stdout !== undefined && normalizeOutput(run.stdout) !== normalizeOutput(e.stdout))
    p.push(`stdout mismatch.\n      expected: ${JSON.stringify(normalizeOutput(e.stdout))}\n      actual:   ${JSON.stringify(normalizeOutput(run.stdout))}`);
  for (const s of e.stdoutContains ?? []) if (!run.stdout.includes(s)) p.push(`stdout lacks "${s}"`);
  if (e.exception && run.exception?.type !== e.exception) p.push(`expected exception ${e.exception}, got ${run.exception?.type ?? "none"} (${describe(r)})`);
  if (!e.exception && run.exception) p.push(`unexpected exception ${run.exception.type}: ${run.exception.message ?? ""}`);
  if (e.exitCode !== undefined && run.exitCode !== e.exitCode) p.push(`expected exit ${e.exitCode}, got ${run.exitCode}`);
  if (!e.exception && e.exitCode === undefined && run.exitCode !== 0 && !run.timedOut) p.push(`non-zero exit ${run.exitCode}: ${run.stderr.slice(0, 200)}`);
  return { problems: p, result: r };
}

const stripMd = (s: string) => s.replace(/```[a-z]*\n?/g, "").replace(/`/g, "").trim();

function optionConsistency(q: QuestionWithFile): string[] {
  const check = q.java;
  if (!check || !check.optionCheck || !q.options) return [];
  const correct = q.options.filter((o) => o.correct);
  const e = check.expect;
  const p: string[] = [];
  if (q.type !== "single") return p;
  const text = stripMd(correct[0].text);
  if (!e.compiles) {
    const lineAnswer = /^line\s+(\d+)\b/i.exec(text);
    if (lineAnswer) {
      if (!e.errorLine) p.push(`correct option names line ${lineAnswer[1]} but java.expect.errorLine is not set`);
      else if (Number(lineAnswer[1]) !== e.errorLine) p.push(`correct option names line ${lineAnswer[1]} but the verified error is on line ${e.errorLine}`);
    } else if (!/compil|does not compile|fails to compile/i.test(text)) p.push(`program does not compile but correct option is "${text}"`);
  } else if (e.exception) {
    const simple = e.exception.split(".").pop()!;
    if (!text.includes(simple) && !/exception is thrown|throws/i.test(text)) p.push(`program throws ${simple} but correct option is "${text}"`);
  } else if (q.format === "predict-output" && e.stdout !== undefined) {
    if (normalizeOutput(text) !== normalizeOutput(e.stdout)) p.push(`correct option "${text}" ≠ verified stdout ${JSON.stringify(normalizeOutput(e.stdout))}`);
    // No other option may also equal the real output.
    for (const o of q.options.filter((x) => !x.correct))
      if (normalizeOutput(stripMd(o.text)) === normalizeOutput(e.stdout)) p.push(`wrong option ${o.key} equals the real output`);
  }
  return p;
}

async function main() {
  const c = loadContent();
  if (c.errors.length && !args.includes("--allow-errors")) {
    console.error(`Content has ${c.errors.length} schema/reference errors — run content:validate first.`);
    for (const e of c.errors.slice(0, 30)) console.error("  " + e);
    process.exit(1);
  }
  const health = await fetch(`${RUNNER}/health`).then((r) => r.json()).catch(() => null);
  if (!health) { console.error(`Runner not reachable at ${RUNNER}. Start it (see README) and retry.`); process.exit(2); }
  const jdk = String(health.java);
  if (!jdk.startsWith("25")) { console.error(`Runner uses JDK ${jdk}; questions target Java 25. Refusing to verify.`); process.exit(3); }

  const jobs: Job[] = [];
  const inScope = (id: string) => (!only || id.startsWith(only + "-") || id.startsWith(only + ".") || id.includes(`/${only}/`)) && (!onlyId || id === onlyId);

  for (const q of c.questions) {
    if (!inScope(q.id) && !(only && q.objective.startsWith(only + "."))) continue;
    const hasJava = q.java || q.options?.some((o) => o.java);
    if (!hasJava) continue;
    jobs.push({
      key: `question:${q.id}`,
      hash: hashOf({ code: q.code, java: q.java, options: q.options }),
      label: `${q.id} (${q.file})`,
      exec: async () => {
        const problems: string[] = [];
        if (q.java) problems.push(...(await checkProgram(q.java, q.code)).problems);
        for (const o of q.options ?? []) {
          if (!o.java) continue;
          const r = await checkProgram(o.java, undefined);
          problems.push(...r.problems.map((x) => `option ${o.key}: ${x}`));
        }
        problems.push(...optionConsistency(q));
        return problems;
      },
    });
  }

  for (const l of c.lessons) {
    if (only && l.domain !== only) continue;
    if (onlyId && l.id !== onlyId) continue;
    for (const pb of l.predicts) {
      jobs.push({
        key: `lesson:${l.id}#${pb.index}`,
        hash: hashOf(pb),
        label: `${l.id} predict #${pb.index + 1} (line ${pb.line})`,
        exec: async () => {
          const expectsError = /^\s*(compilation fails|does not compile)/i.test(pb.output);
          const name = /public\s+(?:final\s+)?(?:class|record|interface|enum)\s+(\w+)/.exec(pb.code)?.[1] ?? "Main";
          const r = await runJava([{ name: `${name}.java`, content: pb.code }]);
          if (expectsError) return r.compile.ok ? ["block says compilation fails, but it compiles"] : [];
          if (!r.compile.ok) return [describe(r)];
          const run = r.run!;
          const so = normalizeOutput(run.stdout);
          const actual = run.exception ? normalizeOutput(so + (so ? "\n" : "") + `Exception in thread "main" ${run.exception.type}${run.exception.message ? ": " + run.exception.message : ""}`) : normalizeOutput(run.stdout);
          const expected = normalizeOutput(pb.output);
          return actual === expected ? [] : [`output mismatch\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`];
        },
      });
    }
  }

  for (const ex of c.exercises) {
    if (only && !ex.objective.startsWith(only + ".")) continue;
    if (onlyId && ex.id !== onlyId) continue;
    jobs.push({
      key: `exercise:${ex.id}`,
      hash: hashOf({ s: ex.solution, st: ex.starter, h: ex.harness }),
      label: `${ex.id} (${ex.file})`,
      exec: async () => {
        const p: string[] = [];
        const sol = await runJava([{ name: "Main.java", content: ex.harness }, { name: ex.fileName, content: ex.solution }], undefined, ex.timeLimitMs, "Main");
        const lines = sol.run?.stdout.split("\n").filter(Boolean) ?? [];
        if (!sol.compile.ok) p.push("solution: " + describe(sol));
        else if (!lines.length || lines.some((x) => !x.startsWith("PASS "))) p.push("solution does not pass every test: " + describe(sol));
        const st = await runJava([{ name: "Main.java", content: ex.harness }, { name: ex.fileName, content: ex.starter }], undefined, ex.timeLimitMs, "Main");
        const stLines = st.run?.stdout.split("\n").filter(Boolean) ?? [];
        if (st.compile.ok && stLines.length && stLines.every((x) => x.startsWith("PASS "))) p.push("starter code already passes all tests (harness too weak)");
        return p;
      },
    });
  }

  const outDir = join(c.dir, ".verification");
  const outFile = join(outDir, "java-results.json");
  const previous = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : { results: {} };
  const results: Record<string, { hash: string; ok: boolean; problems: string[]; verifiedAt: string; jdk: string }> =
    (only || onlyId) ? { ...previous.results } : {};

  console.log(`Verifying ${jobs.length} Java artefacts on JDK ${jdk} via ${RUNNER} …`);
  let failed = 0, idx = 0;
  const t0 = Date.now();
  async function worker() {
    while (idx < jobs.length) {
      const job = jobs[idx++];
      let problems: string[];
      try { problems = await job.exec(); } catch (e) { problems = [`infrastructure error: ${(e as Error).message}`]; }
      results[job.key] = { hash: job.hash, ok: problems.length === 0, problems, verifiedAt: new Date().toISOString(), jdk };
      if (problems.length) {
        failed++;
        console.log(`✗ ${job.label}`);
        for (const pr of problems) console.log(`    - ${pr}`);
      } else if (verbose) console.log(`✓ ${job.label}`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), jdk, results }, null, 2));
  console.log(`\n${jobs.length - failed}/${jobs.length} verified, ${failed} failed (${((Date.now() - t0) / 1000).toFixed(1)}s). Results → ${outFile}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
