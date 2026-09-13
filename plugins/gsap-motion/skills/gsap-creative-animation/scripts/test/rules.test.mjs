/**
 * One `describe` per audit rule, each proving the rule fires on the failure it
 * exists for and stays quiet on the correct code beside it.
 *
 * A finding that is wrong in either direction is a bug in the rule. Fix it by
 * adding the case here first, watching it fail, then changing the rule — the
 * final test refuses a rule that has not been shown to do both.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { RULES } from "../lib/rules.mjs";
import { coverage, fires, quiet } from "./helpers.mjs";

const REACT = `"use client";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
`;

const PLAIN = `import gsap from "gsap";
`;

describe("orphan-tween", () => {
  test("fires on a tween in a plain useEffect", () => {
    fires(
      "orphan-tween",
      `${REACT}
export function Box() {
  const ref = useRef(null);
  useEffect(() => {
    gsap.to(ref.current, { x: 100 });
  }, []);
  return <div ref={ref} />;
}`,
    );
  });

  test("fires on a handler beside a bodiless useGSAP, outside contextSafe", () => {
    fires(
      "orphan-tween",
      `${REACT}
export function Box() {
  const ref = useRef(null);
  const { contextSafe } = useGSAP({ scope: ref });
  const spin = () => {
    gsap.to(ref.current, { rotation: 90 });
  };
  return <button ref={ref} onClick={spin} />;
}`,
    );
  });

  test("stays quiet inside a useGSAP body", () => {
    quiet(
      "orphan-tween",
      `${REACT}
export function Box() {
  const ref = useRef(null);
  useGSAP(() => {
    gsap.to("[data-box]", { x: 100 });
  }, { scope: ref });
  return <div ref={ref} />;
}`,
    );
  });

  test("stays quiet inside an expression-bodied contextSafe", () => {
    quiet(
      "orphan-tween",
      `${REACT}
export function Box() {
  const ref = useRef(null);
  const { contextSafe } = useGSAP({ scope: ref });
  const spin = contextSafe(() => gsap.to(ref.current, { rotation: 90 }));
  return <button ref={ref} onClick={spin} />;
}`,
    );
  });

  test("stays quiet at module scope and on gsap.set", () => {
    quiet(
      "orphan-tween",
      `${REACT}
const intro = gsap.timeline({ paused: true });

export function Box() {
  const ref = useRef(null);
  useEffect(() => {
    gsap.set(ref.current, { autoAlpha: 1 });
  }, []);
  return <div ref={ref} />;
}`,
    );
  });

  test("stays quiet outside React", () => {
    quiet(
      "orphan-tween",
      `${PLAIN}
export function mount(el) {
  gsap.to(el, { x: 100 });
}`,
      { ext: "ts" },
    );
  });
});

describe("unmanaged-instance", () => {
  const OBSERVER = `${REACT}import { Observer } from "gsap/Observer";
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(Observer, SplitText);
`;

  test("fires on an instance that is never kept", () => {
    fires(
      "unmanaged-instance",
      `${OBSERVER}
export function Swipe() {
  useEffect(() => {
    Observer.create({ target: window, onUp: () => {} });
  }, []);
  return null;
}`,
    );
  });

  test("fires even when something unrelated is killed in the same file", () => {
    fires(
      "unmanaged-instance",
      `${OBSERVER}
export function Swipe() {
  useEffect(() => {
    Observer.create({ target: window, onUp: () => {} });
    const tl = gsap.timeline();
    return () => tl.kill();
  }, []);
  return null;
}`,
    );
  });

  test("fires on an instance kept in a variable but never torn down", () => {
    fires(
      "unmanaged-instance",
      `${OBSERVER}
export function Swipe() {
  useEffect(() => {
    const observer = Observer.create({ target: window, onUp: () => {} });
  }, []);
  return null;
}`,
    );
  });

  test("stays quiet when the kept instance is killed", () => {
    quiet(
      "unmanaged-instance",
      `${OBSERVER}
export function Swipe() {
  useEffect(() => {
    const observer = Observer.create({ target: window, onUp: () => {} });
    return () => observer.kill();
  }, []);
  return null;
}`,
    );
  });

  test("stays quiet when a ref-held instance is reverted with optional chaining", () => {
    quiet(
      "unmanaged-instance",
      `${OBSERVER}
export function Lines() {
  const el = useRef(null);
  const split = useRef(null);
  useEffect(() => {
    split.current = new SplitText(el.current, { type: "lines" });
    return () => split.current?.revert();
  }, []);
  return <p ref={el} />;
}`,
    );
  });

  test("stays quiet inside a useGSAP body", () => {
    quiet(
      "unmanaged-instance",
      `${OBSERVER}
export function Box() {
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px)", () => {});
  });
  return null;
}`,
    );
  });
});

describe("dangling-listener", () => {
  test("fires on a listener that is never removed", () => {
    fires(
      "dangling-listener",
      `${PLAIN}
export function watch(onResize) {
  window.addEventListener("resize", onResize);
}`,
      { ext: "ts" },
    );
  });

  test("fires on an inline handler, which can never be removed", () => {
    fires(
      "dangling-listener",
      `${PLAIN}
export function watch(onResize) {
  window.addEventListener("resize", () => onResize());
  return () => window.removeEventListener("resize", onResize);
}`,
      { ext: "ts" },
    );
  });

  test("fires when the counts match but the events do not", () => {
    fires(
      "dangling-listener",
      `${PLAIN}
export function watch(onResize, onScroll) {
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll);
  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("resize", onResize);
  };
}`,
      { ext: "ts", count: 1 },
    );
  });

  test("stays quiet on a matched pair", () => {
    quiet(
      "dangling-listener",
      `${PLAIN}
export function watch(onResize) {
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on an AbortSignal or a once listener", () => {
    quiet(
      "dangling-listener",
      `${PLAIN}
export function watch(onResize, controller) {
  window.addEventListener("resize", onResize, { signal: controller.signal });
  window.addEventListener("load", () => onResize(), { once: true });
}`,
      { ext: "ts" },
    );
  });
});

describe("tween-per-event", () => {
  test("fires on a tween created per pointer event", () => {
    fires(
      "tween-per-event",
      `${PLAIN}
export function follow(el) {
  window.addEventListener("pointermove", (event) => {
    gsap.to(el, { x: event.clientX });
  });
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on a quickTo created once", () => {
    quiet(
      "tween-per-event",
      `${PLAIN}
export function follow(el) {
  const xTo = gsap.quickTo(el, "x", { duration: 0.4 });
  window.addEventListener("pointermove", (event) => {
    xTo(event.clientX);
  });
}`,
      { ext: "ts" },
    );
  });
});

describe("state-per-event", () => {
  test("fires on a state setter in a mousemove handler", () => {
    fires(
      "state-per-event",
      `${REACT}
export function Tracker() {
  const [x, setX] = useState(0);
  return <div onMouseMove={(event) => { setX(event.clientX); }}>{x}</div>;
}`,
    );
  });

  test("stays quiet on a state setter in a click handler", () => {
    quiet(
      "state-per-event",
      `${REACT}
export function Menu() {
  const [open, setOpen] = useState(false);
  return <button onClick={() => { setOpen(!open); }}>menu</button>;
}`,
    );
  });
});

describe("layout-property", () => {
  test("fires on width, suggesting scaleX", () => {
    const [finding] = fires(
      "layout-property",
      `${PLAIN}
export const grow = (el) => gsap.to(el, { width: 200, duration: 0.4 });`,
      { ext: "ts" },
    );
    assert.match(finding.hint, /scaleX/);
  });

  test("adds the percentage caveat to a percentage top", () => {
    const [finding] = fires(
      "layout-property",
      `${PLAIN}
export const drop = (el) => gsap.to(el, { top: "50%" });`,
      { ext: "ts" },
    );
    assert.match(finding.hint, /containing block/);
  });

  test("stays quiet on transforms", () => {
    quiet(
      "layout-property",
      `${PLAIN}
export const grow = (el) => gsap.to(el, { scaleX: 0.5, x: 20, yPercent: 50 });`,
      { ext: "ts" },
    );
  });
});

describe("trigger-per-item", () => {
  test("fires on a ScrollTrigger per item in a loop", () => {
    fires(
      "trigger-per-item",
      `${PLAIN}
export function reveal(items) {
  items.forEach((item) => {
    gsap.from(item, { autoAlpha: 0, scrollTrigger: { trigger: item } });
  });
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on one trigger with a stagger", () => {
    quiet(
      "trigger-per-item",
      `${PLAIN}
export function reveal(section, items) {
  gsap.from(items, { autoAlpha: 0, stagger: 0.1, scrollTrigger: { trigger: section } });
}`,
      { ext: "ts" },
    );
  });
});

describe("eased-loop", () => {
  test("fires on an infinite repeat with an ease", () => {
    fires(
      "eased-loop",
      `${PLAIN}
export const spin = (dot) => gsap.to(dot, { rotation: 360, repeat: -1, ease: "power2.inOut" });`,
      { ext: "ts" },
    );
  });

  test("stays quiet on ease none, and on a yoyo", () => {
    quiet(
      "eased-loop",
      `${PLAIN}
export const spin = (dot) => gsap.to(dot, { rotation: 360, repeat: -1, ease: "none" });
export const breathe = (dot) => gsap.to(dot, { scale: 1.1, repeat: -1, yoyo: true, ease: "sine.inOut" });`,
      { ext: "ts" },
    );
  });
});

describe("eased-scrub", () => {
  test("fires on a scrubbed tween with an ease", () => {
    fires(
      "eased-scrub",
      `${PLAIN}
export const move = (el) =>
  gsap.to(el, { x: 100, ease: "power2.out", scrollTrigger: { trigger: el, scrub: 1 } });`,
      { ext: "ts" },
    );
  });

  test("fires on an eased child chained onto a scrubbed timeline", () => {
    fires(
      "eased-scrub",
      `${PLAIN}
export function scene(section) {
  gsap
    .timeline({ scrollTrigger: { trigger: section, scrub: 1 } })
    .to("[data-a]", { x: 100, ease: "power2.out" })
    .to("[data-b]", { y: 50 });
}`,
      { ext: "ts" },
    );
  });

  test("fires on an eased child added through the timeline's variable", () => {
    fires(
      "eased-scrub",
      `${PLAIN}
export function scene(section) {
  const tl = gsap.timeline({ scrollTrigger: { trigger: section, scrub: true } });
  tl.to("[data-a]", { x: 100, ease: "expo.out" });
}`,
      { ext: "ts" },
    );
  });

  test("fires on an eased default on a scrubbed timeline", () => {
    fires(
      "eased-scrub",
      `${PLAIN}
export function scene(section) {
  gsap
    .timeline({ defaults: { ease: "power3.out" }, scrollTrigger: { trigger: section, scrub: 1 } })
    .to("[data-a]", { x: 100 });
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on ease none, and on an eased tween outside the scrubbed timeline", () => {
    quiet(
      "eased-scrub",
      `${PLAIN}
export function scene(section, button) {
  gsap
    .timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: section, scrub: 1 } })
    .to("[data-a]", { x: 100 });
  gsap.to(button, { scale: 1.05, ease: "power2.out" });
}`,
      { ext: "ts" },
    );
  });
});

describe("never-completes", () => {
  test("fires on an endless child added after a label, through the timeline's variable", () => {
    fires(
      "never-completes",
      `${REACT}
export function Intro({ onDone }) {
  const root = useRef(null);
  useGSAP(() => {
    const tl = gsap.timeline({ onComplete: onDone });
    tl.addLabel("mark")
      .from("[data-mark]", { autoAlpha: 0, duration: 0.8 })
      .addLabel("hold")
      .to("[data-dot]", { rotation: 360, duration: 2, repeat: -1, ease: "none" }, "hold")
      .to({}, { duration: 0.45 }, "hold");
  }, { scope: root });
  return <div ref={root} />;
}`,
      { count: 1 },
    );
  });

  test("fires on an onComplete attached by eventCallback, with the loop passed to add", () => {
    fires(
      "never-completes",
      `${PLAIN}
export function loader(ring, finish) {
  const tl = gsap.timeline();
  tl.to(ring, { drawSVG: "0% 75%", duration: 0.9 })
    .add(gsap.to(ring, { rotation: 360, duration: 1.8, repeat: -1, ease: "none" }));
  tl.eventCallback("onComplete", finish);
}`,
      { ext: "ts", count: 1 },
    );
  });

  test("fires on a tween and a timeline that repeat forever and wait to complete", () => {
    fires(
      "never-completes",
      `${PLAIN}
export function idle(dot, done) {
  gsap.to(dot, { rotation: 360, repeat: -1, ease: "none", onComplete: done });
  gsap.timeline({ repeat: -1, onComplete: done }).to(dot, { x: 10 });
}`,
      { ext: "ts", count: 2 },
    );
  });

  test("stays quiet on a handover at a position with call", () => {
    quiet(
      "never-completes",
      `${PLAIN}
export function intro(mark, dot, finish) {
  const tl = gsap.timeline();
  tl.from(mark, { autoAlpha: 0, duration: 0.8 })
    .addLabel("hold")
    .to(dot, { rotation: 360, duration: 2, repeat: -1, ease: "none" }, "hold")
    .call(finish, [], "hold+=0.45");
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on a finite timeline beside a loop, and on another function's tl", () => {
    quiet(
      "never-completes",
      `${PLAIN}
export function intro(mark, dot, finish) {
  const tl = gsap.timeline({ onComplete: finish });
  tl.from(mark, { autoAlpha: 0, duration: 0.8 })
    .to(mark, { scale: 1.05, repeat: 2, yoyo: true });
  gsap.to(dot, { rotation: 360, repeat: -1, ease: "none" });
}

export function idle(dot) {
  const tl = gsap.timeline();
  tl.to(dot, { rotation: 360, repeat: -1, ease: "none" });
}`,
      { ext: "ts" },
    );
  });
});

describe("late-transform-origin", () => {
  test("fires on a fromTo that grows from nothing with the origin only in the to-vars", () => {
    fires(
      "late-transform-origin",
      `${PLAIN}
export const pop = (dot) =>
  gsap.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.4, transformOrigin: "50% 50%" });`,
      { ext: "ts", count: 1 },
    );
  });

  test("fires on a chained fromTo that rotates, with svgOrigin in the to-vars", () => {
    fires(
      "late-transform-origin",
      `${PLAIN}
export function turn(tl, dial) {
  tl.addLabel("in")
    .fromTo(dial, { rotation: "90deg", autoAlpha: 0 }, { rotation: 0, autoAlpha: 1, svgOrigin: "50 50" }, "in");
}`,
      { ext: "ts", count: 1 },
    );
  });

  test("stays quiet with the origin in the from-vars, smoothOrigin off, or no transform to move", () => {
    quiet(
      "late-transform-origin",
      `${PLAIN}
export function pop(dot, ring, bar, pin) {
  gsap.fromTo(dot, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1 });
  gsap.fromTo(ring, { scale: 0 }, { scale: 1, transformOrigin: "50% 50%", smoothOrigin: false });
  gsap.fromTo(bar, { scale: 1, x: 20 }, { scale: 2, x: 0, transformOrigin: "0% 50%" });
  gsap.fromTo(pin, { rotation: 0 }, { rotation: 45, transformOrigin: "50% 100%" });
}`,
      { ext: "ts" },
    );
  });
});

describe("shared-plugin-id", () => {
  test("fires on a hardcoded id in a component's plugin config", () => {
    fires(
      "shared-plugin-id",
      `${REACT}
export function Orbit() {
  useGSAP(() => {
    gsap.to("[data-dot]", { motionPath: { path: "#track" } });
  });
  return null;
}`,
    );
  });

  test("stays quiet on an id built per instance", () => {
    quiet(
      "shared-plugin-id",
      `${REACT}
export function Orbit({ uid }) {
  useGSAP(() => {
    gsap.to("[data-dot]", { motionPath: { path: \`#\${uid}-track\` } });
  });
  return null;
}`,
    );
  });
});

describe("unregistered-plugin", () => {
  test("fires on a plugin that is imported and never registered", () => {
    fires(
      "unregistered-plugin",
      `${PLAIN}import { ScrollTrigger } from "gsap/ScrollTrigger";
export const refresh = () => ScrollTrigger.refresh();`,
      { ext: "ts" },
    );
  });

  test("fires when the plugin is only mentioned after registerPlugin", () => {
    fires(
      "unregistered-plugin",
      `${PLAIN}import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(useGSAP);
export const refresh = () => ScrollTrigger.refresh();`,
      { ext: "ts" },
    );
  });

  test("fires on exactly the plugin that was left out", () => {
    const [finding] = fires(
      "unregistered-plugin",
      `${PLAIN}import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(Flip);`,
      { ext: "ts", count: 1 },
    );
    assert.match(finding.message, /SplitText/);
  });

  test("stays quiet across several registerPlugin calls, an alias and a type import", () => {
    quiet(
      "unregistered-plugin",
      `${PLAIN}import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger as ST } from "gsap/ScrollTrigger";
import type { Observer } from "gsap/Observer";
gsap.registerPlugin(Flip);
gsap.registerPlugin(SplitText, ST);`,
      { ext: "ts" },
    );
  });
});

describe("missing-reduced-motion", () => {
  test("fires on an animating file with no reduced-motion branch", () => {
    fires(
      "missing-reduced-motion",
      `${PLAIN}
export const play = (el) => gsap.to(el, { x: 10 });`,
      { ext: "ts" },
    );
  });

  test("stays quiet with a branch, and on a file that only sets", () => {
    quiet(
      "missing-reduced-motion",
      `${PLAIN}
export function play(el) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => gsap.to(el, { x: 10 }));
}`,
      { ext: "ts" },
    );
    quiet(
      "missing-reduced-motion",
      `${PLAIN}
export const show = (el) => gsap.set(el, { autoAlpha: 1 });`,
      { ext: "ts" },
    );
  });
});

describe("dev-tool-shipped", () => {
  test("fires on a static GSDevTools import and unconditional markers", () => {
    fires(
      "dev-tool-shipped",
      `${PLAIN}import { GSDevTools } from "gsap/GSDevTools";
export const scene = (el) => gsap.to(el, { x: 1, scrollTrigger: { trigger: el, markers: true } });`,
      { ext: "ts", count: 2 },
    );
  });

  test("stays quiet on a dynamic import and gated markers", () => {
    quiet(
      "dev-tool-shipped",
      `${PLAIN}
export async function debug(el) {
  const { GSDevTools } = await import("gsap/GSDevTools");
  gsap.to(el, { x: 1, scrollTrigger: { trigger: el, markers: process.env.NODE_ENV === "development" } });
}`,
      { ext: "ts" },
    );
  });
});

describe("barrel-import", () => {
  test("fires on gsap/all", () => {
    fires("barrel-import", `import { gsap, ScrollTrigger } from "gsap/all";`, {
      ext: "ts",
    });
  });

  test("stays quiet on subpath imports", () => {
    quiet(
      "barrel-import",
      `${PLAIN}import { ScrollTrigger } from "gsap/ScrollTrigger";`,
      { ext: "ts" },
    );
  });
});

test("every rule is shown to fire and to stay quiet", () => {
  const ids = RULES.map((rule) => rule.id);
  assert.deepEqual(
    ids.filter((id) => !coverage.fires.has(id)),
    [],
    "rules with no firing case",
  );
  assert.deepEqual(
    ids.filter((id) => !coverage.quiet.has(id)),
    [],
    "rules with no quiet case",
  );
});
