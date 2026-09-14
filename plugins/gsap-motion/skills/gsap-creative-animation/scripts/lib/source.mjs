/**
 * Source reading for the GSAP audit: finding the files, and reading each one
 * once into what the rules need.
 *
 * Rules read the syntax tree. A few facts about the whole file — is it React,
 * does it use GSAP — are still read from its text with the comments blanked
 * out, because well-commented animation code explains itself at length, and a
 * docblock that mentions `@gsap/react` is not an import of it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { parse } from "./ast.mjs";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
]);

/** Every source file under `root`, or `root` itself when it is a file. */
export function collect(root) {
  if (statSync(root).isFile()) return [root];

  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(full);
    }
  };

  walk(root);
  return files.sort();
}

/**
 * Whether the character at `i` opens a string literal.
 *
 * An apostrophe between two word characters never does: that is JSX text —
 * `<p>Don't</p>` — and in code it would be a syntax error. Read as an opening
 * quote, it inverted every string and comment after it, so a comment survived
 * stripping and a call's span ran past its own closing parenthesis. A backtick
 * after a word character is left alone: that is a tagged template.
 */
export function opensString(source, i) {
  const c = source[i];
  if (c !== '"' && c !== "'" && c !== "`") return false;
  const word = (ch) => ch !== undefined && /\w/.test(ch);
  return !(c === "'" && word(source[i - 1]) && word(source[i + 1]));
}

/**
 * Replaces comment bodies with spaces, keeping every newline and every offset.
 *
 * Offsets are preserved rather than the text being cut out, so an index into
 * the returned string is still an index into the original and `lineAt` stays
 * correct. Blanking also means a rule cannot accidentally join two tokens that
 * a comment sat between.
 */
export function stripComments(source) {
  const out = source.split("");
  let mode = "code";
  let quote = "";

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];

    if (mode === "code") {
      if (c === "/" && next === "/") {
        mode = "line";
        out[i] = " ";
        out[i + 1] = " ";
        i += 1;
      } else if (c === "/" && next === "*") {
        mode = "block";
        out[i] = " ";
        out[i + 1] = " ";
        i += 1;
      } else if (opensString(source, i)) {
        mode = "string";
        quote = c;
      }
      continue;
    }

    if (mode === "line") {
      if (c === "\n") mode = "code";
      else out[i] = " ";
      continue;
    }

    if (mode === "block") {
      if (c === "*" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        i += 1;
        mode = "code";
      } else if (c !== "\n") {
        out[i] = " ";
      }
      continue;
    }

    // Inside a string literal: left intact, but escapes must not end it early.
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (c === quote) mode = "code";
  }

  return out.join("");
}

/** 1-indexed line number for a character offset. */
export function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

/** A file plus everything the rules need, read once. */
export function load(path, root) {
  const raw = readFileSync(path, "utf8");
  const code = stripComments(raw);

  /**
   * Parsed on first use, and once. Most files in a project never mention GSAP,
   * and the run skips those before any rule asks for a tree. A file that does
   * not parse keeps `ast: null` and says why in `parseError`, so it can be
   * reported as not checked rather than passed as clean.
   */
  let parsed;
  const tree = () => {
    if (parsed === undefined) {
      try {
        parsed = { ...parse(raw, path), error: null };
      } catch (error) {
        parsed = {
          ast: null,
          comments: [],
          error: { message: error.message, line: error.loc?.line ?? 1 },
        };
      }
    }
    return parsed;
  };

  return {
    get ast() {
      return tree().ast;
    },
    get comments() {
      return tree().comments;
    },
    get parseError() {
      return tree().error;
    },
    path,
    display: relative(root, path).replace(/\\/g, "/"),
    raw,
    code,
    /**
     * "Can this mount more than once?" rather than literally "is this JSX".
     *
     * A hook lives in a `.ts` file and often imports only `@gsap/react`, never
     * `react` itself — so matching on the extension or a React import alone
     * misses exactly the files where the component-instance rules matter most.
     */
    isReact:
      /\.(tsx|jsx)$/.test(path) ||
      /\bfrom ["']react["']/.test(code) ||
      /\bfrom ["']@gsap\/react["']/.test(code),
    isClient: /^\s*["']use client["']/m.test(code),
    usesGsap: /\bfrom ["']gsap(?:\/|["'])/.test(code),
  };
}
