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
 * When set, every fixture is also written here, with the rule it belongs to:
 * the ESLint plugin's parity test lints each one through ESLint and compares
 * what comes back with what the audit reports on it.
 */
const DUMP = process.env.GSAP_MOTION_FIXTURES;
let dumped = 0;

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

/**
 * `registered` stands in for the rest of a project: the plugins other audited
 * files register, which the runner collects before any rule reads a file.
 */
function findings(ruleId, source, ext, registered = []) {
  const rule = RULES.find((r) => r.id === ruleId);
  assert.ok(rule, `No rule with id "${ruleId}"`);
  const dir = project({ [`fixture.${ext}`]: source });
  const file = load(join(dir, `fixture.${ext}`), dir);
  file.registeredElsewhere = new Set(registered);

  if (DUMP) {
    const name = `fixture-${String(dumped).padStart(3, "0")}`;
    dumped += 1;
    mkdirSync(DUMP, { recursive: true });
    writeFileSync(join(DUMP, `${name}.${ext}`), source);
    writeFileSync(
      join(DUMP, `${name}.json`),
      JSON.stringify({ rule: ruleId, ext, registered }),
    );
  }

  /** A fixture that does not parse would pass every quiet case silently. */
  assert.equal(
    file.parseError,
    null,
    `fixture for [${ruleId}] does not parse: ${file.parseError?.message}\n${source}`,
  );
  return rule.test(file);
}

/** Asserts `ruleId` reports at least one finding — or exactly `count`. */
export function fires(ruleId, source, { ext = "tsx", count, registered } = {}) {
  coverage.fires.add(ruleId);
  const found = findings(ruleId, source, ext, registered);
  assert.ok(found.length > 0, `expected [${ruleId}] to fire on:\n${source}`);
  if (count !== undefined) {
    assert.equal(found.length, count, `[${ruleId}] finding count`);
  }
  return found;
}

/** Asserts `ruleId` reports nothing. */
export function quiet(ruleId, source, { ext = "tsx", registered } = {}) {
  coverage.quiet.add(ruleId);
  const found = findings(ruleId, source, ext, registered);
  assert.deepEqual(
    found.map((f) => f.message),
    [],
    `expected [${ruleId}] to stay quiet on:\n${source}`,
  );
}
