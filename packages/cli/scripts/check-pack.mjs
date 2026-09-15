#!/usr/bin/env node

/**
 * Packs gsap-motion exactly as `npm publish` would, checks the tarball's
 * contents, then runs the packed CLI through `npx` from empty directories.
 *
 * That last part is the only honest test of what a user downloads. It catches a
 * file left out of `files`, a bin path npm rewrote, or a skill that was never
 * bundled — none of which the tests against the source tree can see.
 */
import { execSync } from "node:child_process";
import {
  existsSync,
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
const { name, version, bin } = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
);

const work = mkdtempSync(join(tmpdir(), "gsap-motion-pack-"));
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
   * The skill folder is copied into every project that installs it, so its
   * size is a cost users carry. Measured at 487 kB in 3.1.0, when the vendored
   * parser (229 kB) arrived, and at 606 kB in 3.4, when capture-motion.mjs and
   * explain-motion.mjs added a browser to the toolkit — both plain source, no
   * second bundle. The ceiling leaves room for growth without letting one slip
   * in unnoticed. Raise it on purpose, in the change that needs the room.
   */
  const UNPACKED_CEILING_KB = 700;
  check(
    pack.unpackedSize / 1024 <= UNPACKED_CEILING_KB,
    `unpacked size within ${UNPACKED_CEILING_KB} kB`,
  );

  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE.md",
    "bin/gsap-motion.mjs",
    "skill/SKILL.md",
    "skill/reference/routing.md",
    "skill/scripts/audit-gsap.mjs",
    "skill/scripts/audit-svg.mjs",
    "skill/scripts/capture-motion.mjs",
    "skill/scripts/explain-motion.mjs",
    "skill/scripts/lib/rules.mjs",
    "skill/scripts/lib/source.mjs",
    "skill/scripts/lib/ast.mjs",
    "skill/scripts/lib/audit.mjs",
    "skill/scripts/lib/vendor/parser.mjs",
  ]) {
    check(files.includes(required), `ships ${required}`);
  }
  check(
    !files.some((file) => file.includes("/test/") || file.endsWith(".test.mjs")),
    "ships no tests",
  );
  check(
    !files.some((file) => file.startsWith("scripts/")),
    "ships no build scripts",
  );

  const tarball = join(work, pack.filename);
  /**
   * `--package=<tarball> <bin>`, not `npx <tarball>`. A bare tarball path is
   * silently not executed on Windows — exit 0, no output — while this form is
   * exactly what `npx @mehshekari/gsap-motion` resolves to from the registry:
   * the scoped package, running its one bin, which is named gsap-motion.
   */
  const command = Object.keys(bin)[0];
  const npx = (args, cwd) =>
    run(`npx --yes --package="${tarball}" ${command} ${args}`, cwd);

  const empty = join(work, "empty");
  mkdirSync(empty);
  check(
    npx("--version", empty).trim() === version,
    `npx ${name} --version prints ${version}`,
  );

  const project = join(work, "project");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(
    join(project, "src", "show.ts"),
    'import gsap from "gsap";\nexport const show = (el: Element) => gsap.set(el, { autoAlpha: 1 });\n',
  );

  /** Each check proves the command ran: a silent exit 0 is not a pass. */
  check(
    /gsap-audit:/.test(npx("audit --quiet", project)),
    `npx ${name} audit runs the bundled audit`,
  );

  const added = npx("add", project);
  check(
    /Installed gsap-creative-animation/.test(added) &&
      existsSync(join(project, ".claude", "skills", "gsap-creative-animation", "SKILL.md")),
    `npx ${name} add installs the skill`,
  );
  check(
    !existsSync(join(project, ".claude", "skills", "gsap-creative-animation", "scripts", "test")),
    `npx ${name} add installs no tests`,
  );
} catch (error) {
  check(false, String(error.message).split("\n")[0]);
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
