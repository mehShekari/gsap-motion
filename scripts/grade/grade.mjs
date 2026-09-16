#!/usr/bin/env node
/**
 * grade — the phase-8 grader: a browser and the audit, together.
 *
 *   node scripts/grade/grade.mjs <url> <source dir> [--json]
 *
 * It answers one question about an implementation of an animation: is it
 * fragile? It does not say whether the animation is good. That is a separate
 * judgement, and a grader that blurred the two would be easy to game.
 *
 * Two instruments, because the bugs this was built on split between them. A
 * head-to-head test found three real bugs, and no single instrument caught all
 * three:
 *
 *   the whole page shipped with no animation   browser: never-animates
 *                                              audit:   matchmedia-never-runs
 *   the main visual below the fold on mobile   browser: below-fold-mobile
 *   a label hidden through its whole state     audit:   stacked-from
 *
 * The third is invisible to a browser: the buggy label hid for 1308ms while
 * clean reveals in the same page hid text for 1178-1574ms, so no threshold
 * separates them. The first is caught by both, independently.
 *
 * Validated on five variants of that project — both clean implementations and
 * each bug restored — with no false finding and every bug caught. That is
 * in-sample: the thresholds were set there. Read every failure it reports on
 * code it has not seen, which is to say every failure, until it has seen more.
 *
 * Node.js 22+, no dependencies, whatever Chrome the machine has.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fragility } from "./fragility.mjs";

const AUDIT = fileURLToPath(
  new URL("../../plugins/gsap-motion/skills/gsap-creative-animation/scripts/audit-gsap.mjs", import.meta.url),
);

/** Warnings and errors from the audit; info is advice, not fragility. */
export function audit(dir) {
  let out;
  try {
    out = execFileSync(process.execPath, [AUDIT, dir, "--json"], { encoding: "utf8" });
  } catch (error) {
    /** The audit exits 1 when it has findings, which is not a failure to run. */
    out = error.stdout;
  }
  return JSON.parse(out)
    .findings.filter((finding) => finding.level !== "info")
    .map((finding) => ({ rule: finding.rule, level: finding.level, file: finding.file, line: finding.line }));
}

export async function grade(url, dir) {
  const browser = await fragility(url);
  const statics = audit(dir);
  return {
    url,
    dir,
    fragile: browser.some((check) => check.failed) || statics.length > 0,
    browser,
    audit: statics,
  };
}

async function main(argv) {
  const json = argv.includes("--json");
  const [url, dir] = argv.filter((arg) => arg !== "--json");
  if (!url || !dir) {
    console.error("Usage: node scripts/grade/grade.mjs <url> <source dir> [--json]");
    process.exit(2);
  }

  const result = await grade(url, resolve(dir));
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.fragile ? "FRAGILE" : "not fragile"}  ${url}`);
    for (const check of result.browser) {
      console.log(`  ${check.failed ? "FAIL" : "pass"}  ${check.id.padEnd(22)} ${check.evidence}`);
    }
    if (result.audit.length) {
      for (const finding of result.audit) {
        console.log(`  FAIL  ${finding.rule.padEnd(22)} ${finding.file}:${finding.line} (${finding.level})`);
      }
    } else {
      console.log("  pass  audit                  no warnings or errors");
    }
  }
  process.exit(result.fragile ? 1 : 0);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main(process.argv.slice(2));
