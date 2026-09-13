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
 * SKILL.md and compares their major.minor with what npm publishes now.
 *
 *   node scripts/check-freshness.mjs            # report, always exit 0
 *   node scripts/check-freshness.mjs --strict   # exit 1 when re-verification is due
 *
 * An unreachable registry is reported and never fails the run: this is a
 * reminder, and a network blip is not a reason to re-verify anything.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SKILL = fileURLToPath(
  new URL(
    "../plugins/gsap-motion/skills/gsap-creative-animation/SKILL.md",
    import.meta.url,
  ),
);

const PACKAGES = [
  { name: "gsap", key: "verified-gsap" },
  { name: "@gsap/react", key: "verified-gsap-react" },
];

const strict = process.argv.includes("--strict");
const inActions = process.env.GITHUB_ACTIONS === "true";
const source = readFileSync(SKILL, "utf8");

const verified = (key) =>
  source.match(new RegExp(`^\\s+${key}:\\s*"?([\\d.]+)"?`, "m"))?.[1];

const majorMinor = (version) => version.split(".").slice(0, 2).map(Number);

const isNewer = (latest, base) => {
  const [a, b] = majorMinor(latest);
  const [c, d] = majorMinor(base);
  return a > c || (a === c && b > d);
};

const due = [];

for (const pkg of PACKAGES) {
  const base = verified(pkg.key);
  if (!base) {
    console.error(`SKILL.md has no metadata.${pkg.key}.`);
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
    console.log(`✓ ${pkg.name} ${latest} — verified against ${base}`);
    continue;
  }

  const message = `${pkg.name} ${latest} is out; the skill was verified against ${base}. Re-check every claim marked "verified against", then update metadata.${pkg.key} in SKILL.md.`;
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
