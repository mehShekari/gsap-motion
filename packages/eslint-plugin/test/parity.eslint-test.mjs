/**
 * The same findings through ESLint as through the audit.
 *
 * First every fixture the audit's own tests use: each is written out, linted
 * through ESLint with the plugin, and compared with what the audit reports on
 * it — every rule, line, column and message. Then real code: the example app
 * and the templates, as `audit-gsap --json` reports them.
 *
 * GSAP_MOTION_PARITY adds directories to the second part, separated by the
 * platform's path delimiter, for a parity run over a real project:
 *
 *   GSAP_MOTION_PARITY=../../../roboshan/src npm test
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import tsParser from "@typescript-eslint/parser";
import { ESLint } from "eslint";

import { check, mentionsGsap, notParsed } from "../../../plugins/gsap-motion/skills/gsap-creative-animation/scripts/lib/audit.mjs";
import { pluginRegistrations, RULES } from "../../../plugins/gsap-motion/skills/gsap-creative-animation/scripts/lib/rules.mjs";
import { collect, fromText, load } from "../../../plugins/gsap-motion/skills/gsap-creative-animation/scripts/lib/source.mjs";
import plugin from "../index.mjs";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const SKILL = join(REPO, "plugins", "gsap-motion", "skills", "gsap-creative-animation");
const AUDIT = join(SKILL, "scripts", "audit-gsap.mjs");
const PREFIX = "gsap-motion/";

const severity = (level) => (level === "info" ? "warn" : level);
const SEVERITY = { 1: "warn", 2: "error" };

/** The project's own ESLint setup, in miniature: a parser per language, then the plugin. */
function eslintIn(cwd, extra = []) {
  return new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{js,jsx,mjs}"],
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      },
      { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tsParser } },
      { files: ["**/*.{js,jsx,mjs,ts,tsx}"], ...plugin.configs.recommended },
      /** Inline ESLint comments in real projects name rules this run does not load. */
      { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" } },
      ...extra,
    ],
  });
}

/**
 * What ESLint reported for one file, in the form the audit's findings are
 * compared in. A fatal message is ESLint's own parser failing, which is ESLint
 * saying "not checked".
 */
function eslintFindings(result, { column }) {
  return result.messages.flatMap((message) => {
    if (message.fatal) return ["not-parsed"];
    if (!message.ruleId?.startsWith(PREFIX)) return [];
    const place = column ? `${message.line}:${message.column}` : `${message.line}`;
    return [
      `${place} ${SEVERITY[message.severity]} ${message.ruleId.slice(PREFIX.length)} ${message.message}`,
    ];
  });
}

// --- Every audit fixture -----------------------------------------------------

const fixtures = mkdtempSync(join(tmpdir(), "gsap-motion-parity-"));
after(() => rmSync(fixtures, { recursive: true, force: true }));

test("every fixture of the audit's tests reports the same through ESLint", async () => {
  /** A child of `node --test` inherits a context that would make the nested run report to it. */
  const env = { ...process.env, GSAP_MOTION_FIXTURES: fixtures };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(
    process.execPath,
    ["--test", join(SKILL, "scripts", "test", "rules.test.mjs")],
    { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(run.status, 0, `the audit's rule tests failed:\n${run.stdout}${run.stderr}`);

  const cases = readdirSync(fixtures)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name: name.slice(0, -".json".length),
      ...JSON.parse(readFileSync(join(fixtures, name), "utf8")),
    }));
  /** The audit's tests show every rule firing and staying quiet: two fixtures each, at least. */
  for (const rule of RULES) {
    assert.ok(
      cases.filter((fixture) => fixture.rule === rule.id).length >= 2,
      `fewer than two fixtures were written for ${rule.id}`,
    );
  }

  const expected = new Map();
  for (const fixture of cases) {
    const path = join(fixtures, `${fixture.name}.${fixture.ext}`);
    const source = fromText(readFileSync(path, "utf8"), path);
    let findings = [];
    if (mentionsGsap(source)) {
      if (source.parseError) {
        findings = notParsed(source) ? ["not-parsed"] : [];
      } else {
        source.registeredElsewhere = new Set(fixture.registered);
        findings = RULES.flatMap((rule) => check(rule, source)).map(
          (f) => `${f.line}:${f.column + 1} ${severity(f.level)} ${f.rule} ${f.message} ${f.hint}`,
        );
      }
    }
    expected.set(path, findings.sort());
  }

  /** A fixture that stands in for a project's other files names what they register. */
  const registrations = cases
    .filter((fixture) => fixture.registered.length)
    .map((fixture) => ({
      files: [`${fixture.name}.${fixture.ext}`],
      rules: {
        [`${PREFIX}unregistered-plugin`]: ["error", { registered: fixture.registered }],
      },
    }));

  const results = await eslintIn(fixtures, registrations).lintFiles([...expected.keys()]);
  assert.equal(results.length, cases.length);

  const differences = [];
  for (const result of results) {
    const actual = eslintFindings(result, { column: true }).sort();
    const wanted = expected.get(result.filePath);
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      differences.push({
        fixture: relative(fixtures, result.filePath),
        source: readFileSync(result.filePath, "utf8"),
        audit: wanted,
        eslint: actual,
      });
    }
  }
  assert.deepEqual(differences, [], `${differences.length} of ${cases.length} fixtures differ`);
});

// --- Real code ---------------------------------------------------------------

const targets = [
  join(REPO, "examples", "next-app", "app"),
  join(SKILL, "template"),
  ...(process.env.GSAP_MOTION_PARITY ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((path) => resolve(path)),
];

for (const target of targets) {
  test(`the audit and ESLint agree on ${relative(REPO, target).replace(/\\/g, "/")}`, async () => {
    const cli = spawnSync(process.execPath, [AUDIT, ".", "--json"], {
      cwd: target,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    assert.ok(cli.status === 0 || cli.status === 1, cli.stderr);

    const expected = JSON.parse(cli.stdout)
      .findings.map((f) =>
        f.rule === "not-parsed"
          ? `${f.file} not-parsed`
          : `${f.file} ${f.line} ${severity(f.level)} ${f.rule} ${f.message} ${f.hint}`,
      )
      .sort();

    /**
     * The command line collects what the audited files register between them.
     * ESLint sees one file at a time, so the project names the same plugins in
     * the rule's options.
     */
    const files = collect(target);
    const registered = [
      ...new Set(
        files
          .map((path) => load(path, target))
          .filter((source) => mentionsGsap(source) && !source.parseError)
          .flatMap((source) => [...pluginRegistrations(source)]),
      ),
    ];

    const results = await eslintIn(target, [
      { rules: { [`${PREFIX}unregistered-plugin`]: ["error", { registered }] } },
    ]).lintFiles(files);

    const actual = results
      .flatMap((result) => {
        const file = relative(target, result.filePath).replace(/\\/g, "/");
        return eslintFindings(result, { column: false }).map((finding) =>
          finding === "not-parsed" ? `${file} not-parsed` : `${file} ${finding}`,
        );
      })
      .sort();

    assert.deepEqual(actual, expected);
  });
}
