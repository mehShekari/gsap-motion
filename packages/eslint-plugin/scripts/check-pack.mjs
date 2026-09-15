#!/usr/bin/env node

/**
 * Packs the ESLint plugin exactly as `npm publish` would, checks the tarball,
 * then installs it with ESLint into an empty project and lints a file there.
 *
 * The install is the only honest test of what a user downloads. A file left
 * out of `files`, a `lib/` that was never bundled, or an import that resolves
 * only inside this repository all pass the tests against the source tree.
 *
 * ESLint comes from the registry, so this needs the network.
 */
import { execSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { name, devDependencies } = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
);

const work = mkdtempSync(join(tmpdir(), "gsap-motion-eslint-pack-"));
const run = (command, cwd) =>
  execSync(command, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

let failed = false;
const check = (ok, message) => {
  console.log(`${ok ? "✓" : "✗"} ${message}`);
  if (!ok) failed = true;
};

try {
  const output = run(`npm pack --json --pack-destination "${work}"`, PACKAGE_ROOT);
  /** npm 11 prints an array of packs; npm 12 prints an object keyed by package name. */
  const parsed = JSON.parse(output.slice(output.search(/^[[{]/m)));
  const [pack] = Array.isArray(parsed)
    ? parsed
    : parsed.files
      ? [parsed]
      : Object.values(parsed);
  const files = pack.files.map((file) => file.path.replace(/\\/g, "/"));

  console.log(
    `${pack.filename}: ${files.length} files, ${(pack.size / 1024).toFixed(0)} kB packed, ${(pack.unpackedSize / 1024).toFixed(0)} kB unpacked`,
  );

  /**
   * Measured at 317 kB when first packed, most of it the audit's vendored
   * parser. The ceiling leaves room for rules to grow without letting a second
   * bundle slip in unnoticed. Raise it on purpose, in the change that needs the
   * room.
   */
  const UNPACKED_CEILING_KB = 400;
  check(
    pack.unpackedSize / 1024 <= UNPACKED_CEILING_KB,
    `unpacked size within ${UNPACKED_CEILING_KB} kB`,
  );

  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE.md",
    "index.mjs",
    "lib/audit.mjs",
    "lib/rules.mjs",
    "lib/source.mjs",
    "lib/ast.mjs",
    "lib/vendor/parser.mjs",
  ]) {
    check(files.includes(required), `ships ${required}`);
  }
  check(
    !files.some((file) => file.startsWith("test/") || file.startsWith("scripts/")),
    "ships no tests and no build scripts",
  );

  const project = join(work, "project");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ name: "check-pack", private: true, type: "module" }),
  );
  run(
    `npm install --no-audit --no-fund --no-package-lock "${join(work, pack.filename)}" eslint@${devDependencies.eslint}`,
    project,
  );

  writeFileSync(
    join(project, "eslint.config.js"),
    [
      `import gsapMotion from "${name}";`,
      "",
      "export default [",
      '  { files: ["**/*.jsx"], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },',
      '  { files: ["**/*.{js,jsx}"], ...gsapMotion.configs.recommended },',
      "];",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(project, "src", "Box.jsx"),
    [
      '"use client";',
      'import gsap from "gsap";',
      'import { useEffect, useRef } from "react";',
      "",
      "export function Box() {",
      "  const ref = useRef(null);",
      "  useEffect(() => {",
      "    gsap.to(ref.current, { x: 100 });",
      "  }, []);",
      "  return <div ref={ref} />;",
      "}",
      "",
    ].join("\n"),
  );

  /** ESLint exits 1 on an error finding, which is the point here. */
  let report;
  try {
    report = run("npx --no-install eslint src --format json", project);
  } catch (error) {
    report = error.stdout;
  }
  const messages = JSON.parse(report).flatMap((result) => result.messages);

  check(
    !messages.some((message) => message.fatal),
    "ESLint loads the installed plugin and parses the file",
  );
  check(
    messages.some(
      (message) => message.ruleId === "gsap-motion/orphan-tween" && message.line === 8,
    ),
    `${name} reports orphan-tween through ESLint, on the tween's line`,
  );
} catch (error) {
  check(false, String(error.message).split("\n")[0]);
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
