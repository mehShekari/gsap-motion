/**
 * The GSAP audit's rule registry.
 *
 * Every rule here earns its place by catching something that is **silent** —
 * no error, no warning, often no visible symptom until much later or on a
 * slower device. Craft questions (is this ease right, is the rhythm good) are
 * deliberately absent: they are not mechanically decidable, and pretending
 * otherwise would fill the report with noise that hides the real findings.
 *
 * Each rule: `{ id, level, test(file) -> findings[] }` where a finding is
 * `{ index, message, hint }`. `level` is "error" (a bug), "warn" (a likely
 * bug or a real cost) or "info" (worth a look, higher false-positive rate).
 *
 * Every rule has fixtures in `scripts/test/rules.test.mjs`: a case it must fire
 * on and a case it must stay quiet on. A wrong finding in either direction is
 * fixed by adding the case there first and watching it fail.
 */
import { blockAfter, parenSpan, within } from "./source.mjs";

/** Properties whose animation forces the browser to re-run layout. */
const LAYOUT_PROPERTIES = [
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "margin",
  "marginTop",
  "marginLeft",
  "marginRight",
  "marginBottom",
  "padding",
  "paddingTop",
  "paddingLeft",
  "fontSize",
  "lineHeight",
];

const TRANSFORM_FOR = {
  left: "x",
  right: "x",
  top: "y",
  bottom: "y",
  width: "scaleX (with transformOrigin)",
  height: "scaleY (with transformOrigin)",
};

/**
 * The caveat that makes the swap above safe, and the reason this is spelled
 * out rather than left as "use a transform".
 *
 * `top: 50%` is half the **containing block**. `y: "50%"` and `yPercent: 50`
 * are half the **element's own** size. On a 1px rule those are 0.5px, so the
 * naive swap silently turns a full-height travel into nothing — which is worse
 * than the layout cost it was meant to fix.
 *
 * Two ways out: give the moving element the same height as its container and
 * translate that (the percentages then agree, and nothing has to be measured),
 * or measure the container once and translate in pixels.
 */
const PERCENT_CAVEAT =
  "Careful with percentages: `top: 50%` is half the containing block, `yPercent: 50` is half the element itself. Either wrap it in a full-height box and translate that — the percentages then agree — or measure the container once and translate in pixels.";

/** Events that fire many times a second. Global: every occurrence is scanned. */
const HOT_EVENTS =
  /(pointermove|mousemove|touchmove|onMouseMove|onPointerMove|"scroll"|'scroll'|wheel)/g;

/** Every `gsap.to/from/fromTo/set(` call site, as offsets. */
const tweenCalls = (code) => [
  ...code.matchAll(/\bgsap\.(to|from|fromTo|set|timeline)\s*\(/g),
];

const find = (code, pattern) => [...code.matchAll(pattern)];

/** An import from `gsap/*` that is a plugin needing `registerPlugin`. */
const PLUGIN_NAME =
  /(?:Plugin|Trigger|Text|Flip|Observer|Draggable|Ease|Smoother|Bounce|Wiggle)$/;

/**
 * Whether the instance constructed at `index` is kept under a name and
 * reverted or killed through that name.
 *
 * This used to ask whether `.revert(` or `.kill(` appeared anywhere in the
 * file, so one unrelated `tl.kill()` exempted every instance beside it.
 */
function tornDown(code, index) {
  const kept = code
    .slice(Math.max(0, index - 200), index)
    .match(/([\w$][\w$.]*)\s*=\s*$/);
  if (!kept) return false;
  const name = kept[1].replace(/[.$]/g, "\\$&");
  return new RegExp(
    `(?<![\\w$.])${name}\\s*\\??\\.\\s*(?:revert|kill)\\s*\\(`,
  ).test(code);
}

/**
 * Every call to `method` (`addEventListener` / `removeEventListener`), with
 * the event name and handler read out of its arguments.
 *
 * Pairing by event and handler rather than counting calls: two adds and two
 * removes used to pass even when both removes were for the same event, and an
 * inline arrow — which no remove can ever reach — passed whenever any remove
 * existed. A dynamic event name cannot be judged statically, so it is skipped.
 */
function listenerCalls(code, method) {
  return find(code, new RegExp(`\\b${method}\\s*\\(`, "g")).map((m) => {
    const open = m.index + m[0].length - 1;
    const span = parenSpan(code, open);
    const args = span ? code.slice(open + 1, span[1]) : "";
    const event = args.match(/^\s*(["'`])([\w:-]+)\1\s*,\s*/);
    if (!event) return { index: m.index, event: null };

    const rest = args.slice(event[0].length);
    const inline = /^(?:async\b|function\b|\(|[\w$]+\s*=>)/.test(rest);
    return {
      index: m.index,
      event: event[2],
      inline,
      handler: inline ? null : (rest.match(/^[\w$.]+/)?.[0] ?? null),
      /** Removed by an AbortController, or by the browser after one call. */
      selfCleaning: /\bsignal\b|\bonce\s*:\s*true/.test(rest),
    };
  });
}

/**
 * The argument spans of the `.to(` / `.from(` / `.fromTo(` calls chained on
 * from `cursor`, following the chain through labels and other calls.
 */
function chainedTweens(code, cursor) {
  const spans = [];
  for (;;) {
    const next = code.slice(cursor).match(/^\s*\.\s*([\w$]+)\s*\(/);
    if (!next) return spans;
    const open = cursor + next[0].length - 1;
    const span = parenSpan(code, open);
    if (!span) return spans;
    if (["to", "from", "fromTo"].includes(next[1])) spans.push([open, span[1]]);
    cursor = span[1] + 1;
  }
}

export const RULES = [
  // --- Lifecycle ------------------------------------------------------------
  {
    id: "orphan-tween",
    level: "error",
    test(file) {
      if (!file.isReact || !file.usesGsap) return [];

      return tweenCalls(file.code)
        .filter((m) => m[1] !== "set" && !within(file.contexts, m.index))
        .filter((m) => {
          /**
           * Only tweens inside some function — module-scope constants are not
           * the target here.
           *
           * This used to read `\b(useEffect|useLayoutEffect|function|=>)\s*[({]`.
           * `\b` needs a word character beside it and `=>` has none, so the
           * arrow alternative could never match: every tween in an arrow-function
           * handler, which is most of React, was silently exempt. `function`
           * only matched the anonymous `function (`, never `function Name(`.
           */
          const before = file.code.slice(0, m.index);
          return /(?:\bfunction\b[^(]*\(|=>)/.test(before.slice(-400));
        })
        .map((m) => ({
          index: m.index,
          message: `\`gsap.${m[1]}\` is created outside any useGSAP/gsap.context scope.`,
          hint: "Nothing reverts it on unmount, and React StrictMode runs it twice in development. Move it into the useGSAP body, or wrap the handler in contextSafe. This check does not follow calls: a helper that tweens reads as outside even when only the body calls it — keep the measuring in the helper and the tween in the body.",
        }));
    },
  },
  /**
   * GSAP's own teardown is wider than it is usually given credit for, and
   * these rules are narrow because of it.
   *
   * While a context's function runs, `_context` points at that context, and
   * `MatchMedia`, `Observer`, `Draggable`, `SplitText` and `ScrollTrigger` all
   * register themselves with it on construction (the `_context(this)` call in
   * each constructor — verified against gsap 3.15). `context.revert()` then reverts
   * them. So anything built **inside** a `useGSAP` body is already handled,
   * and demanding a manual `.kill()` there would be cargo cult.
   *
   * Built outside one — module scope, a plain `useEffect`, a handler that never
   * went through `contextSafe` — nothing is watching, and it is a real leak.
   */
  {
    id: "unmanaged-instance",
    level: "error",
    test(file) {
      const constructors =
        /\b(?:gsap\.(matchMedia)|(Observer|Draggable|ScrollSmoother)\.create|new (SplitText))\s*\(/g;

      return find(file.code, constructors)
        .filter((m) => !within(file.contexts, m.index))
        .filter((m) => !tornDown(file.code, m.index))
        .map((m) => ({
          index: m.index,
          message: `\`${m[1] ?? m[2] ?? m[3]}\` is created outside any useGSAP/gsap.context scope and never torn down.`,
          hint: "Inside a context these register themselves and are reverted with it. Out here nothing is watching: move it into the useGSAP body, or keep the instance and revert/kill it from the cleanup.",
        }));
    },
  },
  {
    id: "dangling-listener",
    level: "warn",
    test(file) {
      const removed = new Set(
        listenerCalls(file.code, "removeEventListener")
          .filter((call) => call.handler)
          .map((call) => `${call.event}|${call.handler}`),
      );

      return listenerCalls(file.code, "addEventListener")
        .filter((call) => call.event && !call.selfCleaning)
        .filter(
          (call) => call.inline || !removed.has(`${call.event}|${call.handler}`),
        )
        .map((call) => ({
          index: call.index,
          message: call.inline
            ? `An inline \`${call.event}\` listener, which no removeEventListener can reach.`
            : `\`${call.event}\` listener \`${call.handler}\` is added and never removed.`,
          hint: "A listener that survives unmount keeps the component's closure — and its DOM nodes — alive. Name the handler and remove it in the cleanup, or pass `{ signal }` from an AbortController and abort it there.",
        }));
    },
  },

  // --- Cost -----------------------------------------------------------------
  {
    id: "tween-per-event",
    level: "error",
    test(file) {
      const findings = [];

      for (const handler of find(file.code, HOT_EVENTS)) {
        const span = blockAfter(file.code, handler.index);
        if (!span) continue;

        for (const call of tweenCalls(file.code)) {
          if (call[1] === "set" || !within([span], call.index)) continue;
          findings.push({
            index: call.index,
            message: `\`gsap.${call[1]}\` inside a high-frequency handler (${handler[1]}).`,
            hint: "One tween allocated per event, each fighting the last. Create a `gsap.quickTo()` once and call it from the handler.",
          });
        }
      }

      return findings;
    },
  },
  {
    id: "state-per-event",
    level: "error",
    test(file) {
      if (!file.isReact) return [];
      const findings = [];

      for (const handler of find(file.code, HOT_EVENTS)) {
        const span = blockAfter(file.code, handler.index);
        if (!span) continue;

        for (const setter of find(file.code, /\bset[A-Z]\w*\s*\(/g)) {
          if (!within([span], setter.index)) continue;
          findings.push({
            index: setter.index,
            message: `React state setter inside a ${handler[1]} handler.`,
            hint: "A re-render per frame so one element can move a few pixels. State owns what exists; GSAP owns how it moves — use a ref and quickTo.",
          });
        }
      }

      return findings;
    },
  },
  {
    id: "layout-property",
    level: "warn",
    test(file) {
      const pattern = new RegExp(
        `\\b(${LAYOUT_PROPERTIES.join("|")})\\s*:\\s*(?!["'\\s]*$)`,
        "g",
      );

      return tweenCalls(file.code).flatMap((call) => {
        const span = blockAfter(file.code, call.index);
        if (!span) return [];
        const body = file.code.slice(span[0], span[1]);

        return [...body.matchAll(pattern)]
          .filter((m) => !/^\s*(?:\/\/|\*)/.test(m[0]))
          .map((m) => {
            const swap = TRANSFORM_FOR[m[1]];
            /**
             * Whether the flagged value is a percentage of something.
             *
             * Braces are allowed through rather than treated as a terminator:
             * the value is very often a template literal, and `` `${n}%` ``
             * carries a closing brace immediately before the `%` that was
             * meant to be found. The comma and the newline are what actually
             * end a value here.
             */
            const percent = new RegExp(`\\b${m[1]}\\s*:[^,\\n]{0,80}%`).test(
              body,
            );

            return {
              index: span[0] + m.index,
              message: `Animating \`${m[1]}\` forces layout on every frame.`,
              hint: swap
                ? `Use \`${swap}\` instead — a compositor-only property.` +
                  (percent ? ` ${PERCENT_CAVEAT}` : "")
                : "Prefer transform and opacity; they never touch layout.",
            };
          });
      });
    },
  },
  {
    id: "trigger-per-item",
    level: "warn",
    test(file) {
      return find(file.code, /\.(forEach|map)\s*\(/g)
        .flatMap((loop) => {
          const span = blockAfter(file.code, loop.index);
          if (!span) return [];
          const body = file.code.slice(span[0], span[1]);
          const hit = body.indexOf("scrollTrigger");
          return hit === -1
            ? []
            : [
                {
                  index: span[0] + hit,
                  message: "A ScrollTrigger created per item in a loop.",
                  hint: "Each carries its own start/end maths on every scroll frame. If the items belong to one visual moment, use one trigger with a stagger. Per-item is right only when they genuinely reveal independently — pinned card stacks, for instance.",
                },
              ];
        })
        .slice(0, 1);
    },
  },

  // --- Correctness that is invisible ---------------------------------------
  {
    id: "eased-loop",
    level: "warn",
    test(file) {
      return tweenCalls(file.code).flatMap((call) => {
        const span = blockAfter(file.code, call.index);
        if (!span) return [];
        const body = file.code.slice(span[0], span[1]);

        if (!/repeat\s*:\s*-1/.test(body)) return [];
        /** yoyo reverses rather than restarting, so there is no seam to hide. */
        if (/yoyo\s*:\s*true/.test(body)) return [];
        if (/ease\s*:\s*["']none["']/.test(body)) return [];
        if (!/ease\s*:/.test(body)) return [];

        return [
          {
            index: span[0] + body.indexOf("ease"),
            message: "An infinite repeat with an ease other than `none`.",
            hint: "The tween decelerates into its own restart, so the loop seam becomes visible. Use `ease: \"none\"`, or `yoyo: true` if it should breathe.",
          },
        ];
      });
    },
  },
  {
    id: "eased-scrub",
    level: "warn",
    test(file) {
      if (!/scrub\s*:/.test(file.code)) return [];

      const eased = (text) => text.search(/\bease\s*:\s*["'`](?!none["'`])/);
      const findings = [];
      const report = (index) =>
        findings.push({
          index,
          message: "Easing inside a scrubbed ScrollTrigger timeline.",
          hint: "The scrollbar is the playhead, so an ease fights the visitor's own scrolling and reads as lag. Use `ease: \"none\"` on the children and let `scrub: 1` do the smoothing.",
        });

      /**
       * Whitespace is allowed around the dot because a formatter breaks a
       * three-call chain as `gsap\n  .timeline(…)\n  .to(…)`. The eased child of
       * a scrubbed timeline is the common case, and it used to be missed: only
       * the timeline's own vars were read, and they rarely carry the ease.
       */
      for (const call of find(
        file.code,
        /\bgsap\s*\.\s*(to|from|fromTo|timeline)\s*\(/g,
      )) {
        const open = call.index + call[0].length - 1;
        const span = parenSpan(file.code, open);
        if (!span) continue;
        const args = file.code.slice(open, span[1]);
        if (!/scrub\s*:/.test(args)) continue;

        const own = eased(args);
        if (own !== -1) report(open + own);
        if (call[1] !== "timeline") continue;

        const children = chainedTweens(file.code, span[1] + 1);
        const kept = file.code
          .slice(Math.max(0, call.index - 80), call.index)
          .match(/([\w$]+)\s*=\s*$/);
        if (kept) {
          const name = kept[1].replace(/\$/g, "\\$");
          const uses = new RegExp(
            `(?<![\\w$.])${name}(?=\\s*\\.\\s*(?:to|from|fromTo)\\s*\\()`,
            "g",
          );
          for (const use of find(file.code, uses)) {
            children.push(
              ...chainedTweens(file.code, use.index + use[0].length),
            );
          }
        }

        for (const [start, end] of children) {
          const at = eased(file.code.slice(start, end));
          if (at !== -1) report(start + at);
        }
      }

      return findings.slice(0, 1);
    },
  },
  {
    id: "shared-plugin-id",
    level: "error",
    test(file) {
      if (!file.isReact) return [];

      return find(
        file.code,
        /\b(?:path|shape|align)\s*:\s*["'](#[A-Za-z][\w-]*)["']/g,
      ).map((m) => ({
        index: m.index,
        message: `Hardcoded id \`${m[1]}\` in plugin config.`,
        hint: "useGSAP scopes the selectors it resolves itself, but MotionPath and MorphSVG resolve their own config against the whole document. Mount this component twice and both instances drive the first one's geometry, silently. Namespace it with useId().",
      }));
    },
  },
  {
    id: "unregistered-plugin",
    level: "error",
    test(file) {
      /**
       * The identifiers actually passed to `registerPlugin`, across every
       * call. This used to be "does the name appear anywhere after the first
       * registerPlugin", so a `ScrollTrigger.refresh()` below a registration
       * that never mentioned it counted as registering it — and an alias
       * (`ScrollTrigger as ST`) registered by its alias counted as missing.
       */
      const registered = new Set(
        find(file.code, /\bregisterPlugin\s*\(/g).flatMap((m) => {
          const open = m.index + m[0].length - 1;
          const span = parenSpan(file.code, open);
          return span
            ? file.code
                .slice(open + 1, span[1])
                .split(/[^\w$]+/)
                .filter(Boolean)
            : [];
        }),
      );

      return find(
        file.code,
        /\bimport\s*\{([^}]*)\}\s*from\s*["']gsap\/[\w/-]+["']/g,
      ).flatMap((m) =>
        m[1]
          .split(",")
          .map((specifier) => specifier.trim())
          .filter((specifier) => specifier && !/^type\s/.test(specifier))
          .flatMap((specifier) => {
            const [imported, local = imported] = specifier.split(/\s+as\s+/);
            if (!PLUGIN_NAME.test(imported) || registered.has(local)) return [];
            return [
              {
                index: m.index,
                message: `\`${imported}\` is imported but never passed to \`gsap.registerPlugin\`.`,
                hint: "An unregistered plugin's properties are ignored without an error — the animation simply does nothing.",
              },
            ];
          }),
      );
    },
  },
  {
    id: "missing-reduced-motion",
    level: "warn",
    test(file) {
      if (!file.usesGsap) return [];
      if (/prefers-reduced-motion/.test(file.code)) return [];
      /** A file that only sets values is not animating anything. */
      if (!tweenCalls(file.code).some((m) => m[1] !== "set")) return [];

      return [
        {
          index: file.code.search(/\bgsap\./),
          message: "No `prefers-reduced-motion` branch in an animating file.",
          hint: "Reduced motion is a design, not an off switch: decide what the motion was saying and say it without the travel. Note that the reduced branch must set the END state — a `from` that never runs leaves its target invisible.",
        },
      ];
    },
  },

  // --- Shipping -------------------------------------------------------------
  {
    id: "dev-tool-shipped",
    level: "error",
    test(file) {
      const findings = [];

      for (const m of find(
        file.code,
        /^\s*import\b[^\n]*\b(MotionPathHelper|GSDevTools)\b/gm,
      )) {
        findings.push({
          index: m.index,
          message: `\`${m[1]}\` is statically imported.`,
          hint: "A static import ships regardless of any `if` around the call. Load it with a dynamic `import()` behind a NODE_ENV check, or bake its output in and delete it.",
        });
      }

      for (const m of find(file.code, /markers\s*:\s*true/g)) {
        findings.push({
          index: m.index,
          message: "`markers: true` is unconditional.",
          hint: 'Gate it: `markers: process.env.NODE_ENV === "development"`.',
        });
      }

      return findings;
    },
  },
  {
    id: "barrel-import",
    level: "warn",
    test(file) {
      return find(file.code, /from\s*["']gsap\/all["']/g).map((m) => ({
        index: m.index,
        message: "Importing from `gsap/all` pulls in every plugin.",
        hint: "Import each from its own subpath — `gsap/ScrollTrigger` — so the bundler can drop the ones this route does not use.",
      }));
    },
  },
];
