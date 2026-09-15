#!/usr/bin/env node

/**
 * Warns when GSAP has moved past the versions the skill was verified against.
 *
 * The references make claims about GSAP's behaviour — some about its internals
 * — and each names the version it was checked on. A new release does not make
 * them wrong, but it is the moment they might have become wrong, and nothing
 * else in the repository would notice.
 *
 * Reads `metadata.verified-gsap` and `metadata.verified-gsap-react` from
 * SKILL.md, and the versions each adapter names in its own Versions section,
 * and compares their major.minor with what npm publishes now.
 *
 *   node scripts/check-freshness.mjs            # report, always exit 0
 *   node scripts/check-freshness.mjs --strict   # exit 1 when re-verification is due
 *
 * An unreachable registry is reported and never fails the run: this is a
 * reminder, and a network blip is not a reason to re-verify anything.
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = fileURLToPath(
  new URL("../plugins/gsap-motion/skills/gsap-creative-animation/", import.meta.url),
);
const SKILL = join(SKILL_DIR, "SKILL.md");

const strict = process.argv.includes("--strict");
const inActions = process.env.GITHUB_ACTIONS === "true";
const source = readFileSync(SKILL, "utf8");

const verified = (key) =>
  source.match(new RegExp(`^\\s+${key}:\\s*"?([\\d.]+)"?`, "m"))?.[1];

/**
 * What each adapter names in its Versions section, as `package@major.minor`.
 * An adapter is written against one stack, and that stack moving is the moment
 * its lifecycle, hydration and route guidance might have gone stale — which
 * SKILL.md's two GSAP keys would never show.
 *
 * The highest version named for a package wins, so "written for `react@18` and
 * `react@19`" is checked against 19.
 */
function fromAdapters() {
  const highest = new Map();

  for (const file of readdirSync(join(SKILL_DIR, "adapter"))) {
    const text = readFileSync(join(SKILL_DIR, "adapter", file), "utf8");
    const versions = text.split("## Versions")[1] ?? "";

    for (const [, name, base] of versions.matchAll(/`([@\w./-]+)@([\d.]+)`/g)) {
      // gsap and @gsap/react are SKILL.md's to state, once, for the whole skill.
      if (name === "gsap" || name === "@gsap/react") continue;
      const held = highest.get(name);
      if (!held || isNewer(base, held.base)) {
        highest.set(name, { name, base, where: `adapter/${file}` });
      }
    }
  }

  return [...highest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const majorMinor = (version) => version.split(".").slice(0, 2).map(Number);

const isNewer = (latest, base) => {
  const [a, b] = majorMinor(latest);
  const [c, d] = majorMinor(base);
  return a > c || (a === c && b > d);
};

const due = [];

const PACKAGES = [
  { name: "gsap", base: verified("verified-gsap"), where: "SKILL.md" },
  { name: "@gsap/react", base: verified("verified-gsap-react"), where: "SKILL.md" },
  ...fromAdapters(),
];

for (const pkg of PACKAGES) {
  const { base } = pkg;
  if (!base) {
    console.error(`SKILL.md has no verified version for ${pkg.name}.`);
    process.exit(1);
  }

  let latest;
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${pkg.name.replace("/", "%2F")}/latest`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ({ version: latest } = await response.json());
  } catch (error) {
    console.log(`? Could not reach npm for ${pkg.name}: ${error.message}`);
    continue;
  }

  if (!isNewer(latest, base)) {
    console.log(`✓ ${pkg.name} ${latest} — ${pkg.where} says ${base}`);
    continue;
  }

  const message = `${pkg.name} ${latest} is out; ${pkg.where} says ${base}. Re-check what that file claims, then update the version it names.`;
  due.push(message);
  console.log(
    inActions ? `::warning title=${pkg.name} ${latest}::${message}` : `! ${message}`,
  );
}

if (inActions && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    due.length
      ? `## Re-verification due\n\n${due.map((line) => `- ${line}`).join("\n")}\n`
      : "Every verified version is current.\n",
  );
}

process.exit(strict && due.length ? 1 : 0);
