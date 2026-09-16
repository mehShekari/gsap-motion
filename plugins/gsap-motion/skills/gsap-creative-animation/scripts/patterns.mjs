#!/usr/bin/env node
/**
 * patterns — what a project has proven, and what it has only tried.
 *
 * A skill that writes down whatever it just invented teaches itself its own
 * mistakes: a bad pattern, once loaded as guidance, repeats in every session
 * after it. So a pattern's standing is not something it can claim. It is
 * counted from evidence recorded in the project's own ANIMATION.md:
 *
 *   experimental  built once, verified, offered in an answer. Never written.
 *   candidate     the user put it in the file. Mentionable, never a default.
 *   validated     used again, in another component, each use with its commit.
 *   canonical     a named person reviewed it.
 *   retired       disproved, kept with the reason so it is not reinvented.
 *
 * `validated` is computed here rather than asserted there, and `canonical`
 * needs a name, because those are the two a keen assistant would otherwise
 * grant itself. This command only reads and reports; it never edits the file.
 *
 * Node.js 22+, no dependencies.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STATUSES = ["experimental", "candidate", "validated", "canonical", "retired"];

/** How many separate components a pattern must appear in to be validated. */
export const USES_FOR_VALIDATED = 2;

const FIELDS = {
  concept: "concept",
  fixed: "fixed",
  parameters: "parameters",
  "not when": "notWhen",
  "reduced motion": "reducedMotion",
  "verified against": "verifiedAgainst",
  "reviewed by": "reviewedBy",
  why: "why",
  status: "status",
  uses: "uses",
};

/**
 * Read the Patterns section of an ANIMATION.md.
 *
 * The format is what a person would write by hand — a heading per pattern and a
 * bold-labelled list under it — because a format nobody will write is a format
 * nothing will be recorded in. A field may wrap over several lines.
 */
export function parse(markdown) {
  const lines = markdown.split(/\r?\n/);
  const entries = [];

  let inSection = false;
  let entry = null;
  let field = null;

  const closeField = () => {
    if (entry && field && entry.fields[field] !== undefined) {
      entry.fields[field] = entry.fields[field].trim();
    }
    field = null;
  };

  for (const line of lines) {
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const [, hashes, title] = heading;
      if (hashes === "##") {
        closeField();
        entry = null;
        inSection = /^patterns\b/i.test(title.trim());
        continue;
      }
      if (inSection) {
        closeField();
        entry = { name: title.trim(), status: null, fields: {}, uses: [] };
        entries.push(entry);
      }
      continue;
    }
    if (!inSection || !entry) continue;

    const labelled = /^\s*-\s+\*\*(.+?):\*\*\s*(.*)$/.exec(line);
    if (labelled) {
      closeField();
      const key = FIELDS[labelled[1].trim().toLowerCase()];
      if (!key) continue;
      if (key === "status") {
        entry.status = labelled[2].trim().toLowerCase() || null;
        continue;
      }
      if (key === "uses") {
        field = "uses";
        continue;
      }
      field = key;
      entry.fields[key] = labelled[2];
      continue;
    }

    /** A use: a file, the commit it landed in, and what was checked. */
    const use = /^\s+-\s+`([^`]+)`\s*[—-]\s*`([^`]+)`\s*(?:[—-]\s*(.*))?$/.exec(line);
    if (use && field === "uses") {
      entry.uses.push({ file: use[1].trim(), commit: use[2].trim(), note: (use[3] ?? "").trim() });
      continue;
    }

    /** A continuation of the field above, wrapped by a person or a formatter. */
    if (field && field !== "uses" && /^\s+\S/.test(line)) {
      entry.fields[field] = `${entry.fields[field] ?? ""} ${line.trim()}`;
    }
  }
  closeField();

  return entries;
}

/** Components, not lines: two commits to one file is one pattern used once. */
const distinctUses = (entry) => new Set(entry.uses.map((use) => use.file)).size;

const REQUIRED = ["concept", "notWhen", "reducedMotion", "verifiedAgainst"];
const LABEL = {
  concept: "concept",
  notWhen: "not when",
  reducedMotion: "reduced motion",
  verifiedAgainst: "verified against",
};

/**
 * What the section gets wrong.
 *
 * Errors are claims the evidence does not support; warnings are entries that
 * are fine but should not be in the file yet. Nothing here is a judgement about
 * whether the pattern is any good.
 */
export function check(entries, { uses = USES_FOR_VALIDATED } = {}) {
  const found = [];
  const at = (entry, level, message) => found.push({ name: entry.name, level, message });

  for (const entry of entries) {
    if (!entry.status) {
      at(entry, "error", `"${entry.name}" has no status. One of: ${STATUSES.join(", ")}.`);
      continue;
    }
    if (!STATUSES.includes(entry.status)) {
      at(
        entry,
        "error",
        `"${entry.name}": ${entry.status} is not a status. One of: ${STATUSES.join(", ")}.`,
      );
      continue;
    }

    if (entry.status === "retired") {
      /** A retired pattern is kept only so it is not reinvented, so it owes one thing. */
      if (!entry.fields.why) {
        at(entry, "error", `"${entry.name}" is retired but does not say why it was retired.`);
      }
      continue;
    }

    if (entry.status === "experimental") {
      at(
        entry,
        "warn",
        `"${entry.name}" is experimental, which is offered, not written. ` +
          "Make it a candidate when it is accepted, or take it out.",
      );
      continue;
    }

    const missing = REQUIRED.filter((key) => !entry.fields[key]);
    if (missing.length) {
      at(
        entry,
        "error",
        `"${entry.name}" is missing: ${missing.map((key) => LABEL[key]).join(", ")}.`,
      );
    }

    if (entry.status === "validated" || entry.status === "canonical") {
      const count = distinctUses(entry);
      if (count < uses) {
        at(
          entry,
          "error",
          `"${entry.name}" claims ${entry.status} with ${count} recorded use${count === 1 ? "" : "s"}. ` +
            `${uses} in separate components are needed, each with its file and commit.`,
        );
      }
    }

    if (entry.status === "canonical" && !entry.fields.reviewedBy) {
      at(
        entry,
        "error",
        `"${entry.name}" claims canonical with nobody named. Add "Reviewed by".`,
      );
    }
  }

  return found;
}

const asVersion = (text) => {
  const found = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text ?? "");
  return found ? [Number(found[1]), Number(found[2]), Number(found[3] ?? 0)] : null;
};

/**
 * Patterns verified against a GSAP older than the installed one.
 *
 * They stay loaded — a pattern does not stop working because a minor version
 * shipped — but they are marked, because the claim behind them was checked
 * against something else. A patch difference is not worth a word.
 */
export function stale(entries, { gsap } = {}) {
  const installed = asVersion(gsap);
  if (!installed) return [];

  const found = [];
  for (const entry of entries) {
    if (entry.status === "retired") continue;
    const verified = asVersion(entry.fields.verifiedAgainst);
    if (!verified) continue;
    const older = verified[0] < installed[0] || (verified[0] === installed[0] && verified[1] < installed[1]);
    if (older) {
      found.push({
        name: entry.name,
        level: "warn",
        message:
          `"${entry.name}" was verified against gsap ${verified[0]}.${verified[1]}, ` +
          `and ${gsap} is installed. Re-verify it, or record the version you checked.`,
      });
    }
  }
  return found;
}

/**
 * Candidates that have earned validated.
 *
 * Proposed, never applied: the skill offers a promotion with its evidence and a
 * person accepts it. Canonical is absent on purpose — no amount of use earns a
 * review.
 */
export function promotable(entries, { uses = USES_FOR_VALIDATED } = {}) {
  return entries
    .filter((entry) => entry.status === "candidate" && distinctUses(entry) >= uses)
    .filter((entry) => REQUIRED.every((key) => entry.fields[key]))
    .map((entry) => ({
      name: entry.name,
      to: "validated",
      uses: distinctUses(entry),
      files: [...new Set(entry.uses.map((use) => use.file))],
    }));
}

// --- The command ---------------------------------------------------------------

const installedGsap = (root) => {
  for (const path of ["node_modules/gsap/package.json", "package.json"]) {
    try {
      const json = JSON.parse(readFileSync(resolve(root, path), "utf8"));
      const version = path.endsWith("gsap/package.json")
        ? json.version
        : json.dependencies?.gsap ?? json.devDependencies?.gsap;
      if (version) return String(version).replace(/^[\^~]/, "");
    } catch {
      /** No package.json, or no gsap in it: there is simply nothing to compare. */
    }
  }
  return null;
};

export function report(entries, findings, { file, json, quiet }) {
  if (json) {
    return JSON.stringify({ file, patterns: entries.length, findings }, null, 2);
  }

  /**
   * In a lint script, a check with nothing to say should say nothing. Errors
   * still print, because they are why the run fails.
   */
  if (quiet) {
    const errors = findings.filter((finding) => finding.level === "error");
    return errors.map((finding) => `  error  ${finding.message}`).join("\n");
  }

  const lines = [];
  if (!entries.length) {
    lines.push(`No Patterns section in ${file}.`);
    lines.push("Nothing to check. A pattern is written there once it has been accepted.");
    return lines.join("\n");
  }

  const by = (status) => entries.filter((entry) => entry.status === status).length;
  lines.push(`${entries.length} pattern${entries.length === 1 ? "" : "s"} in ${file}`);
  lines.push(
    "  " +
      STATUSES.map((status) => `${by(status)} ${status}`)
        .filter((part) => !part.startsWith("0 "))
        .join(" · "),
  );

  if (findings.length) {
    lines.push("");
    for (const finding of findings) {
      lines.push(`  ${finding.level === "error" ? "error" : " warn"}  ${finding.message}`);
    }
  }

  const ready = promotable(entries);
  if (ready.length) {
    lines.push("", "Earned a promotion — yours to grant, with the evidence:");
    for (const entry of ready) {
      lines.push(`  ${entry.name} → validated (${entry.uses} uses: ${entry.files.join(", ")})`);
    }
  }

  if (!findings.length) lines.push("", "patterns: clean");
  return lines.join("\n");
}

async function main(argv) {
  const json = argv.includes("--json");
  const quiet = argv.includes("--quiet");
  const rest = argv.filter(
    (argument) => !["--json", "--quiet", "check"].includes(argument),
  );
  const file = rest[0] ?? "ANIMATION.md";
  const root = process.cwd();

  let markdown;
  try {
    markdown = readFileSync(resolve(root, file), "utf8");
  } catch {
    console.error(`Cannot read ${file}. Pass the path to your ANIMATION.md.`);
    process.exit(2);
  }

  const entries = parse(markdown);
  const findings = [...check(entries), ...stale(entries, { gsap: installedGsap(root) })];
  const text = report(entries, findings, { file, json, quiet });
  if (text) console.log(text);
  process.exit(findings.some((finding) => finding.level === "error") ? 1 : 0);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main(process.argv.slice(2));
