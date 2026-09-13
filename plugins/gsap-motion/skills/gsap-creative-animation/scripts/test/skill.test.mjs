/**
 * The skill as a package: its frontmatter against the Agent Skills
 * specification, what it costs to load, whether its links resolve, and whether
 * anything from the project it was developed in has leaked back into it.
 *
 * Each of these fails silently in use. A bad key is ignored by one client and
 * rejected by another; a budget creeps a paragraph at a time; a dead link is an
 * agent reading nothing and carrying on.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const read = (file) =>
  readFileSync(join(SKILL, file), "utf8").replace(/\r\n/g, "\n");

const words = (text) => text.split(/\s+/).filter(Boolean).length;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const rel = (full) => relative(SKILL, full).split(sep).join("/");

/**
 * The Agent Skills specification's keys — the set `agentskills validate`
 * accepts. Claude Code reads more (`argument-hint`, `user-invocable`, …), but
 * any of them fails the reference validator and a claude.ai or API upload. Add
 * one to EXTENSIONS only as a deliberate trade, never to get a test green.
 */
const SPEC_KEYS = [
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
];
const EXTENSIONS = [];

/**
 * What loads on every invocation, and what loads on the commonest path —
 * writing code in a React project. Raise a budget only on purpose, in the same
 * change as the content that needs the room.
 */
const BUDGET = {
  "SKILL.md": 1500,
  always: ["SKILL.md", "reference/motion-design.md"],
  alwaysWords: 2600,
  reactBuild: [
    "SKILL.md",
    "reference/motion-design.md",
    "reference/core-gsap.md",
    "reference/react-nextjs.md",
  ],
  reactBuildWords: 5000,
};

/** Strings that only ever mean the project this skill was developed in. */
const PROJECT_MARKERS = [
  /roboshan/i,
  /--rs-/,
  /src\/modules\//,
  /npm run (?:lint|check|typecheck)/,
  /\bthis repo\b/i,
  /check-architecture/,
  /raw-colour/,
];

function frontmatter(source) {
  const block = source.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(block, "SKILL.md must open with a --- frontmatter block");

  const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, "$2");
  const fields = {};
  let parent = null;

  for (const line of block[1].split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const top = line.match(/^([\w-]+):\s*(.*)$/);
    const nested = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (top) {
      parent = top[2] === "" ? top[1] : null;
      fields[top[1]] = top[2] === "" ? {} : unquote(top[2]);
    } else if (nested && parent) {
      fields[parent][nested[1]] = unquote(nested[2]);
    } else {
      assert.fail(`Unparseable frontmatter line: ${line}`);
    }
  }

  return fields;
}

describe("frontmatter", () => {
  const fields = frontmatter(read("SKILL.md"));

  test("uses only specification keys and deliberate extensions", () => {
    const allowed = new Set([...SPEC_KEYS, ...EXTENSIONS]);
    assert.deepEqual(
      Object.keys(fields).filter((key) => !allowed.has(key)),
      [],
    );
  });

  test("name matches the directory and the naming rules", () => {
    assert.equal(fields.name, basename(SKILL));
    assert.match(fields.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(fields.name.length <= 64);
  });

  test("description fits the specification's 1024 characters", () => {
    assert.ok(fields.description.length > 0);
    assert.ok(
      fields.description.length <= 1024,
      `${fields.description.length} characters`,
    );
  });

  test("compatibility fits 500 characters", () => {
    assert.ok(fields.compatibility.length <= 500);
  });

  test("version lives in metadata, as semver", () => {
    assert.equal(typeof fields.metadata, "object");
    assert.match(fields.metadata.version, /^\d+\.\d+\.\d+$/);
  });
});

describe("context budget", () => {
  const count = (files) =>
    files.reduce((total, file) => total + words(read(file)), 0);

  test(`SKILL.md stays under ${BUDGET["SKILL.md"]} words and 500 lines`, () => {
    const source = read("SKILL.md");
    assert.ok(words(source) <= BUDGET["SKILL.md"], `${words(source)} words`);
    assert.ok(source.split("\n").length < 500);
  });

  test(`what always loads stays under ${BUDGET.alwaysWords} words`, () => {
    const total = count(BUDGET.always);
    assert.ok(total <= BUDGET.alwaysWords, `${total} words`);
  });

  test(`a React build stays under ${BUDGET.reactBuildWords} words`, () => {
    const total = count(BUDGET.reactBuild);
    assert.ok(total <= BUDGET.reactBuildWords, `${total} words`);
  });
});

describe("links", () => {
  const markdown = walk(SKILL).filter((file) => file.endsWith(".md"));

  test("every relative link resolves inside the skill", () => {
    const broken = [];
    for (const file of markdown) {
      const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
      for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(?:https?:|mailto:|#)/.test(target)) continue;
        const path = resolve(dirname(file), target.split("#")[0]);
        if (!existsSync(path) || !path.startsWith(SKILL)) {
          broken.push(`${rel(file)} -> ${target}`);
        }
      }
    }
    assert.deepEqual(broken, []);
  });

  test("every document and template is linked from SKILL.md, one level deep", () => {
    const skill = read("SKILL.md");
    const linked = new Set(
      [...skill.matchAll(/\]\(([^)\s#]+)/g)].map(([, target]) => target),
    );
    const companions = walk(SKILL)
      .map(rel)
      .filter((file) => /^(?:reference|preset|example|template)\//.test(file));
    assert.deepEqual(
      companions.filter((file) => !linked.has(file)),
      [],
    );
  });
});

test("nothing from the project the skill was developed in leaks into it", () => {
  const leaks = [];
  for (const file of walk(SKILL)) {
    const path = rel(file);
    if (path.startsWith("scripts/test/")) continue;
    if (!/\.(?:md|mjs|ts|tsx)$/.test(path)) continue;
    const text = readFileSync(file, "utf8");
    for (const marker of PROJECT_MARKERS) {
      if (marker.test(text)) leaks.push(`${path}: ${marker}`);
    }
  }
  assert.deepEqual(leaks, []);
});
