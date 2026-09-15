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

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".vue",
  ".svelte",
  ".astro",
]);

/** A single-file component: only its `<script>` blocks are code. */
const SINGLE_FILE = /\.(?:vue|svelte|astro)$/;
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

/**
 * A single-file component with everything outside its `<script>` blocks blanked
 * out, keeping every newline and every offset — so what reaches the parser is
 * JavaScript, and a finding still points at the right line of the `.vue`,
 * `.svelte` or `.astro` file.
 *
 * A `<script>` whose `type` is not JavaScript — JSON-LD, an import map, a
 * template — is blanked with the markup. Astro's `---` frontmatter runs on the
 * server and animates nothing, so it is left out too; the client `<script>` is
 * what this reads.
 */
export function scriptsOnly(raw) {
  const blank = (text) => text.replace(/[^\n]/g, " ");
  const JAVASCRIPT = /^(?:module|text\/javascript|application\/javascript|ts|tsx)$/i;
  const open = /<script\b([^>]*)>/gi;

  let out = "";
  let index = 0;

  for (let tag = open.exec(raw); tag; tag = open.exec(raw)) {
    const start = tag.index + tag[0].length;
    const close = raw.indexOf("</script", start);
    const end = close === -1 ? raw.length : close;
    const type = tag[1].match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1];
    const code = !type || JAVASCRIPT.test(type.trim());

    out += blank(raw.slice(index, start));
    out += code ? raw.slice(start, end) : blank(raw.slice(start, end));
    index = end;
    open.lastIndex = end;
  }

  return out + blank(raw.slice(index));
}

/**
 * A file plus everything the rules need, from its text.
 *
 * The command line reads the text from disk, through `load`. The ESLint plugin
 * passes the text ESLint already holds, with the file's path, so both entry
 * points run the rules on the same parse of the same characters.
 */
export function fromText(raw, path, display = path) {
  const source = SINGLE_FILE.test(path) ? scriptsOnly(raw) : raw;
  const code = stripComments(source);

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
        parsed = { ...parse(source, path), error: null };
      } catch (error) {
        parsed = {
          ast: null,
          comments: [],
          error: {
            message: error.message,
            line: error.loc?.line ?? 1,
            column: error.loc?.column ?? 0,
          },
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
    display,
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

/** A file on disk, read once, shown by its path from `root`. */
export function load(path, root) {
  return fromText(
    readFileSync(path, "utf8"),
    path,
    relative(root, path).replace(/\\/g, "/"),
  );
}

/** Whether `collect` reads files with this path's extension. */
export function hasSourceExtension(path) {
  return SOURCE_EXTENSIONS.has(extname(path));
}
