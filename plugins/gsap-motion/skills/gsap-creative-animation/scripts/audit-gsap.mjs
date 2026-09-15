#!/usr/bin/env node

/**
 * Audits GSAP animation code for the failures that are silent.
 *
 * Nothing here is a matter of taste. Every rule catches something that
 * produces no error and often no visible symptom until much later, on a slower
 * device, or after a navigation: a tween that outlives its component, a tween
 * allocated per pointer event, a layout property animated every frame, an ease
 * on a loop that makes its own seam visible, a hardcoded id that makes two
 * instances drive one another's geometry.
 *
 * Rhythm, easing choice and whether an animation earns its place are not
 * checkable and are not attempted — reference/motion-design.md owns those.
 *
 * It reads each file's syntax tree — with a vendored parser, so nothing is
 * installed — and follows what can be followed inside one file: aliases, a
 * helper called only from a context, a timeline kept under a name. It does not
 * follow calls into other files. A file it cannot parse is reported as
 * `not-parsed`, never passed as clean. A wrong finding is a bug in this script;
 * report it rather than working around it.
 *
 * What happens to each file — the rules, waivers, `not-parsed` — is in
 * lib/audit.mjs, which the ESLint plugin runs too. This file finds the files,
 * collects what they register between them, and prints.
 *
 * Usage — paths resolve from the current directory, so run it from the project
 * root, wherever the skill itself is installed:
 *   node <skill-dir>/scripts/audit-gsap.mjs [path...]     # default: src
 *   node <skill-dir>/scripts/audit-gsap.mjs src/components --json
 *   node <skill-dir>/scripts/audit-gsap.mjs src --quiet   # errors only
 *
 * Exit code is 1 when any error-level finding is reported, 0 otherwise.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { check, mentionsGsap, notParsed } from "./lib/audit.mjs";
import { pluginRegistrations, RULES } from "./lib/rules.mjs";
import { collect, load } from "./lib/source.mjs";

/**
 * The project being audited is wherever this is run from, not wherever the
 * skill is installed. It used to be derived from this file's own location,
 * which only worked while the skill sat exactly four levels inside the project:
 * installed per user under `~/.claude/skills/`, it resolved `src` against the
 * home directory and every run exited with "No such path".
 */
const ROOT = process.cwd();

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const quiet = argv.includes("--quiet");
const targets = argv.filter((a) => !a.startsWith("--"));

const paths = (targets.length ? targets : ["src"]).map((p) => resolve(ROOT, p));

for (const path of paths) {
  if (!existsSync(path)) {
    console.error(`No such path: ${path}`);
    process.exit(2);
  }
}

// --- Run ---------------------------------------------------------------------

const findings = [];
const sources = [];

/** A finding as the report shows it: under the file's display path, no column. */
const reported = (source, finding) => ({
  rule: finding.rule,
  level: finding.level,
  file: source.display,
  line: finding.line,
  message: finding.message,
  hint: finding.hint,
});

for (const path of paths) {
  for (const file of collect(path)) {
    const source = load(file, ROOT);
    if (!mentionsGsap(source)) continue;

    if (source.parseError) {
      const finding = notParsed(source);
      if (finding) findings.push(reported(source, finding));
      continue;
    }

    sources.push(source);
  }
}

/**
 * Plugin registration is global: `gsap.registerPlugin(ScrollTrigger)` in one
 * module registers it for every other. What the audited files register between
 * them is collected before any rule runs, so a section that imports a plugin
 * the app's entry registers is not reported as unregistered.
 */
const registered = new Set(sources.flatMap((source) => [...pluginRegistrations(source)]));

for (const source of sources) {
  source.registeredElsewhere = registered;

  for (const rule of RULES) {
    for (const finding of check(rule, source)) {
      findings.push(reported(source, finding));
    }
  }
}

// --- Report ------------------------------------------------------------------

const ORDER = { error: 0, warn: 1, info: 2 };
const ICON = { error: "✗", warn: "!", info: "i" };

findings.sort(
  (a, b) =>
    ORDER[a.level] - ORDER[b.level] ||
    a.file.localeCompare(b.file) ||
    a.line - b.line,
);

const shown = quiet ? findings.filter((f) => f.level === "error") : findings;

if (asJson) {
  console.log(JSON.stringify({ findings: shown }, null, 2));
} else if (!shown.length) {
  console.log(
    findings.length
      ? `gsap-audit: no errors (${findings.length} lower-severity finding(s) hidden by --quiet)`
      : "gsap-audit: clean",
  );
} else {
  let current = "";
  for (const f of shown) {
    if (f.file !== current) {
      current = f.file;
      console.log(`\n${current}`);
    }
    console.log(`  ${ICON[f.level]} ${f.line}:  ${f.message}  [${f.rule}]`);
    console.log(`      ${f.hint}`);
  }

  const counts = ORDER;
  const tally = Object.keys(counts)
    .map((level) => [level, findings.filter((f) => f.level === level).length])
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${n} ${level}`)
    .join(", ");

  console.log(`\n${tally}`);
}

process.exit(findings.some((f) => f.level === "error") ? 1 : 0);
