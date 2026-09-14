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
import { lineAt, load } from "../lib/source.mjs";

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

/**
 * While the audit moves from text matching onto a syntax tree, a rule can have
 * both `test` and `testAst`. Every fixture then runs both. The tree's findings
 * are the ones asserted; the text engine's must match them line for line and
 * message for message, unless the fixture is tagged `oldEngineWrong` — a case
 * the text engine is known to get wrong, which only the tree has to pass.
 */
function run(ruleId, source, ext) {
  const rule = RULES.find((r) => r.id === ruleId);
  assert.ok(rule, `No rule with id "${ruleId}"`);
  const dir = project({ [`fixture.${ext}`]: source });
  const file = load(join(dir, `fixture.${ext}`), dir);
  const old = rule.test(file);
  if (!rule.testAst) return { file, found: old, old, tree: null };

  /** A fixture that does not parse would pass every quiet case silently. */
  assert.equal(
    file.parseError,
    null,
    `fixture for [${ruleId}] does not parse: ${file.parseError?.message}\n${source}`,
  );
  const tree = rule.testAst(file);
  return { file, found: tree, old, tree };
}

const shape = (file, findings) =>
  findings.map((f) => `${lineAt(file.raw, f.index)}: ${f.message}`).sort();

function compare(ruleId, source, result, oldEngineWrong) {
  if (!result.tree) {
    assert.ok(!oldEngineWrong, `[${ruleId}] has no tree engine to be right instead`);
    return;
  }
  const tree = shape(result.file, result.tree);
  const old = shape(result.file, result.old);
  if (oldEngineWrong) {
    assert.notDeepEqual(
      old,
      tree,
      `[${ruleId}] is tagged oldEngineWrong, but both engines agree — remove the tag:\n${source}`,
    );
  } else {
    assert.deepEqual(
      tree,
      old,
      `[${ruleId}] the tree and text engines disagree on:\n${source}`,
    );
  }
}

/** Asserts `ruleId` reports at least one finding — or exactly `count`. */
export function fires(
  ruleId,
  source,
  { ext = "tsx", count, oldEngineWrong = false } = {},
) {
  coverage.fires.add(ruleId);
  const result = run(ruleId, source, ext);
  assert.ok(
    result.found.length > 0,
    `expected [${ruleId}] to fire on:\n${source}`,
  );
  if (count !== undefined) {
    assert.equal(result.found.length, count, `[${ruleId}] finding count`);
  }
  compare(ruleId, source, result, oldEngineWrong);
  return result.found;
}

/** Asserts `ruleId` reports nothing. */
export function quiet(ruleId, source, { ext = "tsx", oldEngineWrong = false } = {}) {
  coverage.quiet.add(ruleId);
  const result = run(ruleId, source, ext);
  assert.deepEqual(
    result.found.map((f) => f.message),
    [],
    `expected [${ruleId}] to stay quiet on:\n${source}`,
  );
  compare(ruleId, source, result, oldEngineWrong);
}
