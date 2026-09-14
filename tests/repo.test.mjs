/**
 * The repository around the skill: the marketplace and plugin manifests, the
 * version that has to agree in three places, and the eval suite's shape.
 *
 * `claude plugin validate` checks manifest syntax in CI. These check what it
 * cannot — that the pieces agree with each other.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { RULES } from "../plugins/gsap-motion/skills/gsap-creative-animation/scripts/lib/rules.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) =>
  readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const json = (path) => JSON.parse(read(path));

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

const PLUGIN_DIR = "plugins/gsap-motion";
const SKILL_MD = `${PLUGIN_DIR}/skills/gsap-creative-animation/SKILL.md`;
const EVALS = `${PLUGIN_DIR}/evals`;

const marketplace = json(".claude-plugin/marketplace.json");
const plugin = json(`${PLUGIN_DIR}/.claude-plugin/plugin.json`);

describe("marketplace", () => {
  test("has a kebab-case name, a description, an owner and at least one plugin", () => {
    assert.match(marketplace.name, KEBAB);
    // `claude plugin validate --strict` fails a marketplace with no description.
    assert.ok(marketplace.description, "description");
    assert.ok(marketplace.owner?.name, "owner.name");
    assert.ok(marketplace.plugins.length > 0);
  });

  test("every plugin source exists and carries the same name", () => {
    for (const entry of marketplace.plugins) {
      assert.match(entry.name, KEBAB);
      assert.match(entry.source, /^\.\//, "a local source starts with ./");
      const manifest = join(entry.source, ".claude-plugin", "plugin.json");
      assert.ok(existsSync(join(ROOT, manifest)), `${manifest} exists`);
      assert.equal(json(manifest).name, entry.name);
    }
  });
});

describe("plugin", () => {
  test("has a kebab-case name and a semver version", () => {
    assert.match(plugin.name, KEBAB);
    assert.match(plugin.version, SEMVER);
  });

  test("keeps only plugin.json inside .claude-plugin", () => {
    assert.deepEqual(readdirSync(join(ROOT, PLUGIN_DIR, ".claude-plugin")), [
      "plugin.json",
    ]);
  });

  test("version agrees with the skill's metadata.version", () => {
    const skill = read(SKILL_MD).match(
      /\nmetadata:\n(?:[ \t]+[\w-]+:.*\n)*?[ \t]+version:\s*"?(\d+\.\d+\.\d+)"?/,
    )?.[1];
    assert.equal(skill, plugin.version);
  });

  test("version is the latest release in CHANGELOG.md", () => {
    const released = read("CHANGELOG.md").match(
      /^## \[(\d+\.\d+\.\d+)\]/m,
    )?.[1];
    assert.equal(released, plugin.version);
  });

  test("README's install command names this plugin and marketplace", () => {
    assert.ok(
      read("README.md").includes(
        `/plugin install ${plugin.name}@${marketplace.name}`,
      ),
    );
  });
});

describe("npm package", () => {
  const pkg = json("packages/cli/package.json");

  test("is @mehshekari/gsap-motion, at the plugin's version", () => {
    // The unscoped name was refused by npm as too close to `gsapmotion`.
    assert.equal(pkg.name, "@mehshekari/gsap-motion");
    assert.equal(pkg.version, plugin.version);
    assert.equal(pkg.publishConfig?.access, "public", "a scoped package is private by default");
  });

  test("installs one command, named for the plugin", () => {
    assert.deepEqual(Object.keys(pkg.bin), [plugin.name]);
  });

  test("the docs run it by its package name", () => {
    // `npx gsap-motion` would fetch whatever owns that name, not this package.
    for (const doc of ["README.md", "packages/cli/README.md", "CONTRIBUTING.md"]) {
      assert.doesNotMatch(read(doc), /npx gsap-motion\b/, doc);
    }
  });

  test("points at this repository", () => {
    assert.equal(pkg.repository.url, `git+${plugin.repository}.git`);
    assert.equal(pkg.repository.directory, "packages/cli");
  });

  test("has a bin that exists", () => {
    for (const file of Object.values(pkg.bin)) {
      assert.ok(existsSync(join(ROOT, "packages/cli", file)), file);
    }
  });

  test("has no dependencies and no install scripts, because npx runs it", () => {
    for (const key of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      assert.equal(pkg[key], undefined, key);
    }
    for (const script of ["preinstall", "install", "postinstall"]) {
      assert.equal(pkg.scripts?.[script], undefined, script);
    }
  });
});

describe("evals", () => {
  const PREFIXES = ["trigger-", "ignore-", "outcome-"];
  const GRADER_TYPES = [
    "regex",
    "tool_used",
    "tool_order",
    "file_exists",
    "llm",
    "baseline",
  ];

  const cases = readdirSync(join(ROOT, EVALS), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !["results", "mocks"].includes(entry.name))
    .map((entry) => entry.name);

  test("every case is named for what it measures", () => {
    assert.deepEqual(
      cases.filter((name) => !PREFIXES.some((p) => name.startsWith(p))),
      [],
    );
  });

  test("there are cases of every kind", () => {
    for (const prefix of PREFIXES) {
      assert.ok(
        cases.some((name) => name.startsWith(prefix)),
        `a ${prefix}* case`,
      );
    }
  });

  test("every case has a prompt and at least one grader of a known type", () => {
    for (const name of cases) {
      const dir = join(EVALS, name);
      assert.ok(existsSync(join(ROOT, dir, "prompt.md")), `${name}/prompt.md`);
      const graders = readdirSync(join(ROOT, dir, "graders")).filter((file) =>
        file.endsWith(".md"),
      );
      assert.ok(graders.length > 0, `${name} has a grader`);
      for (const grader of graders) {
        const type = read(join(dir, "graders", grader)).match(
          /^type:\s*(\S+)/m,
        )?.[1];
        assert.ok(GRADER_TYPES.includes(type), `${name}/${grader}: ${type}`);
      }
    }
  });
});

test("the README states the audit's real rule count", () => {
  const stated = read("README.md").match(/\*\*`audit-gsap`\*\*: (\d+) rules/)?.[1];
  assert.equal(Number(stated), RULES.length);
});

/**
 * The vendored parser's header names the versions it was built from. CI's
 * `vendor` job proves the bytes match; this proves, with no install, that a
 * change to a pin did not go without a regeneration.
 */
test("the vendored parser was generated from the pinned versions", () => {
  const header = read(
    `${PLUGIN_DIR}/skills/gsap-creative-animation/scripts/lib/vendor/parser.mjs`,
  )
    .split("\n")
    .slice(0, 4)
    .join("\n");
  const { devDependencies } = json("package.json");
  for (const name of ["acorn", "@sveltejs/acorn-typescript"]) {
    assert.ok(
      header.includes(`${name} ${devDependencies[name]} (`),
      `${name} ${devDependencies[name]} in the vendored parser's header`,
    );
  }
});
