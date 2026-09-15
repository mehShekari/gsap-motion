/**
 * The plugin as ESLint sees it: one rule per audit rule, at the audit's level,
 * reporting where the audit reports, under espree and under typescript-eslint
 * alike.
 *
 * Whether each rule is right is proved by the audit's own fixtures, in the
 * skill, and parity.eslint-test.mjs runs every one of them through ESLint. This
 * file proves the wiring: options, waivers, the files the audit does not read,
 * and a file only ESLint's parser can read.
 *
 * Named `*.eslint-test.mjs` so the repository's test runner, which installs
 * nothing, does not pick it up. `npm test` in this package runs it.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, test } from "node:test";
import { fileURLToPath } from "node:url";

import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";

import { RULES } from "../../../plugins/gsap-motion/skills/gsap-creative-animation/scripts/lib/rules.mjs";
import plugin from "../index.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKILL_LIB = join(
  PACKAGE_ROOT,
  "..",
  "..",
  "plugins",
  "gsap-motion",
  "skills",
  "gsap-creative-animation",
  "scripts",
  "lib",
);
const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));

describe("the plugin", () => {
  test("has one rule per audit rule, and not-parsed", () => {
    assert.deepEqual(
      Object.keys(plugin.rules).sort(),
      [...RULES.map((rule) => rule.id), "not-parsed"].sort(),
    );
  });

  test("names itself after its package", () => {
    assert.equal(plugin.meta.name, pkg.name);
    assert.equal(plugin.meta.version, pkg.version);
  });

  test("describes every rule and links to the audit's documentation", () => {
    for (const [id, rule] of Object.entries(plugin.rules)) {
      assert.ok(rule.meta.docs.description, id);
      assert.match(
        rule.meta.docs.url,
        /^https:\/\/github\.com\/mehShekari\/gsap-motion#/,
        id,
      );
    }
  });

  test("recommends every rule at the level the command line reports it", () => {
    const { plugins, rules } = plugin.configs.recommended;
    assert.equal(plugins["gsap-motion"], plugin);

    /** ESLint has no info level, so an info rule warns — as `not-parsed` does. */
    for (const rule of RULES) {
      const expected = rule.level === "info" ? "warn" : rule.level;
      assert.equal(rules[`gsap-motion/${rule.id}`], expected, rule.id);
    }

    assert.ok(
      RULES.some((rule) => rule.level === "info"),
      "an info rule exists, so that mapping is exercised",
    );
    assert.equal(rules["gsap-motion/not-parsed"], "warn");
    assert.equal(Object.keys(rules).length, RULES.length + 1);
  });

  test("runs the audit's own files, copied unchanged", () => {
    const tree = (dir, prefix = "") =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? tree(join(dir, entry.name), `${prefix}${entry.name}/`)
          : [`${prefix}${entry.name}`],
      );
    const source = tree(SKILL_LIB).sort();
    assert.deepEqual(tree(join(PACKAGE_ROOT, "lib")).sort(), source);
    for (const file of source) {
      assert.ok(
        readFileSync(join(PACKAGE_ROOT, "lib", file)).equals(
          readFileSync(join(SKILL_LIB, file)),
        ),
        `lib/${file} differs from the skill's; run npm run bundle`,
      );
    }
  });
});

// --- Wiring ------------------------------------------------------------------

const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});
const typescript = { parser: tsParser };

/** Where `text` starts in `code`, as ESLint reports it: 1-based line and column. */
function at(code, text) {
  const index = code.indexOf(text);
  assert.ok(index >= 0, `"${text}" is not in the fixture`);
  const lines = code.slice(0, index).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

const REACT = `"use client";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef } from "react";
`;

const orphan = `${REACT}
export function Box() {
  const ref = useRef(null);
  useEffect(() => {
    gsap.to(ref.current, { x: 100 });
  }, []);
  return <div ref={ref} />;
}
`;

const inContext = `${REACT}
export function Box() {
  const ref = useRef(null);
  useGSAP(() => {
    gsap.to(ref.current, { x: 100 });
  }, { scope: ref });
  return <div ref={ref} />;
}
`;

const waivedOrphan = orphan.replace(
  "    gsap.to(",
  "    // orphan-tween-ok — the harness unmounts nothing while this runs.\n    gsap.to(",
);

tester.run("orphan-tween", plugin.rules["orphan-tween"], {
  valid: [
    { name: "inside useGSAP", code: inContext, filename: "Box.tsx", languageOptions: typescript },
    { name: "answered by a waiver", code: waivedOrphan, filename: "Box.tsx", languageOptions: typescript },
  ],
  invalid: [
    {
      name: "a tween in a plain useEffect, under typescript-eslint",
      code: orphan,
      filename: "Box.tsx",
      languageOptions: typescript,
      errors: [{ messageId: "finding", ...at(orphan, "gsap.to") }],
    },
    {
      name: "the same tween under espree",
      code: orphan,
      filename: "Box.jsx",
      errors: [{ messageId: "finding", ...at(orphan, "gsap.to") }],
    },
  ],
});

const show = `import gsap from "gsap";

export const show = (el: Element) => gsap.to(el, { autoAlpha: 1 });
`;

tester.run("missing-reduced-motion", plugin.rules["missing-reduced-motion"], {
  valid: [
    {
      name: "a file the command line does not read either",
      code: show,
      filename: "show.cts",
      languageOptions: typescript,
    },
  ],
  invalid: [
    {
      name: "the same file where the command line reads it",
      code: show,
      filename: "show.ts",
      languageOptions: typescript,
      errors: [{ messageId: "finding" }],
    },
  ],
});

const imported = `import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export const reveal = (el) => gsap.to(el, { x: 1, scrollTrigger: el });
`;

tester.run("unregistered-plugin", plugin.rules["unregistered-plugin"], {
  valid: [
    {
      name: "registered in another file, named in the options",
      code: imported,
      filename: "reveal.js",
      options: [{ registered: ["ScrollTrigger"] }],
    },
  ],
  invalid: [
    {
      name: "registered nowhere this file or the options can show",
      code: imported,
      filename: "reveal.js",
      errors: [{ messageId: "finding", ...at(imported, "import { ScrollTrigger }") }],
    },
  ],
});

/**
 * `with` is sloppy-mode JavaScript: espree reads it as a script, the audit
 * parses modules and cannot. The one case where ESLint reads a file and the
 * audit does not, which must be said rather than passed as clean.
 */
tester.run("not-parsed", plugin.rules["not-parsed"], {
  valid: [
    { name: "a file that parses", code: "gsap.to(el, { x: 1 });\n", filename: "fine.js" },
    {
      name: "an unparsable file that never mentions GSAP",
      code: "with (window) { run(); }\n",
      filename: "legacy.js",
      languageOptions: { sourceType: "script" },
    },
  ],
  invalid: [
    {
      name: "a file only ESLint's parser can read",
      code: "with (window) { gsap.to(el, { x: 1 }); }\n",
      filename: "legacy.js",
      languageOptions: { sourceType: "script" },
      errors: [{ messageId: "finding", line: 1 }],
    },
  ],
});
