#!/usr/bin/env node

/**
 * Audits an SVG for GSAP animatability, before a single line of animation is
 * written.
 *
 * Every failure this reports is one that is silent at runtime: DrawSVG on a
 * fill-only path animates nothing and throws nothing; MorphSVG between a 4-node
 * and a 40-node path produces a lurch rather than an error; a `<circle>` handed
 * to either simply is not a path. Those are the bugs that cost an hour of
 * staring at a loader that "just doesn't move", so they are checked up front.
 *
 * Usage:
 *   node <skill-dir>/scripts/audit-svg.mjs <file.svg> [...]
 *   node <skill-dir>/scripts/audit-svg.mjs --morph a.svg b.svg
 *   node <skill-dir>/scripts/audit-svg.mjs --hues <file.svg>   # flag hue literals too
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// --- SVG parsing -------------------------------------------------------------

/** Shape elements GSAP can touch. `<g>` is structure, not geometry. */
const SHAPES = new Set([
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
]);

/** Everything but `<path>` must go through `MorphSVGPlugin.convertToPath()`. */
const NEEDS_CONVERT = new Set([
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
]);

const ATTR = /([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'/g;

function attrs(tagSource) {
  const out = {};
  for (const m of tagSource.matchAll(ATTR)) {
    out[m[1] ?? m[3]] = m[2] ?? m[4];
  }
  return out;
}

/** Strips comments and CDATA so their contents never read as markup. */
const strip = (svg) =>
  svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

function parse(svg) {
  const clean = strip(svg);
  const root = clean.match(/<svg\b([^>]*)>/i);
  const elements = [];

  for (const m of clean.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)\/?>/g)) {
    const tag = m[1].toLowerCase();
    if (!SHAPES.has(tag)) continue;
    elements.push({ tag, ...describe(tag, attrs(m[2])) });
  }

  /**
   * Illustrator and Figma put their paint in a `<style>` block keyed by
   * generated class names — `.st0 { fill: #ffd400 }` — rather than on the
   * elements. Scanning attributes alone therefore reports a clean SVG for the
   * export format most likely to arrive, which is the one case that has to
   * work.
   */
  const stylesheets = [...clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");

  return {
    root: root ? attrs(root[1]) : null,
    elements,
    stylesheets,
    styleHues: hues(stylesheets),
    /** Generated class names are meaningless and survive into the JSX paste. */
    generatedClasses: [
      ...new Set(
        [...clean.matchAll(/class\s*=\s*["']([^"']*)["']/g)]
          .flatMap((m) => m[1].split(/\s+/))
          .filter((c) => /^(st|cls)\d+$/.test(c)),
      ),
    ],
  };
}

// --- Per-element facts -------------------------------------------------------

/** Paint that resolves to nothing drawn. */
const isNone = (v) => !v || v === "none" || v === "transparent";

const PATH_COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/g;

function describe(tag, a) {
  const style = a.style ?? "";
  const styleOf = (prop) =>
    style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim();

  const stroke = a.stroke ?? styleOf("stroke");
  const fill = a.fill ?? styleOf("fill");

  return {
    id: a.id ?? null,
    stroke: stroke ?? null,
    fill: fill ?? null,
    /**
     * DrawSVG animates the stroke dash, so a shape with no stroke has nothing
     * to draw. An absent `stroke` attribute is not proof of absence — it may be
     * inherited or set in CSS — so that case is reported as unknown, not as a
     * failure.
     */
    drawable: stroke === undefined ? "unknown" : !isNone(stroke),
    filled: fill === undefined ? "unknown" : !isNone(fill),
    needsConvert: NEEDS_CONVERT.has(tag),
    nodes: tag === "path" ? (a.d?.match(PATH_COMMAND)?.length ?? 0) : null,
    /** `pathLength` rescales the dash maths and quietly breaks DrawSVG offsets. */
    pathLength: a.pathLength ?? null,
    hues: hues([a.fill, a.stroke, a["stop-color"], style].join(" ")),
  };
}

// --- Hue literals, for projects whose colours must be tokens -----------------

/**
 * Opt-in with `--hues`. Equal channels are greyscale and pass; anything else is
 * a hue. A project that requires colour to come from tokens, so it can follow a
 * theme, wants to hear about these before the paste — an inline SVG arrives
 * whole, and by lint time the literal is in forty attributes, not one. A
 * project without such a rule does not, which is why this is off by default.
 */
const HEX = /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g;
const FN = /(?<![a-zA-Z0-9])(rgba?|hsla?)\(([^()]*)\)/g;

function hues(text) {
  const found = new Set();

  for (const [literal] of text.matchAll(HEX)) {
    const body = literal.slice(1);
    const pairs =
      body.length === 3 || body.length === 4
        ? Array.from(body.slice(0, 3), (c) => c + c)
        : body.length === 6 || body.length === 8
          ? [0, 2, 4].map((i) => body.slice(i, i + 2))
          : null;
    if (!pairs) continue;
    const [r, g, b] = pairs.map((p) => Number.parseInt(p, 16));
    if (!(r === g && g === b)) found.add(literal);
  }

  for (const [literal, fn, body] of text.matchAll(FN)) {
    if (body.includes("var(")) continue;
    const args = body
      .split(/[,/\s]+/)
      .filter(Boolean)
      .map((v) => Number.parseFloat(v));
    if (args.length < 3 || args.slice(0, 3).some(Number.isNaN)) continue;
    const hue = fn.startsWith("hsl")
      ? args[1] !== 0
      : !(args[0] === args[1] && args[1] === args[2]);
    if (hue) found.add(literal);
  }

  return [...found];
}

// --- Report ------------------------------------------------------------------

const notes = [];
const note = (level, message) => notes.push({ level, message });

const DASH = "──";
const EMPTY = "—";

function audit(file) {
  const { root, elements, stylesheets, styleHues, generatedClasses } = parse(
    readFileSync(file, "utf8"),
  );

  console.log(`\n${DASH} ${basename(file)} ${DASH}`);

  if (!root) {
    note("error", `${basename(file)}: no <svg> root element found.`);
    return { elements: [] };
  }

  if (!root.viewBox) {
    note(
      "error",
      `${basename(file)}: no viewBox. MotionPath aligns in the SVG's own user units, so without one the coordinate system is the pixel size and the animation breaks the moment the SVG is scaled.`,
    );
  }
  if (root.width && /^\d+(px)?$/.test(root.width)) {
    note(
      "warn",
      `${basename(file)}: fixed width="${root.width}". Drop width/height and size it with CSS so the loader scales.`,
    );
  }

  console.log(
    `viewBox: ${root.viewBox ?? "MISSING"}   shapes: ${elements.length}`,
  );

  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    `\n  ${pad("tag", 9)}${pad("id", 18)}${pad("stroke", 9)}${pad("fill", 9)}${pad("nodes", 7)}convert`,
  );

  for (const el of elements) {
    const mark = (v) => (v === "unknown" ? "?" : v ? "yes" : "no");
    console.log(
      `  ${pad(el.tag, 9)}${pad(el.id ?? EMPTY, 18)}${pad(mark(el.drawable), 9)}${pad(mark(el.filled), 9)}${pad(el.nodes ?? EMPTY, 7)}${el.needsConvert ? "REQUIRED" : EMPTY}`,
    );

    const name = `<${el.tag}${el.id ? ` id="${el.id}"` : ""}>`;

    if (checkHues && el.hues.length) {
      note(
        "error",
        `${name} paints ${el.hues.join(", ")} — a hue literal the theme cannot reach. Use currentColor or one of the project's CSS variables.`,
      );
    }
    if (el.pathLength) {
      note(
        "warn",
        `${name} sets pathLength="${el.pathLength}", which rescales the dash maths DrawSVG relies on. Remove it.`,
      );
    }
  }

  // --- What these shapes make possible ---
  const convertible = elements.filter((e) => e.needsConvert);
  const drawable = elements.filter((e) => e.drawable === true);
  const unknownStroke = elements.filter((e) => e.drawable === "unknown");
  const identified = elements.filter((e) => e.id);

  console.log("");

  if (convertible.length) {
    const tags = [...new Set(convertible.map((e) => e.tag))];
    note(
      "action",
      `${convertible.length} non-path shape(s): ${tags.join(", ")}. Run MorphSVGPlugin.convertToPath("${tags.join(", ")}") once before animating, or convert them in the source file.`,
    );
  }
  if (!drawable.length && !unknownStroke.length) {
    note(
      "warn",
      "Nothing here has a stroke, so DrawSVG has nothing to animate. Either add strokes, or reach for MorphSVG / MotionPath / opacity instead.",
    );
  }
  if (unknownStroke.length) {
    note(
      "info",
      `${unknownStroke.length} shape(s) declare no stroke attribute — they may inherit one from CSS. Confirm in the browser before assuming DrawSVG will work.`,
    );
  }
  if (!identified.length) {
    note(
      "action",
      "No element carries an id. Add one to every shape the timeline targets — selector strings scoped to the component root are what keep the hook readable.",
    );
  }

  if (checkHues && styleHues.length) {
    note(
      "error",
      `The <style> block paints ${styleHues.join(", ")} — hue literals the theme cannot reach once the SVG is inlined, and an attribute-only scan of the JSX will not show them. Move the paint onto the elements as currentColor or one of the project's CSS variables.`,
    );
  }
  if (generatedClasses.length) {
    note(
      "action",
      `Generated class names from the export tool: ${generatedClasses.join(", ")}. They carry no meaning, they collide between two inlined SVGs on one page, and in JSX they must be renamed to className. Replace them with fill/stroke attributes.`,
    );
  }
  if (stylesheets.includes("@") || /\bclass\s*=/.test(stylesheets)) {
    note(
      "info",
      "This SVG styles itself from an internal <style> block. Tailwind does not compile it and the theme cannot reach it — convert it to attributes before inlining.",
    );
  }

  return { elements };
}

// --- Morph pair comparison ---------------------------------------------------

function compareMorph(a, b) {
  const paths = (r) => r.elements.filter((e) => e.tag === "path");
  const [pa, pb] = [paths(a), paths(b)];

  console.log(`\n${DASH} morph pair ${DASH}`);

  if (pa.length !== 1 || pb.length !== 1) {
    note(
      "warn",
      `Morph compares one path to one path; got ${pa.length} and ${pb.length}. MorphSVG animates a single d attribute, so a multi-path shape needs one tween per path.`,
    );
  }

  const [na, nb] = [pa[0]?.nodes ?? 0, pb[0]?.nodes ?? 0];
  const ratio = Math.max(na, nb) / Math.max(1, Math.min(na, nb));
  console.log(`  nodes: ${na} vs ${nb}   ratio: ${ratio.toFixed(1)}x`);

  if (ratio > 3) {
    note(
      "warn",
      `Node counts differ ${ratio.toFixed(1)}x. MorphSVG subdivides the simpler path to match, which is correct but can read as a smear. Try shapeIndex, or map: "complexity".`,
    );
  }
  note(
    "info",
    'Morph rotation is decided by shapeIndex. Find the right one with MorphSVGPlugin.findShapeIndex("#from", "#to") in the browser console, then hardcode it — the default is a guess and is usually wrong for a logo.',
  );
}

// --- Run ---------------------------------------------------------------------

const argv = process.argv.slice(2);
const morph = argv.includes("--morph");
/** Read by `audit()`, which only runs below this line. */
const checkHues = argv.includes("--hues");
const files = argv.filter((a) => !a.startsWith("--"));

if (!files.length) {
  console.error(
    "Usage: audit-svg.mjs [--hues] <file.svg> [...]\n       audit-svg.mjs [--hues] --morph <from.svg> <to.svg>",
  );
  process.exit(1);
}

const results = files.map(audit);
if (morph && results.length === 2) compareMorph(results[0], results[1]);

const ICON = { error: "✗", warn: "!", action: "→", info: "i" };
const ORDER = ["error", "warn", "action", "info"];

if (notes.length) {
  console.log(`\n${DASH} findings ${DASH}`);
  for (const level of ORDER) {
    for (const n of notes.filter((x) => x.level === level)) {
      console.log(`  ${ICON[level]} ${n.message}`);
    }
  }
} else {
  console.log("\nNo findings — this SVG is ready to animate.");
}

process.exit(notes.some((n) => n.level === "error") ? 1 : 0);
