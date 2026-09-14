/**
 * The two command-line entry points, run the way a user runs them: as a child
 * process, from a project directory the skill is not installed in.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { project } from "./helpers.mjs";

const script = (name) =>
  fileURLToPath(new URL(`../${name}`, import.meta.url));

const run = (name, args, cwd) =>
  spawnSync(process.execPath, [script(name), ...args], {
    cwd,
    encoding: "utf8",
  });

const json = (result) => JSON.parse(result.stdout).findings;

const ORPHAN = `"use client";
import gsap from "gsap";
import { useEffect, useRef } from "react";

export function Box() {
  const ref = useRef(null);
  useEffect(() => {
    gsap.to(ref.current, { width: 200 });
  }, []);
  return <div ref={ref} />;
}
`;

const CLEAN = `"use client";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

export function Box() {
  const ref = useRef(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-box]", { y: 20 });
    });
  }, { scope: ref });
  return <div ref={ref} />;
}
`;

describe("audit-gsap.mjs", () => {
  test("resolves the default path from the working directory", () => {
    const dir = project({ "src/Box.tsx": ORPHAN });
    const result = run("audit-gsap.mjs", ["--json"], dir);
    assert.equal(result.status, 1, result.stderr);
    const orphan = json(result).find((f) => f.rule === "orphan-tween");
    assert.ok(orphan, "orphan-tween reported");
    assert.equal(orphan.file, "src/Box.tsx");
  });

  test("exits 0 and says so on clean code", () => {
    const dir = project({ "src/Box.tsx": CLEAN });
    const result = run("audit-gsap.mjs", ["src"], dir);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /gsap-audit: clean/);
  });

  test("exits 2 on a path that does not exist", () => {
    const dir = project({ "src/Box.tsx": CLEAN });
    assert.equal(run("audit-gsap.mjs", ["nowhere"], dir).status, 2);
  });

  test("--quiet reports errors only", () => {
    const dir = project({ "src/Box.tsx": ORPHAN });
    const result = run("audit-gsap.mjs", ["--quiet", "--json"], dir);
    assert.equal(result.status, 1);
    const findings = json(result);
    assert.ok(findings.length > 0);
    assert.ok(findings.every((f) => f.level === "error"));
  });

  test("a waiver silences its own rule and nothing else", () => {
    const waived = ORPHAN.replace(
      "    gsap.to(",
      "    // orphan-tween-ok — reverted by the test harness that mounts this.\n    gsap.to(",
    );
    const dir = project({ "src/Box.tsx": waived });
    const result = run("audit-gsap.mjs", ["--json"], dir);
    const rules = json(result).map((f) => f.rule);
    assert.ok(!rules.includes("orphan-tween"), "orphan-tween waived");
    assert.ok(rules.includes("layout-property"), "layout-property still reported");
    assert.equal(result.status, 0, "no error-level finding left");
  });

  test("a waiver more than eight lines above does not apply", () => {
    const far = `// orphan-tween-ok — too far away to count.${"\n".repeat(10)}${ORPHAN}`;
    const dir = project({ "src/Box.tsx": far });
    const rules = json(run("audit-gsap.mjs", ["--json"], dir)).map((f) => f.rule);
    assert.ok(rules.includes("orphan-tween"));
  });

  test("reports a file it cannot parse as not checked, not as clean", () => {
    const dir = project({
      "src/Broken.ts": 'import gsap from "gsap";\n\nexport const play = (el) => gsap.to(el, { x: 1 };\n',
      "src/Box.tsx": CLEAN,
    });
    const result = run("audit-gsap.mjs", ["--json"], dir);
    assert.equal(result.status, 0, "not-parsed is info, not an error");
    const [finding] = json(result).filter((f) => f.rule === "not-parsed");
    assert.ok(finding, "not-parsed reported");
    assert.equal(finding.level, "info");
    assert.equal(finding.file, "src/Broken.ts");
    assert.equal(finding.line, 3);
  });

  test("a plugin registered in another audited file counts as registered", () => {
    const dir = project({
      "src/index.ts":
        'import gsap from "gsap";\nimport { ScrollTrigger } from "gsap/ScrollTrigger";\ngsap.registerPlugin(ScrollTrigger);\n',
      "src/Section.ts":
        'import gsap from "gsap";\nimport { ScrollTrigger } from "gsap/ScrollTrigger";\nimport { SplitText } from "gsap/SplitText";\nexport const refresh = () => ScrollTrigger.refresh();\n',
    });
    const unregistered = json(run("audit-gsap.mjs", ["--json"], dir))
      .filter((f) => f.rule === "unregistered-plugin")
      .map((f) => `${f.file}: ${f.message}`);
    assert.deepEqual(unregistered, [
      "src/Section.ts: `SplitText` is imported but never passed to `gsap.registerPlugin`.",
    ]);
  });
});

describe("audit-svg.mjs", () => {
  const COMPLEX = `M0 0${" L1 1".repeat(19)}Z`;
  const dir = project({
    "hued.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.st0{fill:#ffd400}</style><path id="a" class="st0" d="M0 0L10 10" stroke="#0ea5e9"/></svg>`,
    "grey.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="g" d="M0 0L10 10" stroke="#333" fill="#fff"/></svg>`,
    "no-viewbox.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path id="n" d="M0 0L10 10" stroke="currentColor"/></svg>`,
    "circle.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle id="c" cx="5" cy="5" r="4" stroke="currentColor"/></svg>`,
    "simple.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="s" d="M0 0L10 0L10 10Z" fill="currentColor"/></svg>`,
    "complex.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="x" d="${COMPLEX}" fill="currentColor"/></svg>`,
  });
  const file = (name) => join(dir, name);

  test("does not report hue literals by default", () => {
    const result = run("audit-svg.mjs", [file("hued.svg")], dir);
    assert.equal(result.status, 0, result.stdout);
    assert.doesNotMatch(result.stdout, /hue literal/);
  });

  test("--hues reports attribute and stylesheet hues, in either flag position", () => {
    for (const args of [
      ["--hues", file("hued.svg")],
      [file("hued.svg"), "--hues"],
    ]) {
      const result = run("audit-svg.mjs", args, dir);
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stdout, /#0ea5e9/);
      assert.match(result.stdout, /#ffd400/);
    }
  });

  test("--hues lets greyscale through", () => {
    const result = run("audit-svg.mjs", ["--hues", file("grey.svg")], dir);
    assert.equal(result.status, 0, result.stdout);
  });

  test("a missing viewBox is an error", () => {
    const result = run("audit-svg.mjs", [file("no-viewbox.svg")], dir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /no viewBox/);
  });

  test("non-path shapes are told to convert", () => {
    const result = run("audit-svg.mjs", [file("circle.svg")], dir);
    assert.match(result.stdout, /convertToPath/);
  });

  test("--morph warns on very different node counts", () => {
    const result = run(
      "audit-svg.mjs",
      ["--morph", file("simple.svg"), file("complex.svg")],
      dir,
    );
    assert.match(result.stdout, /Node counts differ/);
  });

  test("exits 1 with usage when given no file", () => {
    const result = run("audit-svg.mjs", [], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage/);
  });
});
