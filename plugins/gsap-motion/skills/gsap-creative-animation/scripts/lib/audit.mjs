/**
 * One file through the audit, shared by the command line and the ESLint plugin.
 *
 * The runner decides which files to read and how to print them; ESLint decides
 * both for the plugin. What happens to a file in between — whether the rules
 * look at it at all, what a file that does not parse reports, where a finding
 * lands and whether a waiver answers it — is decided here, once, so the two
 * entry points cannot disagree.
 */
import { lineAt } from "./source.mjs";

/**
 * A file that never mentions GSAP has nothing these rules can say. Checked once
 * per file rather than in every rule, and before anything is parsed.
 */
export function mentionsGsap(source) {
  return source.usesGsap || /\bgsap\./.test(source.code);
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

export function waived(raw, line, ruleId) {
  const lines = raw.split("\n");
  const from = Math.max(0, line - 1 - LOOKBACK);
  return lines.slice(from, line).join("\n").includes(`${ruleId}-ok`);
}

// --- Findings ----------------------------------------------------------------

/** 0-indexed column of a character offset, as ESLint counts columns. */
function columnAt(raw, index) {
  return Math.max(0, index - (raw.lastIndexOf("\n", index - 1) + 1));
}

export const NOT_PARSED = "not-parsed";

/**
 * What was not checked is reported as not checked. A file that uses GSAP and
 * does not parse gets no rule's verdict — a silent skip would read as clean.
 *
 * Returns null for a file that parsed, and for one whose waiver answers it.
 */
export function notParsed(source) {
  const error = source.parseError;
  if (!error || waived(source.raw, error.line, NOT_PARSED)) return null;
  return {
    rule: NOT_PARSED,
    level: "info",
    line: error.line,
    column: error.column,
    message: `Not checked: the file could not be parsed (${error.message}).`,
    hint: "No rule ran on this file. If it is valid JavaScript or TypeScript, the audit's parser is wrong — report it with this line.",
  };
}

/**
 * What one rule reports on one parsed file: each finding placed on its line and
 * column, and dropped when a waiver answers it.
 */
export function check(rule, source) {
  const findings = [];
  for (const hit of rule.test(source)) {
    const line = lineAt(source.raw, hit.index);
    if (waived(source.raw, line, rule.id)) continue;
    findings.push({
      rule: rule.id,
      level: rule.level,
      line,
      column: columnAt(source.raw, hit.index),
      message: hit.message,
      hint: hit.hint,
    });
  }
  return findings;
}
