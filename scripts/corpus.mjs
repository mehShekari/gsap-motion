#!/usr/bin/env node

/**
 * The audit's precision corpus: real GSAP projects, each pinned to a commit,
 * and a hand-written label for every finding the audit reports on them.
 *
 * A rule's precision is the share of its findings that are true. It is measured
 * here rather than asserted: every finding is read in its source and labelled
 * true or false with a one-line reason, and a finding nobody has labelled fails
 * the report. Recall is not measured — a miss nobody found cannot be counted.
 *
 *   node scripts/corpus.mjs fetch               clone every project at its commit
 *   node scripts/corpus.mjs run                 audit them into corpus/.cache/findings.json
 *   node scripts/corpus.mjs unlabelled          each unlabelled finding, with its source
 *   node scripts/corpus.mjs report              precision per rule; exit 1 if any is unlabelled
 *   node scripts/corpus.mjs report --markdown   the same, as a table for the README
 *
 * `fetch` needs git and the network; nothing is installed. Projects live in the
 * git-ignored corpus/.cache/. Only labels are committed — never the projects'
 * code.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(ROOT, "corpus");
const CACHE = join(CORPUS, ".cache");
const FINDINGS = join(CACHE, "findings.json");
const AUDIT = join(
  ROOT,
  "plugins/gsap-motion/skills/gsap-creative-animation/scripts/audit-gsap.mjs",
);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/**
 * A finding's identity across runs: project, file, rule and line, plus a hash
 * of the line's text. The commit is pinned, so the line cannot move; the hash
 * catches a label that was written against different code.
 */
export function findingKey(project, finding, lineText) {
  const hash = createHash("sha1").update(lineText.trim()).digest("hex").slice(0, 10);
  return `${project}|${finding.file}|${finding.rule}|${finding.line}|${hash}`;
}

/**
 * Precision per rule from findings and labels: `{ rules, unlabelled, stale }`.
 * `rules[id]` holds `level`, `findings`, `true`, `false` and `precision`, which
 * is `null` until at least one finding of that rule is labelled. A label whose
 * key no finding has is stale: the code or the rule changed under it.
 */
export function precision(findings, labels) {
  const rules = {};
  const unlabelled = [];
  const keys = new Set();

  for (const finding of findings) {
    keys.add(finding.key);
    const row = (rules[finding.rule] ??= {
      level: finding.level,
      findings: 0,
      true: 0,
      false: 0,
      precision: null,
    });
    row.findings += 1;
    const label = labels[finding.key];
    if (label?.verdict === "true") row.true += 1;
    else if (label?.verdict === "false") row.false += 1;
    else unlabelled.push(finding);
  }

  for (const row of Object.values(rules)) {
    const judged = row.true + row.false;
    row.precision = judged ? row.true / judged : null;
  }

  const stale = Object.keys(labels).filter((key) => !keys.has(key));
  return { rules, unlabelled, stale };
}

/**
 * `core.longpaths` because some projects' files exceed Windows' 260-character
 * path limit once they sit under the cache, and git then fails the checkout. It
 * changes nothing elsewhere.
 */
const git = (args, cwd) =>
  execFileSync("git", ["-c", "core.longpaths=true", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

function projects() {
  return readJson(join(CORPUS, "manifest.json")).projects;
}

function fetchAll() {
  mkdirSync(CACHE, { recursive: true });
  for (const project of projects()) {
    const dir = join(CACHE, project.name);
    if (existsSync(join(dir, ".git"))) {
      try {
        if (git(["rev-parse", "HEAD"], dir) === project.commit) {
          console.log(`${project.name}: already at ${project.commit.slice(0, 12)}`);
          continue;
        }
      } catch {}
    }
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    git(["init", "--quiet"], dir);
    git(["remote", "add", "origin", `https://github.com/${project.repo}.git`], dir);
    git(["fetch", "--quiet", "--depth", "1", "origin", project.commit], dir);
    git(["checkout", "--quiet", "FETCH_HEAD"], dir);
    console.log(`${project.name}: fetched ${project.commit.slice(0, 12)}`);
  }
}

function runAll() {
  const all = [];
  for (const project of projects()) {
    const dir = join(CACHE, project.name);
    if (!existsSync(dir)) throw new Error(`${project.name} is not fetched; run \`fetch\` first.`);

    const result = spawnSync(process.execPath, [AUDIT, ...project.paths, "--json"], {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status === 2) throw new Error(`${project.name}: ${result.stderr.trim()}`);
    const { findings } = JSON.parse(result.stdout);

    for (const finding of findings) {
      const lines = readFileSync(join(dir, finding.file), "utf8").split(/\r?\n/);
      all.push({
        project: project.name,
        ...finding,
        key: findingKey(project.name, finding, lines[finding.line - 1] ?? ""),
      });
    }
    console.log(`${project.name}: ${findings.length} finding(s)`);
  }
  writeFileSync(FINDINGS, `${JSON.stringify(all, null, 2)}\n`);
  console.log(`${all.length} finding(s) written to ${FINDINGS}`);
}

function load() {
  if (!existsSync(FINDINGS)) throw new Error("No findings yet; run `run` first.");
  const labelsPath = join(CORPUS, "labels.json");
  return {
    findings: readJson(FINDINGS),
    labels: existsSync(labelsPath) ? readJson(labelsPath) : {},
  };
}

function showUnlabelled() {
  const { findings, labels } = load();
  const { unlabelled } = precision(findings, labels);
  for (const finding of unlabelled) {
    const lines = readFileSync(join(CACHE, finding.project, finding.file), "utf8").split(/\r?\n/);
    const from = Math.max(0, finding.line - 4);
    const context = lines
      .slice(from, finding.line + 3)
      .map((text, i) => `${from + i + 1 === finding.line ? ">" : " "} ${String(from + i + 1).padStart(5)}  ${text}`)
      .join("\n");
    console.log(`\n${finding.key}\n[${finding.level}] ${finding.message}\n${context}`);
  }
  console.log(`\n${unlabelled.length} unlabelled finding(s).`);
}

function report(markdown) {
  const { findings, labels } = load();
  const { rules, unlabelled, stale } = precision(findings, labels);
  const rows = Object.entries(rules).sort(([a], [b]) => a.localeCompare(b));
  const percent = (value) => (value === null ? "—" : `${Math.round(value * 100)}%`);

  if (markdown) {
    console.log("| Rule | Level | Findings | True | False | Precision |");
    console.log("|---|---|---|---|---|---|");
    for (const [id, row] of rows) {
      console.log(`| \`${id}\` | ${row.level} | ${row.findings} | ${row.true} | ${row.false} | ${percent(row.precision)} |`);
    }
  } else {
    for (const [id, row] of rows) {
      console.log(
        `${id.padEnd(24)} ${row.level.padEnd(6)} findings ${String(row.findings).padStart(4)}  true ${String(row.true).padStart(4)}  false ${String(row.false).padStart(4)}  precision ${percent(row.precision)}`,
      );
    }
  }

  for (const key of stale) console.error(`stale label: ${key}`);
  if (unlabelled.length) {
    console.error(`${unlabelled.length} unlabelled finding(s); run \`unlabelled\` to see them.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command] = process.argv.slice(2);
  try {
    if (command === "fetch") fetchAll();
    else if (command === "run") runAll();
    else if (command === "unlabelled") showUnlabelled();
    else if (command === "report") report(process.argv.includes("--markdown"));
    else {
      console.error("Usage: node scripts/corpus.mjs fetch | run | unlabelled | report [--markdown]");
      process.exit(2);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
