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

import { RULES } from "./lib/rules.mjs";
import { collect, lineAt, load } from "./lib/source.mjs";

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

// --- Escape hatch ------------------------------------------------------------

/**
 * The same shape many repos already use for their own lint waivers, on
 * purpose: one way to say "yes, and here is why", not two.
 *
 * A hatch is the rule's own id plus `-ok`, on the flagged line or in the eight
 * above it, and it waives that rule and nothing else — silencing a shared id
 * cannot also silence a layout property on the same line. The lookback is eight
 * because a reason usually stands above a whole declaration rather than beside
 * one line of it.
 *
 * Every hatch must carry its reason. A bare token with no sentence after it is
 * a rule someone turned off rather than answered, and once this gates a build
 * that distinction has to stay visible in review.
 */
const LOOKBACK = 8;

function waived(source, line, ruleId) {
  const lines = source.split("\n");
  const from = Math.max(0, line - 1 - LOOKBACK);
  return lines.slice(from, line).join("\n").includes(`${ruleId}-ok`);
}

// --- Run ---------------------------------------------------------------------

const findings = [];

for (const path of paths) {
  for (const file of collect(path)) {
    const source = load(file, ROOT);

    /**
     * A file that never mentions GSAP has nothing these rules can say. Checked
     * once here rather than in every rule.
     */
    if (!source.usesGsap && !/\bgsap\./.test(source.code)) continue;

    /**
     * What was not checked is reported as not checked. A file that uses GSAP
     * and does not parse gets no rule's verdict — a silent skip would read as
     * clean.
     */
    if (source.parseError) {
      const { line, message } = source.parseError;
      if (!waived(source.raw, line, "not-parsed")) {
        findings.push({
          rule: "not-parsed",
          level: "info",
          file: source.display,
          line,
          message: `Not checked: the file could not be parsed (${message}).`,
          hint: "No rule ran on this file. If it is valid JavaScript or TypeScript, the audit's parser is wrong — report it with this line.",
        });
      }
      continue;
    }

    for (const rule of RULES) {
      for (const hit of rule.test(source)) {
        const line = lineAt(source.raw, hit.index);
        if (waived(source.raw, line, rule.id)) continue;

        findings.push({
          rule: rule.id,
          level: rule.level,
          file: source.display,
          line,
          message: hit.message,
          hint: hit.hint,
        });
      }
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
