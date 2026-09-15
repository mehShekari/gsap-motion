#!/usr/bin/env node

/**
 * Copies the audit's engine into this package, before it is packed and before
 * its tests run.
 *
 * The rules have exactly one home in git, the skill's `scripts/lib/`. The ESLint
 * plugin carries a copy made here, so the plugin and `gsap-motion audit` cannot
 * drift apart: they run the same files.
 *
 * Refuses to bundle when this package's version is not the skill's, so the
 * plugin and the command line always move in lockstep.
 *
 *   node scripts/bundle-audit.mjs
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = resolve(
  PACKAGE_ROOT,
  "..",
  "..",
  "plugins",
  "gsap-motion",
  "skills",
  "gsap-creative-animation",
);
const SOURCE = join(SKILL, "scripts", "lib");
const OUT = join(PACKAGE_ROOT, "lib");

if (!existsSync(join(SOURCE, "rules.mjs"))) {
  console.error(`No audit at ${SOURCE}. Run this from a clone of the repository.`);
  process.exit(1);
}

const { version } = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
);
const skillVersion = readFileSync(join(SKILL, "SKILL.md"), "utf8")
  .replace(/\r\n/g, "\n")
  .match(/\nmetadata:\n(?:[ \t]+[\w-]+:.*\n)*?[ \t]+version:\s*"?([\d.]+)"?/)?.[1];

if (skillVersion !== version) {
  console.error(
    `Version mismatch: package.json is ${version}, SKILL.md metadata.version is ${skillVersion}. Set both before packing.`,
  );
  process.exit(1);
}

function copyTree(from, to) {
  let copied = 0;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copied += copyTree(source, target);
    else if (entry.isFile()) {
      copyFileSync(source, target);
      copied += 1;
    }
  }
  return copied;
}

rmSync(OUT, { recursive: true, force: true });
const files = copyTree(SOURCE, OUT);

/** npm ships a LICENSE at the package root; the skill's own is the source. */
copyFileSync(join(SKILL, "LICENSE"), join(PACKAGE_ROOT, "LICENSE"));
copyFileSync(join(SKILL, "NOTICE.md"), join(PACKAGE_ROOT, "NOTICE.md"));

console.error(`Bundled the gsap-motion audit ${version}: ${files} files into ${OUT}`);
