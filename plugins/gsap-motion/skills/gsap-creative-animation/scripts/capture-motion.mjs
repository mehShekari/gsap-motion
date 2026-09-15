#!/usr/bin/env node

/**
 * Watches a page animate, and reports what it saw.
 *
 * Everything here is an observation, never a verdict. It captures frames at
 * given times, reads the timeline GSAP is actually running, and counts the
 * layouts, style recalculations and frames the browser did — and then says so,
 * with numbers. Whether 14 layouts in a second is a problem depends on the
 * animation, and that judgement belongs to whoever reads this.
 *
 * It drives Chrome over the DevTools Protocol through a pipe — `stdin` and
 * `stdout` of two extra file descriptors — rather than a WebSocket, because
 * Node 18 has no global WebSocket and this skill installs nothing. It uses
 * whatever Chrome the machine already has.
 *
 * Usage, from the project root:
 *   node <skill-dir>/scripts/capture-motion.mjs <url> [options]
 *
 *   --at 0,300,900        when to capture, in ms after the page settles
 *   --wait 400            settle time before the first capture (default 400)
 *   --out <dir>           where frames go (default .gsap-motion/inspect)
 *   --scroll <px|sel>     scroll before capturing: a number, or to a selector
 *   --hover <selector>    move the pointer onto an element, at its live box
 *   --click <selector>    click an element
 *   --reduced             emulate prefers-reduced-motion: reduce
 *   --dark                emulate prefers-color-scheme: dark
 *   --mobile              390x844 at dpr 3, with touch input
 *   --cpu 4               throttle the CPU by this factor
 *   --json                machine-readable, for scripts
 *   --chrome <path>       a browser to use, overriding the search
 *
 * `--scroll`, `--hover` and `--click` run in the order they are written, before
 * the first capture. An animation that needs a pointer or a scroll position is
 * invisible without them.
 *
 * `--mobile` makes input touch, so it cannot be combined with `--hover`: a
 * device with a coarse pointer has no hover, which is the point.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- The browser -------------------------------------------------------------

/** Where a Chrome usually is, per platform. `CHROME_PATH` wins over all of it. */
export function findChrome(override) {
  const candidates = [
    override,
    process.env.GSAP_MOTION_CHROME,
    process.env.CHROME_PATH,
    ...(process.platform === "win32"
      ? [
          `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
          ]),
  ];

  return candidates.find((path) => path && existsSync(path)) ?? null;
}

/**
 * A CDP connection over Chrome's pipe transport: commands into file descriptor
 * 3, replies and events out of 4, each message a JSON object followed by a NUL.
 */
export function connect(executable, { headless = true } = {}) {
  const profile = join(tmpdir(), `gsap-motion-inspect-${process.pid}`);
  const chrome = spawn(
    executable,
    [
      ...(headless ? ["--headless=new"] : []),
      "--remote-debugging-pipe",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-extensions",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] },
  );

  const [, , stderr, toBrowser, fromBrowser] = chrome.stdio;
  const stderrLines = [];
  stderr.on("data", (chunk) => stderrLines.push(chunk.toString()));

  const waiting = new Map();
  let buffer = "";

  fromBrowser.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let end = buffer.indexOf("\0");
    while (end !== -1) {
      let message;
      try {
        message = JSON.parse(buffer.slice(0, end));
      } catch {
        message = null;
      }
      buffer = buffer.slice(end + 1);
      const pending = message?.id && waiting.get(message.id);
      if (pending) {
        waiting.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "CDP error"));
        else pending.resolve(message.result);
      }
      end = buffer.indexOf("\0");
    }
  });

  let nextId = 0;
  const send = (method, params = {}, sessionId) =>
    new Promise((accept, reject) => {
      const id = (nextId += 1);
      waiting.set(id, { resolve: accept, reject });
      toBrowser.write(
        `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
      );
      setTimeout(() => {
        if (!waiting.has(id)) return;
        waiting.delete(id);
        reject(new Error(`${method} did not answer within 20s`));
      }, 20000);
    });

  const close = async () => {
    try {
      await send("Browser.close");
    } catch {
      chrome.kill();
    }
  };

  return { send, close, stderrLines };
}

// --- Options -----------------------------------------------------------------

/** A number of milliseconds, or null when the text is not one. */
const asNumber = (text) => {
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

/**
 * Reads the command line. Exported because the parsing is worth testing without
 * a browser, and because a wrong `--at` should fail before Chrome starts.
 */
export function parseOptions(argv) {
  const options = {
    url: null,
    at: [0, 300, 900],
    wait: 400,
    out: join(".gsap-motion", "inspect"),
    steps: [],
    reduced: false,
    dark: false,
    mobile: false,
    cpu: 1,
    json: false,
    chrome: null,
    errors: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => argv[(index += 1)];

    switch (argument) {
      case "--at": {
        const times = String(value() ?? "")
          .split(",")
          .map((part) => asNumber(part.trim()));
        if (times.length === 0 || times.some((time) => time === null || time < 0)) {
          options.errors.push("--at takes milliseconds, such as --at 0,300,900");
        } else {
          options.at = times.sort((a, b) => a - b);
        }
        break;
      }
      case "--wait": {
        const ms = asNumber(value());
        if (ms === null || ms < 0) options.errors.push("--wait takes milliseconds");
        else options.wait = ms;
        break;
      }
      case "--out":
        options.out = value() ?? options.out;
        break;
      case "--scroll":
        options.steps.push({ type: "scroll", value: value() ?? "" });
        break;
      case "--hover":
        options.steps.push({ type: "hover", value: value() ?? "" });
        break;
      case "--click":
        options.steps.push({ type: "click", value: value() ?? "" });
        break;
      case "--reduced":
        options.reduced = true;
        break;
      case "--dark":
        options.dark = true;
        break;
      case "--mobile":
        options.mobile = true;
        break;
      case "--cpu": {
        const rate = asNumber(value());
        if (rate === null || rate < 1) options.errors.push("--cpu takes a factor of 1 or more");
        else options.cpu = rate;
        break;
      }
      case "--json":
        options.json = true;
        break;
      case "--chrome":
        options.chrome = value() ?? null;
        break;
      default:
        if (argument.startsWith("--")) options.errors.push(`Unknown option: ${argument}`);
        else if (options.url === null) options.url = argument;
        else options.errors.push(`Unexpected argument: ${argument}`);
    }
  }

  if (options.url === null) options.errors.push("No URL. Pass the page to watch.");

  /** A coarse pointer has no hover; emulating both would measure something no device is. */
  if (options.mobile && options.steps.some((step) => step.type === "hover")) {
    options.errors.push(
      "--mobile and --hover cannot be combined: mobile emulation makes input touch, and a touch device has no hover.",
    );
  }

  return options;
}

// --- What runs in the page ---------------------------------------------------

/**
 * The timeline GSAP is running, read from the page itself rather than guessed
 * from the source.
 *
 * A bundled app never gives the page a gsap global. GSAP installs its exports
 * into a private object, and the branch of its installer that would reach
 * window cannot be taken, because that object is truthy from the start. So a
 * page can be full of GSAP with nothing to ask. Presence is read instead from
 * the traces it leaves — the version it announces, and the cache it hangs on
 * every element it touches — and a timeline that cannot be read is reported as
 * unreadable, never as an animation that never ran.
 */
const READ_TIMELINE = `(() => {
  const handle =
    typeof gsap !== "undefined"
      ? gsap
      : window.GreenSockGlobals && window.GreenSockGlobals.gsap
        ? window.GreenSockGlobals.gsap
        : null;
  const version = (window.gsapVersions || [])[0] || null;
  const controlled = [...document.querySelectorAll("*")].filter((el) => el._gsap).length;
  if (!handle) {
    if (!version && !controlled) return null;
    return { readable: false, version, controlled };
  }
  const children = handle.globalTimeline.getChildren(true, true, true);
  return {
    readable: true,
    version,
    controlled,
    time: handle.globalTimeline.time(),
    children: children.map((child) => ({
      targets: (child.targets?.() ?? []).map((target) =>
        target?.id ? "#" + target.id :
        target?.tagName ? target.tagName.toLowerCase() :
        String(target)
      ),
      duration: Number(child.duration?.().toFixed?.(3) ?? child.duration?.() ?? 0),
      repeat: child.repeat?.() ?? 0,
      yoyo: child.yoyo?.() ?? false,
      paused: child.paused?.() ?? false,
      ease: typeof child.vars?.ease === "string" ? child.vars.ease : child.vars?.ease ? "(function)" : null,
      props: Object.keys(child.vars ?? {}).filter(
        (key) => !["ease", "duration", "repeat", "yoyo", "scrollTrigger", "onComplete", "onUpdate", "delay", "stagger"].includes(key),
      ),
    })),
  };
})()`;

/**
 * Frames the page actually drove.
 *
 * Chrome's own Frames metric reads 0 in headless even while a tween runs at a
 * steady 60fps, so it cannot be reported as a frame count. A requestAnimationFrame
 * counter, installed before the page's own scripts, counts the frames the page
 * was given — which is the number a reader wants when asking whether motion
 * was smooth.
 */
const COUNT_FRAMES = `(() => {
  if (window.__gsapMotionFrames !== undefined) return true;
  window.__gsapMotionFrames = 0;
  window.__gsapMotionStart = performance.now();
  const step = () => {
    window.__gsapMotionFrames += 1;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return true;
})()`;

/** The live box of a selector, so a pointer lands on an element that is moving. */
const boxOf = (selector) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height };
})()`;

// --- The run -----------------------------------------------------------------

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Whether a box can be pointed at.
 *
 * A selector can match an element that styles say is visible and that layout
 * gives no box at all — a duplicate inside a collapsed container, say. Its
 * rect is every zero, so a pointer aimed at its centre lands in the corner of
 * the viewport and hits whatever is there. Found on a real site, where a
 * header held two copies of the same button and the first had no box.
 */
export const pointable = (box) => Boolean(box && box.width > 0 && box.height > 0);

async function capture(options) {
  const executable = findChrome(options.chrome);
  if (!executable) {
    throw new Error(
      "No Chrome found. Install Chrome, or pass --chrome <path>, or set CHROME_PATH.",
    );
  }

  const browser = connect(executable);
  const notes = [];

  try {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
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

    await call("Page.addScriptToEvaluateOnNewDocument", { source: COUNT_FRAMES });

    const before = await call("Performance.getMetrics");
    await call("Page.navigate", { url: options.url });
    await wait(options.wait);

    for (const step of options.steps) {
      if (step.type === "scroll") {
        const pixels = asNumber(step.value);
        const moved = await evaluate(
          pixels === null
            ? `(() => {
                const element = document.querySelector(${JSON.stringify(step.value)});
                if (!element) return null;
                element.scrollIntoView({ block: "center" });
                return Math.round(window.scrollY);
              })()`
            : `(window.scrollTo(0, ${pixels}), Math.round(window.scrollY))`,
        );
        notes.push(
          moved === null
            ? `scroll: nothing matched ${step.value}`
            : `scroll: to ${moved}px`,
        );
      }

      if (step.type === "hover" || step.type === "click") {
        const box = await evaluate(boxOf(step.value));
        if (!box) {
          notes.push(`${step.type}: nothing matched ${step.value}`);
          continue;
        }
        if (!pointable(box)) {
          notes.push(
            `${step.type}: ${step.value} matched an element with no box on screen, so nothing was done`,
          );
          continue;
        }
        /**
         * Two moves, because a pointer that is already there never enters; and
         * the box is read now, since whatever is animating has moved since the
         * page loaded.
         */
        await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1, buttons: 0 });
        await wait(60);
        await call("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: box.x,
          y: box.y,
          buttons: 0,
        });

        if (step.type === "click") {
          for (const type of ["mousePressed", "mouseReleased"]) {
            await call("Input.dispatchMouseEvent", {
              type,
              x: box.x,
              y: box.y,
              button: "left",
              buttons: type === "mousePressed" ? 1 : 0,
              clickCount: 1,
            });
          }
        }
        notes.push(
          `${step.type}: ${step.value} at ${Math.round(box.x)},${Math.round(box.y)}`,
        );
        await wait(120);
      }
    }

    mkdirSync(resolve(options.out), { recursive: true });

    const frames = [];
    let elapsed = 0;
    for (const at of options.at) {
      if (at > elapsed) {
        await wait(at - elapsed);
        elapsed = at;
      }
      const shot = await call("Page.captureScreenshot", { format: "png" });
      const bytes = Buffer.from(shot.data, "base64");
      const file = join(resolve(options.out), `frame-${String(at).padStart(5, "0")}ms.png`);
      writeFileSync(file, bytes);
      frames.push({ at, file, bytes: bytes.length });
    }

    const timeline = await evaluate(READ_TIMELINE);
    const drawn = await evaluate(
      "({ frames: window.__gsapMotionFrames ?? null, since: window.__gsapMotionStart ?? null })",
    );
    const after = await call("Performance.getMetrics");

    const delta = (name) => {
      const start = before.metrics.find((metric) => metric.name === name)?.value ?? 0;
      const end = after.metrics.find((metric) => metric.name === name)?.value ?? 0;
      return end - start;
    };

    /** The window the page was actually watched for, not the one that was asked for. */
    const span = Math.round(
      drawn.since === null
        ? (options.at.at(-1) ?? 0) + options.wait
        : await evaluate(`performance.now() - ${drawn.since}`),
    );
    const measured = {
      layouts: delta("LayoutCount"),
      recalcs: delta("RecalcStyleCount"),
      frames: drawn.frames,
      fps: drawn.frames && span ? Number(((drawn.frames / span) * 1000).toFixed(1)) : null,
      layoutSeconds: Number(delta("LayoutDuration").toFixed(3)),
      recalcSeconds: Number(delta("RecalcStyleDuration").toFixed(3)),
      overMs: span,
    };

    return { url: options.url, frames, timeline, measured, notes, chrome: executable };
  } finally {
    await browser.close();
  }
}

// --- Reporting ---------------------------------------------------------------

export function report(result, options) {
  const lines = [`Watched ${result.url}`];

  const emulated = [
    options.reduced && "reduced motion",
    options.dark && "dark",
    options.mobile && "mobile 390x844",
    options.cpu > 1 && `CPU ÷${options.cpu}`,
  ].filter(Boolean);
  if (emulated.length) lines.push(`  as: ${emulated.join(", ")}`);
  for (const note of result.notes) lines.push(`  ${note}`);

  lines.push("", `Frames (${result.frames.length}), in ${options.out}`);
  for (const frame of result.frames) {
    lines.push(`  ${String(frame.at).padStart(5)}ms  ${frame.file}`);
  }

  lines.push("", "Timeline, as the page is running it");
  if (result.timeline === null) {
    lines.push("  no GSAP on the page — nothing was animating, or it never loaded");
  } else if (result.timeline.readable === false) {
    const { version, controlled } = result.timeline;
    lines.push(
      `  GSAP${version ? ` ${version}` : ""} is running, but this page keeps it to itself,` +
        " so its timeline cannot be read from outside.",
    );
    lines.push(
      `  ${controlled} element${controlled === 1 ? " carries" : "s carry"} GSAP's cache,` +
        " so it has touched the page.",
    );
    lines.push("  To read the timeline here, call gsap.install(window) in development.");
  } else if (result.timeline.children.length === 0) {
    lines.push("  GSAP is loaded, and its global timeline has no children right now");
  } else {
    for (const child of result.timeline.children) {
      const forever = child.repeat === -1;
      lines.push(
        `  ${child.targets.join(", ") || "(no target)"} · ${child.duration}s` +
          `${forever ? ", repeats forever" : child.repeat ? `, repeats ${child.repeat}` : ""}` +
          `${child.yoyo ? ", yoyo" : ""}${child.paused ? ", paused" : ""}` +
          `${child.ease ? `, ease ${child.ease}` : ""}` +
          `${child.props.length ? ` · ${child.props.join(" ")}` : ""}`,
      );
    }
  }

  const { measured } = result;
  lines.push("", `Browser work over ${measured.overMs}ms`);
  /** A rate only means something when frames were counted at all. */
  const rate = measured.fps === null ? "" : ` (${measured.fps}/s)`;
  const drew =
    measured.frames === null ? "frames not counted" : `${measured.frames} frames${rate}`;
  lines.push(
    `  ${drew} · ${measured.layouts} layouts (${measured.layoutSeconds}s)` +
      ` · ${measured.recalcs} style recalculations (${measured.recalcSeconds}s)`,
  );
  lines.push("", "These are observations. What they mean is yours to judge.");

  return lines.join("\n");
}

// --- Entry -------------------------------------------------------------------

async function main(argv) {
  const options = parseOptions(argv);

  if (options.errors.length) {
    for (const error of options.errors) console.error(error);
    console.error("\nUsage: node capture-motion.mjs <url> [--at 0,300,900] [--hover <sel>] …");
    process.exit(2);
  }

  try {
    const result = await capture(options);
    console.log(options.json ? JSON.stringify(result, null, 2) : report(result, options));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main(process.argv.slice(2));
