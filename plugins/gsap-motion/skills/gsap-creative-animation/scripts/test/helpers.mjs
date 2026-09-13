/**
 * Fixture plumbing for the audit tests.
 *
 * Fixtures are written to a temporary directory at test time rather than kept
 * as files in the skill. A deliberately broken `.tsx` checked into a project is
 * picked up by that project's own linter and type checker, and copied by
 * anything that syncs the skill somewhere else.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after } from "node:test";

import { RULES } from "../lib/rules.mjs";
import { load } from "../lib/source.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "gsap-audit-test-"));
after(() => rmSync(ROOT, { recursive: true, force: true }));

let counter = 0;

/**
 * Writes `files` — `{ "relative/path.tsx": source }` — into a fresh project
 * directory and returns that directory.
 */
export function project(files) {
  const dir = join(ROOT, `project-${counter}`);
  counter += 1;
  for (const [relative, source] of Object.entries(files)) {
    const full = join(dir, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, source);
  }
  return dir;
}

/** Which rules have been shown to fire, and which to stay quiet. */
export const coverage = { fires: new Set(), quiet: new Set() };

function findings(ruleId, source, ext) {
  const rule = RULES.find((r) => r.id === ruleId);
  assert.ok(rule, `No rule with id "${ruleId}"`);
  const dir = project({ [`fixture.${ext}`]: source });
  return rule.test(load(join(dir, `fixture.${ext}`), dir));
}

/** Asserts `ruleId` reports at least one finding — or exactly `count`. */
export function fires(ruleId, source, { ext = "tsx", count } = {}) {
  coverage.fires.add(ruleId);
  const found = findings(ruleId, source, ext);
  assert.ok(found.length > 0, `expected [${ruleId}] to fire on:\n${source}`);
  if (count !== undefined) {
    assert.equal(found.length, count, `[${ruleId}] finding count`);
  }
  return found;
}

/** Asserts `ruleId` reports nothing. */
export function quiet(ruleId, source, { ext = "tsx" } = {}) {
  coverage.quiet.add(ruleId);
  const found = findings(ruleId, source, ext);
  assert.deepEqual(
    found.map((f) => f.message),
    [],
    `expected [${ruleId}] to stay quiet on:\n${source}`,
  );
}
