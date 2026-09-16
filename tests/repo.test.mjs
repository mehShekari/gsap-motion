/**
 * The repository around the skill: the marketplace and plugin manifests, the
 * version that has to agree in three places, and the eval suite's shape.
 *
 * `claude plugin validate` checks manifest syntax in CI. These check what it
 * cannot — that the pieces agree with each other.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
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

describe("ESLint plugin package", () => {
  const pkg = json("packages/eslint-plugin/package.json");

  test("is @mehshekari/eslint-plugin-gsap-motion, in lockstep with the command line", () => {
    // One version for both, so the plugin at 3.x.y and the audit at 3.x.y are the same rules.
    assert.equal(pkg.name, "@mehshekari/eslint-plugin-gsap-motion");
    assert.equal(pkg.version, plugin.version);
    assert.equal(pkg.publishConfig?.access, "public", "a scoped package is private by default");
  });

  test("points at this repository", () => {
    assert.equal(pkg.repository.url, `git+${plugin.repository}.git`);
    assert.equal(pkg.repository.directory, "packages/eslint-plugin");
  });

  test("depends on nothing but ESLint itself, and installs nothing", () => {
    assert.equal(pkg.dependencies, undefined, "dependencies");
    assert.equal(pkg.optionalDependencies, undefined, "optionalDependencies");
    assert.deepEqual(Object.keys(pkg.peerDependencies), ["eslint"]);
    for (const script of ["preinstall", "install", "postinstall"]) {
      assert.equal(pkg.scripts?.[script], undefined, script);
    }
  });

  test("ships the audit it copies at pack time, which git ignores", () => {
    assert.ok(pkg.files.includes("lib/"), "files includes lib/");
    assert.equal(pkg.scripts.prepack, "node scripts/bundle-audit.mjs");
    assert.match(read(".gitignore"), /^packages\/eslint-plugin\/lib\/$/m);
  });
});

test("both READMEs list every rule with its level and what it catches", () => {
  // The rule's `description` is what ESLint shows; the README row is what people read.
  for (const doc of ["README.md", "packages/eslint-plugin/README.md"]) {
    const text = read(doc);
    for (const rule of RULES) {
      assert.ok(
        text.includes(`| \`${rule.id}\` | ${rule.level} | ${rule.description} |`),
        `${doc} has no row for ${rule.id} matching its level and description`,
      );
    }
  }
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
 * The same discipline for the command count, and for the same reason: it said
 * "14 commands" through three releases that added six, and nothing noticed
 * until the surface was rewritten in 4.0. A number in prose that nothing checks
 * is a number that goes stale.
 */
test("the README states as many commands as its own table lists", () => {
  const readme = read("README.md");
  const words = {
    Twelve: 12, Thirteen: 13, Fourteen: 14, Fifteen: 15, Sixteen: 16,
    Seventeen: 17, Eighteen: 18, Nineteen: 19, Twenty: 20,
    "Twenty-one": 21, "Twenty-two": 22, "Twenty-three": 23, "Twenty-four": 24,
  };
  const stated = readme.match(/\*\*(?:(\d+)|([A-Z][a-z]+(?:-[a-z]+)?)) commands\*\*/);
  assert.ok(stated, "README does not state a command count");
  const count = stated[1] ? Number(stated[1]) : words[stated[2]];
  assert.ok(count, `unrecognised number word: ${stated[2]}`);

  const table = readme.match(/\| Command \| What it does \|[\s\S]*?\n\n/)?.[0] ?? "";
  const rows = table.split("\n").filter((line) => /^\| `[a-z]/.test(line)).length;
  assert.equal(count, rows, `README says ${count}, its table lists ${rows}`);
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

/**
 * `claude plugin validate` does not read hooks.json, so nothing else would
 * notice a hook that no longer runs — and a hook that fails silently is worse
 * than none, because the loop it automates looks like it happened.
 */
describe("audit-on-write hook", () => {
  const hooks = json(`${PLUGIN_DIR}/hooks/hooks.json`);
  const script = join(ROOT, PLUGIN_DIR, "hooks", "audit-on-write.mjs");

  const box = mkdtempSync(join(tmpdir(), "gsap-motion-hook-"));
  after(() => rmSync(box, { recursive: true, force: true }));

  /** The shape Claude Code sends on stdin after an Edit or a Write. */
  const run = (file) => {
    const call = JSON.stringify({
      tool_name: "Edit",
      cwd: box,
      tool_input: { file_path: join(box, file) },
    });
    return spawnSync(process.execPath, [script], { input: call, encoding: "utf8" });
  };

  const write = (file, source) => {
    mkdirSync(join(box, "src"), { recursive: true });
    writeFileSync(join(box, file), source);
    return file;
  };

  test("asks for PostToolUse on Edit and Write, and runs the file it ships", () => {
    const [entry] = hooks.hooks.PostToolUse;
    assert.match(entry.matcher, /Edit/);
    assert.match(entry.matcher, /Write/);

    const [command] = entry.hooks;
    assert.equal(command.type, "command");
    assert.equal(command.command, "node");
    assert.deepEqual(command.args, ["${CLAUDE_PLUGIN_ROOT}/hooks/audit-on-write.mjs"]);
    assert.ok(existsSync(script), "the script the hook names exists");
  });

  test("hands findings back as additionalContext, without blocking the edit", () => {
    write(
      "src/Box.tsx",
      `"use client";
import gsap from "gsap";
import { useEffect, useRef } from "react";

export function Box() {
  const ref = useRef(null);
  useEffect(() => {
    gsap.to(ref.current, { width: 200 });
  }, []);
  return <div ref={ref} />;
}
`,
    );

    const result = run("src/Box.tsx");
    assert.equal(result.status, 0, "an edit is never blocked by an audit finding");

    const { hookSpecificOutput } = JSON.parse(result.stdout);
    assert.equal(hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(hookSpecificOutput.additionalContext, /orphan-tween/);
    assert.match(hookSpecificOutput.additionalContext, /src\/Box\.tsx/);
  });

  test("says nothing at all about a file it has no finding for", () => {
    write("src/clean.ts", "export const ready = true;\n");
    const result = run("src/clean.ts");
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "", "silence is the normal case");
  });

  test("says nothing when the tool call carries no file", () => {
    const result = spawnSync(process.execPath, [script], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "");
  });
});
