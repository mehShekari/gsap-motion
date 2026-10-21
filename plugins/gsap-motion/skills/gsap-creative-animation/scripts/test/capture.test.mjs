/**
 * What `inspect` decides before Chrome starts.
 *
 * The capture itself needs a browser and is not run here — CI has no display
 * budget for it, and a test that launches Chrome is the kind that fails for
 * reasons nobody can reproduce. What is tested is everything that can be wrong
 * without one: the options, the order of the steps, and the combinations that
 * would measure something no device is.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frameName, parseOptions, pointable, prepareOut, probe, report } from "../capture-motion.mjs";

describe("where frames go", () => {
  test("the default folder ignores itself, and nothing else is touched", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gsap-motion-out-"));
    try {
      const out = prepareOut(join(".gsap-motion", "inspect"), cwd);
      assert.equal(out, join(cwd, ".gsap-motion", "inspect"));
      assert.match(readFileSync(join(cwd, ".gsap-motion", ".gitignore"), "utf8"), /^\*$/m);
      assert.equal(existsSync(join(cwd, ".gitignore")), false);

      prepareOut("frames", cwd);
      assert.equal(existsSync(join(cwd, "frames", ".gitignore")), false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("inspect options", () => {
  test("needs a URL, and says so rather than starting a browser", () => {
    const { errors } = parseOptions([]);
    assert.deepEqual(errors, ["No URL. Pass the page to watch."]);
  });

  test("--seek takes a name on window, and needs --at in seconds", () => {
    const options = parseOptions(["u", "--seek", "__film.seek", "--at", "3.6,3,3.3"]);
    assert.deepEqual(options.errors, []);
    assert.equal(options.seek, "__film.seek");
    assert.deepEqual(options.at, [3, 3.3, 3.6]);
    assert.match(parseOptions(["u", "--seek", "__seek"]).errors.join(" "), /needs --at/);
    /** Spliced into the page's code, so anything but a name is refused. */
    assert.match(parseOptions(["u", "--seek", "x);alert(1", "--at", "1"]).errors.join(" "), /name of a function/);
  });

  test("names a seeked frame by its timeline second, and a clocked one by its millisecond", () => {
    assert.equal(frameName(3.3, { seek: "__seek" }), "frame-0003.300s.png");
    assert.equal(frameName(300, { seek: null }), "frame-00300ms.png");
  });

  test("prints the timeline probe without a URL, since it opens no page", () => {
    assert.deepEqual(parseOptions(["--probe", "timeline"]).errors, []);
    assert.match(parseOptions(["--probe", "frames"]).errors.join(" "), /--probe/);
  });

  test("the timeline probe is a whole function, and says null without GSAP", () => {
    const window = {};
    const document = { querySelectorAll: () => [] };
    const run = new Function("window", "document", `return (${probe()})();`);
    assert.equal(run(window, document), null);
  });

  test("captures at three times by default, and settles first", () => {
    const options = parseOptions(["https://example.com"]);
    assert.deepEqual(options.errors, []);
    assert.equal(options.url, "https://example.com");
    assert.deepEqual(options.at, [0, 300, 900]);
    assert.equal(options.wait, 400);
  });

  test("reads --at as milliseconds, in order", () => {
    const options = parseOptions(["u", "--at", "900,0,300"]);
    assert.deepEqual(options.at, [0, 300, 900]);
  });

  test("refuses an --at that is not milliseconds", () => {
    for (const bad of ["soon", "0,later", "-5"]) {
      const { errors } = parseOptions(["u", "--at", bad]);
      assert.match(errors.join(" "), /--at takes milliseconds/, bad);
    }
  });

  test("keeps the steps in the order they were written", () => {
    const options = parseOptions([
      "u",
      "--hover",
      ".card",
      "--scroll",
      "600",
      "--click",
      "button",
    ]);
    assert.deepEqual(options.steps, [
      { type: "hover", value: ".card" },
      { type: "scroll", value: "600" },
      { type: "click", value: "button" },
    ]);
  });

  test("takes a scroll target as pixels or as a selector", () => {
    assert.deepEqual(parseOptions(["u", "--scroll", "800"]).steps, [
      { type: "scroll", value: "800" },
    ]);
    assert.deepEqual(parseOptions(["u", "--scroll", "#pricing"]).steps, [
      { type: "scroll", value: "#pricing" },
    ]);
  });

  test("refuses --mobile with --hover, because a touch device has no hover", () => {
    const { errors } = parseOptions(["u", "--mobile", "--hover", ".card"]);
    assert.match(errors.join(" "), /--mobile and --hover cannot be combined/);
  });

  test("allows --mobile with a scroll or a click, which touch devices do have", () => {
    assert.deepEqual(parseOptions(["u", "--mobile", "--scroll", "400"]).errors, []);
    assert.deepEqual(parseOptions(["u", "--mobile", "--click", "button"]).errors, []);
  });

  test("reads the conditions", () => {
    const options = parseOptions(["u", "--reduced", "--dark", "--cpu", "4", "--json"]);
    assert.deepEqual(options.errors, []);
    assert.equal(options.reduced, true);
    assert.equal(options.dark, true);
    assert.equal(options.cpu, 4);
    assert.equal(options.json, true);
  });

  test("refuses a CPU factor below 1, which would speed the machine up", () => {
    const { errors } = parseOptions(["u", "--cpu", "0.5"]);
    assert.match(errors.join(" "), /--cpu takes a factor of 1 or more/);
  });

  test("names an unknown option rather than ignoring it", () => {
    const { errors } = parseOptions(["u", "--filmstrip"]);
    assert.deepEqual(errors, ["Unknown option: --filmstrip"]);
  });
});

/**
 * What the report says about a page it could not fully read.
 *
 * Found on a real site: a bundled app never publishes gsap, because GSAP
 * installs its exports into a private object and the branch of its installer
 * that would reach window cannot be taken. The first version of this probe
 * asked for a gsap global, did not find one, and told the reader that nothing
 * was animating — on a page running 228 animated elements. A tool that reports
 * a wrong absence is worse than one that reports nothing.
 */
describe("inspect report", () => {
  const base = {
    url: "http://localhost:3000/fa",
    frames: [],
    measured: { frames: 1, layouts: 2, layoutTime: 0, recalcs: 3, recalcTime: 0 },
    notes: [],
  };
  const plain = parseOptions([base.url]);

  test("warns that a canvas was drawn without the GPU, unless it ran headed", () => {
    const result = { ...base, timeline: null, canvases: 2 };
    assert.match(report(result, plain), /2 canvases on the page, and Chrome ran without its GPU/);
    const headed = parseOptions([base.url, "--headed"]);
    assert.equal(headed.headed, true);
    assert.doesNotMatch(report(result, headed), /without its GPU/);
    assert.match(report(result, headed), /headed, on the GPU/);
    assert.doesNotMatch(report({ ...result, canvases: 0 }, plain), /without its GPU/);
  });

  test("says nothing was there only when nothing was there", () => {
    const text = report({ ...base, timeline: null }, plain);
    assert.match(text, /no GSAP on the page/);
  });

  test("reports a bundled page as unreadable, not as dead", () => {
    const text = report(
      { ...base, timeline: { readable: false, version: "3.15.0", controlled: 228 } },
      plain,
    );
    assert.doesNotMatch(text, /nothing was animating/);
    assert.match(text, /GSAP 3\.15\.0 is running/);
    assert.match(text, /cannot be read from outside/);
    assert.match(text, /228 elements carry/);
    assert.match(text, /gsap\.install\(window\)/);
  });

  test("counts one controlled element in the singular", () => {
    const text = report(
      { ...base, timeline: { readable: false, version: null, controlled: 1 } },
      plain,
    );
    assert.match(text, /1 element carries GSAP's cache/);
  });

  test("still reads a timeline it can reach", () => {
    const text = report(
      {
        ...base,
        timeline: {
          readable: true,
          version: "3.15.0",
          controlled: 4,
          time: 1.5,
          children: [
            {
              targets: ["#box"],
              duration: 4,
              repeat: -1,
              yoyo: true,
              paused: false,
              ease: "power2.inOut",
              props: ["x"],
            },
          ],
        },
      },
      plain,
    );
    assert.match(text, /#box · 4s, repeats forever, yoyo, ease power2\.inOut · x/);
  });

  test("says so when the timeline is readable and empty", () => {
    const text = report(
      { ...base, timeline: { readable: true, version: null, controlled: 0, time: 0, children: [] } },
      plain,
    );
    assert.match(text, /has no children right now/);
  });
});

/**
 * A selector can match something that cannot be pointed at. Found on a real
 * site: a header held two copies of one button, and the first had a zero box,
 * so a click aimed at its centre landed at 0,0 and was reported as a click on
 * the selector.
 */
describe("what can be pointed at", () => {
  test("a box with size can", () => {
    assert.equal(pointable({ x: 64, y: 18, width: 36, height: 36 }), true);
  });

  test("an element with no box cannot, however visible its styles say it is", () => {
    assert.equal(pointable({ x: 0, y: 0, width: 0, height: 0 }), false);
  });

  test("a sliver with no height cannot", () => {
    assert.equal(pointable({ x: 10, y: 10, width: 120, height: 0 }), false);
  });

  test("nothing at all cannot", () => {
    assert.equal(pointable(null), false);
  });
});
