/**
 * What the visual audit concludes from what it recorded.
 *
 * The recording needs a browser; the reasoning does not. Everything that turns
 * a frame log into a finding is a pure function here, and every one of these
 * cases is a shape seen on a real page — roboshan, or the control tween — not
 * an invention. That is the whole lesson of 3.4.1: the bugs were in what the
 * code concluded about a real page, and no fixture had ever shown it one.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  afterScroll,
  coverage,
  firstMotion,
  motionOverText,
  parseOptions,
  seamEvents,
  seams,
  starts,
} from "../review-motion.mjs";

const VIEWPORT = { width: 1000, height: 500 };

describe("time to first motion", () => {
  test("is when something first moved, not when the page loaded", () => {
    const log = [
      { at: 423, moved: [{ key: "path", gsap: true }] },
      { at: 440, moved: [{ key: "path", gsap: true }] },
    ];
    assert.equal(firstMotion(log), 423);
  });

  test("is null when nothing ever moved, which is a finding of its own", () => {
    assert.equal(firstMotion([]), null);
  });
});

describe("how much of the screen is moving", () => {
  test("counts overlapping boxes once, not twice", () => {
    /** Two identical boxes, one nested in the other: a quarter of the screen. */
    const boxes = [
      [0, 0, 500, 250],
      [0, 0, 500, 250],
    ];
    assert.equal(coverage(boxes, VIEWPORT), 0.25);
  });

  test("adds up boxes that do not overlap", () => {
    const boxes = [
      [0, 0, 500, 250],
      [500, 250, 500, 250],
    ];
    assert.equal(coverage(boxes, VIEWPORT), 0.5);
  });

  test("clips to the viewport, so an off-screen box does not inflate it", () => {
    const boxes = [[900, 0, 500, 500]];
    assert.equal(coverage(boxes, VIEWPORT), 0.1);
  });

  test("ignores a box entirely off-screen", () => {
    assert.equal(coverage([[2000, 0, 100, 100]], VIEWPORT), 0);
  });

  test("a page where everything moves reads as one", () => {
    assert.equal(coverage([[0, 0, 1000, 500]], VIEWPORT), 1);
  });

  test("nothing moving is zero, not a division by nothing", () => {
    assert.equal(coverage([], VIEWPORT), 0);
  });
});

describe("loop seams", () => {
  /** A loop that jumps back to its start shows one frame unlike its neighbours. */
  test("finds the jump when a loop restarts without a tween back", () => {
    /** A marquee: twenty frames of even travel, then snapped back to zero. */
    const track = [];
    for (let i = 0; i < 20; i += 1) track.push({ at: i * 16, x: i * 10 });
    track.push({ at: 320, x: 0 });
    track.push({ at: 336, x: 10 });

    const found = seams(track);
    assert.equal(found.length, 1);
    assert.equal(found[0].at, 320);
    assert.equal(found[0].jump, 190);
  });

  test("says nothing about a loop that travels evenly", () => {
    const track = [0, 16, 32, 48, 64, 80].map((at, i) => ({ at, x: i * 10 }));
    assert.deepEqual(seams(track), []);
  });

  test("says nothing about an eased tween, where steps differ but never jump", () => {
    /** power2.out: big steps first, then small. No step is an outlier. */
    const track = [0, 16, 32, 48, 64, 80, 96].map((at, i) => ({
      at,
      x: Math.round(100 * (1 - Math.pow(1 - i / 6, 2))),
    }));
    assert.deepEqual(seams(track), []);
  });

  /**
   * The case that sets the threshold. A hard ease-out takes a huge first step
   * and a tiny last one, so its largest step is several times its median — 3.8x
   * for power4.out. Anything under about 5 would call every such tween torn,
   * which is why the factor is 6 and not 3.
   */
  test("says nothing about a hard ease-out, whose first step dwarfs its last", () => {
    const track = [];
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      track.push({ at: i * 16, x: Math.round(100 * (1 - Math.pow(1 - t, 4)) * 10) / 10 });
    }
    assert.deepEqual(seams(track), []);
  });

  /**
   * From the first run against a real page: an orbiting dot whose median step
   * is a fraction of a pixel. Any wobble is many times that, so a ratio alone
   * called a 7.6px drift a tear. A seam has to be big enough to see.
   */
  test("says nothing about a wobble that is large only in proportion", () => {
    const track = [];
    for (let i = 0; i < 24; i += 1) track.push({ at: i * 16, x: i % 2 ? 0.2 : 0 });
    track.push({ at: 384, x: 7.6 });
    assert.deepEqual(seams(track), []);
  });

  test("needs enough frames to know what normal is", () => {
    assert.deepEqual(seams([{ at: 0, x: 0 }, { at: 16, x: 400 }]), []);
  });
});

describe("motion over text", () => {
  const text = [{ key: "p.lead", box: [100, 100, 300, 40] }];

  test("reports a moving box that covers the text being read", () => {
    const moving = [{ key: "div.overlay", box: [90, 90, 320, 60] }];
    const found = motionOverText(moving, text);
    assert.equal(found.length, 1);
    assert.equal(found[0].text, "p.lead");
    assert.equal(found[0].over, "div.overlay");
  });

  test("says nothing when the motion is elsewhere", () => {
    const moving = [{ key: "div.hero", box: [600, 300, 200, 100] }];
    assert.deepEqual(motionOverText(moving, text), []);
  });

  test("ignores a graze, because a shared edge is not motion over text", () => {
    /** Overlaps by 4px of 40: the reader is not losing the line. */
    const moving = [{ key: "div.rule", box: [100, 136, 300, 20] }];
    assert.deepEqual(motionOverText(moving, text), []);
  });

  /**
   * Also from that run: a fixed sheet covering the whole page was reported as
   * covering every line on it. It was there, but at an opacity nobody reads
   * through, so it was not in the way.
   */
  test("ignores a sheet too faint to read through", () => {
    const moving = [{ key: "div.fixed", box: [0, 0, 1000, 500], opacity: 0.02 }];
    assert.deepEqual(motionOverText(moving, text), []);
  });

  test("reports a sheet that is actually opaque", () => {
    const moving = [{ key: "div.fixed", box: [0, 0, 1000, 500], opacity: 0.9 }];
    assert.equal(motionOverText(moving, text).length, 1);
  });

  test("does not report the text moving as motion over itself", () => {
    const moving = [{ key: "p.lead", box: [100, 100, 300, 40] }];
    assert.deepEqual(motionOverText(moving, text), []);
  });
});

describe("when things start", () => {
  test("gives each element the moment it first moved, in order", () => {
    const log = [
      { at: 100, moved: [{ key: "a" }] },
      { at: 120, moved: [{ key: "b" }, { key: "a" }] },
      { at: 300, moved: [{ key: "c" }] },
    ];
    assert.deepEqual(starts(log), [
      { key: "a", at: 100 },
      { key: "b", at: 120 },
      { key: "c", at: 300 },
    ]);
  });

  test("is empty for a page that never moved", () => {
    assert.deepEqual(starts([]), []);
  });
});

describe("review options", () => {
  test("needs a URL", () => {
    assert.match(parseOptions([]).errors.join(" "), /No URL/);
  });

  test("watches for three seconds by default", () => {
    const options = parseOptions(["http://localhost:3000"]);
    assert.deepEqual(options.errors, []);
    assert.equal(options.watch, 3000);
  });

  test("reads the conditions inspect already understands", () => {
    const options = parseOptions([
      "u",
      "--watch",
      "5000",
      "--scroll",
      "2200",
      "--mobile",
      "--cpu",
      "4",
      "--reduced",
      "--json",
    ]);
    assert.deepEqual(options.errors, []);
    assert.equal(options.watch, 5000);
    assert.equal(options.scroll, "2200");
    assert.equal(options.mobile, true);
    assert.equal(options.cpu, 4);
    assert.equal(options.reduced, true);
    assert.equal(options.json, true);
  });

  test("refuses a watch too short to see a frame", () => {
    assert.match(parseOptions(["u", "--watch", "10"]).errors.join(" "), /--watch/);
  });

  test("names an unknown option rather than ignoring it", () => {
    assert.deepEqual(parseOptions(["u", "--seams"]).errors, ["Unknown option: --seams"]);
  });
});

/**
 * Jumping the scrollbar is how this tool reaches a scene further down, and a
 * scrubbed animation answers an instant scroll by moving instantly — which is
 * correct behaviour. A real page reported 575px and 77px tears at the exact
 * moment of the scroll; that is the method's doing, not the page's.
 */
describe("seams a scroll caused", () => {
  const found = [
    { at: 566, jump: 1090 },
    { at: 3014, jump: 575 },
  ];

  test("drops the one that lands in the scroll's wake", () => {
    assert.deepEqual(afterScroll(found, [3000]), [{ at: 566, jump: 1090 }]);
  });

  test("keeps a seam that is merely later", () => {
    assert.deepEqual(afterScroll([{ at: 3400, jump: 500 }], [3000]), [{ at: 3400, jump: 500 }]);
  });

  test("keeps everything when nothing scrolled", () => {
    assert.deepEqual(afterScroll(found, []), found);
  });

  test("does not drop a seam before the scroll", () => {
    assert.deepEqual(afterScroll([{ at: 2900, jump: 500 }], [3000]), [{ at: 2900, jump: 500 }]);
  });
});

/**
 * Elements that move together tear together. A real page reported five rects
 * jumping 25-30px in the same two frames: that reads as five problems and is
 * one lurch.
 */
describe("grouping seams into events", () => {
  const torn = [
    { key: "rect", seams: [{ at: 4893, jump: 29.3 }] },
    { key: "rect", seams: [{ at: 4893, jump: 27.7 }] },
    { key: "rect", seams: [{ at: 4909, jump: 25.4 }] },
    { key: "path", seams: [{ at: 8200, jump: 400 }] },
  ];

  test("makes one event of the lurch and one of the later jump", () => {
    const events = seamEvents(torn);
    assert.equal(events.length, 2);
    assert.equal(events[0].at, 4893);
    assert.equal(events[0].count, 1);
    assert.equal(events[0].least, 25.4);
    assert.equal(events[0].most, 29.3);
    assert.equal(events[1].at, 8200);
  });

  test("counts the distinct elements involved", () => {
    const events = seamEvents([
      { key: "li.card", seams: [{ at: 1000, jump: 40 }] },
      { key: "div.rail", seams: [{ at: 1010, jump: 44 }] },
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].count, 2);
  });

  test("keeps events that are genuinely apart", () => {
    const events = seamEvents([
      { key: "a", seams: [{ at: 1000, jump: 40 }] },
      { key: "a", seams: [{ at: 1200, jump: 40 }] },
    ]);
    assert.equal(events.length, 2);
  });

  test("a page with no seams has no events", () => {
    assert.deepEqual(seamEvents([]), []);
  });
});
