/**
 * Fragility: failures a real browser shows and reading the code does not.
 *
 * The browser half of the phase-8 grader. It exists because a head-to-head test
 * — one React hero built with the skill and without it, every result checked in
 * a real browser rather than on the agent's word — found bugs that passing type
 * checks and confident "verified live" reports had not. Each check below is one
 * of those failures, stated as something a browser can measure. None of them is
 * a judgement about taste.
 *
 *   never-animates         nothing moves in the watch window
 *   below-fold-mobile      at 390x844, most of the main visual is off screen
 *   reduced-leaves-hidden  with reduced motion, a label ends hidden in a shown,
 *                          textless container
 *   runtime-errors         an exception while the page runs
 *
 * VALIDATED IN-SAMPLE ONLY. The checks and their thresholds were calibrated on
 * the five variants of that one project, so on those they are right by
 * construction. Treat the first code they have never seen — the first agent runs
 * — as their real test, and read every failure they report there.
 *
 * What calibrating them taught, because it is the part worth keeping:
 *
 * - "Hidden text" is not a failure. A component that stacks alternatives, a
 *   label per state, hides all but one on purpose, and a first version reported
 *   those as bugs in the implementation that had none. A hidden label counts only
 *   inside a container that is shown and shows no text at all.
 * - There is no stuck-invisible check, and there should not be. The bug it was
 *   for — a badge label hidden through its state — stayed hidden 1308ms, while
 *   clean entrance reveals in the same page hid text for 1178-1574ms. No
 *   threshold separates them; what makes it a bug is that the label belongs to
 *   the state on screen, which watching visibility cannot know. The audit rule
 *   `stacked-from` catches it exactly, from the code, which is why grade.mjs runs
 *   the audit beside this. Different bugs need different instruments.
 * - `below-fold-mobile` fails when MOST of the visual is off screen. A first
 *   version required three quarters and missed a real bug where 57% was.
 *
 * Samples every 100ms rather than every frame: these failures last seconds, and
 * reading every box every frame is what forces layout.
 */
import { connect, findChrome } from "../../plugins/gsap-motion/skills/gsap-creative-animation/scripts/capture-motion.mjs";

const SAMPLE_MS = 100;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Installed before the page's own scripts, so it sees the first frame and every error. */
export const RECORDER = `(() => {
  if (window.__frag) return;
  const start = performance.now();
  const frag = (window.__frag = { motion: null, samples: [], errors: [] });

  addEventListener("error", (e) => frag.errors.push(String(e.message || e)));
  addEventListener("unhandledrejection", (e) => frag.errors.push(String(e.reason)));
  const original = console.error;
  console.error = (...args) => {
    frag.errors.push(args.map(String).join(" ").slice(0, 200));
    original.apply(console, args);
  };

  const last = new WeakMap();
  const ownText = (el) => {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim().length >= 2) return node.textContent.trim().slice(0, 40);
    }
    return null;
  };
  const seen = (node) => node.checkVisibility({ opacityProperty: true, visibilityProperty: true });

  setInterval(() => {
    const at = Math.round(performance.now() - start);
    const texts = [];
    for (const el of document.querySelectorAll("body *")) {
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
      const style = getComputedStyle(el);
      const signature = style.transform + "|" + style.opacity;
      const before = last.get(el);
      if (before !== undefined && before !== signature && frag.motion === null) frag.motion = at;
      last.set(el, signature);

      const text = ownText(el);
      if (!text) continue;
      const box = el.getBoundingClientRect();
      const onScreen = box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
      if (!onScreen) continue;

      const visible = seen(el);
      let orphan = 0;
      if (!visible && el.parentElement && seen(el.parentElement)) {
        const shows = [...el.parentElement.querySelectorAll("*")].some((d) => d !== el && ownText(d) && seen(d));
        orphan = shows ? 0 : 1;
      }
      texts.push([el.tagName.toLowerCase() + ":" + text, visible ? 1 : 0, orphan]);
    }
    if (frag.samples.length < 600) frag.samples.push([at, texts]);
  }, ${SAMPLE_MS});
})()`;

/**
 * The main visual, and how much of it the first screen shows.
 *
 * The largest in-flow block, inside the section that holds the headline, that
 * is not the copy: nothing in it is the headline, a button or a link, it does not
 * contain the headline, and it is not absolutely positioned, so a decorative blob
 * is not taken for it. Staying inside the headline's section matters: without it
 * the next section down, a larger block than any visual, was taken for the visual
 * and reported 0% on screen.
 *
 * A first version took the largest svg, canvas, img or video. That was right on
 * the project it was calibrated on, whose visual was one large SVG, and wrong on
 * the first code it had not seen: two heroes built their visual from divs around
 * a small SVG chart, and it measured the 72px chart and reported the visual 100%
 * on screen. The verdict happened to be right; the measurement was not, and a
 * div-built visual that really sat below the fold would have passed the same way.
 */
const MAIN_VISUAL = `(() => {
  const headline = document.querySelector("h1");
  const isCopy = (el) => el.matches("h1, button, a[href]") || el.querySelector("h1, button, a[href]");
  const scope = (headline && headline.closest("section, header")) || document.body;
  let best = null;
  for (const el of scope.querySelectorAll("*")) {
    if (headline && el.contains(headline)) continue;
    if (isCopy(el)) continue;
    const position = getComputedStyle(el).position;
    if (position === "absolute" || position === "fixed") continue;
    const box = el.getBoundingClientRect();
    const area = box.width * box.height;
    if (area < 4000 || box.top + scrollY > innerHeight * 2) continue;
    if (!best || area > best.area) best = { el, area, top: box.top + scrollY, bottom: box.bottom + scrollY, height: box.height };
  }
  if (!best) return null;
  const shown = Math.max(0, Math.min(best.bottom, innerHeight) - Math.max(best.top, 0));
  const tag = best.el.tagName.toLowerCase() + (best.el.className && typeof best.el.className === "string" ? "." + best.el.className.trim().split(" ")[0] : "");
  return { top: Math.round(best.top), height: Math.round(best.height), what: tag, shown: Math.round((shown / best.height) * 100) / 100, viewport: innerHeight };
})()`;

async function watch(url, { mobile = false, reduced = false, ms = 6000 } = {}) {
  const browser = connect(findChrome());
  try {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) =>
      (await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

    await call("Page.enable");
    await call("Runtime.enable");
    if (reduced) {
      await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    }
    await call(
      "Emulation.setDeviceMetricsOverride",
      mobile
        ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
        : { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
    );
    await call("Page.addScriptToEvaluateOnNewDocument", { source: RECORDER });
    await call("Page.navigate", { url });
    await wait(ms);
    return { frag: await evaluate("window.__frag"), visual: await evaluate(MAIN_VISUAL) };
  } finally {
    browser.close();
  }
}

/** Every check against one URL. Each result says what was measured, pass or fail. */
export async function fragility(url) {
  const desktop = await watch(url);
  const mobile = await watch(url, { mobile: true, ms: 2500 });
  const reduced = await watch(url, { reduced: true, ms: 2500 });

  const checks = [];
  const add = (id, failed, evidence) => checks.push({ id, failed, evidence });

  add(
    "never-animates",
    desktop.frag.motion === null,
    desktop.frag.motion === null ? "nothing moved in 6s" : `first motion at ${desktop.frag.motion}ms`,
  );

  const visual = mobile.visual;
  add(
    "below-fold-mobile",
    visual !== null && visual.shown < 0.5,
    visual
      ? `main visual ${visual.what}, top ${visual.top}px, ${visual.height}px tall, ${Math.round(visual.shown * 100)}% in the first ${visual.viewport}px`
      : "no main visual found",
  );

  const atRest = reduced.frag.samples.at(-1)?.[1] ?? [];
  const hidden = atRest.filter(([, visible, orphan]) => !visible && orphan).map(([key]) => key);
  add(
    "reduced-leaves-hidden",
    hidden.length > 0,
    hidden.length ? `hidden at rest: ${hidden.slice(0, 3).join(", ")}` : "no label hidden in a shown container",
  );

  const errors = [...desktop.frag.errors, ...mobile.frag.errors, ...reduced.frag.errors];
  add("runtime-errors", errors.length > 0, errors.length ? errors.slice(0, 2).join(" | ") : "none");

  return checks;
}
