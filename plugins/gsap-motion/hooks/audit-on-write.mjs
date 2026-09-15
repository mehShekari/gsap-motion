#!/usr/bin/env node

/**
 * Runs the audit on an animation file as soon as it is written, and hands the
 * findings back.
 *
 * The refinement loop in reference/refine.md starts with "audit what you just
 * wrote". Remembering to do that is exactly the kind of step that gets skipped
 * on the tenth edit of a long session, so it does not depend on memory: this
 * runs on every Edit and Write, and says nothing at all unless the file it
 * touched both uses GSAP and has something wrong with it.
 *
 * Silence is the normal case, on purpose. A hook that reports "clean" after
 * every edit teaches the reader to skim past it.
 *
 * Contract (Claude Code plugin hooks): stdin carries the tool call as JSON,
 * with the edited file at `tool_input.file_path`; exit 0 with
 * `hookSpecificOutput.additionalContext` puts text in front of Claude without
 * blocking the edit, which is right here — the finding is information, and the
 * decision about it belongs to whoever is reading.
 */
import { relative, resolve } from "node:path";

/**
 * Kept as a URL, and imported as one: on Windows a drive-letter path is not a
 * valid module specifier, and this ran there first.
 */
const SKILL = new URL("../skills/gsap-creative-animation/scripts/lib/", import.meta.url);
const lib = (file) => import(new URL(file, SKILL).href);

/** Nothing here is worth failing an edit over: any surprise exits quietly. */
const quiet = () => process.exit(0);

const stdin = await new Promise((done) => {
  let text = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    text += chunk;
  });
  process.stdin.on("end", () => done(text));
  process.stdin.on("error", () => done(""));
});

let call;
try {
  call = JSON.parse(stdin);
} catch {
  quiet();
}

const path = call?.tool_input?.file_path;
if (typeof path !== "string" || path.length === 0) quiet();

const { check, mentionsGsap, notParsed } = await lib("audit.mjs");
const { pluginRegistrations, RULES } = await lib("rules.mjs");
const { hasSourceExtension, load } = await lib("source.mjs");

if (!hasSourceExtension(path)) quiet();

const root = typeof call.cwd === "string" && call.cwd ? call.cwd : process.cwd();

let file;
try {
  file = load(resolve(path), root);
} catch {
  /** Deleted, renamed, unreadable: the edit is already done and this is not the place to complain. */
  quiet();
}

if (!mentionsGsap(file)) quiet();

const findings = [];

if (file.parseError) {
  const finding = notParsed(file);
  if (finding) findings.push(finding);
} else {
  file.registeredElsewhere = new Set(pluginRegistrations(file));
  for (const rule of RULES) findings.push(...check(rule, file));
}

if (findings.length === 0) quiet();

const ORDER = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.line - b.line);

/** Enough to act on, not so much that it buries the edit that caused it. */
const SHOWN = 8;
const shown = findings.slice(0, SHOWN);
const name = relative(root, resolve(path)).replace(/\\/g, "/") || path;

const lines = shown.map(
  (finding) => `  ${finding.level} ${finding.line}: ${finding.message} [${finding.rule}]\n    ${finding.hint}`,
);
if (findings.length > shown.length) {
  lines.push(`  …and ${findings.length - shown.length} more; run the audit on the file to see them.`);
}

const errors = findings.filter((finding) => finding.level === "error").length;

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: [
        `gsap-motion audited ${name} after this edit and found ${findings.length} thing(s)${errors ? `, ${errors} at error level` : ""}:`,
        ...lines,
        errors
          ? "An error-level finding fails `gsap-motion audit --quiet`, so it would fail a build that gates on it. Fix it, or waive it with `<rule-id>-ok` and a reason."
          : "These are warnings: judge them. A deliberate one is waived with `<rule-id>-ok` and a reason.",
      ].join("\n"),
    },
  }),
);
