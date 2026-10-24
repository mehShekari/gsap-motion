#!/usr/bin/env node

/**
 * Audits GSAP animation code for the failures that are silent.
 *
 * Nothing here is a matter of taste. Every rule catches something that
 * produces no error and often no visible symptom until much later, on a slower
 * device, or after a navigation: a tween that outlives its component, a tween
 * allocated per pointer event, a layout property animated every frame, an ease
 * on a loop that makes its own seam visible, a hardcoded id that makes two
 * instances drive one another's geometry.
 *
 * Rhythm, easing choice and whether an animation earns its place are not
 * checkable and are not attempted — reference/motion-design.md owns those.
 *
 * It reads each file's syntax tree — with a vendored parser, so nothing is
 * installed — and follows what can be followed inside one file: aliases, a
 * helper called only from a context, a timeline kept under a name. It does not
 * follow calls into other files. A file it cannot parse is reported as
 * `not-parsed`, never passed as clean. A wrong finding is a bug in this script;
 * report it rather than working around it.
 *
 * What happens to each file — the rules, waivers, `not-parsed` — is in
 * lib/audit.mjs, which the ESLint plugin runs too. This file finds the files,
 * collects what they register between them, and prints.
 *
 * Usage — paths resolve from the current directory, so run it from the project
 * root, wherever the skill itself is installed:
 *   node <skill-dir>/scripts/audit-gsap.mjs [path...]     # default: src
 *   node <skill-dir>/scripts/audit-gsap.mjs src/components --json
 *   node <skill-dir>/scripts/audit-gsap.mjs src --quiet   # errors only
 *
 * Exit code is 1 when any error-level finding is reported, 0 otherwise.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { check, mentionsGsap, notParsed } from "./lib/audit.mjs";
import { pluginRegistrations, RULES } from "./lib/rules.mjs";
import { collect, hasSourceExtension, load } from "./lib/source.mjs";

/**
 * The project being audited is wherever this is run from, not wherever the
 * skill is installed. It used to be derived from this file's own location,
 * which only worked while the skill sat exactly four levels inside the project:
 * installed per user under `~/.claude/skills/`, it resolved `src` against the
 * home directory and every run exited with "No such path".
 */
const ROOT = process.cwd();

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const quiet = argv.includes("--quiet");
const targets = argv.filter((a) => !a.startsWith("--"));

const paths = (targets.length ? targets : ["src"]).map((p) => resolve(ROOT, p));

for (const path of paths) {
  if (!existsSync(path)) {
    console.error(`No such path: ${path}`);
    process.exit(2);
  }
}

/**
 * `compilerOptions.paths` from the project's tsconfig.json, as
 * `[prefix, [target prefixes]]`: `"@/*": ["./src/*"]` becomes
 * `["@/", ["./src/"]]`, against `baseUrl` when one is set. A tsconfig is JSON
 * with comments and trailing commas, so those are stripped first; one that
 * still does not parse gives no aliases rather than an error.
 */
function tsconfigPaths(root) {
  try {
    const text = withoutComments(readFileSync(join(root, "tsconfig.json"), "utf8")).replace(/,(\s*[}\]])/g, "$1");
    const { compilerOptions = {} } = JSON.parse(text);
    const base = compilerOptions.baseUrl ?? ".";
    return Object.entries(compilerOptions.paths ?? {}).map(([key, targets]) => [
      key.replace(/\*$/, ""),
      targets.map((target) => join(base, target.replace(/\*$/, ""))),
    ]);
  } catch {
    return [];
  }
}

/**
 * JSON with its comments removed, outside strings only. A regex over the whole
 * text took the `/*` in `"**\/*.ts"` — in every Next tsconfig's `include` — for
 * the start of a comment, broke the JSON, and lost every alias.
 */
function withoutComments(text) {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      const end = text.slice(i + 1).search(/(?<!\\)"/);
      const close = end === -1 ? text.length : i + 1 + end;
      out += text.slice(i, close + 1);
      i = close;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else {
      out += char;
    }
  }
  return out;
}

// --- Run ---------------------------------------------------------------------

const findings = [];
const sources = [];
/** Every file read, GSAP or not: the import graph needs callers that never animate. */
const loaded = [];
/**
 * A file named on the command line that the audit cannot read — a stylesheet,
 * say. It used to be skipped in silence and the run printed "clean", which
 * reads as "checked and fine" about a file nothing looked at.
 */
const notScanned = [];

/** A finding as the report shows it: under the file's display path, no column. */
const reported = (source, finding) => ({
  rule: finding.rule,
  level: finding.level,
  file: source.display,
  line: finding.line,
  message: finding.message,
  hint: finding.hint,
});

for (const path of paths) {
  if (statSync(path).isFile() && !hasSourceExtension(path)) {
    notScanned.push(path);
    continue;
  }
  for (const file of collect(path)) {
    const source = load(file, ROOT);
    loaded.push(source);
    if (!mentionsGsap(source)) continue;

    if (source.parseError) {
      const finding = notParsed(source);
      if (finding) findings.push(reported(source, finding));
      continue;
    }

    sources.push(source);
  }
}

/**
 * Plugin registration is global: `gsap.registerPlugin(ScrollTrigger)` in one
 * module registers it for every other. What the audited files register between
 * them is collected before any rule runs, so a section that imports a plugin
 * the app's entry registers is not reported as unregistered.
 */
const registered = new Set(sources.flatMap((source) => [...pluginRegistrations(source)]));

/**
 * Who imports each file, among everything read — a caller need not use GSAP
 * itself. Relative imports, and aliases the project's tsconfig maps in
 * `compilerOptions.paths` (`"@/*": ["./src/*"]`).
 *
 * An alias that cannot be resolved may still name the file, and a verdict that
 * rests on some of a file's callers is a guess. A real project imported one
 * helper relatively from one caller and through `@/` from another; only the
 * first was seen. So when an unresolved alias ends in a file's name, that
 * file's importers are marked unknown, and it is judged alone.
 */
const byPath = new Map(loaded.map((source) => [resolve(source.path), source]));
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js"];
const aliases = tsconfigPaths(ROOT);
const resolveSpecifier = (from, specifier) => {
  const bases = specifier.startsWith(".")
    ? [resolve(dirname(from), specifier)]
    : aliases.flatMap(([prefix, targets]) =>
        specifier.startsWith(prefix) ? targets.map((target) => resolve(ROOT, target + specifier.slice(prefix.length))) : [],
      );
  for (const base of bases) {
    const target = EXTENSIONS.map((ext) => byPath.get(base + ext)).find(Boolean);
    if (target) return target;
  }
  return null;
};
/** A bare package name — `gsap`, `react`, `@scope/pkg` — is not an alias. */
const looksLikeAlias = (specifier) => /^(?:@\/|~\/|#)/.test(specifier) || aliases.some(([prefix]) => specifier.startsWith(prefix));
const stem = (path) => path.replace(/\\/g, "/").split("/").at(-1).replace(/\.[^.]+$/, "");

for (const source of loaded) source.importers = [];
for (const source of loaded) {
  for (const [, specifier] of source.code.matchAll(/\bimport\s+(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/g)) {
    if (!specifier.startsWith(".") && !looksLikeAlias(specifier)) continue;
    const target = resolveSpecifier(source.path, specifier);
    if (target && target !== source) {
      target.importers.push(source);
    } else if (!target && looksLikeAlias(specifier)) {
      const name = specifier.split("/").at(-1);
      for (const candidate of loaded) if (stem(candidate.path) === name) candidate.importersUnknown = true;
    }
  }
}

for (const source of sources) {
  source.registeredElsewhere = registered;

  for (const rule of RULES) {
    for (const finding of check(rule, source)) {
      findings.push(reported(source, finding));
    }
  }
}

// --- Report ------------------------------------------------------------------

const ORDER = { error: 0, warn: 1, info: 2 };
const ICON = { error: "✗", warn: "!", info: "i" };

findings.sort(
  (a, b) =>
    ORDER[a.level] - ORDER[b.level] ||
    a.file.localeCompare(b.file) ||
    a.line - b.line,
);

const shown = quiet ? findings.filter((f) => f.level === "error") : findings;

const READS = "the audit reads .ts, .tsx, .js, .jsx and .mjs, and the scripts of .vue, .svelte and .astro files";
if (notScanned.length === paths.length) {
  for (const path of notScanned) console.error(`Not scanned: ${path} — ${READS}.`);
  process.exit(2);
}

if (asJson) {
  console.log(JSON.stringify({ findings: shown, notScanned }, null, 2));
} else if (!shown.length) {
  console.log(
    findings.length
      ? `gsap-audit: no errors (${findings.length} lower-severity finding(s) hidden by --quiet)`
      : "gsap-audit: clean",
  );
} else {
  let current = "";
  for (const f of shown) {
    if (f.file !== current) {
      current = f.file;
      console.log(`\n${current}`);
    }
    console.log(`  ${ICON[f.level]} ${f.line}:  ${f.message}  [${f.rule}]`);
    console.log(`      ${f.hint}`);
  }

  const counts = ORDER;
  const tally = Object.keys(counts)
    .map((level) => [level, findings.filter((f) => f.level === level).length])
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${n} ${level}`)
    .join(", ");

  console.log(`\n${tally}`);
  /** Said here because a report that never mentions it reads as "there is no way". */
  console.log(
    "A deliberate finding is waived with `<rule-id>-ok` and a reason, on its line or in the eight above.",
  );
}

if (!asJson) {
  for (const path of notScanned) console.log(`Not scanned: ${path} — ${READS}.`);
}

process.exit(findings.some((f) => f.level === "error") ? 1 : 0);
