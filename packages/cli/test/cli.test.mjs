/**
 * The npx CLI, run as a child process the way a user runs it, against
 * throwaway projects and a throwaway home directory.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(PACKAGE_ROOT, "bin", "gsap-motion.mjs");
const BUNDLE = join(PACKAGE_ROOT, "scripts", "bundle-skill.mjs");
const { version } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
const SKILL = "gsap-creative-animation";

const ROOT = mkdtempSync(join(tmpdir(), "gsap-motion-cli-"));
after(() => rmSync(ROOT, { recursive: true, force: true }));

let counter = 0;
function sandbox(files = {}) {
  const dir = join(ROOT, `case-${counter}`);
  counter += 1;
  const project = join(dir, "project");
  const home = join(dir, "home");
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    writeFileSync(join(project, path), source);
  }
  return { project, home };
}

const run = ({ project, home }, ...args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    cwd: project,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1" },
  });

const installed = (root) => join(root, ".claude", "skills", SKILL);

describe("help and version", () => {
  test("--version prints the package version", () => {
    const result = run(sandbox(), "--version");
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), version);
  });

  test("no command prints help", () => {
    const result = run(sandbox());
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage/);
  });

  test("an unknown command exits 2", () => {
    const result = run(sandbox(), "install-everything");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown command/);
  });
});

describe("add", () => {
  test("installs into this project, without the repository's tests", () => {
    const box = sandbox();
    const result = run(box, "add");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(installed(box.project), "SKILL.md")));
    assert.ok(existsSync(join(installed(box.project), "scripts", "audit-gsap.mjs")));
    assert.ok(!existsSync(join(installed(box.project), "scripts", "test")));
  });

  test("--global installs into the user's home", () => {
    const box = sandbox();
    assert.equal(run(box, "add", "--global").status, 0);
    assert.ok(existsSync(join(installed(box.home), "SKILL.md")));
    assert.ok(!existsSync(installed(box.project)));
  });

  test("--dir installs into any skills directory", () => {
    const box = sandbox();
    assert.equal(run(box, "add", "--dir", "agent-skills").status, 0);
    assert.ok(existsSync(join(box.project, "agent-skills", SKILL, "SKILL.md")));
  });

  test("is a no-op when this version is already installed", () => {
    const box = sandbox();
    run(box, "add");
    const result = run(box, "add");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /already installed/);
  });

  test("updates an older version", () => {
    const box = sandbox();
    run(box, "add");
    const skillMd = join(installed(box.project), "SKILL.md");
    writeFileSync(skillMd, readFileSync(skillMd, "utf8").replace(`version: "${version}"`, 'version: "0.0.1"'));
    const result = run(box, "add");
    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(`Updated ${SKILL} 0\\.0\\.1 → ${version.replace(/\./g, "\\.")}`));
  });

  test("refuses to overwrite a directory that is not this skill", () => {
    const box = sandbox({ [`.claude/skills/${SKILL}/SKILL.md`]: "---\nname: something-else\n---\n" });
    const result = run(box, "add");
    assert.equal(result.status, 1);
    assert.match(readFileSync(join(installed(box.project), "SKILL.md"), "utf8"), /something-else/);
  });

  test("rejects --global together with --dir", () => {
    assert.equal(run(sandbox(), "add", "--global", "--dir", "x").status, 2);
  });
});

describe("remove", () => {
  test("removes an installed skill", () => {
    const box = sandbox();
    run(box, "add");
    const result = run(box, "remove");
    assert.equal(result.status, 0);
    assert.ok(!existsSync(installed(box.project)));
  });

  test("refuses to remove a directory that is not this skill", () => {
    const box = sandbox({ [`.claude/skills/${SKILL}/SKILL.md`]: "---\nname: something-else\n---\n" });
    assert.equal(run(box, "remove").status, 1);
    assert.ok(existsSync(installed(box.project)));
  });
});

describe("audits", () => {
  test("audit passes the audit's exit code through", () => {
    const orphan = sandbox({
      "src/Box.tsx": `"use client";
import gsap from "gsap";
import { useEffect, useRef } from "react";
export function Box() {
  const ref = useRef(null);
  useEffect(() => {
    gsap.to(ref.current, { x: 100 });
  }, []);
  return <div ref={ref} />;
}
`,
    });
    assert.equal(run(orphan, "audit", "--quiet").status, 1);

    const clean = sandbox({ "src/show.ts": 'import gsap from "gsap";\nexport const show = (el) => gsap.set(el, { autoAlpha: 1 });\n' });
    assert.equal(run(clean, "audit", "--quiet").status, 0);
  });

  test("audit-svg with no file prints its usage and exits 1", () => {
    const result = run(sandbox(), "audit-svg");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage/);
  });
});

describe("doctor", () => {
  test("warns about an old gsap and a missing @gsap/react, and still exits 0", () => {
    const box = sandbox({
      "package.json": JSON.stringify({ dependencies: { gsap: "^3.12.5", react: "^19.0.0" } }),
    });
    const result = run(box, "doctor");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /! gsap \^3\.12\.5/);
    assert.match(result.stdout, /! @gsap\/react is not a dependency/);
    assert.match(result.stdout, /Not installed for this project/);
  });

  test("confirms a current install and project", () => {
    const box = sandbox({
      "package.json": JSON.stringify({ dependencies: { gsap: "^3.15.0", react: "^19.0.0", "@gsap/react": "^2.1.2" } }),
      "ANIMATION.md": "# Animation rules\n",
    });
    run(box, "add");
    const result = run(box, "doctor");
    assert.match(result.stdout, new RegExp(`✓ Installed for this project: ${version.replace(/\./g, "\\.")}`));
    assert.match(result.stdout, /✓ gsap \^3\.15\.0/);
    assert.match(result.stdout, /✓ ANIMATION\.md found/);
  });

  /**
   * Found in a real project: a checked-in skill copy three releases behind a
   * plugin that was current. doctor found it, and then recommended `add`, which
   * is the command that creates exactly that. With a plugin present, a missing
   * local copy is the healthy state and must not read as a thing to fix.
   */
  test("says the plugin provides the skill, and does not suggest a second copy", () => {
    const box = sandbox({
      "package.json": JSON.stringify({ dependencies: { gsap: "^3.15.0" } }),
      ".claude/settings.json": JSON.stringify({
        enabledPlugins: { "gsap-motion@mehshekari": true },
      }),
    });
    const result = run(box, "doctor");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Provided by the gsap-motion@mehshekari plugin/);
    assert.match(result.stdout, /No separate copy for this project/);
    assert.doesNotMatch(result.stdout, /add installs it at/);
  });

  test("still offers the install when no plugin provides it", () => {
    const box = sandbox({ "package.json": JSON.stringify({ dependencies: { gsap: "^3.15.0" } }) });
    const result = run(box, "doctor");
    assert.match(result.stdout, /Not installed for this project/);
    assert.match(result.stdout, /add installs it at/);
  });

  test("ignores a plugin entry that is switched off", () => {
    const box = sandbox({
      "package.json": JSON.stringify({ dependencies: { gsap: "^3.15.0" } }),
      ".claude/settings.json": JSON.stringify({
        enabledPlugins: { "gsap-motion@mehshekari": false },
      }),
    });
    assert.match(run(box, "doctor").stdout, /Not installed for this project/);
  });

  test("survives a settings file that is not JSON", () => {
    const box = sandbox({
      "package.json": JSON.stringify({ dependencies: { gsap: "^3.15.0" } }),
      ".claude/settings.json": "{ this is not json",
    });
    const result = run(box, "doctor");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Not installed for this project/);
  });

  test("--json reports the same run the text does, not a thinner one", () => {
    const box = sandbox({
      "package.json": JSON.stringify({ dependencies: { gsap: "^3.15.0", react: "^19.0.0" } }),
    });
    const result = run(box, "doctor", "--json");
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.cli, version);
    assert.equal(report.skill, version);
    assert.deepEqual(report.adapters, ["react"]);
    assert.equal(report.plugin, null);
    assert.equal(report.animationMd, false);
    /** The same checks the text prints, every one of them carrying its state. */
    assert.ok(report.checks.length >= 4);
    assert.ok(report.checks.every((check) => typeof check.state === "string"));
    assert.equal(report.worst, "warn");
  });

  test("--json prints nothing but JSON, so a script can read it", () => {
    const box = sandbox({ "package.json": JSON.stringify({ dependencies: { gsap: "^3.15.0" } }) });
    const result = run(box, "doctor", "--json");
    assert.doesNotThrow(() => JSON.parse(result.stdout));
    assert.doesNotMatch(result.stdout, /carrying gsap-creative-animation/);
  });

  test("names the adapters the stack gets, composed as SKILL.md composes them", () => {
    const next = sandbox({
      "package.json": JSON.stringify({
        dependencies: { gsap: "^3.15.0", next: "^16.0.0", react: "^19.0.0" },
      }),
    });
    assert.match(run(next, "doctor").stdout, /Adapters: react, next/);

    const scene = sandbox({
      "package.json": JSON.stringify({
        dependencies: { gsap: "^3.15.0", react: "^19.0.0", "@react-three/fiber": "^9.0.0" },
      }),
    });
    assert.match(run(scene, "doctor").stdout, /Adapters: react, r3f/);

    const plain = sandbox({
      "package.json": JSON.stringify({ dependencies: { gsap: "^3.15.0" } }),
    });
    assert.match(run(plain, "doctor").stdout, /Adapters: vanilla/);
  });
});

describe("bundle-skill.mjs", () => {
  test("bundles the skill without tests, with the licence and notice", () => {
    const out = join(ROOT, "bundle");
    mkdirSync(out, { recursive: true });
    const result = spawnSync(process.execPath, [BUNDLE, "--out", out], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(out, "skill", "SKILL.md")));
    assert.ok(existsSync(join(out, "skill", "scripts", "audit-gsap.mjs")));
    assert.ok(!existsSync(join(out, "skill", "scripts", "test")));
    assert.ok(existsSync(join(out, "LICENSE")));
    assert.ok(existsSync(join(out, "NOTICE.md")));
  });
});
