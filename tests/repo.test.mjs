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
  test("has a kebab-case name, an owner and at least one plugin", () => {
    assert.match(marketplace.name, KEBAB);
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
