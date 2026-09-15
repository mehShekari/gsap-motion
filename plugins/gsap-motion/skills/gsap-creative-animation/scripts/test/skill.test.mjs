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
 * What loads at each size tier in SKILL.md's setup step 3, before the command's
 * own reference. Raise a budget only on purpose, in the same change as the
 * content that needs the room.
 */
const ALWAYS = ["SKILL.md", "reference/motion-design.md"];

const BUDGET = {
  "SKILL.md": 1500,
  always: ALWAYS,
  alwaysWords: 2600,
  /**
   * One tier per stack, because setup step 3 picks the adapter from
   * package.json and composes it: `next` loads react and next,
   * `@react-three/fiber` loads react and r3f, and every other stack loads one.
   *
   * 4,150 from 3.2, up from 4,000. Next is the one stack that loads two
   * adapters, and answering the contract in both costs it about 230 words.
   * Every other stack fell from 3,873 to between 2,980 and 3,300, which is what
   * the split was for: a Vue project no longer reads past React and Svelte to
   * find its own lifecycle.
   */
  componentWords: 4150,
  component: {
    next: [...ALWAYS, "adapter/react.md", "adapter/next.md"],
    react: [...ALWAYS, "adapter/react.md"],
    r3f: [...ALWAYS, "adapter/react.md", "adapter/r3f.md"],
    three: [...ALWAYS, "adapter/three.md"],
    vue: [...ALWAYS, "adapter/vue.md"],
    svelte: [...ALWAYS, "adapter/svelte.md"],
    astro: [...ALWAYS, "adapter/astro.md"],
    vanilla: [...ALWAYS, "adapter/vanilla.md"],
  },
  /**
   * The largest request on the largest stack. It rose from 5,000 in 3.2, when
   * the adapter split gave this tier two files where it had one: the same
   * guidance, in a shape that lets every other stack load less.
   */
  build: [...ALWAYS, "adapter/react.md", "adapter/next.md", "reference/core-gsap.md"],
  buildWords: 5200,
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

  test(`a one-element change loads under ${BUDGET.alwaysWords} words`, () => {
    const total = count(BUDGET.always);
    assert.ok(total <= BUDGET.alwaysWords, `${total} words`);
  });

  for (const [stack, files] of Object.entries(BUDGET.component)) {
    test(`a ${stack} component loads under ${BUDGET.componentWords} words`, () => {
      const total = count(files);
      assert.ok(total <= BUDGET.componentWords, `${total} words`);
    });
  }

  test(`a Next sequence or scene loads under ${BUDGET.buildWords} words`, () => {
    const total = count(BUDGET.build);
    assert.ok(total <= BUDGET.buildWords, `${total} words`);
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
      .filter((file) =>
        /^(?:adapter|reference|preset|example|template)\//.test(file),
      );
    assert.deepEqual(
      companions.filter((file) => !linked.has(file)),
      [],
    );
  });
});

/**
 * One adapter per stack, each answering the same questions under the same
 * headings. A reader who knows one knows where to look in any of them, and a
 * stack whose adapter is silent about teardown or hydration is a gap, not a
 * style choice. Extra sections are allowed — Three has a division of labour to
 * explain that React does not.
 */
describe("adapters", () => {
  const CONTRACT = [
    "Where it is created",
    "Where it is torn down",
    "Scope",
    "Server rendering and hydration",
    "Reaching the element",
    "Every frame",
    "Page and route changes",
    "Failures",
    "What the audit covers",
    "Versions",
  ];

  const adapters = walk(SKILL)
    .map(rel)
    .filter((file) => file.startsWith("adapter/"))
    .sort();

  test("there is one per stack, and nothing else", () => {
    assert.deepEqual(adapters, [
      "adapter/astro.md",
      "adapter/next.md",
      "adapter/r3f.md",
      "adapter/react.md",
      "adapter/svelte.md",
      "adapter/three.md",
      "adapter/vanilla.md",
      "adapter/vue.md",
    ]);
  });

  for (const file of adapters) {
    test(`${file} answers the contract, in order`, () => {
      const headings = [...read(file).matchAll(/^## (.+)$/gm)]
        .map(([, heading]) => heading)
        .filter((heading) => CONTRACT.includes(heading));
      assert.deepEqual(headings, CONTRACT);
    });

    test(`${file} names the versions it was written against`, () => {
      const versions = read(file).split("## Versions")[1] ?? "";
      assert.match(versions, /`gsap@\d+\.\d+`/, "its GSAP version");
      assert.match(
        versions,
        /`[@\w./-]+@[\d.]+`/,
        "at least one package@version, for check-freshness",
      );
    });
  }
});

test("nothing from the project the skill was developed in leaks into it", () => {
  const leaks = [];
  for (const file of walk(SKILL)) {
    const path = rel(file);
    if (path.startsWith("scripts/test/")) continue;
    if (!/\.(?:md|mjs|ts|tsx)$/.test(path)) continue;
    /**
     * Whitespace collapsed first, because prose wraps: "this" at the end of
     * one line and "repo" at the start of the next is the same leak, and it
     * sat in reference/svg.md unreported while the check read lines as they
     * were wrapped.
     */
    const text = readFileSync(file, "utf8").replace(/\s+/g, " ");
    for (const marker of PROJECT_MARKERS) {
      if (marker.test(text)) leaks.push(`${path}: ${marker}`);
    }
  }
  assert.deepEqual(leaks, []);
});
