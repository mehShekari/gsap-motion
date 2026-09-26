#!/usr/bin/env node
/**
 * run-arm — one arm of a creative A/B: agent runs, builds, and the grader.
 *
 *   node scripts/grade/run-arm.mjs <root> <arm> <brief> [--runs 3] [--parallel 3]
 *
 * `<root>` holds `starter/` (with its node_modules installed), `briefs/<brief>.md`
 * plus `briefs/constraints.md`, and, for every arm but `none`, the skill to test
 * at `skills/<arm>/SKILL.md`: a frozen copy, so editing the skill's source during
 * a round cannot change an arm halfway through it.
 *
 * Each run is its own `claude -p` process in its own copy of the starter, as
 * phase 8's clean round established: no parent session, so no plugin hook; skills
 * and slash commands off in every arm; project settings only, of which there are
 * none. The skill reaches the skill arms as a path the prompt names, and the
 * control arm is told not to read one. The init event and every read outside the
 * run's own folder are recorded, so a leak is seen rather than assumed away.
 *
 * Then, for every run: a build with relative asset paths, so the arena can serve
 * it under any prefix; `grade.mjs` on that build after one warm load; and
 * `basicShare`, below. Results go to `<root>/results/<brief>__<arm>-<n>.json`, and
 * a run that already has one is skipped, so a round can be resumed.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "./arena.mjs";
import { grade } from "./grade.mjs";
import { findAll, keyName, parse, tweenMethod, varsObjects } from "../../plugins/gsap-motion/skills/gsap-creative-animation/scripts/lib/ast.mjs";

const CLAUDE = process.env.CLAUDE_BIN ?? "claude";
const MODEL = process.env.ARM_MODEL ?? "sonnet";

/** Keys that configure a tween rather than name a property it animates. */
const SETTINGS = new Set([
  "duration", "delay", "ease", "stagger", "repeat", "repeatDelay", "yoyo", "yoyoEase", "overwrite",
  "immediateRender", "paused", "reversed", "id", "data", "defaults", "scrollTrigger", "inherit",
  "runBackwards", "startAt", "keyframes", "lazy", "callbackScope", "smoothChildTiming", "autoRemoveChildren",
  "clearProps", "force3D", "onStart", "onUpdate", "onComplete", "onRepeat", "onReverseComplete", "onInterrupt",
]);
/** The vocabulary of the default reveal: fade and translate, nothing else. */
const BASIC = new Set(["opacity", "autoAlpha", "x", "y", "xPercent", "yPercent"]);

/**
 * The share of tweens whose animated properties are only opacity and translate.
 *
 * A diagnostic, not a score: a fade-up is often right. It exists to test one
 * claim from the reports this round answers, that the skill's output is the web's
 * default reveal, with a number instead of an impression. `properties` is every
 * property any tween animates, so a change of vocabulary shows too.
 */
export function basicShare(sources) {
  let tweens = 0;
  let basic = 0;
  const properties = new Set();
  for (const [path, source] of sources) {
    let ast;
    try {
      ({ ast } = parse(source, path));
    } catch {
      continue;
    }
    for (const call of findAll(ast, (node) => ["to", "from", "fromTo"].includes(tweenMethod(node)))) {
      const keys = varsObjects(call, tweenMethod(call))
        .flatMap((vars) => vars.properties.map(keyName))
        .filter((key) => key && !SETTINGS.has(key));
      if (keys.length === 0) continue;
      tweens += 1;
      keys.forEach((key) => properties.add(key));
      if (keys.every((key) => BASIC.has(key))) basic += 1;
    }
  }
  return { tweens, basic, share: tweens ? Math.round((basic / tweens) * 100) / 100 : null, properties: [...properties].sort() };
}

const sourcesIn = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(jsx?|tsx?|mjs)$/.test(entry.name))
    .map((entry) => {
      const path = join(entry.parentPath ?? entry.path, entry.name);
      return [path, readFileSync(path, "utf8")];
    });

const guidance = (root, arm) => {
  if (arm === "none") {
    return `## Your guidance: your own knowledge only

Do NOT read any file under a \`.claude\` directory, a \`plugins\` directory, or any \`skills\` directory, anywhere on this machine. Use only your own knowledge of GSAP and React.

`;
  }
  const skill = resolve(root, "skills", arm);
  return `## Your guidance: a GSAP skill — read it before writing any code

Before writing anything, read this skill and follow it for the whole task:

${join(skill, "SKILL.md")}

Where the skill says \`<skill-dir>\`, it means that folder:
${skill}

Load the reference files SKILL.md tells you to load for this kind of request, by reading them from that path.

`;
};

const ARGS = [
  "-p", "--model", MODEL, "--output-format", "stream-json", "--verbose",
  "--permission-mode", "acceptEdits",
  "--allowedTools", "Read,Write,Edit,Glob,Grep,Bash(node:*)",
  "--disable-slash-commands", "--setting-sources", "project", "--strict-mcp-config",
  "--no-session-persistence", "--max-budget-usd", "6",
];

function agent(dir, prompt, log) {
  return new Promise((done) => {
    const out = createWriteStream(log);
    const child = spawn(CLAUDE, ARGS, { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.pipe(out);
    child.stderr.on("data", (chunk) => process.stderr.write(`[${basename(dir)}] ${chunk}`));
    child.stdin.end(prompt);
    child.on("close", (code) => out.end(() => done(code)));
  });
}

/** What the transcript says about cost, tools and leaks. */
function transcript(log, dir) {
  const events = readFileSync(log, "utf8").split("\n").flatMap((line) => {
    try {
      return line ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
  const init = events.find((e) => e.type === "system" && e.subtype === "init") ?? {};
  const result = events.find((e) => e.type === "result") ?? {};
  const uses = events.flatMap((e) => (e.type === "assistant" ? e.message.content.filter((c) => c.type === "tool_use") : []));
  const inside = (path) => resolve(path).toLowerCase().startsWith(resolve(dir).toLowerCase());
  return {
    model: init.model,
    /** Built-in plugins ship with the CLI and load in every arm alike. */
    plugins: (init.plugins ?? []).filter((plugin) => !String(plugin.source).endsWith("@builtin")),
    skills: init.skills ?? [],
    mcp: init.mcp_servers ?? [],
    outcome: result.subtype,
    cost: result.total_cost_usd,
    seconds: Math.round((result.duration_ms ?? 0) / 1000),
    tools: uses.length,
    readOutside: [...new Set(uses.filter((u) => u.name === "Read" && !inside(u.input.file_path)).map((u) => u.input.file_path))],
    summary: String(result.result ?? "").slice(0, 4000),
  };
}

/** Grades a build: `grade.mjs` against it, served, after one warm load. */
async function gradeBuild(dist, src) {
  const server = await serve(dist);
  try {
    await fetch(server.url);
    return await grade(server.url, src);
  } finally {
    server.close();
  }
}

/**
 * The starter's own grade. A check the untouched starter already fails is a
 * property of the layout every arm was told to keep, not of any arm's motion:
 * on this bench the invoice starts below most of a phone's first screen. Only a
 * failure the starter does not have counts as fragility.
 */
async function starterGrade(root) {
  const out = join(root, "results", "starter.json");
  if (existsSync(out)) return JSON.parse(readFileSync(out, "utf8"));
  mkdirSync(join(root, "results"), { recursive: true });
  const starter = join(root, "starter");
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--base", "./"], { cwd: starter, stdio: "pipe" });
  const result = await gradeBuild(join(starter, "dist"), join(starter, "src"));
  writeFileSync(out, JSON.stringify(result, null, 2));
  return result;
}

async function one(root, arm, brief, n, baseline) {
  const dir = join(root, "runs", brief, `${arm}-${n}`);
  const out = join(root, "results", `${brief}__${arm}-${n}.json`);
  if (existsSync(out)) return JSON.parse(readFileSync(out, "utf8"));

  mkdirSync(join(root, "logs"), { recursive: true });
  mkdirSync(join(root, "results"), { recursive: true });
  const log = join(root, "logs", `${brief}__${arm}-${n}.jsonl`);

  /** A run whose agent finished is never paid for twice: only what follows it is redone. */
  let code = 0;
  if (!(existsSync(log) && transcript(log, dir).outcome === "success")) {
    /** Leave out the starter's own build only: packages in `node_modules` keep their code in a `dist` too. */
    const starterDist = resolve(root, "starter", "dist");
    cpSync(join(root, "starter"), dir, { recursive: true, filter: (path) => resolve(path) !== starterDist });
    /** A copy the agent cannot build in is a different task, so refuse it before paying for a run. */
    execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "--version"], { cwd: dir, stdio: "pipe" });

    const prompt =
      `You are working on a web page in an isolated project. Work ONLY inside this directory:\n\n${dir}\n\n` +
      guidance(root, arm) +
      readFileSync(join(root, "briefs", `${brief}.md`), "utf8") +
      "\n" +
      readFileSync(join(root, "briefs", "constraints.md"), "utf8");
    code = await agent(dir, prompt, log);
  }
  const record = { brief, arm, n, exit: code, ...transcript(log, dir) };
  /** A run cut off by a usage limit or a crash is not a sample: leave it for the resume to redo. */
  if (record.outcome !== "success") return record;

  try {
    execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--base", "./"], { cwd: dir, stdio: "pipe" });
    record.build = "passed";
  } catch (error) {
    record.build = `failed: ${String(error.stderr).slice(0, 400)}`;
  }

  record.vocabulary = basicShare(sourcesIn(join(dir, "src")));

  if (record.build === "passed") {
    try {
      record.grade = await gradeBuild(join(dir, "dist"), join(dir, "src"));
    } catch (error) {
      console.error(`${brief}/${arm}-${n}: grading failed, the run is kept for a re-grade: ${error.message}`);
      return record;
    }
    const known = new Set(baseline.browser.filter((check) => check.failed).map((check) => check.id));
    record.fragile = [
      ...record.grade.browser.filter((check) => check.failed && !known.has(check.id)).map((check) => `${check.id}: ${check.evidence}`),
      ...record.grade.audit.map((finding) => `${finding.rule} ${finding.file}:${finding.line}`),
    ];
  }

  writeFileSync(out, JSON.stringify(record, null, 2));
  return record;
}

const line = (r) =>
  r.outcome !== "success" ? `${r.brief}/${r.arm}-${r.n}: ${r.outcome ?? "no result"}, not counted; resume to redo it` :
  `${r.brief}/${r.arm}-${r.n}: ${r.outcome} $${r.cost?.toFixed(2)} ${r.seconds}s tools ${r.tools}; build ${r.build}; ` +
  `${r.fragile ? (r.fragile.length ? `FRAGILE (${r.fragile.join("; ")})` : "not fragile") : "not graded"}; basic ${r.vocabulary.basic}/${r.vocabulary.tweens}` +
  `${r.plugins.length || r.skills.length || r.mcp.length ? "; LEAK: plugins/skills/mcp in init" : ""}` +
  `${r.readOutside.length ? `; read outside: ${r.readOutside.length}` : ""}`;

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback);
  const [root, arm, brief] = args.filter((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"));
  if (!root || !arm || !brief) {
    console.error("Usage: node scripts/grade/run-arm.mjs <root> <arm> <brief> [--runs 3] [--parallel 3]");
    process.exit(2);
  }
  const base = resolve(root);
  if (arm !== "none" && !existsSync(join(base, "skills", arm, "SKILL.md"))) {
    console.error(`No skill at ${join(base, "skills", arm, "SKILL.md")}`);
    process.exit(2);
  }
  const runs = option("--runs", 3);
  const parallel = option("--parallel", 3);
  const queue = Array.from({ length: runs }, (_, i) => i + 1);
  const baseline = await starterGrade(base);
  const workers = Array.from({ length: Math.min(parallel, runs) }, async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
      console.log(line(await one(base, arm, brief, n, baseline)));
    }
  });
  await Promise.all(workers);
}
