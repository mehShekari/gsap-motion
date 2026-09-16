#!/usr/bin/env node
/**
 * review — the visual audit: what the motion actually did, measured.
 *
 * `audit` reads the source and says what is likely wrong. `inspect` watches and
 * reports what it saw. This sits between them: it watches, and then draws
 * conclusions that can be checked — time to first motion, how much of the screen
 * moves at once, motion over text being read, loop seams, and layout work per
 * frame.
 *
 * It does not read `gsap.globalTimeline`. A bundled app never publishes `gsap`,
 * so an audit built on the timeline would work on demo pages and fail on real
 * ones. Everything here comes from sampling the DOM: every frame, the box,
 * opacity and transform of each element that can move, diffed against the frame
 * before. That sees CSS and Web Animations motion too, which the source audit
 * cannot see at all.
 *
 * What it does not do is judge taste. Composition, rhythm and visual quality are
 * for a reviewer looking at the filmstrip; this reports evidence, with the time
 * and the element, and leaves the verdict to them.
 *
 * Node.js 22+, no dependencies, whatever Chrome the machine already has.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { connect, findChrome } from "./capture-motion.mjs";

// --- What a recording means ---------------------------------------------------

/** The first moment anything moved, or null when nothing ever did. */
export function firstMotion(log) {
  return log.length ? log[0].at : null;
}

/**
 * The share of the viewport in motion.
 *
 * Summing the boxes is wrong and wildly so: on a real page the moving elements
 * are nested, and the first spike reported 34 viewports in motion on a viewport
 * that has one. This is the area of their union, clipped to the screen — the
 * fraction a viewer would say is moving.
 *
 * The union is computed by sweeping the distinct x edges and, for each strip,
 * merging the y ranges that cover it. With the handful of boxes a frame holds,
 * that is exact and fast enough to run per frame.
 */
export function coverage(boxes, viewport) {
  const clipped = [];
  for (const [x, y, width, height] of boxes) {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(viewport.width, x + width);
    const y1 = Math.min(viewport.height, y + height);
    if (x1 > x0 && y1 > y0) clipped.push([x0, y0, x1, y1]);
  }
  if (!clipped.length) return 0;

  const edges = [...new Set(clipped.flatMap(([x0, , x1]) => [x0, x1]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < edges.length - 1; i += 1) {
    const left = edges[i];
    const right = edges[i + 1];
    const width = right - left;
    if (!width) continue;

    const spans = clipped
      .filter(([x0, , x1]) => x0 <= left && x1 >= right)
      .map(([, y0, , y1]) => [y0, y1])
      .sort((a, b) => a[0] - b[0]);

    let covered = 0;
    let openFrom = null;
    let openTo = null;
    for (const [y0, y1] of spans) {
      if (openTo === null || y0 > openTo) {
        if (openTo !== null) covered += openTo - openFrom;
        openFrom = y0;
        openTo = y1;
      } else if (y1 > openTo) {
        openTo = y1;
      }
    }
    if (openTo !== null) covered += openTo - openFrom;
    area += width * covered;
  }

  return Math.round((area / (viewport.width * viewport.height)) * 1000) / 1000;
}

/**
 * Where a loop jumps instead of travelling.
 *
 * A seam is a frame whose step is unlike every other step: a marquee that
 * restarts at zero rather than being carried back, and shows a tear. Easing is
 * not a seam, which is why this compares against the median step rather than
 * the mean — an eased tween's steps vary smoothly, and no single one stands out
 * against the middle of the distribution.
 *
 * A ratio alone is not enough. A nearly-still element has a median step of a
 * fraction of a pixel, so the smallest wobble is many times it: the first run
 * against a real page reported an orbiting dot that moved 7.6px. A tear has to
 * be big enough to see, so a seam is both unlike its neighbours and at least
 * `least` pixels.
 */
export function seams(track, { factor = 6, minimum = 4, least = 16 } = {}) {
  if (track.length < minimum) return [];

  const steps = [];
  /**
   * From index 2: a track begins when the element first moves, so its first
   * step is the leap out of rest that a `from` tween makes when it sets its
   * starting offset. A real page reported every such entrance as a 633px tear.
   */
  for (let i = 2; i < track.length; i += 1) {
    steps.push({ at: track[i].at, delta: Math.abs(track[i].x - track[i - 1].x) });
  }
  if (!steps.length) return [];

  const sorted = [...steps].map((step) => step.delta).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  /** A still element has no normal step to be unlike, so nothing is a seam. */
  if (!median) return [];

  return steps
    .filter((step) => step.delta > median * factor && step.delta >= least)
    .map((step) => ({ at: step.at, jump: Math.round(step.delta * 10) / 10 }));
}

/** How much of `a` lies under `b`, as a share of `a`. */
const overlap = ([ax, ay, aw, ah], [bx, by, bw, bh]) => {
  const width = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const height = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / (aw * ah);
};

/**
 * Motion passing over text a reader is in the middle of.
 *
 * A shared edge is not a problem — a rule sliding under a heading covers a few
 * pixels of it — so this only reports motion over a quarter of the line or
 * more. An element moving over itself is not motion over text, or every reveal
 * of a paragraph would be reported.
 */
export function motionOverText(moving, text, { least = 0.25, visible = 0.5 } = {}) {
  const found = [];
  for (const line of text) {
    for (const mover of moving) {
      if (mover.key === line.key) continue;
      /** A sheet at two percent opacity is over the text but not in the way. */
      if (mover.opacity !== undefined && mover.opacity < visible) continue;
      /**
       * Nor is a wrapper that paints nothing. Geometry cannot tell a positioning
       * box from a sheet: on a real page a transparent full-screen div was
       * reported as covering every line on it. The page is asked whether the
       * element paints at all, and only then is it in the way.
       */
      if (mover.paints === false) continue;
      /**
       * When the page hit-tested the line, believe it: `covered` is the element
       * actually painted on top of it, and null means nothing is.
       */
      if (line.covered !== undefined && mover.id !== line.covered) continue;
      const share = overlap(line.box, mover.box);
      if (share >= least) {
        found.push({
          text: line.key,
          over: mover.key,
          share: Math.round(share * 100) / 100,
        });
      }
    }
  }
  return found;
}

/**
 * Seams that a scroll did not cause.
 *
 * Jumping the scrollbar is how this tool reaches a scene, and a scrubbed
 * animation answers an instant scroll by moving instantly — correctly. A real
 * page reported 575px and 77px tears at the exact moment of the scroll, which
 * says something about how it was driven, not about the animation. Anything
 * within `settle` of a frame that scrolled is therefore not reported.
 */
export function afterScroll(found, scrolledAt, { settle = 300 } = {}) {
  return found.filter((seam) => !scrolledAt.some((at) => seam.at >= at && seam.at - at <= settle));
}

/**
 * One lurch is one finding, however many elements were in it.
 *
 * Elements that move together tear together: a real page reported five rects
 * jumping 25-30px, which reads as five problems and is one. Seams within
 * `window` of each other are the same event, and the reader is told how many
 * elements were in it.
 */
export function seamEvents(torn, { window = 50 } = {}) {
  const flat = torn.flatMap((element) =>
    element.seams.map((seam) => ({ key: element.key, at: seam.at, jump: seam.jump })),
  );
  flat.sort((a, b) => a.at - b.at);

  const events = [];
  for (const seam of flat) {
    const open = events.at(-1);
    if (open && seam.at - open.at <= window) {
      open.elements.add(seam.key);
      open.least = Math.min(open.least, seam.jump);
      open.most = Math.max(open.most, seam.jump);
      continue;
    }
    events.push({
      at: seam.at,
      elements: new Set([seam.key]),
      least: seam.jump,
      most: seam.jump,
    });
  }

  return events.map((event) => ({
    at: event.at,
    count: event.elements.size,
    example: [...event.elements][0],
    least: event.least,
    most: event.most,
  }));
}

/** Each element and the moment it first moved, in that order. */
export function starts(log) {
  const first = new Map();
  for (const frame of log) {
    for (const moved of frame.moved) {
      if (!first.has(moved.key)) first.set(moved.key, frame.at);
    }
  }
  return [...first].map(([key, at]) => ({ key, at }));
}

// --- Options -----------------------------------------------------------------

const asNumber = (value) => {
  if (!/^\d+$/.test(String(value ?? ""))) return null;
  return Number(value);
};

export function parseOptions(argv) {
  const options = {
    url: null,
    watch: 3000,
    scroll: null,
    mobile: false,
    reduced: false,
    dark: false,
    cpu: 1,
    out: null,
    json: false,
    chrome: null,
    errors: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    const next = () => argv[(i += 1)];

    if (!argument.startsWith("--")) {
      if (options.url === null) options.url = argument;
      else options.errors.push(`More than one URL: ${argument}`);
      continue;
    }

    switch (argument) {
      case "--watch": {
        const ms = asNumber(next());
        if (ms === null || ms < 200) {
          options.errors.push("--watch takes milliseconds, 200 or more.");
        } else {
          options.watch = ms;
        }
        break;
      }
      case "--scroll":
        options.scroll = next() ?? null;
        break;
      case "--out":
        options.out = next() ?? null;
        break;
      case "--cpu": {
        const rate = Number(next());
        if (!Number.isFinite(rate) || rate < 1) {
          options.errors.push("--cpu takes a factor of 1 or more.");
        } else {
          options.cpu = rate;
        }
        break;
      }
      case "--chrome":
        options.chrome = next() ?? null;
        break;
      case "--mobile":
        options.mobile = true;
        break;
      case "--reduced":
        options.reduced = true;
        break;
      case "--dark":
        options.dark = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        options.errors.push(`Unknown option: ${argument}`);
    }
  }

  if (options.url === null) options.errors.push("No URL. Pass the page to review.");
  return options;
}

// --- What runs in the page ----------------------------------------------------

/**
 * The recorder, installed before the page's own scripts so it sees the first
 * frame. It keeps its log in the page and hands the whole thing over at the end:
 * one round trip, not one per frame, because a round trip per frame would slow
 * the page it is measuring.
 */
const RECORDER = `(() => {
  if (window.__gsapMotionReview) return true;
  const log = [];
  const started = performance.now();
  let frames = 0;
  let previous = new Map();
  let lastScrollX = window.scrollX;
  let lastScrollY = window.scrollY;

  /** Does this element put anything on the screen, or only position things? */
  const paints = (style) =>
    style.backgroundImage !== "none" ||
    style.backdropFilter !== "none" ||
    !/^rgba\(.*,\s*0(\.0+)?\)$/.test(style.backgroundColor);

  const keyOf = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\\s+/)[0] : "";
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (cls ? "." + cls : "");
  };

  /**
   * A readable key is not an identity. An SVG holds many rect elements with no
   * id and no class, and on a real page every one of them collapsed into a
   * single track whose interleaved positions looked like a 633px tear. Each
   * element carries its own number; the key is only what the reader is shown.
   */
  let counter = 0;
  const ids = new WeakMap();
  const idOf = (el) => {
    let id = ids.get(el);
    if (id === undefined) {
      id = counter += 1;
      ids.set(el, id);
    }
    return id;
  };

  const tick =() => {
    frames += 1;
    const at = Math.round(performance.now() - started);
    const now = new Map();
    const moved = [];
    /**
     * Scrolling moves every box on the screen at once. Measured against the
     * viewport, a scroll reads as the whole page animating and as a jump of
     * hundreds of pixels in every track — the first run against a real page
     * reported exactly that. Motion is therefore measured against the document,
     * and only coverage and motion-over-text use where a thing is on screen.
     */
    const sx = window.scrollX;
    const sy = window.scrollY;
    const scrolled = sx !== lastScrollX || sy !== lastScrollY;
    lastScrollX = sx;
    lastScrollY = sy;

    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      const transform = style.transform === "none" ? "" : style.transform;
      const opacity = Math.round(parseFloat(style.opacity) * 100) / 100;
      /** Only what can move: GSAP's own, or anything transformed or faded. */
      if (!el._gsap && !transform && opacity === 1) continue;

      const box = el.getBoundingClientRect();
      const state = {
        x: Math.round((box.x + sx) * 10) / 10,
        y: Math.round((box.y + sy) * 10) / 10,
        w: Math.round(box.width * 10) / 10,
        h: Math.round(box.height * 10) / 10,
        o: opacity,
        t: transform,
        screen: [
          Math.round(box.x * 10) / 10,
          Math.round(box.y * 10) / 10,
          Math.round(box.width * 10) / 10,
          Math.round(box.height * 10) / 10,
        ],
      };
      now.set(el, state);

      const before = previous.get(el);
      if (
        before &&
        (before.x !== state.x || before.y !== state.y || before.w !== state.w ||
          before.h !== state.h || before.o !== state.o || before.t !== state.t)
      ) {
        moved.push({
          id: idOf(el),
          key: keyOf(el),
          gsap: Boolean(el._gsap),
          box: state.screen,
          x: state.x,
          opacity: state.o,
          paints: paints(style),
        });
      }
    }

    previous = now;
    if (moved.length) log.push({ at, moved, scrolled });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  /** The text on the page, read once at the end: what a reader could be reading. */
  const textLines = () => {
    const lines = [];
    for (const el of document.querySelectorAll("p, h1, h2, h3, h4, li, blockquote, figcaption")) {
      const text = (el.textContent || "").trim();
      if (text.length < 20) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 40 || box.height < 10) continue;
      if (box.y > innerHeight || box.y + box.height < 0) continue;
      /**
       * Boxes cannot express stacking. A full-screen backdrop sits under the
       * text and still covers it geometrically; a real page reported one as
       * covering every line on it. Hit testing is the browser's own answer to
       * what is on top, so the covering element is read rather than inferred.
       */
      const onTop = document.elementFromPoint(
        Math.min(innerWidth - 1, Math.max(0, box.x + box.width / 2)),
        Math.min(innerHeight - 1, Math.max(0, box.y + box.height / 2)),
      );
      const covered = onTop && onTop !== el && !el.contains(onTop) ? idOf(onTop) : null;

      lines.push({
        key: el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""),
        covered,
        box: [
          Math.round(box.x), Math.round(box.y),
          Math.round(box.width), Math.round(box.height),
        ],
      });
    }
    return lines;
  };

  window.__gsapMotionReview = () => ({
    frames,
    elapsed: Math.round(performance.now() - started),
    viewport: { width: innerWidth, height: innerHeight },
    text: textLines(),
    log,
  });
  return true;
})()`;

// --- Watching ------------------------------------------------------------------

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function watch(options) {
  const executable = findChrome(options.chrome);
  if (!executable) {
    throw new Error("No Chrome found. Install Chrome, or pass --chrome <path>, or set CHROME_PATH.");
  }

  const browser = connect(executable);
  const notes = [];

  try {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const { result } = await call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.value;
    };

    await call("Page.enable");
    await call("Runtime.enable");
    await call("Performance.enable");

    const features = [];
    if (options.reduced) features.push({ name: "prefers-reduced-motion", value: "reduce" });
    if (options.dark) features.push({ name: "prefers-color-scheme", value: "dark" });
    if (features.length) await call("Emulation.setEmulatedMedia", { features });
    if (options.mobile) {
      await call("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        mobile: true,
      });
      await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    }
    if (options.cpu > 1) await call("Emulation.setCPUThrottlingRate", { rate: options.cpu });

    await call("Page.addScriptToEvaluateOnNewDocument", { source: RECORDER });

    const before = await call("Performance.getMetrics");
    await call("Page.navigate", { url: options.url });
    await wait(options.watch);

    if (options.scroll !== null) {
      const pixels = asNumber(options.scroll);
      const moved = await evaluate(
        pixels === null
          ? `(() => {
              const element = document.querySelector(${JSON.stringify(options.scroll)});
              if (!element) return null;
              element.scrollIntoView({ block: "center" });
              return Math.round(window.scrollY);
            })()`
          : `(window.scrollTo(0, ${pixels}), Math.round(window.scrollY))`,
      );
      notes.push(moved === null ? `scroll: nothing matched ${options.scroll}` : `scroll: to ${moved}px`);
      await wait(options.watch);
    }

    const recorded = await evaluate(
      "window.__gsapMotionReview ? window.__gsapMotionReview() : null",
    );
    const after = await call("Performance.getMetrics");

    if (!recorded) throw new Error("The recorder never ran. The page may have blocked scripts.");

    const delta = (name) => {
      const start = before.metrics.find((m) => m.name === name)?.value ?? 0;
      const end = after.metrics.find((m) => m.name === name)?.value ?? 0;
      return end - start;
    };

    let shot = null;
    if (options.out) {
      mkdirSync(resolve(options.out), { recursive: true });
      const png = await call("Page.captureScreenshot", { format: "png" });
      shot = join(resolve(options.out), "review.png");
      writeFileSync(shot, Buffer.from(png.data, "base64"));
    }

    return {
      url: options.url,
      recorded,
      layouts: delta("LayoutCount"),
      recalcs: delta("RecalcStyleCount"),
      shot,
      notes,
    };
  } finally {
    await browser.close();
  }
}

// --- Conclusions ---------------------------------------------------------------

/** Turn one recording into the findings a reviewer can act on. */
export function conclude(result) {
  const { recorded } = result;
  const { log, viewport, text, frames, elapsed } = recorded;

  const busiest = log
    .map((frame) => ({ at: frame.at, share: coverage(frame.moved.map((m) => m.box), viewport) }))
    .sort((a, b) => b.share - a.share)[0] ?? null;

  /** One track per element, to find the loops that tear. */
  const tracks = new Map();
  const named = new Map();
  for (const frame of log) {
    for (const moved of frame.moved) {
      const id = moved.id ?? moved.key;
      const track = tracks.get(id) ?? [];
      track.push({ at: frame.at, x: moved.x });
      tracks.set(id, track);
      named.set(id, moved.key);
    }
  }
  const scrolledAt = log.filter((frame) => frame.scrolled).map((frame) => frame.at);
  const torn = [];
  for (const [key, track] of tracks) {
    /** Only long-running motion can have a seam; a reveal simply ends. */
    if (track.length < 20) continue;
    const found = afterScroll(seams(track), scrolledAt);
    if (found.length) {
      torn.push({ key: named.get(key) ?? key, seams: found.slice(0, 3), frames: track.length });
    }
  }

  /** Motion over text, judged at the busiest moment rather than every frame. */
  const atBusiest = busiest ? log.find((frame) => frame.at === busiest.at) : null;
  const overText = atBusiest ? motionOverText(atBusiest.moved, text) : [];

  const began = starts(log);
  return {
    firstMotion: firstMotion(log),
    frames,
    elapsed,
    fps: elapsed ? Math.round((frames / elapsed) * 1000 * 10) / 10 : null,
    busiest,
    movers: tracks.size,
    gsapMovers: new Set(
      log.flatMap((frame) => frame.moved.filter((m) => m.gsap).map((m) => m.id ?? m.key)),
    ).size,
    seams: seamEvents(torn),
    overText,
    began: began.slice(0, 8),
    spread: began.length > 1 ? began.at(-1).at - began[0].at : 0,
  };
}

// --- Report --------------------------------------------------------------------

export function report(result, options) {
  const found = conclude(result);
  const lines = [`Reviewed ${result.url}`];

  const emulated = [
    options.reduced && "reduced motion",
    options.dark && "dark",
    options.mobile && "mobile 390x844",
    options.cpu > 1 && `CPU ÷${options.cpu}`,
  ].filter(Boolean);
  if (emulated.length) lines.push(`  as: ${emulated.join(", ")}`);
  for (const note of result.notes) lines.push(`  ${note}`);

  lines.push("", "What moved");
  if (found.firstMotion === null) {
    lines.push("  nothing moved in the whole window — the animation never started,");
    lines.push("  or it needs a scroll or a pointer to begin");
  } else {
    lines.push(`  first motion at ${found.firstMotion}ms`);
    lines.push(
      `  ${found.movers} elements moved, ${found.gsapMovers} of them GSAP's` +
        `${found.movers > found.gsapMovers ? " (the rest is CSS, which the source audit cannot see)" : ""}`,
    );
    if (found.spread) lines.push(`  they started over a span of ${found.spread}ms`);
  }

  if (found.busiest) {
    lines.push("", "How much moves at once");
    lines.push(
      `  at its busiest, ${Math.round(found.busiest.share * 100)}% of the screen was in motion` +
        ` (${found.busiest.at}ms)`,
    );
  }

  lines.push("", "Cost");
  lines.push(
    `  ${found.frames} frames over ${found.elapsed}ms${found.fps ? ` (${found.fps}/s)` : ""}`,
  );
  /**
   * Layout counts are deliberately absent. Reading every box every frame is
   * what forces layout, so this run's counts are the sampler's own work as much
   * as the page's — measured on a real page, sampling quadrupled them. `inspect`
   * measures that without sampling, and is the honest place to read it.
   */
  lines.push("  layout work is not measured here — sampling forces it; use inspect for that");

  if (found.seams.length) {
    lines.push("", "Seams — a step far larger than the motion's own rhythm");
    for (const event of found.seams.slice(0, 6)) {
      const size = event.least === event.most ? `${event.most}px` : `${event.least}-${event.most}px`;
      lines.push(
        `  ${event.at}ms  ${event.count === 1 ? event.example : `${event.count} elements (${event.example})`}` +
          ` jumps ${size}`,
      );
    }
  }

  if (found.overText.length) {
    lines.push("", "Motion over text");
    for (const o of found.overText.slice(0, 5)) {
      lines.push(`  ${o.over} covers ${Math.round(o.share * 100)}% of ${o.text}`);
    }
  }

  if (result.shot) lines.push("", `Frame: ${result.shot}`);

  lines.push("", "These are measurements. Composition, rhythm and taste are yours to judge.");
  return lines.join("\n");
}

// --- Entry ---------------------------------------------------------------------

async function main(argv) {
  const options = parseOptions(argv);
  if (options.errors.length) {
    for (const error of options.errors) console.error(error);
    console.error("\nUsage: node review-motion.mjs <url> [--watch 3000] [--scroll <px|sel>] …");
    process.exit(2);
  }

  try {
    const result = await watch(options);
    console.log(
      options.json
        ? JSON.stringify({ url: result.url, ...conclude(result) }, null, 2)
        : report(result, options),
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main(process.argv.slice(2));
