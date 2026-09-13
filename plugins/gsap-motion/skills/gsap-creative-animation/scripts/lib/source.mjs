/**
 * Source reading for the GSAP audit.
 *
 * Every helper here exists because naive matching produces false findings, and
 * a checker that cries wolf is one people switch off. Comments are stripped
 * before any rule runs — well-commented animation code explains itself at length, and
 * a docblock saying "do not use `gsap.to` in a pointermove handler" would
 * otherwise be reported as doing exactly that.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

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
      } else if (c === '"' || c === "'" || c === "`") {
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
 * The `{ … }` block that opens at or after `from`, as a `[start, end]` pair.
 *
 * Used to ask "is this call inside that handler?" without a parser. Quotes are
 * tracked so a brace inside a string cannot close the block early; comments are
 * already gone by the time this runs.
 */
export function blockAfter(source, from) {
  const start = source.indexOf("{", from);
  if (start === -1) return null;

  let depth = 0;
  let quote = "";

  for (let i = start; i < source.length; i += 1) {
    const c = source[i];

    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return [start, i];
    }
  }

  return null;
}

/** Whether `index` falls inside any of the given `[start, end]` spans. */
export const within = (spans, index) =>
  spans.some(([start, end]) => index > start && index < end);

/**
 * The `( … )` of a call, as a `[start, end]` pair, given the index of its
 * opening paren. Quotes are tracked the same way `blockAfter` tracks them.
 */
export function parenSpan(source, open) {
  let depth = 0;
  let quote = "";

  for (let i = open; i < source.length; i += 1) {
    const c = source[i];

    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return [open, i];
    }
  }

  return null;
}

/**
 * Spans of every `useGSAP(…)`, `gsap.context(…)` and `contextSafe(…)` call.
 *
 * Anything created outside these is outside the context that reverts it, which
 * is the single most common way an animation outlives its component.
 *
 * The span is the call's parentheses, not the first `{` after its name. The
 * first brace failed silently twice over: a bodiless `useGSAP()` — the usual
 * way to get `contextSafe` — claimed whatever block came next in the file, so an
 * orphaned tween in the handler below it read as owned; and an expression-bodied
 * `contextSafe(() => gsap.to(el, { … }))` measured as the tween's own vars
 * object, which the call itself sits in front of.
 *
 * `contextSafe` counts because it is a context: a wrapped function's tweens are
 * added to the one `useGSAP` created.
 */
export function contextSpans(code) {
  const spans = [];
  for (const match of code.matchAll(
    /\b(?:useGSAP|gsap\.context|contextSafe)\s*\(/g,
  )) {
    const span = parenSpan(code, match.index + match[0].length - 1);
    if (span) spans.push(span);
  }
  return spans;
}

/** A file plus everything the rules need, read once. */
export function load(path, root) {
  const raw = readFileSync(path, "utf8");
  const code = stripComments(raw);

  return {
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
    contexts: contextSpans(code),
  };
}
