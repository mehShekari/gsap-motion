#!/usr/bin/env node

/**
 * Copies the skill into this package, run automatically before it is packed.
 *
 * The skill has exactly one home in git, `plugins/gsap-motion/skills/`. The npm
 * package carries a copy made here at pack time, so the two cannot drift. The
 * repository's tests are left out: they are for contributors, not users.
 *
 * Refuses to bundle when the package and the skill disagree about the version,
 * so a publish can never ship a skill labelled with the wrong number.
 *
 *   node scripts/bundle-skill.mjs [--out <dir>]
 *
 * Progress goes to stderr, so `npm pack --json` stays parseable.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(
  PACKAGE_ROOT,
  "..",
  "..",
  "plugins",
  "gsap-motion",
  "skills",
  "gsap-creative-animation",
);

const outIndex = process.argv.indexOf("--out");
const OUT = outIndex === -1 ? PACKAGE_ROOT : resolve(process.argv[outIndex + 1]);

if (!existsSync(join(SOURCE, "SKILL.md"))) {
  console.error(`No skill at ${SOURCE}. Run this from a clone of the repository.`);
  process.exit(1);
}

const { version } = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
);
const skillVersion = readFileSync(join(SOURCE, "SKILL.md"), "utf8")
  .replace(/\r\n/g, "\n")
  .match(/\nmetadata:\n(?:[ \t]+[\w-]+:.*\n)*?[ \t]+version:\s*"?([\d.]+)"?/)?.[1];

if (skillVersion !== version) {
  console.error(
    `Version mismatch: package.json is ${version}, SKILL.md metadata.version is ${skillVersion}. Set both before packing.`,
  );
  process.exit(1);
}

const isTestPath = (path) =>
  path === "scripts/test" || path.startsWith("scripts/test/");

function copyTree(from, to) {
  let copied = 0;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    if (isTestPath(relative(SOURCE, source).split(sep).join("/"))) continue;
    const target = join(to, entry.name);
    if (entry.isDirectory()) copied += copyTree(source, target);
    else if (entry.isFile()) {
      copyFileSync(source, target);
      copied += 1;
    }
  }
  return copied;
}

const skillOut = join(OUT, "skill");
rmSync(skillOut, { recursive: true, force: true });
const files = copyTree(SOURCE, skillOut);

/** npm ships a LICENSE at the package root; the skill's own is the source. */
copyFileSync(join(SOURCE, "LICENSE"), join(OUT, "LICENSE"));
copyFileSync(join(SOURCE, "NOTICE.md"), join(OUT, "NOTICE.md"));

console.error(`Bundled gsap-creative-animation ${version}: ${files} files into ${skillOut}`);
