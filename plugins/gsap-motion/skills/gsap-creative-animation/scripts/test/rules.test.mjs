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

  test("stays quiet on a tween kept under a name and killed or reverted in the cleanup", () => {
    quiet(
      "orphan-tween",
      `${REACT}
export function Box() {
  const ref = useRef(null);
  const tweenRef = useRef(null);
  useEffect(() => {
    const tl = gsap.timeline();
    tl.to(ref.current, { x: 100 });
    const tween = gsap.to(ref.current, { y: 10 });
    tweenRef.current = gsap.fromTo(ref.current, { opacity: 0 }, { opacity: 1 });
    return () => {
      tl.kill();
      tween?.revert();
      tweenRef.current?.kill();
    };
  }, []);
  return <div ref={ref} />;
}`,
    );
  });

  test("stays quiet on a timeline a helper returns and every caller tears down", () => {
    quiet(
      "orphan-tween",
      `${REACT}
export function Section() {
  const ref = useRef(null);
  const build = () => {
    const tl = gsap.timeline();
    tl.to(ref.current, { x: 100 });
    return [tl, ref.current];
  };
  useEffect(() => {
    let later;
    const [timeline] = build();
    [later] = build();
    return () => {
      timeline && timeline.kill();
      later.progress(1);
    };
  }, []);
  return <section ref={ref} />;
}`,
    );
  });

  test("fires when only something unrelated is killed", () => {
    fires(
      "orphan-tween",
      `${REACT}
export function Box({ other }) {
  const ref = useRef(null);
  useEffect(() => {
    const tl = gsap.timeline();
    tl.to(ref.current, { x: 100 });
    return () => other.kill();
  }, []);
  return <div ref={ref} />;
}`,
      { count: 1 },
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

  test("stays quiet on an instance a helper returns and the caller kills", () => {
    quiet(
      "unmanaged-instance",
      `${OBSERVER}import { ScrollTrigger } from "gsap/ScrollTrigger";
export function Pin() {
  const ref = useRef(null);
  const make = () => {
    const st = ScrollTrigger.create({ trigger: ref.current, pin: true });
    return st;
  };
  useEffect(() => {
    const trigger = make();
    return () => trigger && trigger.kill();
  }, []);
  return <div ref={ref} />;
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

  test("stays quiet on listeners whose target is created here, or is an element outside React", () => {
    quiet(
      "dangling-listener",
      `${PLAIN}
export function build(onPick) {
  const button = document.createElement("button");
  button.addEventListener("click", () => onPick());
  const audio = new Audio("/theme.mp3");
  audio.addEventListener("error", onPick);
  const start = document.getElementById("start");
  start?.addEventListener("click", onPick);
  return button;
}`,
      { ext: "ts" },
    );
  });

  test("fires on an element listener a React component never removes", () => {
    fires(
      "dangling-listener",
      `${REACT}
export function Header({ onClick }) {
  useEffect(() => {
    document.querySelector("header").addEventListener("click", onClick);
  }, []);
  return null;
}`,
      { count: 1 },
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

  test("stays quiet on a tween guarded by an in-flight flag, and on one in its onComplete", () => {
    quiet(
      "tween-per-event",
      `${PLAIN}
export function pulse(el, state) {
  window.addEventListener("pointermove", () => {
    if (!state.animating) {
      state.animating = true;
      gsap.to(el, {
        scale: 1.1,
        duration: 0.3,
        onComplete: () => {
          gsap.to(el, { scale: 1, duration: 1, onComplete: () => { state.animating = false; } });
        },
      });
    }
  });
}`,
      { ext: "ts" },
    );
  });

  test("fires on a tween behind a condition that is not an in-flight flag", () => {
    fires(
      "tween-per-event",
      `${PLAIN}
export function follow(el) {
  window.addEventListener("pointermove", (event) => {
    if (el) {
      gsap.to(el, { x: event.clientX });
    }
  });
}`,
      { ext: "ts", count: 1 },
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

  test("stays quiet on a setter called with a constant", () => {
    quiet(
      "state-per-event",
      `${REACT}
export function List({ setOpen }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div onScroll={() => setHovered(null)} onWheel={() => { setOpen(false); }}>
      {hovered}
    </div>
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

  test("stays quiet on gsap.set, which animates nothing", () => {
    quiet(
      "layout-property",
      `${PLAIN}
export function measure(el) {
  gsap.set(el, { height: "auto" });
  const natural = el.offsetHeight;
  gsap.set(el, { height: 0, width: "50%" });
  return natural;
}`,
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

  test("stays quiet on a plugin another audited file registers", () => {
    quiet(
      "unregistered-plugin",
      `${PLAIN}import { ScrollTrigger } from "gsap/ScrollTrigger";
export const refresh = () => ScrollTrigger.refresh();`,
      { ext: "ts", registered: ["ScrollTrigger"] },
    );
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
describe("written in 3.3", () => {
  const PROBE = `import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Observer } from "gsap/Observer";
gsap.registerPlugin(ScrollTrigger, Observer);
`;

  test("tween-per-frame fires on onUpdate, the ticker, Observer onMove and a rAF loop", () => {
    for (const body of [
      "ScrollTrigger.create({ trigger: el, onUpdate: (self) => { gsap.to(bar, { scaleX: self.progress }); } });",
      "gsap.ticker.add(() => { gsap.to(el, { x: mouse.x }); });",
      "Observer.create({ target: window, onMove: (self) => { gsap.to(el, { x: self.x }); } });",
      "function tick() { gsap.to(el, { x: mouse.x }); requestAnimationFrame(tick); }\nrequestAnimationFrame(tick);",
    ]) {
      fires("tween-per-frame", `${PROBE}${body}\n`, { ext: "ts" });
    }
  });

  test("paint-property fires on filter and boxShadow", () => {
    fires(
      "paint-property",
      `${PROBE}gsap.to(card, { filter: "blur(12px)", boxShadow: "0 30px 60px rgba(0,0,0,.4)", duration: 1 });\n`,
      { ext: "ts" },
    );
  });
});

describe("what the corpus showed in 3.3", () => {
  test("missing-reduced-motion stays quiet on a file that only registers and kills", () => {
    quiet(
      "missing-reduced-motion",
      `${PLAIN}
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

export function reset(el) {
  gsap.killTweensOf(el);
  gsap.set(el, { clearProps: "all" });
}
`,
      { ext: "ts" },
    );
  });

  test("missing-reduced-motion lands on the animation, not on registerPlugin", () => {
    const source = `${PLAIN}
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function reveal(el) {
  gsap.from(el, { autoAlpha: 0, y: 24 });
}
`;
    const [finding] = fires("missing-reduced-motion", source, { ext: "ts", count: 1 });
    assert.equal(
      source.slice(finding.index, finding.index + "gsap.from".length),
      "gsap.from",
    );
  });

  test("missing-reduced-motion stays quiet in a helper that fills a timeline it is given", () => {
    quiet(
      "missing-reduced-motion",
      `import type { gsap } from "gsap";

/** The caller owns the reduced-motion branch; this only adds the beats. */
export function addIntro(tl: gsap.core.Timeline, scope: Element) {
  tl.addLabel("intro")
    .from("[data-heading]", { yPercent: 110, duration: 0.8 })
    .from("[data-lead]", { autoAlpha: 0, y: 18, duration: 0.6 }, "-=0.5");
}
`,
      { ext: "ts" },
    );
  });

  test("dangling-listener stays quiet on DOMContentLoaded, which fires once", () => {
    quiet(
      "dangling-listener",
      `${PLAIN}
document.addEventListener("DOMContentLoaded", () => {
  gsap.from("[data-item]", { autoAlpha: 0, y: 24 });
});
`,
      { ext: "ts" },
    );
  });
});

describe("tween-per-frame, quiet", () => {
  test("stays quiet on an onChange that belongs to something other than GSAP", () => {
    quiet(
      "tween-per-frame",
      `${PLAIN}
export function useModel(obj) {
  useControls({
    spread: {
      value: 0,
      onChange: (v) => {
        obj.current.traverse((child) => {
          gsap.to(child.position, { z: v, duration: 1 });
        });
      },
    },
  });
}
`,
      { ext: "ts" },
    );
  });

  test("stays quiet on a quickTo called from onUpdate, and on gsap.set", () => {
    quiet(
      "tween-per-frame",
      `${PLAIN}
const moveX = gsap.quickTo(el, "x", { duration: 0.4 });

ScrollTrigger.create({
  trigger: el,
  onUpdate: (self) => {
    moveX(self.progress * 100);
    gsap.set(bar, { scaleX: self.progress });
  },
});
`,
      { ext: "ts" },
    );
  });
});

describe("paint-property", () => {
  test("stays quiet on a clip-path reveal, which is the technique this skill teaches", () => {
    quiet(
      "paint-property",
      `${PLAIN}
gsap.from(image, { clipPath: "inset(0 100% 0 0)", duration: 0.9, ease: "power3.out" });
`,
      { ext: "ts" },
    );
  });

  test("stays quiet on gsap.set, which animates nothing", () => {
    quiet("paint-property", `${PLAIN}gsap.set(card, { filter: "blur(8px)" });
`, {
      ext: "ts",
    });
  });
});

describe("unowned-loop", () => {
  test("fires on an infinite repeat nothing pauses", () => {
    fires(
      "unowned-loop",
      `${PLAIN}gsap.to(mark, { rotation: 360, duration: 8, ease: "none", repeat: -1 });
`,
      { ext: "ts" },
    );
  });

  test("stays quiet on a loop a context holds, which unmount reverts", () => {
    quiet(
      "unowned-loop",
      `${REACT}
export function Mark() {
  const root = useRef(null);
  useGSAP(() => {
    gsap.to("[data-arc]", { rotation: 360, duration: 8, ease: "none", repeat: -1 });
  }, { scope: root });
  return <div ref={root} />;
}`,
    );
  });

  test("stays quiet when the loop is paused, observed, or owned by a ScrollTrigger", () => {
    quiet(
      "unowned-loop",
      `${PLAIN}
const spin = gsap.to(mark, { rotation: 360, duration: 8, ease: "none", repeat: -1 });
spin.pause();
`,
      { ext: "ts" },
    );
    quiet(
      "unowned-loop",
      `${PLAIN}
const io = new IntersectionObserver(() => {});
gsap.to(mark, { rotation: 360, duration: 8, ease: "none", repeat: -1 });
io.observe(mark);
`,
      { ext: "ts" },
    );
    quiet(
      "unowned-loop",
      `${PLAIN}
gsap.to(mark, {
  rotation: 360,
  ease: "none",
  repeat: -1,
  scrollTrigger: { trigger: mark, toggleActions: "play pause resume pause" },
});
`,
      { ext: "ts" },
    );
  });
});

describe("ungated-hover", () => {
  test("fires on a pointerenter tween with no hover gate", () => {
    fires(
      "ungated-hover",
      `${PLAIN}
card.addEventListener("pointerenter", () => {
  gsap.to(card, { scale: 1.05, duration: 0.3 });
});
`,
      { ext: "ts" },
    );
  });

  test("fires on a JSX onMouseEnter handler", () => {
    fires(
      "ungated-hover",
      `${REACT}
export function Card() {
  const ref = useRef(null);
  const onEnter = () => {
    gsap.to(ref.current, { scale: 1.05, duration: 0.3 });
  };
  return <div ref={ref} onMouseEnter={onEnter} />;
}`,
    );
  });

  test("stays quiet when a matchMedia gates it on (hover: hover)", () => {
    quiet(
      "ungated-hover",
      `${PLAIN}
const mm = gsap.matchMedia();
mm.add("(hover: hover)", () => {
  card.addEventListener("pointerenter", () => {
    gsap.to(card, { scale: 1.05, duration: 0.3 });
  });
});
`,
      { ext: "ts" },
    );
  });
});

describe("delay-chain", () => {
  test("fires on three tweens sequenced by delay in one scope", () => {
    fires(
      "delay-chain",
      `${PLAIN}
export function intro() {
  gsap.from(mark, { autoAlpha: 0, duration: 0.6 });
  gsap.from(word, { autoAlpha: 0, duration: 0.6, delay: 0.5 });
  gsap.from(lead, { autoAlpha: 0, duration: 0.6, delay: 1 });
  gsap.from(cta, { autoAlpha: 0, duration: 0.6, delay: 1.4 });
}
`,
      { ext: "ts", count: 1 },
    );
  });

  test("stays quiet on two delays, and on a timeline with positions", () => {
    quiet(
      "delay-chain",
      `${PLAIN}
export function pair() {
  gsap.from(mark, { autoAlpha: 0, delay: 0.2 });
  gsap.from(word, { autoAlpha: 0, delay: 0.6 });
}
`,
      { ext: "ts" },
    );
    quiet(
      "delay-chain",
      `${PLAIN}
export function scene() {
  const tl = gsap.timeline();
  tl.from(mark, { autoAlpha: 0 })
    .from(word, { autoAlpha: 0 }, "-=0.2")
    .from(lead, { autoAlpha: 0 }, "<")
    .from(cta, { autoAlpha: 0 }, "<0.1");
}
`,
      { ext: "ts" },
    );
  });
});

describe("unreverted-context", () => {
  test("fires on a Vue context built on mount that nothing reverts", () => {
    fires(
      "unreverted-context",
      `<template>
  <section ref="root"><p>Don't wait</p></section>
</template>

<script setup lang="ts">
import gsap from "gsap";
import { onMounted, ref } from "vue";

const root = ref<HTMLElement | null>(null);

onMounted(() => {
  gsap.context(() => {
    gsap.from("[data-item]", { autoAlpha: 0, y: 24, stagger: 0.06 });
  }, root.value);
});
</script>`,
      { ext: "vue" },
    );
  });

  test("stays quiet when onUnmounted reverts the context it was assigned to", () => {
    quiet(
      "unreverted-context",
      `<script setup>
import gsap from "gsap";
import { onMounted, onUnmounted, ref } from "vue";

const root = ref(null);
let ctx;

onMounted(() => {
  ctx = gsap.context(() => {
    gsap.from("[data-item]", { autoAlpha: 0, y: 24 });
  }, root.value);
});

onUnmounted(() => ctx?.revert());
</script>`,
      { ext: "vue" },
    );
  });

  test("fires on an Astro page-load context with no swap teardown", () => {
    fires(
      "unreverted-context",
      `<script>
import gsap from "gsap";

document.addEventListener("astro:page-load", () => {
  gsap.context(() => {
    gsap.from("[data-item]", { autoAlpha: 0, y: 24 });
  });
});
</script>`,
      { ext: "astro" },
    );
  });

  test("stays quiet on an Astro context reverted before the swap", () => {
    quiet(
      "unreverted-context",
      `<script>
import gsap from "gsap";

let ctx;

document.addEventListener("astro:page-load", () => {
  ctx = gsap.context(() => {
    gsap.from("[data-item]", { autoAlpha: 0, y: 24 });
  });
});

document.addEventListener("astro:before-swap", () => ctx?.revert());
</script>`,
      { ext: "astro" },
    );
  });

  test("stays quiet on a Svelte effect that returns its own revert", () => {
    quiet(
      "unreverted-context",
      `<script>
  import gsap from "gsap";

  let root;

  $effect(() => {
    const ctx = gsap.context(() => {
      gsap.from("[data-item]", { autoAlpha: 0, y: 24 });
    }, root);

    return () => ctx.revert();
  });
</script>

<section bind:this={root}>a</section>`,
      { ext: "svelte" },
    );
  });

  test("fires on a React useEffect context with no cleanup", () => {
    fires(
      "unreverted-context",
      `${REACT}
export function Box() {
  const root = useRef(null);
  useEffect(() => {
    gsap.context(() => {
      gsap.from("[data-item]", { y: 20 });
    }, root.current);
  }, []);
  return <div ref={root} />;
}`,
    );
  });

  test("stays quiet on a context the module hands to its caller", () => {
    quiet(
      "unreverted-context",
      `${PLAIN}
export function mountReveal(root) {
  const ctx = gsap.context(() => {
    gsap.from("[data-item]", { autoAlpha: 0, y: 24 });
  }, root);

  return () => ctx.revert();
}`,
      { ext: "ts" },
    );
  });
});

describe("state-per-event, per frame", () => {
  test("fires on React state set inside useFrame", () => {
    fires(
      "state-per-event",
      `"use client";
import { useFrame } from "@react-three/fiber";
import { useState } from "react";

export function Rig() {
  const [spin, setSpin] = useState(0);
  useFrame((state) => {
    setSpin(state.clock.elapsedTime);
  });
  return null;
}`,
    );
  });

  test("stays quiet when useFrame writes a ref", () => {
    quiet(
      "state-per-event",
      `"use client";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export function Rig() {
  const mesh = useRef(null);
  useFrame((state) => {
    mesh.current.rotation.y = state.clock.elapsedTime;
  });
  return null;
}`,
    );
  });
});

/**
 * Both rules below come from a head-to-head test on a real React + Vite hero,
 * where the version written with this skill shipped both bugs and the version
 * written without it shipped neither. The firing cases are that code with its
 * fix removed; the quiet cases include the fixed code, and the two nearby
 * shapes a careless rule would have reported.
 */
describe("matchmedia-never-runs", () => {
  test("fires on a callback that branches on a condition no default visitor has", () => {
    fires(
      "matchmedia-never-runs",
      `${REACT}
export function Hero() {
  const scope = useRef(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(
      { reduced: "(prefers-reduced-motion: reduce)" },
      (context) => {
        const { reduced } = context.conditions;
        if (reduced) {
          gsap.set(".title", { autoAlpha: 1 });
          return;
        }
        gsap.from(".title", { autoAlpha: 0, y: 24 });
      },
    );
  }, { scope });
  return <section ref={scope} />;
}`,
    );
  });

  test("fires when the conditions are read without destructuring", () => {
    fires(
      "matchmedia-never-runs",
      `${PLAIN}
const mm = gsap.matchMedia();
mm.add({ reduced: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  if (!ctx.conditions.reduced) gsap.from(".title", { autoAlpha: 0 });
});`,
      { ext: "ts" },
    );
  });

  test("stays quiet once a no-preference condition sits beside it — the fix", () => {
    quiet(
      "matchmedia-never-runs",
      `${PLAIN}
const mm = gsap.matchMedia();
mm.add(
  {
    reduced: "(prefers-reduced-motion: reduce)",
    motion: "(prefers-reduced-motion: no-preference)",
  },
  (context) => {
    const { reduced } = context.conditions;
    if (reduced) return gsap.set(".title", { autoAlpha: 1 });
    gsap.from(".title", { autoAlpha: 0 });
  },
);`,
      { ext: "ts" },
    );
  });

  /**
   * GSAP's own documented pattern: a reduced-only branch that sets end states,
   * beside a separate add for everyone else. It must never fire, because it is
   * correct — it is meant to run only for visitors who asked for less motion.
   */
  test("stays quiet on a reduced-only branch that does not branch on its conditions", () => {
    quiet(
      "matchmedia-never-runs",
      `${PLAIN}
const mm = gsap.matchMedia();
mm.add("(prefers-reduced-motion: no-preference)", () => {
  gsap.from(".title", { autoAlpha: 0 });
});
mm.add("(prefers-reduced-motion: reduce)", () => {
  gsap.set(".title", { autoAlpha: 1 });
});`,
      { ext: "ts" },
    );
  });

  test("stays quiet on an object of width conditions, which most visitors match", () => {
    quiet(
      "matchmedia-never-runs",
      `${PLAIN}
const mm = gsap.matchMedia();
mm.add({ isDesktop: "(min-width: 800px)" }, (context) => {
  const { isDesktop } = context.conditions;
  gsap.to(".panel", { x: isDesktop ? 200 : 0 });
});`,
      { ext: "ts" },
    );
  });

  test("stays quiet on a timeline's add, which only shares the name", () => {
    quiet(
      "matchmedia-never-runs",
      `${PLAIN}
const tl = gsap.timeline();
tl.add({ reduced: "(prefers-reduced-motion: reduce)" }, (context) => context.conditions);`,
      { ext: "ts" },
    );
  });
});

describe("stacked-from", () => {
  /**
   * The shape from the real hero: one \`.fromTo\` call site inside a helper that
   * a loop calls once per state. Every call applies its start state the moment
   * it is built, so the last one wins and holds its target hidden until the
   * playhead reaches it — the badge was invisible for the whole first state.
   */
  test("fires on a from-tween in a helper that a loop calls with the same target", () => {
    fires(
      "stacked-from",
      `${REACT}
export function Emblem() {
  const badge = useRef(null);
  useGSAP(() => {
    const tl = gsap.timeline();
    const addBeat = (state) => {
      tl.addLabel(state).fromTo(badge.current, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0 }, state);
    };
    ["money", "cards", "final"].forEach((state) => {
      addBeat(state);
    });
  });
  return <span ref={badge} />;
}`,
    );
  });

  test("fires on a from-tween directly inside a loop with a fixed target", () => {
    fires(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
for (const label of ["a", "b", "c"]) {
  tl.from(".badge", { autoAlpha: 0 }, label);
}`,
      { ext: "ts" },
    );
  });

  test("fires on two from-tweens written out against the same target", () => {
    fires(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
tl.from(".badge", { autoAlpha: 0 })
  .to(".badge", { autoAlpha: 0 }, "+=1")
  .from(".badge", { autoAlpha: 0, y: 8 });`,
      { ext: "ts" },
    );
  });

  test("stays quiet once immediateRender is false — the fix", () => {
    quiet(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
const addBeat = (state) => {
  tl.fromTo(".badge", { autoAlpha: 0 }, { autoAlpha: 1, immediateRender: false }, state);
};
["money", "cards", "final"].forEach((state) => addBeat(state));`,
      { ext: "ts" },
    );
  });

  test("stays quiet when each pass targets a different element", () => {
    quiet(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
document.querySelectorAll(".card").forEach((card) => {
  tl.from(card, { autoAlpha: 0, y: 20 }, "<0.1");
});`,
      { ext: "ts" },
    );
  });

  /**
   * The trap in the same real file: a from-tween inside a callback that is only
   * passed along, and only invoked for one of the states. Reporting it would
   * have been a false finding sitting right next to the true one.
   */
  test("stays quiet on a from-tween inside a callback that is only passed along", () => {
    quiet(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
const addBeat = (state, extra) => {
  tl.addLabel(state);
  extra?.(state);
};
["money", "insights"].forEach((state) => {
  addBeat(state, state === "insights" ? (label) => {
    tl.fromTo("[data-bar]", { scaleY: 0 }, { scaleY: 1 }, label);
  } : undefined);
});`,
      { ext: "ts" },
    );
  });

  test("stays quiet on gsap.from outside a timeline, which renders on its own schedule", () => {
    quiet(
      "stacked-from",
      `${PLAIN}
["a", "b"].forEach(() => {
  gsap.from(".badge", { autoAlpha: 0 });
});`,
      { ext: "ts" },
    );
  });

  /**
   * From the corpus: a fade-in built in the `if` and a fade-out in the `else`,
   * against the same element. Only one branch ever runs, so nothing is stacked.
   * The first version of this rule reported it — twice, once per target.
   */
  test("stays quiet on from-tweens in opposite branches of one if", () => {
    quiet(
      "stacked-from",
      `${PLAIN}
export function toggle(open, effect) {
  const timeline = gsap.timeline();
  if (open) {
    timeline.fromTo(effect, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1 });
  } else {
    timeline.fromTo(effect, { opacity: 1, scale: 1 }, { opacity: 0, scale: 1.08 });
  }
}`,
      { ext: "ts" },
    );
  });

  /**
   * From the corpus: two from-tweens on one element that set different
   * properties. "Last one wins" is per property, so neither hides the other —
   * a line flies in on opacity and y while a second tween turns it on
   * rotationY. That is choreography, not a bug.
   */
  test("stays quiet when the start states set different properties", () => {
    quiet(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
tl.from(".wish span", { opacity: 0, y: -50, rotation: 150 })
  .fromTo(".wish span", { scale: 1.4, rotationY: 150 }, { scale: 1, rotationY: 0 }, "party");`,
      { ext: "ts" },
    );
  });

  test("fires when opacity and autoAlpha, which are the same property, collide", () => {
    fires(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
tl.from(".badge", { opacity: 0 }).fromTo(".badge", { autoAlpha: 0 }, { autoAlpha: 1 }, "+=1");`,
      { ext: "ts" },
    );
  });

  /**
   * From the version built WITHOUT the skill, in the same head-to-head: a loop
   * over states, with a fromTo guarded by `key === 'money'`. That selects one
   * pass, so the tween is built once. The rule reported it, and would have
   * credited that version with a bug it did not have.
   */
  test("stays quiet on a from-tween in a loop that an equality guard limits to one pass", () => {
    quiet(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
const STATES = ["brand", "money", "insights"];
for (let i = 1; i < STATES.length; i++) {
  const key = STATES[i];
  if (key === "money" && dot) {
    tl.fromTo(dot, { attr: { cx: 34 } }, { attr: { cx: 50 } }, "state-" + i);
  }
}`,
      { ext: "ts" },
    );
  });

  /** The same guard turned around runs on most passes, and still stacks. */
  test("fires when the guard in the loop excludes one pass instead of selecting it", () => {
    fires(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
for (const state of ["brand", "money", "insights"]) {
  if (state !== "brand") {
    tl.fromTo(".badge", { autoAlpha: 0 }, { autoAlpha: 1 }, state);
  }
}`,
      { ext: "ts" },
    );
  });

  test("stays quiet on one from-tween per target", () => {
    quiet(
      "stacked-from",
      `${PLAIN}
const tl = gsap.timeline();
tl.from(".title", { autoAlpha: 0 }).from(".lead", { autoAlpha: 0 }, "-=0.3");`,
      { ext: "ts" },
    );
  });
});

/**
 * The first real project either new rule met threw on it, and a thrown rule
 * takes the whole audit down — every consumer's lint fails, not one finding.
 * No fixture had an uninitialised `let`; real code has them everywhere. These
 * are the shapes real code has and hand-written fixtures tend not to.
 */
describe("the two new rules survive shapes fixtures leave out", () => {
  const AWKWARD = `${PLAIN}
let tl;
let mm;
var ready;
const shared = { reduced: "(prefers-reduced-motion: reduce)" };
mm = gsap.matchMedia();
mm.add({ ...shared }, (context) => context.conditions);
mm.add();
tl = gsap.timeline();
tl.from();
tl.fromTo(".badge", { ...shared }, { autoAlpha: 1 });
for (;;) { break; }
while (ready) { tl.from(".x", {}); ready = false; }
[].forEach();
`;

  test("matchmedia-never-runs does not throw on them", () => {
    quiet("matchmedia-never-runs", AWKWARD, { ext: "ts" });
  });

  test("stacked-from does not throw on them", () => {
    assert.doesNotThrow(() => {
      try {
        quiet("stacked-from", AWKWARD, { ext: "ts" });
      } catch (error) {
        if (error instanceof TypeError) throw error;
      }
    });
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
