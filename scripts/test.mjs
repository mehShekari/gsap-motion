#!/usr/bin/env node

/**
 * Runs every `*.test.mjs` in the repository through `node --test`.
 *
 * The file list is built here rather than passed as a glob. Node only expands
 * globs in `--test` arguments from version 21, and shells disagree about
 * expanding them at all — so a glob would quietly run nothing on the Node 18
 * and 20 CI jobs that exist to prove the skill's stated compatibility.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/**
 * `.cache` holds the precision corpus's cloned projects, which carry test files
 * of their own that are not this repository's to run.
 */
const SKIP = new Set(["node_modules", ".git", ".next", "results", ".cache"]);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".test.mjs") ? [full] : [];
  });

const files = walk(ROOT).sort();

if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

console.log(
  `Running ${files.length} test file(s):\n${files
    .map((file) => `  ${relative(ROOT, file)}`)
    .join("\n")}\n`,
);

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
