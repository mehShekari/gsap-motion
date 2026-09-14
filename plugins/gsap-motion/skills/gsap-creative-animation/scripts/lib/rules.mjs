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
import {
  calleeName,
  contains,
  dottedName,
  findAll,
  isFunction,
  isGsapCall,
  keyName,
  moduleSource,
  numberValue,
  ownVars,
  propertyOf,
  resolveFunction,
  staticString,
  tweenMethod,
  unwrap,
  varsObjects,
} from "./ast.mjs";
import { blockAfter, opensString, parenSpan, within } from "./source.mjs";

/**
 * Hints for the rules that have moved onto the syntax tree. While a rule has a
 * text engine and a tree engine side by side, both must say exactly the same
 * thing, so the words live here once.
 */
const HINT = {
  sharedPluginId:
    "useGSAP scopes the selectors it resolves itself, but MotionPath and MorphSVG resolve their own config against the whole document. Mount this component twice and both instances drive the first one's geometry, silently. Namespace it with useId().",
  unregisteredPlugin:
    "An unregistered plugin's properties are ignored without an error — the animation simply does nothing.",
  missingReducedMotion:
    "Reduced motion is a design, not an off switch: decide what the motion was saying and say it without the travel. Note that the reduced branch must set the END state — a `from` that never runs leaves its target invisible.",
  devToolImport:
    "A static import ships regardless of any `if` around the call. Load it with a dynamic `import()` behind a NODE_ENV check, or bake its output in and delete it.",
  markers: 'Gate it: `markers: process.env.NODE_ENV === "development"`.',
  barrelImport:
    "Import each from its own subpath — `gsap/ScrollTrigger` — so the bundler can drop the ones this route does not use.",
  easedLoop:
    'The tween decelerates into its own restart, so the loop seam becomes visible. Use `ease: "none"`, or `yoyo: true` if it should breathe.',
  lateTransformOrigin:
    "On an SVG element GSAP holds the element in place when its origin changes, and that correction outlives the tween: it ends offset, silently — a circle grown from 0 about its centre lands a whole radius off. Put `transformOrigin` or `svgOrigin` in the from-vars, or set it before the tween. HTML elements are unaffected.",
  danglingListener:
    "A listener that survives unmount keeps the component's closure — and its DOM nodes — alive. Name the handler and remove it in the cleanup, or pass `{ signal }` from an AbortController and abort it there.",
  tweenPerEvent:
    "One tween allocated per event, each fighting the last. Create a `gsap.quickTo()` once and call it from the handler — or, for work that only matters once resizing stops, debounce it.",
  statePerEvent:
    "A re-render per frame so one element can move a few pixels. State owns what exists; GSAP owns how it moves — use a ref and quickTo.",
  triggerPerItem:
    "Each carries its own start/end maths on every scroll frame. If the items belong to one visual moment, use one trigger with a stagger. Per-item is right only when they genuinely reveal independently — pinned card stacks, for instance.",
};

/** Messages that do not vary with what was found, shared the same way. */
const MESSAGE = {
  easedLoop: "An infinite repeat with an ease other than `none`.",
  lateTransformOrigin:
    "The transform origin is only in this `fromTo`'s to-vars, while its from-vars scale, rotate or skew.",
};

/** Whether a string, template chunk or JSX text spells `text`. Comments are not nodes. */
const spells = (node, text) =>
  (node.type === "Literal" && typeof node.raw === "string" && node.raw.includes(text)) ||
  (node.type === "TemplateElement" && node.value.raw.includes(text)) ||
  (node.type === "JSXText" && node.value.includes(text));

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

/**
 * The hint for an animated layout property: the transform that replaces it,
 * and the percentage trap when the value is a percentage.
 */
function layoutHint(property, percent) {
  const swap = TRANSFORM_FOR[property];
  return swap
    ? `Use \`${swap}\` instead — a compositor-only property.` +
        (percent ? ` ${PERCENT_CAVEAT}` : "")
    : "Prefer transform and opacity; they never touch layout.";
}

/** Whether a transform's from-value, as written, leaves the element untransformed. */
function identityTransform(property, value) {
  const v = value.trim().replace(/^["'`]|["'`]$/g, "");
  return property.startsWith("scale")
    ? /^1(?:\.0+)?$/.test(v)
    : /^-?0(?:\.0+)?(?:deg|rad)?$/.test(v);
}

/**
 * Events that fire many times a second, by the name a listener is given.
 *
 * This used to be one regular expression matched anywhere in the file, with
 * the handler taken to be the next `{`. `resize` could not be added without
 * reporting every `ResizeObserver`, a JSX prop was recognised in two spellings
 * only, and a handler passed by name lent the next function's body to the
 * listener before it.
 */
const HOT_EVENTS = new Set([
  "pointermove",
  "pointerrawupdate",
  "mousemove",
  "touchmove",
  "scroll",
  "wheel",
  "resize",
]);

/**
 * A resize handler that sets state is how a component learns its width: a
 * render per resize, but a render deciding what exists rather than a frame of
 * motion. `state-per-event` leaves it out; a tween per resize is still a tween
 * per event.
 */
const STATE_HOT_EVENTS = new Set(
  [...HOT_EVENTS].filter((event) => event !== "resize"),
);

/** The same events as React props, capture phase included. */
const HOT_PROPS =
  /\bon(PointerMove|MouseMove|TouchMove|Scroll|Wheel)(?:Capture)?\s*=\s*\{/g;

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
 * The argument spans of the `.to(` / `.from(` / `.fromTo(` calls — or of
 * whichever `methods` are asked for — chained on from `cursor`, following the
 * chain through labels and other calls.
 */
function chainedTweens(code, cursor, methods = ["to", "from", "fromTo"]) {
  const spans = [];
  for (;;) {
    const next = code.slice(cursor).match(/^\s*\.\s*([\w$]+)\s*\(/);
    if (!next) return spans;
    const open = cursor + next[0].length - 1;
    const span = parenSpan(code, open);
    if (!span) return spans;
    if (methods.includes(next[1])) spans.push([open, span[1]]);
    cursor = span[1] + 1;
  }
}

/**
 * What is added to the timeline created by the `gsap.timeline(` match `call`,
 * whose arguments close at `close`: the argument spans of its children, and
 * whether an `onComplete` is attached through `eventCallback`.
 *
 * Both are read from the chain on the call itself and from every chain on the
 * variable it was kept in — including one that starts with a label, which is
 * how a sequence usually opens. Those uses are read only up to the next
 * declaration of the same name, so two functions that each keep a `tl` do not
 * lend each other their children.
 */
function timelineCalls(code, call, close) {
  const CHILDREN = ["to", "from", "fromTo", "add"];
  const children = chainedTweens(code, close + 1, CHILDREN);
  const callbacks = chainedTweens(code, close + 1, ["eventCallback"]);

  const kept = code
    .slice(Math.max(0, call.index - 80), call.index)
    .match(/([\w$]+)\s*=\s*$/);
  if (kept) {
    const name = kept[1].replace(/\$/g, "\\$");
    const redeclared = code
      .slice(close)
      .search(new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`));
    const end = redeclared === -1 ? code.length : close + redeclared;
    const uses = new RegExp(`(?<![\\w$.])${name}(?=\\s*\\.\\s*[\\w$]+\\s*\\()`, "g");

    for (const use of code.slice(close, end).matchAll(uses)) {
      const cursor = close + use.index + use[0].length;
      children.push(...chainedTweens(code, cursor, CHILDREN));
      callbacks.push(...chainedTweens(code, cursor, ["eventCallback"]));
    }
  }

  const completes = callbacks.some(([open, end]) =>
    /^\(\s*["'`]onComplete["'`]/.test(code.slice(open, end)),
  );
  return { children, completes };
}

/**
 * The top-level arguments of the call whose parentheses span `[open, close]`,
 * as `[start, end]` pairs. A comma inside brackets, braces or a string does not
 * separate arguments.
 */
function callArgs(code, open, close) {
  const args = [];
  let depth = 0;
  let quote = "";
  let start = open + 1;

  for (let i = open + 1; i < close; i += 1) {
    const c = code[i];

    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = "";
      continue;
    }
    if (opensString(code, i)) quote = c;
    else if ("([{".includes(c)) depth += 1;
    else if (")]}".includes(c)) depth -= 1;
    else if (c === "," && depth === 0) {
      args.push([start, i]);
      start = i + 1;
    }
  }

  if (code.slice(start, close).trim()) args.push([start, close]);
  return args;
}

/**
 * Every handler for one of `events`, as `{ name, span }`: the second argument
 * of an `addEventListener` whose first is that event as a literal, or the
 * `{…}` of a JSX prop for it. A handler passed by name has no body here to
 * read, so it is skipped rather than guessed at.
 */
function hotHandlers(code, events) {
  const handlers = [];

  for (const m of find(code, /\baddEventListener\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const span = parenSpan(code, open);
    if (!span) continue;
    const [first, second] = callArgs(code, open, span[1]);
    if (!first || !second) continue;
    const event = code
      .slice(first[0], first[1])
      .match(/^\s*(["'`])([\w:-]+)\1\s*$/);
    if (event && events.has(event[2])) {
      handlers.push({ name: event[2], span: second });
    }
  }

  for (const m of find(code, HOT_PROPS)) {
    if (!events.has(m[1].toLowerCase())) continue;
    const span = blockAfter(code, m.index + m[0].length - 1);
    if (span) handlers.push({ name: `on${m[1]}`, span });
  }

  return handlers;
}

/**
 * Whether the call at `index` runs once the events stop rather than once per
 * event: the handler is wrapped in `debounce(…)`, or the call sits in a
 * `setTimeout` that the same handler clears first.
 */
function debounced(code, handler, index) {
  const [start, end] = handler.span;
  const body = code.slice(start, end);
  if (/^\s*debounce\s*\(/.test(body)) return true;
  if (!/\bclearTimeout\s*\(/.test(body)) return false;

  return find(body, /\bsetTimeout\s*\(/g).some((timer) => {
    const span = parenSpan(code, start + timer.index + timer[0].length - 1);
    return span !== null && within([span], index);
  });
}

/** `addEventListener` or `removeEventListener` when `node` calls one, on any receiver. */
function listenerMethod(node) {
  if (node.type !== "CallExpression") return null;
  const callee = unwrap(node.callee);
  const name =
    callee?.type === "Identifier"
      ? callee.name
      : callee?.type === "MemberExpression" && !callee.computed
        ? callee.property.name
        : null;
  return name === "addEventListener" || name === "removeEventListener" ? name : null;
}

/**
 * Every handler for one of `events` in the tree, as `{ name, node }`: the
 * second argument of an `addEventListener` whose first names that event, or
 * the expression of a JSX prop for it. A wrapping call — `debounce(fn, 150)` —
 * is kept whole. With `followNames`, a handler passed by name is followed to its
 * declaration when the file declares exactly one function of that name.
 */
function treeHandlers(ast, events, { followNames = true } = {}) {
  const handler = (expression) => {
    const node = unwrap(expression);
    if (node?.type === "CallExpression") return node;
    if (!followNames && !isFunction(node)) return null;
    return resolveFunction(ast, node);
  };
  const handlers = [];

  for (const call of findAll(ast, (node) => listenerMethod(node) === "addEventListener")) {
    const event = staticString(call.arguments[0]);
    if (event === null || !events.has(event) || !call.arguments[1]) continue;
    const node = handler(call.arguments[1]);
    if (node) handlers.push({ name: event, node });
  }

  const props = findAll(
    ast,
    (node) => node.type === "JSXAttribute" && node.name.type === "JSXIdentifier",
  );
  for (const attribute of props) {
    const prop = attribute.name.name.match(
      /^on(PointerMove|MouseMove|TouchMove|Scroll|Wheel)(?:Capture)?$/,
    );
    if (!prop || !events.has(prop[1].toLowerCase())) continue;
    if (attribute.value?.type !== "JSXExpressionContainer") continue;
    const node = handler(attribute.value.expression);
    if (node) handlers.push({ name: `on${prop[1]}`, node });
  }

  return handlers;
}

/**
 * Whether `node` runs once the events stop rather than once per event: the
 * handler is a `debounce(…)` call, or `node` sits inside a `setTimeout` that
 * the same handler also clears.
 */
function treeDebounced(handler, node) {
  const timer = (name) => (n) => {
    const called = calleeName(n);
    return called === name || called === `window.${name}`;
  };
  const wrapper = handler.node.type === "CallExpression" ? calleeName(handler.node) : null;
  if (wrapper === "debounce" || wrapper?.endsWith(".debounce")) return true;
  if (!findAll(handler.node, timer("clearTimeout")).length) return false;
  return findAll(handler.node, timer("setTimeout")).some(
    (call) => call !== node && contains(call, node),
  );
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
    /**
     * Adds and removes are paired by event and by the handler's name as
     * written, across the file. A handler that is not a plain name — an inline
     * function, or `fn.bind(this)`, which makes a new function each call — can
     * never be matched by a remove. `signal` and `once: true` are read from the
     * options object itself.
     */
    testAst(file) {
      if (!file.ast) return [];

      const listeners = (method) =>
        findAll(file.ast, (node) => listenerMethod(node) === method).flatMap((call) => {
          const event = staticString(call.arguments[0]);
          const handler = unwrap(call.arguments[1]);
          if (event === null || !/^[\w:-]+$/.test(event) || !handler) return [];
          const options = unwrap(call.arguments[2]);
          const once = unwrap(propertyOf(options, "once")?.value);
          const callee = unwrap(call.callee);
          return [
            {
              index: callee.type === "MemberExpression" ? callee.property.start : callee.start,
              event,
              handler: dottedName(handler),
              inline: isFunction(handler) || dottedName(handler) === null,
              selfCleaning:
                Boolean(propertyOf(options, "signal")) ||
                (once?.type === "Literal" && once.value === true),
            },
          ];
        });

      const removed = new Set(
        listeners("removeEventListener")
          .filter((call) => call.handler)
          .map((call) => `${call.event}|${call.handler}`),
      );

      return listeners("addEventListener")
        .filter((call) => !call.selfCleaning)
        .filter((call) => call.inline || !removed.has(`${call.event}|${call.handler}`))
        .map((call) => ({
          index: call.index,
          message: call.inline
            ? `An inline \`${call.event}\` listener, which no removeEventListener can reach.`
            : `\`${call.event}\` listener \`${call.handler}\` is added and never removed.`,
          hint: HINT.danglingListener,
        }));
    },
  },

  // --- Cost -----------------------------------------------------------------
  {
    id: "tween-per-event",
    level: "error",
    test(file) {
      const findings = [];

      for (const handler of hotHandlers(file.code, HOT_EVENTS)) {
        for (const call of tweenCalls(file.code)) {
          if (call[1] === "set" || !within([handler.span], call.index)) continue;
          if (debounced(file.code, handler, call.index)) continue;
          findings.push({
            index: call.index,
            message: `\`gsap.${call[1]}\` inside a high-frequency handler (${handler.name}).`,
            hint: "One tween allocated per event, each fighting the last. Create a `gsap.quickTo()` once and call it from the handler — or, for work that only matters once resizing stops, debounce it.",
          });
        }
      }

      return findings;
    },
    /** A GSAP tween call anywhere inside a high-frequency handler, followed by name when it can be. */
    testAst(file) {
      if (!file.ast) return [];
      const calls = findAll(file.ast, (node) => isGsapCall(node));

      return treeHandlers(file.ast, HOT_EVENTS).flatMap((handler) =>
        calls
          .filter((call) => contains(handler.node, call))
          .filter((call) => !treeDebounced(handler, call))
          .map((call) => ({
            index: call.start,
            message: `\`gsap.${unwrap(call.callee).property.name}\` inside a high-frequency handler (${handler.name}).`,
            hint: HINT.tweenPerEvent,
          })),
      );
    },
  },
  {
    id: "state-per-event",
    level: "error",
    test(file) {
      if (!file.isReact) return [];
      const findings = [];
      /**
       * A bare `setX(` call. A member call — `el.style.setProperty(`, which is
       * exactly what a pointer handler should do — and the timers are not
       * state setters.
       */
      const setters = /(?<![\w$.])set(?!Timeout\b|Interval\b)[A-Z]\w*\s*\(/g;

      for (const handler of hotHandlers(file.code, STATE_HOT_EVENTS)) {
        for (const setter of find(file.code, setters)) {
          if (!within([handler.span], setter.index)) continue;
          if (debounced(file.code, handler, setter.index)) continue;
          findings.push({
            index: setter.index,
            message: `React state setter inside a ${handler.name} handler.`,
            hint: "A re-render per frame so one element can move a few pixels. State owns what exists; GSAP owns how it moves — use a ref and quickTo.",
          });
        }
      }

      return findings;
    },
    /**
     * A bare `setX(…)` call — not a member call, not a timer — inside an inline
     * high-frequency handler other than resize.
     *
     * A handler passed by name is not followed here, unlike tween-per-event. A
     * named scroll handler is usually a scroll-spy setting a discrete value — a
     * section id, a boolean — and React skips the render when that value has not
     * changed, so "a render per frame" would be false and, at error level, would
     * fail correct code. Telling a continuous value from a discrete one is a
     * precision question for the corpus, not something this port should guess.
     */
    testAst(file) {
      if (!file.isReact || !file.ast) return [];
      const setters = findAll(file.ast, (node) => {
        if (node.type !== "CallExpression") return false;
        const callee = unwrap(node.callee);
        return (
          callee?.type === "Identifier" &&
          /^set(?!Timeout$|Interval$)[A-Z]\w*$/.test(callee.name)
        );
      });

      return treeHandlers(file.ast, STATE_HOT_EVENTS, { followNames: false }).flatMap((handler) =>
        setters
          .filter((setter) => contains(handler.node, setter))
          .filter((setter) => !treeDebounced(handler, setter))
          .map((setter) => ({
            index: setter.start,
            message: `React state setter inside a ${handler.name} handler.`,
            hint: HINT.statePerEvent,
          })),
      );
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
              hint: layoutHint(m[1], percent),
            };
          });
      });
    },
    /**
     * The layout keys of every vars object a tween carries — both of a
     * `fromTo`'s — on any receiver, so a timeline child counts. The text engine
     * read the first brace after `gsap.*(`: a `fromTo`'s from-vars only, or an
     * unrelated object after an argument-less `gsap.timeline()`.
     *
     * One finding per key per call: a `fromTo` that names `height` in both vars
     * animates one property, and says so once, where it first appears.
     */
    testAst(file) {
      if (!file.ast) return [];
      const LAYOUT = new Set(LAYOUT_PROPERTIES);

      return findAll(file.ast, (node) => tweenMethod(node) !== null).flatMap(
        (call) => {
          const seen = new Set();
          return varsObjects(call, tweenMethod(call))
            .flatMap((vars) => vars.properties)
            .filter((property) => {
              const key = keyName(property);
              if (!LAYOUT.has(key) || staticString(property.value) === "") return false;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .map((property) => ({
              index: property.start,
              message: `Animating \`${keyName(property)}\` forces layout on every frame.`,
              hint: layoutHint(
                keyName(property),
                findAll(property.value, (node) => spells(node, "%")).length > 0,
              ),
            }));
        },
      );
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
    /**
     * A `scrollTrigger` property inside a loop body: the callback of `.forEach`
     * or `.map`, or a `for`, `for…of` or `for…in` statement. The text engine read
     * the first brace after `.map(`, which for `items.map(toLabel)` was
     * whatever block came next. Still one finding per file, at the first.
     */
    testAst(file) {
      if (!file.ast) return [];

      const callbacks = findAll(file.ast, (node) => {
        if (node.type !== "CallExpression") return false;
        const callee = unwrap(node.callee);
        return (
          callee?.type === "MemberExpression" &&
          !callee.computed &&
          (callee.property.name === "forEach" || callee.property.name === "map")
        );
      })
        .map((call) => unwrap(call.arguments[0]))
        .filter(isFunction);
      const loops = findAll(file.ast, (node) =>
        ["ForStatement", "ForOfStatement", "ForInStatement"].includes(node.type),
      ).map((loop) => loop.body);

      const [first] = [...callbacks, ...loops]
        .flatMap((body) => findAll(body, (node) => keyName(node) === "scrollTrigger"))
        .sort((a, b) => a.start - b.start);

      return first
        ? [
            {
              index: first.start,
              message: "A ScrollTrigger created per item in a loop.",
              hint: HINT.triggerPerItem,
            },
          ]
        : [];
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
            message: MESSAGE.easedLoop,
            hint: HINT.easedLoop,
          },
        ];
      });
    },
    /**
     * The tween's own vars — a `fromTo`'s to-vars — on any receiver, so a
     * timeline child counts. Keys at the top level only: a `stagger` object's
     * own `repeat` is not the tween's.
     */
    testAst(file) {
      if (!file.ast) return [];

      return findAll(file.ast, (node) => tweenMethod(node) !== null).flatMap(
        (call) => {
          const vars = ownVars(call, tweenMethod(call));
          if (!vars) return [];
          const repeat = propertyOf(vars, "repeat");
          if (!repeat || numberValue(repeat.value) !== -1) return [];
          const yoyo = unwrap(propertyOf(vars, "yoyo")?.value);
          if (yoyo?.type === "Literal" && yoyo.value === true) return [];
          const ease = propertyOf(vars, "ease");
          if (!ease || staticString(ease.value) === "none") return [];
          return [
            { index: ease.start, message: MESSAGE.easedLoop, hint: HINT.easedLoop },
          ];
        },
      );
    },
  },
  {
    id: "eased-scrub",
    level: "warn",
    test(file) {
      /**
       * `scrub: false` is the explicit opposite, and is left alone. The space
       * belongs inside the lookahead: outside it, `\s*` backtracks to match
       * nothing and the lookahead then sees " false", which is not "false".
       */
      const scrubbed = /\bscrub\s*:(?!\s*false\b)/;
      if (!scrubbed.test(file.code)) return [];

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
        if (!scrubbed.test(args)) continue;

        const own = eased(args);
        if (own !== -1) report(open + own);
        if (call[1] !== "timeline") continue;

        /**
         * The children come from `timelineCalls`, as for never-completes: from
         * the chain and from the timeline's variable, including a chain that
         * opens with a label, and only up to that name's next declaration. This
         * used to match uses anywhere in the file whose first call was a tween,
         * so `tl.addLabel("a").to(…)` was missed and another function's `tl`
         * was read as this one.
         */
        const { children } = timelineCalls(file.code, call, span[1]);

        for (const [start, end] of children) {
          const at = eased(file.code.slice(start, end));
          if (at !== -1) report(start + at);
        }
      }

      return findings.slice(0, 1);
    },
  },
  /**
   * An `onComplete` that can never run. A `repeat: -1` tween never completes,
   * and a timeline holding one is given an effectively infinite duration —
   * 1e10 seconds, measured in gsap 3.15, where neither callback fired — so its
   * `onComplete` never fires either, and a short tween added after the loop
   * does not change that.
   *
   * Nothing reports it. Whatever the callback was meant to start simply does not
   * start: behind a ceiling timer the visitor waits for the ceiling on every
   * visit, and without one the curtain never lifts. The guidance described this
   * for a whole release and it still shipped, which is why it is a rule.
   */
  {
    id: "never-completes",
    level: "error",
    test(file) {
      /** `-1` exactly: the boundary after it rejects `-10`. */
      const endless = /\brepeat\s*:\s*-1\b/;
      const findings = [];

      for (const call of find(
        file.code,
        /\bgsap\s*\.\s*(to|from|fromTo|timeline)\s*\(/g,
      )) {
        const open = call.index + call[0].length - 1;
        const span = parenSpan(file.code, open);
        if (!span) continue;
        const args = file.code.slice(open, span[1]);
        const waits = /\bonComplete\b/.test(args);

        const own = args.search(endless);
        if (waits && own !== -1) {
          findings.push({
            index: open + own,
            message: `\`gsap.${call[1]}\` repeats forever, so its \`onComplete\` can never run.`,
            hint: "An endless repeat never completes. Use `onRepeat` for something that should happen every cycle, or give it a finite `repeat`.",
          });
          continue;
        }
        if (call[1] !== "timeline") continue;

        const { children, completes } = timelineCalls(file.code, call, span[1]);
        if (!waits && !completes) continue;

        for (const [start, end] of children) {
          const at = file.code.slice(start, end).search(endless);
          if (at === -1) continue;
          findings.push({
            index: start + at,
            message:
              "An endlessly repeating child in a timeline with an `onComplete`, which therefore never fires.",
            hint: 'The child gives the timeline an effectively infinite duration, and a tween added after it does not end it. Hand over at a position instead — `.call(fn, [], "label+=0.5")` fires when the playhead passes — or run the loop as its own tween outside the timeline.',
          });
          break;
        }
      }

      return findings;
    },
  },
  /**
   * A transform origin that arrives after the transform it belongs to.
   *
   * When the origin of an SVG element that is already scaled, rotated or
   * skewed changes, GSAP's `smoothOrigin` adds a translate that holds the
   * element where it is. A `fromTo` renders its from-vars first, so an origin
   * given only in its to-vars lands on an element already at its starting
   * transform, and the translate outlives the tween. Measured in gsap 3.15 in
   * Chrome: a circle grown from 0 about its centre ends a whole radius up and
   * left; rotation and skew offset it too; a translation, an identity start or
   * an HTML element does not.
   *
   * `warn`, not `error`: nothing here can tell an SVG target from an HTML one.
   */
  {
    id: "late-transform-origin",
    level: "warn",
    test(file) {
      const ORIGIN = /\b(?:transformOrigin|svgOrigin)\s*:/;
      const TRANSFORM = /\b(scale[XY]?|rotation|rotate|skew[XY])\s*:\s*([^,}\n]+)/g;

      return find(file.code, /\.\s*fromTo\s*\(/g).flatMap((call) => {
        const open = call.index + call[0].length - 1;
        const span = parenSpan(file.code, open);
        if (!span) return [];
        const [, from, to] = callArgs(file.code, open, span[1]);
        if (!from || !to) return [];

        const fromVars = file.code.slice(from[0], from[1]);
        const toVars = file.code.slice(to[0], to[1]);
        const origin = toVars.search(ORIGIN);
        if (origin === -1 || ORIGIN.test(fromVars)) return [];
        if (/\bsmoothOrigin\s*:\s*false\b/.test(toVars)) return [];
        if (
          [...fromVars.matchAll(TRANSFORM)].every(([, prop, value]) =>
            identityTransform(prop, value),
          )
        ) {
          return [];
        }

        return [
          {
            index: to[0] + origin,
            message: MESSAGE.lateTransformOrigin,
            hint: HINT.lateTransformOrigin,
          },
        ];
      });
    },
    /**
     * Any `.fromTo(target, fromVars, toVars)` whose two vars are object
     * literals. Keys are read at the top level of each, and a transform's
     * from-value as it is written: `rotation: "90deg"` and `scale: 0` move the
     * element, `scale: 1` and `rotation: 0` do not.
     */
    testAst(file) {
      if (!file.ast) return [];
      const ORIGIN = new Set(["transformOrigin", "svgOrigin"]);
      const TRANSFORM = /^(?:scale[XY]?|rotation|rotate|skew[XY])$/;

      const calls = findAll(file.ast, (node) => {
        if (node.type !== "CallExpression") return false;
        const callee = unwrap(node.callee);
        return (
          callee?.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.name === "fromTo"
        );
      });

      return calls.flatMap((call) => {
        const from = unwrap(call.arguments[1]);
        const to = unwrap(call.arguments[2]);
        if (from?.type !== "ObjectExpression" || to?.type !== "ObjectExpression") {
          return [];
        }
        const origin = to.properties.find((property) => ORIGIN.has(keyName(property)));
        if (!origin) return [];
        if (from.properties.some((property) => ORIGIN.has(keyName(property)))) return [];
        const smooth = unwrap(propertyOf(to, "smoothOrigin")?.value);
        if (smooth?.type === "Literal" && smooth.value === false) return [];

        const moves = from.properties.some(
          (property) =>
            TRANSFORM.test(keyName(property) ?? "") &&
            !identityTransform(
              keyName(property),
              file.raw.slice(property.value.start, property.value.end),
            ),
        );
        return moves
          ? [
              {
                index: origin.start,
                message: MESSAGE.lateTransformOrigin,
                hint: HINT.lateTransformOrigin,
              },
            ]
          : [];
      });
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
        hint: HINT.sharedPluginId,
      }));
    },
    /**
     * Any property naming a target geometry whose value is a fixed `#id`: a
     * string or a template literal with nothing interpolated, including the
     * shorthands `motionPath: "#id"` and `morphSVG: "#id"`. The text engine
     * saw only quoted values under `path`, `shape` and `align`.
     */
    testAst(file) {
      if (!file.isReact || !file.ast) return [];
      const KEYS = new Set(["path", "shape", "align", "motionPath", "morphSVG"]);

      return findAll(file.ast, (node) => KEYS.has(keyName(node))).flatMap(
        (property) => {
          const id = staticString(property.value)?.match(/^#[A-Za-z][\w-]*$/)?.[0];
          return id
            ? [
                {
                  index: property.start,
                  message: `Hardcoded id \`${id}\` in plugin config.`,
                  hint: HINT.sharedPluginId,
                },
              ]
            : [];
        },
      );
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
                hint: HINT.unregisteredPlugin,
              },
            ];
          }),
      );
    },
    /**
     * Registered means named anywhere inside the arguments of a
     * `registerPlugin` call. Imports are read as declarations: a default import
     * takes its plugin's name from the path, and a type-only import, of the
     * whole statement or of one specifier, ships nothing and is skipped.
     */
    testAst(file) {
      if (!file.ast) return [];

      const registered = new Set();
      const registrations = findAll(file.ast, (node) => {
        const name = calleeName(node);
        return name === "registerPlugin" || name?.endsWith(".registerPlugin");
      });
      for (const call of registrations) {
        for (const arg of call.arguments) {
          for (const id of findAll(arg, (node) => node.type === "Identifier")) {
            registered.add(id.name);
          }
        }
      }

      const findings = [];
      for (const declaration of file.ast.body) {
        if (declaration.type !== "ImportDeclaration") continue;
        if (declaration.importKind === "type") continue;
        const from = declaration.source.value;
        if (typeof from !== "string" || !/^gsap\/[\w/-]+$/.test(from)) continue;

        for (const specifier of declaration.specifiers) {
          if (specifier.importKind === "type") continue;
          const imported =
            specifier.type === "ImportSpecifier"
              ? (specifier.imported.name ?? specifier.imported.value)
              : specifier.type === "ImportDefaultSpecifier"
                ? from.split("/").pop()
                : null;
          if (!imported || !PLUGIN_NAME.test(imported)) continue;
          if (registered.has(specifier.local.name)) continue;
          findings.push({
            index: declaration.start,
            message: `\`${imported}\` is imported but never passed to \`gsap.registerPlugin\`.`,
            hint: HINT.unregisteredPlugin,
          });
        }
      }
      return findings;
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
          hint: HINT.missingReducedMotion,
        },
      ];
    },
    /**
     * A branch is the query written in code — a string, a template or JSX
     * text. A comment that mentions it is not a branch, and a quote inside a
     * regular expression or a plural possessive can no longer turn a comment
     * into what looked like code.
     */
    testAst(file) {
      if (!file.usesGsap || !file.ast) return [];
      if (findAll(file.ast, (node) => spells(node, "prefers-reduced-motion")).length) {
        return [];
      }
      if (!findAll(file.ast, (node) => isGsapCall(node)).length) return [];

      const first = findAll(
        file.ast,
        (node) =>
          node.type === "MemberExpression" &&
          unwrap(node.object)?.type === "Identifier" &&
          unwrap(node.object).name === "gsap",
      ).sort((a, b) => a.start - b.start)[0];

      return [
        {
          index: first.start,
          message: "No `prefers-reduced-motion` branch in an animating file.",
          hint: HINT.missingReducedMotion,
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
          hint: HINT.devToolImport,
        });
      }

      for (const m of find(file.code, /markers\s*:\s*true/g)) {
        findings.push({
          index: m.index,
          message: "`markers: true` is unconditional.",
          hint: HINT.markers,
        });
      }

      return findings;
    },
    /**
     * A static import declaration that brings in a dev tool, by a specifier's
     * name or, for a bare or default import, by its path. A type-only import
     * ships no code. `markers: true` is the property itself, not the text.
     */
    testAst(file) {
      if (!file.ast) return [];
      const TOOLS = /^(?:MotionPathHelper|GSDevTools)$/;
      const findings = [];

      for (const declaration of file.ast.body) {
        if (declaration.type !== "ImportDeclaration") continue;
        if (declaration.importKind === "type") continue;
        const values = declaration.specifiers.filter((s) => s.importKind !== "type");
        if (declaration.specifiers.length && !values.length) continue;

        const tool =
          values
            .map((s) => s.imported?.name ?? s.local.name)
            .find((name) => TOOLS.test(name)) ??
          String(declaration.source.value).split("/").pop();
        if (!TOOLS.test(tool)) continue;

        findings.push({
          index: declaration.start,
          message: `\`${tool}\` is statically imported.`,
          hint: HINT.devToolImport,
        });
      }

      const markers = findAll(file.ast, (node) => {
        if (keyName(node) !== "markers") return false;
        const value = unwrap(node.value);
        return value?.type === "Literal" && value.value === true;
      });
      for (const property of markers) {
        findings.push({
          index: property.start,
          message: "`markers: true` is unconditional.",
          hint: HINT.markers,
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
        hint: HINT.barrelImport,
      }));
    },
    /** An import or re-export whose module is `gsap/all`. */
    testAst(file) {
      if (!file.ast) return [];
      return file.ast.body
        .map(moduleSource)
        .filter((source) => source?.value === "gsap/all")
        .map((source) => ({
          index: source.start,
          message: "Importing from `gsap/all` pulls in every plugin.",
          hint: HINT.barrelImport,
        }));
    },
  },
];
