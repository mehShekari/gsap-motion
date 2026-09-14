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
 * Rules read `file.ast`, the syntax tree `ast.mjs` builds. A file that does not
 * parse never reaches a rule: the runner reports it as `not-parsed`.
 *
 * Every rule has fixtures in `scripts/test/rules.test.mjs`: a case it must fire
 * on and a case it must stay quiet on. A wrong finding in either direction is
 * fixed by adding the case there first and watching it fail.
 */
import {
  ancestorsOf,
  calleeName,
  chainStart,
  contains,
  dottedName,
  findAll,
  gsapContexts,
  isFunction,
  isGsapCall,
  keptUnder,
  keyName,
  methodName,
  moduleSource,
  numberValue,
  ownVars,
  parentOf,
  propertyOf,
  resolveFunction,
  scopeOf,
  staticString,
  timelineLinks,
  tweenMethod,
  unwrap,
  varsObjects,
} from "./ast.mjs";

/** What each rule says, in one place. */
const HINT = {
  orphanTween:
    "Nothing reverts it on unmount, and React StrictMode runs it twice in development. Move it into the useGSAP body, or wrap the handler in contextSafe. A helper counts as inside only when every use of it is a call from inside a context.",
  unmanagedInstance:
    "Inside a context these register themselves and are reverted with it. Out here nothing is watching: move it into the useGSAP body, or keep the instance and revert/kill it from the cleanup.",
  danglingListener:
    "A listener that survives unmount keeps the component's closure — and its DOM nodes — alive. Name the handler and remove it in the cleanup, or pass `{ signal }` from an AbortController and abort it there.",
  tweenPerEvent:
    "One tween allocated per event, each fighting the last. Create a `gsap.quickTo()` once and call it from the handler — or, for work that only matters once resizing stops, debounce it.",
  statePerEvent:
    "A re-render per frame so one element can move a few pixels. State owns what exists; GSAP owns how it moves — use a ref and quickTo.",
  triggerPerItem:
    "Each carries its own start/end maths on every scroll frame. If the items belong to one visual moment, use one trigger with a stagger. Per-item is right only when they genuinely reveal independently — pinned card stacks, for instance.",
  easedLoop:
    'The tween decelerates into its own restart, so the loop seam becomes visible. Use `ease: "none"`, or `yoyo: true` if it should breathe.',
  easedScrub:
    "The scrollbar is the playhead, so an ease fights the visitor's own scrolling and reads as lag. Use `ease: \"none\"` on the children and let `scrub: 1` do the smoothing.",
  neverCompletesOwn:
    "An endless repeat never completes. Use `onRepeat` for something that should happen every cycle, or give it a finite `repeat`.",
  neverCompletesChild:
    'The child gives the timeline an effectively infinite duration, and a tween added after it does not end it. Hand over at a position instead — `.call(fn, [], "label+=0.5")` fires when the playhead passes — or run the loop as its own tween outside the timeline.',
  lateTransformOrigin:
    "On an SVG element GSAP holds the element in place when its origin changes, and that correction outlives the tween: it ends offset, silently — a circle grown from 0 about its centre lands a whole radius off. Put `transformOrigin` or `svgOrigin` in the from-vars, or set it before the tween. HTML elements are unaffected.",
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
};

/** Messages that do not vary with what was found. */
const MESSAGE = {
  easedLoop: "An infinite repeat with an ease other than `none`.",
  easedScrub: "Easing inside a scrubbed ScrollTrigger timeline.",
  neverCompletesChild:
    "An endlessly repeating child in a timeline with an `onComplete`, which therefore never fires.",
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

/** An import from `gsap/*` that is a plugin needing `registerPlugin`. */
const PLUGIN_NAME =
  /(?:Plugin|Trigger|Text|Flip|Observer|Draggable|Ease|Smoother|Bounce|Wiggle)$/;

/**
 * Events that fire many times a second, by the name a listener is given — not
 * a substring anywhere in the file, which could not include `resize` without
 * reporting every `ResizeObserver`.
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
 * Every handler for one of `events`, as `{ name, node }`: the second argument
 * of an `addEventListener` whose first names that event, or the expression of a
 * JSX prop for it. A wrapping call — `debounce(fn, 150)` — is kept whole. With
 * `followNames`, a handler passed by name is followed to its declaration when
 * the file declares exactly one function of that name.
 */
function handlersFor(ast, events, { followNames = true } = {}) {
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
function debounced(handler, node) {
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

/** The calls that add a child to a timeline. */
const CHILDREN = new Set(["to", "from", "fromTo", "add"]);

const TEARDOWN = new Set(["kill", "revert"]);
const FINISH = new Set(["progress", "totalProgress"]);

/**
 * Whether the value built at `node` is torn down by hand somewhere in the file:
 * kept under a name that is `.kill()`ed or `.revert()`ed, or finished with
 * `.progress(1)`, which completes it so GSAP lets it go.
 *
 * Followed through one helper. When a function returns the value — alone, or as
 * an element of an array — every call to that function must keep the result, or
 * that element, under a name that is torn down. Found on the corpus: a component
 * that builds its timeline and trigger in `getProjectsSt()` and kills what the
 * effect destructures from it.
 */
function tornDown(ast, node) {
  const endsUnder = (name) =>
    Boolean(name) &&
    findAll(ast, (n) => {
      const method = methodName(n);
      if (!method) return false;
      const ends =
        TEARDOWN.has(method) || (FINISH.has(method) && numberValue(n.arguments[0]) === 1);
      return ends && dottedName(unwrap(n.callee).object) === name;
    }).length > 0;

  const kept = keptUnder(ast, node);
  if (endsUnder(kept?.name)) return true;

  const fn = scopeOf(ast, node);
  if (!isFunction(fn)) return false;

  const holds = (expression) => {
    const value = unwrap(expression);
    if (!value) return false;
    if (value === node) return true;
    if (value.type === "CallExpression" && chainStart(value) === node) return true;
    return value.type === "Identifier" && kept?.name === value.name;
  };

  const returned = findAll(
    fn,
    (n) => n.type === "ReturnStatement" && n.argument && scopeOf(ast, n) === fn,
  ).map((n) => n.argument);
  if (fn.type === "ArrowFunctionExpression" && fn.expression) returned.push(fn.body);

  let slot = null;
  for (const expression of returned) {
    const value = unwrap(expression);
    if (holds(value)) {
      slot = "whole";
      break;
    }
    if (value?.type === "ArrayExpression") {
      const index = value.elements.findIndex((element) => element && holds(element));
      if (index !== -1) {
        slot = index;
        break;
      }
    }
  }
  if (slot === null) return false;

  const holder = parentOf(ast, fn);
  const name =
    fn.type === "FunctionDeclaration"
      ? fn.id?.name
      : holder?.type === "VariableDeclarator" &&
          holder.init === fn &&
          holder.id.type === "Identifier"
        ? holder.id.name
        : null;
  if (!name) return false;

  const calls = findAll(
    ast,
    (n) =>
      n.type === "CallExpression" &&
      unwrap(n.callee)?.type === "Identifier" &&
      unwrap(n.callee).name === name,
  );
  return (
    calls.length > 0 &&
    calls.every((call) => {
      const parent = parentOf(ast, call);
      const target =
        parent?.type === "VariableDeclarator" && parent.init === call
          ? parent.id
          : parent?.type === "AssignmentExpression" && parent.right === call
            ? parent.left
            : null;
      if (!target) return false;
      if (slot === "whole") return endsUnder(dottedName(target));
      const element = target.type === "ArrayPattern" ? target.elements[slot] : null;
      return element?.type === "Identifier" && endsUnder(element.name);
    })
  );
}

/**
 * Whether `node`, inside a high-frequency handler, runs less often than once
 * per event: inside a completion callback — `onComplete`, `onStart`,
 * `onReverseComplete`, `onInterrupt` — of something the handler started, or
 * behind an in-flight flag the handler raises first,
 * `if (!busy.current) { busy.current = true; … }`.
 */
function notPerEvent(ast, handler, node) {
  for (const ancestor of ancestorsOf(ast, node)) {
    if (ancestor === handler.node) return false;
    if (
      ancestor.type === "Property" &&
      /^on(?:Complete|Start|ReverseComplete|Interrupt)$/.test(keyName(ancestor) ?? "") &&
      isFunction(unwrap(ancestor.value))
    ) {
      return true;
    }
    if (ancestor.type === "IfStatement" && contains(ancestor.consequent, node)) {
      const test = unwrap(ancestor.test);
      const flag =
        test?.type === "UnaryExpression" && test.operator === "!"
          ? dottedName(test.argument)
          : null;
      const raised =
        flag !== null &&
        findAll(ancestor.consequent, (n) => {
          if (n.type !== "AssignmentExpression" || dottedName(n.left) !== flag) return false;
          const value = unwrap(n.right);
          return value?.type === "Literal" && value.value === true;
        }).length > 0;
      if (raised) return true;
    }
  }
  return false;
}

/** Listener targets that outlive every component: the window, the document and its root elements. */
const GLOBAL_TARGETS = new Set([
  "window",
  "document",
  "document.body",
  "document.documentElement",
  "globalThis",
  "self",
  "visualViewport",
  "window.visualViewport",
]);

/**
 * Whether `target` is an element or object the file builds itself — every
 * value it is given comes from `new …` or `createElement` — and so takes its
 * listeners with it when it goes.
 */
function createdHere(ast, target) {
  const builds = (value) => {
    const v = unwrap(value);
    return (
      v?.type === "NewExpression" ||
      ["createElement", "createElementNS", "cloneNode"].includes(methodName(v))
    );
  };
  if (builds(target)) return true;
  if (target.type !== "Identifier") return false;

  const assignments = findAll(
    ast,
    (n) =>
      (n.type === "VariableDeclarator" &&
        n.id.type === "Identifier" &&
        n.id.name === target.name &&
        n.init) ||
      (n.type === "AssignmentExpression" && dottedName(n.left) === target.name),
  );
  return (
    assignments.length > 0 &&
    assignments.every((n) => builds(n.type === "VariableDeclarator" ? n.init : n.right))
  );
}

/** A value that is the same on every call: a literal, a plain template, `undefined`. */
const isConstant = (node) => {
  const value = unwrap(node);
  return (
    value?.type === "Literal" ||
    staticString(value) !== null ||
    (value?.type === "Identifier" && value.name === "undefined")
  );
};

/**
 * The plugins a file registers, by the names they are imported under from
 * `gsap/*`, so `ScrollTrigger as ST` registered as `ST` is `ScrollTrigger`.
 * Registration is global, so the runner unions these across every audited file
 * before any rule runs.
 */
export function pluginRegistrations(file) {
  const names = new Set();
  if (!file.ast) return names;

  const imported = new Map();
  for (const declaration of file.ast.body) {
    if (declaration.type !== "ImportDeclaration") continue;
    const from = declaration.source.value;
    if (typeof from !== "string" || !/^gsap\/[\w/-]+$/.test(from)) continue;
    for (const specifier of declaration.specifiers) {
      const name =
        specifier.type === "ImportSpecifier"
          ? (specifier.imported.name ?? specifier.imported.value)
          : specifier.type === "ImportDefaultSpecifier"
            ? from.split("/").pop()
            : null;
      if (name) imported.set(specifier.local.name, name);
    }
  }

  const registrations = findAll(file.ast, (node) => {
    const name = calleeName(node);
    return name === "registerPlugin" || name?.endsWith(".registerPlugin");
  });
  for (const call of registrations) {
    for (const argument of call.arguments) {
      for (const id of findAll(argument, (n) => n.type === "Identifier")) {
        names.add(imported.get(id.name) ?? id.name);
      }
    }
  }
  return names;
}

export const RULES = [
  // --- Lifecycle ------------------------------------------------------------
  {
    id: "orphan-tween",
    level: "error",
    /**
     * A GSAP tween call inside a function but outside every context — module
     * scope is not the target. Contexts are recognised under the names the file
     * gives them, and a helper counts as inside when every use of it is a call
     * from inside one. A value torn down by hand — see `tornDown` — is not
     * reported: "nothing reverts it" would be false.
     */
    test(file) {
      if (!file.isReact || !file.usesGsap) return [];
      const inside = gsapContexts(file.ast);

      return findAll(file.ast, (node) => isGsapCall(node))
        .filter((call) => !inside(call))
        .filter((call) => ancestorsOf(file.ast, call).some(isFunction))
        .filter((call) => !tornDown(file.ast, call))
        .map((call) => ({
          index: call.start,
          message: `\`gsap.${methodName(call)}\` is created outside any useGSAP/gsap.context scope.`,
          hint: HINT.orphanTween,
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
    /**
     * Torn down as `tornDown` reads it: kept under a name — through any chain
     * called on it, or a helper's return — that has `.revert()` or `.kill()`
     * called on it somewhere in the file, optional chaining included.
     */
    test(file) {
      const inside = gsapContexts(file.ast);
      const CREATORS = new Set(["Observer", "Draggable", "ScrollSmoother", "ScrollTrigger"]);

      const label = (node) => {
        if (node.type === "NewExpression") {
          const callee = unwrap(node.callee);
          return callee?.type === "Identifier" && callee.name === "SplitText"
            ? "SplitText"
            : null;
        }
        if (node.type !== "CallExpression") return null;
        const name = calleeName(node);
        if (name === "gsap.matchMedia") return "matchMedia";
        const [owner, method, extra] = name?.split(".") ?? [];
        return method === "create" && extra === undefined && CREATORS.has(owner)
          ? owner
          : null;
      };
      return findAll(file.ast, (node) => label(node) !== null)
        .filter((node) => !inside(node))
        .filter((node) => !tornDown(file.ast, node))
        .map((node) => ({
          index: node.start,
          message: `\`${label(node)}\` is created outside any useGSAP/gsap.context scope and never torn down.`,
          hint: HINT.unmanagedInstance,
        }));
    },
  },
  {
    id: "dangling-listener",
    level: "warn",
    /**
     * Adds and removes are paired by event and by the handler's name as
     * written, across the file — not by counting calls. A handler that is not a
     * plain name — an inline function, or `fn.bind(this)`, which makes a new
     * function each call — can never be matched by a remove. `signal` and
     * `once: true` are read from the options object. A dynamic event name
     * cannot be judged statically, so it is skipped.
     *
     * Only a target that can outlive the code is reported. An element or object
     * the file creates takes its listeners with it. Outside React, where nothing
     * says when code stops running, only the window and the document can: a
     * listener on a page's own button lasts exactly as long as the button.
     */
    test(file) {
      const listeners = (method) =>
        findAll(file.ast, (node) => listenerMethod(node) === method).flatMap((call) => {
          const event = staticString(call.arguments[0]);
          const handler = unwrap(call.arguments[1]);
          if (event === null || !/^[\w:-]+$/.test(event) || !handler) return [];
          const options = unwrap(call.arguments[2]);
          const once = unwrap(propertyOf(options, "once")?.value);
          const callee = unwrap(call.callee);
          const target = callee.type === "MemberExpression" ? unwrap(callee.object) : null;
          return [
            {
              global: target === null || GLOBAL_TARGETS.has(dottedName(target)),
              created: target !== null && createdHere(file.ast, target),
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
        .filter((call) => !call.selfCleaning && !call.created)
        .filter((call) => file.isReact || call.global)
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
    /**
     * A GSAP tween call inside a high-frequency handler, followed by name when
     * it can be. A debounced one, one in a completion callback, and one behind
     * an in-flight flag run less than once per event, and are not reported.
     */
    test(file) {
      const calls = findAll(file.ast, (node) => isGsapCall(node));

      return handlersFor(file.ast, HOT_EVENTS).flatMap((handler) =>
        calls
          .filter((call) => contains(handler.node, call))
          .filter((call) => !debounced(handler, call))
          .filter((call) => !notPerEvent(file.ast, handler, call))
          .map((call) => ({
            index: call.start,
            message: `\`gsap.${methodName(call)}\` inside a high-frequency handler (${handler.name}).`,
            hint: HINT.tweenPerEvent,
          })),
      );
    },
  },
  {
    id: "state-per-event",
    level: "error",
    /**
     * A bare `setX(…)` call — not a member call such as `el.style.setProperty`,
     * which is exactly what a pointer handler should do, and not a timer —
     * inside an inline high-frequency handler other than resize.
     *
     * A handler passed by name is not followed here, unlike tween-per-event. A
     * named scroll handler is usually a scroll-spy setting a discrete value — a
     * section id, a boolean — and React skips the render when that value has not
     * changed, so "a render per frame" would be false and, at error level, would
     * fail correct code. Telling a continuous value from a discrete one is a
     * precision question for the corpus, not something to guess.
     *
     * A setter called with a constant — `null`, a boolean, a literal — is not
     * reported either: once the state holds that value React skips the render,
     * so it costs one render, not one per frame. The corpus found
     * `onScroll={() => setHoveredCard(null)}`.
     */
    test(file) {
      if (!file.isReact) return [];
      const setters = findAll(file.ast, (node) => {
        if (node.type !== "CallExpression") return false;
        const callee = unwrap(node.callee);
        return (
          callee?.type === "Identifier" &&
          /^set(?!Timeout$|Interval$)[A-Z]\w*$/.test(callee.name) &&
          !(node.arguments.length <= 1 && node.arguments.every(isConstant))
        );
      });

      return handlersFor(file.ast, STATE_HOT_EVENTS, { followNames: false }).flatMap(
        (handler) =>
          setters
            .filter((setter) => contains(handler.node, setter))
            .filter((setter) => !debounced(handler, setter))
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
    /**
     * The layout keys of every vars object a tween carries — both of a
     * `fromTo`'s — on any receiver, so a timeline child counts. One finding per
     * key per call: a `fromTo` that names `height` in both vars animates one
     * property, and says so once, where it first appears. `gsap.set` animates
     * nothing, and is skipped: measuring with `set(el, { height: "auto" })` is
     * not a frame of layout.
     */
    test(file) {
      const LAYOUT = new Set(LAYOUT_PROPERTIES);
      const animates = (node) => {
        const method = tweenMethod(node);
        return method !== null && method !== "set";
      };

      return findAll(file.ast, animates).flatMap(
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
    /**
     * A `scrollTrigger` property inside a loop body: the callback of `.forEach`
     * or `.map`, or a `for`, `for…of` or `for…in` statement. One finding per
     * file, at the first.
     */
    test(file) {
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
    /**
     * The tween's own vars — a `fromTo`'s to-vars — on any receiver, so a
     * timeline child counts. Keys at the top level only: a `stagger` object's
     * own `repeat` is not the tween's. `yoyo` reverses rather than restarting,
     * so there is no seam to hide.
     */
    test(file) {
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
    /**
     * A GSAP call scrubbed anywhere in its arguments — `scrub: false` aside —
     * with a string ease other than `"none"` in those arguments or, for a
     * timeline, in a child `timelineLinks` finds: the chain, and the name it is
     * kept under within its scope, `this.tl` included. One finding per file.
     */
    test(file) {
      const scrubbed = (node) =>
        findAll(node, (n) => {
          if (keyName(n) !== "scrub") return false;
          const value = unwrap(n.value);
          return !(value?.type === "Literal" && value.value === false);
        }).length > 0;
      const eased = (nodes) =>
        nodes.flatMap((node) =>
          findAll(node, (n) => {
            if (keyName(n) !== "ease") return false;
            const value = staticString(n.value);
            return value !== null && value !== "none";
          }),
        )[0];

      for (const call of findAll(file.ast, (node) => isGsapCall(node))) {
        if (!call.arguments.some(scrubbed)) continue;
        const own = eased(call.arguments);
        const child =
          methodName(call) === "timeline"
            ? timelineLinks(file.ast, call)
                .filter((link) => CHILDREN.has(methodName(link)))
                .map((link) => eased(link.arguments))
                .find(Boolean)
            : undefined;
        const at = own ?? child;
        if (at) {
          return [{ index: at.start, message: MESSAGE.easedScrub, hint: HINT.easedScrub }];
        }
      }
      return [];
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
    /**
     * `onComplete` and `repeat: -1` anywhere in a GSAP call's arguments; for a
     * timeline, its children and any `eventCallback("onComplete", …)` from
     * `timelineLinks` — the chain, and the name it is kept under within its
     * scope, `this.tl` included.
     */
    test(file) {
      const endless = (nodes) =>
        nodes.flatMap((node) =>
          findAll(node, (n) => keyName(n) === "repeat" && numberValue(n.value) === -1),
        )[0];
      const findings = [];

      for (const call of findAll(file.ast, (node) => isGsapCall(node))) {
        const method = methodName(call);
        const waits = call.arguments.some(
          (argument) => findAll(argument, (n) => keyName(n) === "onComplete").length > 0,
        );
        const own = endless(call.arguments);
        if (waits && own) {
          findings.push({
            index: own.start,
            message: `\`gsap.${method}\` repeats forever, so its \`onComplete\` can never run.`,
            hint: HINT.neverCompletesOwn,
          });
          continue;
        }
        if (method !== "timeline") continue;

        const links = timelineLinks(file.ast, call);
        const completes = links.some(
          (link) =>
            methodName(link) === "eventCallback" &&
            staticString(link.arguments[0]) === "onComplete",
        );
        if (!waits && !completes) continue;

        const child = links
          .filter((link) => CHILDREN.has(methodName(link)))
          .map((link) => endless(link.arguments))
          .find(Boolean);
        if (child) {
          findings.push({
            index: child.start,
            message: MESSAGE.neverCompletesChild,
            hint: HINT.neverCompletesChild,
          });
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
    /**
     * Any `.fromTo(target, fromVars, toVars)` whose two vars are object
     * literals. Keys are read at the top level of each, and a transform's
     * from-value as it is written: `rotation: "90deg"` and `scale: 0` move the
     * element, `scale: 1` and `rotation: 0` do not.
     */
    test(file) {
      const ORIGIN = new Set(["transformOrigin", "svgOrigin"]);
      const TRANSFORM = /^(?:scale[XY]?|rotation|rotate|skew[XY])$/;

      const calls = findAll(file.ast, (node) => methodName(node) === "fromTo");

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
    /**
     * Any property naming a target geometry whose value is a fixed `#id`: a
     * string or a template literal with nothing interpolated, including the
     * shorthands `motionPath: "#id"` and `morphSVG: "#id"`.
     */
    test(file) {
      if (!file.isReact) return [];
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
    /**
     * Registered means named anywhere inside the arguments of a
     * `registerPlugin` call — not mentioned anywhere after one, and under its
     * local name, so an alias registered by its alias counts. Imports are read
     * as declarations: a default import takes its plugin's name from the path,
     * and a type-only import, of the whole statement or of one specifier, ships
     * nothing and is skipped.
     */
    test(file) {
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
          if (file.registeredElsewhere?.has(imported)) continue;
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
    /**
     * A branch is the query written in code — a string, a template or JSX
     * text. A comment that mentions it is not a branch. A file that only sets
     * values is not animating anything.
     */
    test(file) {
      if (!file.usesGsap) return [];
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
    /**
     * A static import declaration that brings in a dev tool, by a specifier's
     * name or, for a bare or default import, by its path. A type-only import
     * ships no code. `markers: true` is the property itself.
     */
    test(file) {
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
    /** An import or re-export whose module is `gsap/all`. */
    test(file) {
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
