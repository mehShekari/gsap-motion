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

  test("stays quiet when JSX text with an apostrophe comes before the hook", () => {
    quiet(
      "orphan-tween",
      `${REACT}
export function Note() {
  return <p>Don't panic</p>;
}
export function Box() {
  const ref = useRef(null);
  useGSAP(() => {
    // don't run this twice
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

  test("fires on resize, pointerrawupdate and an expression-bodied handler", () => {
    fires(
      "tween-per-event",
      `${PLAIN}
export function follow(el) {
  window.addEventListener("resize", () => { gsap.to(el, { x: window.innerWidth / 2 }); });
  window.addEventListener('pointerrawupdate', (event) => gsap.to(el, { x: event.clientX }));
}`,
      { ext: "ts", count: 2 },
    );
  });

  test("fires on scroll, wheel and touchmove listeners in any quote style", () => {
    fires(
      "tween-per-event",
      `${PLAIN}
export function track(el, bar) {
  window.addEventListener(\`scroll\`, () => { gsap.to(bar, { scaleX: window.scrollY / 1000 }); });
  el.addEventListener("wheel", (e) => { gsap.to(el, { y: e.deltaY }); }, { passive: true });
  el.addEventListener("touchmove", function (e) { gsap.to(el, { x: e.touches[0].clientX }); });
}`,
      { ext: "ts", count: 3 },
    );
  });

  test("fires on the JSX props onScroll, onWheel and onTouchMove", () => {
    fires(
      "tween-per-event",
      `${PLAIN}
export function Bars() {
  return (
    <div
      onScroll={(e) => { gsap.to("[data-bar]", { scaleX: e.currentTarget.scrollTop / 100 }); }}
      onWheel={(e) => gsap.to("[data-bar]", { y: e.deltaY })}
      onTouchMoveCapture={(e) => { gsap.to("[data-bar]", { x: e.touches[0].clientX }); }}
    />
  );
}`,
      { count: 3 },
    );
  });

  test("stays quiet on names that only contain an event: ResizeObserver, onResize", () => {
    quiet(
      "tween-per-event",
      `${PLAIN}
export function watch(el) {
  const onResize = () => { gsap.to(el, { x: 0 }); };
  const ro = new ResizeObserver(() => { gsap.to(el, { scale: 1 }); });
  ro.observe(el);
  return { onResize, ro };
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on a named handler followed by an unrelated tweening function", () => {
    quiet(
      "tween-per-event",
      `${PLAIN}
export function follow(onMove) {
  window.addEventListener("pointermove", onMove);
}
export function intro(el) {
  gsap.to(el, { autoAlpha: 1 });
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on a resize handler that refreshes, and on a debounced one", () => {
    quiet(
      "tween-per-event",
      `${PLAIN}
let timer;
export function watch(el) {
  window.addEventListener("resize", () => { ScrollTrigger.refresh(); });
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { gsap.to(el, { x: window.innerWidth / 2 }); }, 150);
  });
  window.addEventListener("resize", debounce(() => { gsap.to(el, { y: 0 }); }, 150));
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

  test("fires on a state setter in an expression-bodied onScroll", () => {
    fires(
      "state-per-event",
      `${REACT}
export function Progress() {
  const [progress, setProgress] = useState(0);
  return <div onScroll={(e) => setProgress(e.currentTarget.scrollTop)}>{progress}</div>;
}`,
    );
  });

  test("stays quiet on a width kept in state on resize", () => {
    quiet(
      "state-per-event",
      `${REACT}
export function useWidth() {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", () => setWidth(window.innerWidth));
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}`,
    );
  });

  test("stays quiet on a member call and a timer in a pointermove handler", () => {
    quiet(
      "state-per-event",
      `${REACT}
export function Spot() {
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        ref.current.style.setProperty("--x", e.clientX + "px");
        setTimeout(() => ref.current.classList.remove("idle"), 0);
      }}
    />
  );
}`,
    );
  });

  test("stays quiet on a scroll-spy that sets a discrete value through a named handler", () => {
    quiet(
      "state-per-event",
      `${REACT}
export function useSection(anchors) {
  const [section, setSection] = useState(null);
  useEffect(() => {
    const measure = () => {
      let best = null;
      for (const id of anchors) {
        if (document.getElementById(id)?.getBoundingClientRect().top <= 0) best = id;
      }
      setSection(best);
    };
    window.addEventListener("scroll", measure, { passive: true });
    return () => window.removeEventListener("scroll", measure);
  }, [anchors]);
  return section;
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

  test("reports a property a fromTo names in both vars once", () => {
    fires(
      "layout-property",
      `${PLAIN}
export const grow = (el) => gsap.fromTo(el, { width: 0 }, { width: 200 });`,
      { ext: "ts", count: 1 },
    );
    fires(
      "layout-property",
      `${PLAIN}
export function carry(tl, grid, from, to) {
  tl.fromTo(
    grid,
    { height: from },
    { height: to, duration: 0.6 },
    0,
  );
}`,
      { ext: "ts", count: 1 },
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

  test("fires on an eased child added through the timeline's variable after a label", () => {
    fires(
      "eased-scrub",
      `${PLAIN}
export function scene(section) {
  const tl = gsap.timeline({ scrollTrigger: { trigger: section, scrub: true } });
  tl.addLabel("start").to("[data-a]", { x: 100, ease: "power2.out" });
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on another function's timeline of the same name, and on scrub: false", () => {
    quiet(
      "eased-scrub",
      `${PLAIN}
export function intro() {
  const tl = gsap.timeline();
  tl.to("[data-logo]", { autoAlpha: 1, ease: "power2.out" });
}
export function scene(section) {
  const tl = gsap.timeline({ scrollTrigger: { trigger: section, scrub: 1 } });
  tl.to("[data-a]", { x: 100, ease: "none" });
}
export const nudge = (el) =>
  gsap.to(el, { x: 10, ease: "power2.out", scrollTrigger: { trigger: el, scrub: false } });`,
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

  test("fires when only a comment mentions it, after JSX text with an apostrophe", () => {
    fires(
      "missing-reduced-motion",
      `${PLAIN}
export function Hero() {
  return <p>Don't wait</p>;
}
// TODO: add a prefers-reduced-motion branch
export const play = (el) => gsap.to(el, { x: 10 });`,
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

/**
 * Findings the text-matching engine got wrong and the syntax tree gets right:
 * scope, bindings, aliases, helpers and real tokens. Each was parked here as a
 * skipped fixture in 3.0.1, and runs since the audit moved onto the tree.
 */
describe("what the text engine got wrong", () => {
  test("orphan-tween stays quiet on a helper only the useGSAP body calls", () => {
    quiet(
      "orphan-tween",
      `${REACT}
export function Box() {
  const ref = useRef(null);
  const grow = (el) => { gsap.to(el, { scale: 1.2 }); };
  useGSAP(() => { grow(ref.current); }, { scope: ref });
  return <div ref={ref} />;
}`,
    );
  });

  test("orphan-tween stays quiet through aliased useGSAP and contextSafe", () => {
    quiet(
      "orphan-tween",
      `"use client";
import { useGSAP as useG } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
export function Box() {
  const ref = useRef(null);
  const { contextSafe: cs } = useG(() => { gsap.to("[data-a]", { x: 1 }); }, { scope: ref });
  const spin = cs(() => { gsap.to(ref.current, { rotation: 90 }); });
  return <button ref={ref} onClick={spin} />;
}`,
    );
  });

  test("orphan-tween stays quiet on a module-scope tween after an arrow", () => {
    quiet(
      "orphan-tween",
      `${REACT}
export const noop = () => {};
gsap.set("[data-a]", { autoAlpha: 0 });
gsap.to("[data-a]", { autoAlpha: 1 });`,
    );
  });

  test("eased-loop and layout-property read timeline children", () => {
    fires(
      "eased-loop",
      `${PLAIN}
export const spin = (tl, dot) => tl.to(dot, { rotation: 360, repeat: -1, ease: "power1.inOut" });`,
      { ext: "ts" },
    );
    fires(
      "layout-property",
      `${PLAIN}
export const grow = (tl, el) => tl.to(el, { width: 200 });`,
      { ext: "ts" },
    );
  });

  test("layout-property reads fromTo to-vars, and ignores an unrelated object", () => {
    fires(
      "layout-property",
      `${PLAIN}
export const grow = (el) => gsap.fromTo(el, { x: 0 }, { width: 200 });`,
      { ext: "ts" },
    );
    quiet(
      "layout-property",
      `${PLAIN}
export function scene() {
  const tl = gsap.timeline();
  const box = { width: 10 };
  return { tl, box };
}`,
      { ext: "ts" },
    );
  });

  test("trigger-per-item reads for...of, and ignores a block after .map(fn)", () => {
    fires(
      "trigger-per-item",
      `${PLAIN}
export function reveal(items) {
  for (const item of items) {
    gsap.from(item, { autoAlpha: 0, scrollTrigger: { trigger: item } });
  }
}`,
      { ext: "ts" },
    );
    quiet(
      "trigger-per-item",
      `${PLAIN}
export function reveal(section, items, toLabel) {
  const labels = items.map(toLabel);
  if (labels.length) {
    gsap.from(items, { autoAlpha: 0, stagger: 0.1, scrollTrigger: { trigger: section } });
  }
}`,
      { ext: "ts" },
    );
  });

  test("unmanaged-instance fires on ScrollTrigger.create outside a context", () => {
    fires(
      "unmanaged-instance",
      `${PLAIN}import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
export const watch = (el) => ScrollTrigger.create({ trigger: el, onEnter: () => {} });`,
      { ext: "ts" },
    );
  });

  test("shared-plugin-id fires on a template literal and on the morphSVG shorthand", () => {
    fires(
      "shared-plugin-id",
      `${REACT}
export function Morph() {
  useGSAP(() => {
    gsap.to("[data-dot]", { motionPath: { path: \`#track\` } });
    gsap.to("[data-shape]", { morphSVG: "#star" });
  });
  return <svg />;
}`,
      { count: 2 },
    );
  });

  test("unregistered-plugin fires on a default import", () => {
    fires(
      "unregistered-plugin",
      `${PLAIN}import ScrollTrigger from "gsap/ScrollTrigger";
export const refresh = () => ScrollTrigger.refresh();`,
      { ext: "ts" },
    );
  });

  test("never-completes and eased-scrub follow a timeline kept on this", () => {
    fires(
      "never-completes",
      `${PLAIN}
export class Intro {
  play(done) {
    this.tl = gsap.timeline({ onComplete: done });
    this.tl.to("[data-dot]", { rotation: 360, repeat: -1, ease: "none" });
  }
}`,
      { ext: "ts" },
    );
    fires(
      "eased-scrub",
      `${PLAIN}
export class Scene {
  build(section) {
    this.tl = gsap.timeline({ scrollTrigger: { trigger: section, scrub: 1 } });
    this.tl.to("[data-a]", { x: 100, ease: "power2.out" });
  }
}`,
      { ext: "ts" },
    );
  });

  test("tween-per-event follows a named handler", () => {
    fires(
      "tween-per-event",
      `${PLAIN}
export function follow(el) {
  const onMove = (event) => { gsap.to(el, { x: event.clientX }); };
  window.addEventListener("pointermove", onMove);
}`,
      { ext: "ts" },
    );
  });

  test("comments are stripped after a quote in a regex literal or a plural possessive", () => {
    fires(
      "missing-reduced-motion",
      `${PLAIN}
const quote = /"/;
// prefers-reduced-motion is still to do
export const play = (el) => gsap.to(el, { x: 10 });`,
      { ext: "ts" },
    );
    fires(
      "missing-reduced-motion",
      `${PLAIN}
export const Picks = () => <p>Our users' picks</p>;
// prefers-reduced-motion is still to do
export const play = (el) => gsap.to(el, { x: 10 });`,
    );
  });
});

/**
 * Failures a 3.3 rule exists for, found by the 2026-09-13 probe. The rule ids do
 * not exist yet; 3.3 adds `tween-per-frame` and `paint-property` and un-skips
 * these.
 */
describe("parked for 3.3: rules not written yet", () => {
  const PROBE = `import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Observer } from "gsap/Observer";
gsap.registerPlugin(ScrollTrigger, Observer);
`;

  test.skip("tween-per-frame fires on onUpdate, the ticker, Observer onMove and a rAF loop", () => {
    for (const body of [
      "ScrollTrigger.create({ trigger: el, onUpdate: (self) => { gsap.to(bar, { scaleX: self.progress }); } });",
      "gsap.ticker.add(() => { gsap.to(el, { x: mouse.x }); });",
      "Observer.create({ target: window, onMove: (self) => { gsap.to(el, { x: self.x }); } });",
      "function tick() { gsap.to(el, { x: mouse.x }); requestAnimationFrame(tick); }\nrequestAnimationFrame(tick);",
    ]) {
      fires("tween-per-frame", `${PROBE}${body}\n`, { ext: "ts" });
    }
  });

  test.skip("paint-property fires on filter and boxShadow", () => {
    fires(
      "paint-property",
      `${PROBE}gsap.to(card, { filter: "blur(12px)", boxShadow: "0 30px 60px rgba(0,0,0,.4)", duration: 1 });\n`,
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
