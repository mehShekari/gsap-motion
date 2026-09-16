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
  matchMediaNeverRuns:
    "A matchMedia callback runs only while at least one of its named conditions matches, and a visitor with no reduced-motion preference matches none of these — so the branch for them is dead code and nothing animates. Add `motion: \"(prefers-reduced-motion: no-preference)\"` beside it, or use two separate `add` calls.",
  stackedFrom:
    "A `from` or `fromTo` applies its start state the moment it is built. Built more than once against the same element, the last one wins, and holds that element at its start state until the playhead reaches it — invisible, if the start state hides it. Pass `immediateRender: false`, and set the element's first state yourself with `gsap.set`.",
  orphanTween:
    "Nothing reverts it on unmount, and React StrictMode runs it twice in development. Move it into the useGSAP body, or wrap the handler in contextSafe. A helper counts as inside only when every use of it is a call from inside a context.",
  unmanagedInstance:
    "Inside a context these register themselves and are reverted with it. Out here nothing is watching: move it into the useGSAP body, or keep the instance and revert/kill it from the cleanup.",
  unrevertedContext:
    "Keep it under a name and revert it when the component goes: `onUnmounted` in Vue, the function returned from `onMount` or `$effect` in Svelte, the `useEffect` cleanup in React, `astro:before-swap` in Astro. Everything created inside the context goes with it.",
  tweenPerFrame:
    "A tween per frame allocates an object per frame, and each one fights the last. Create a `gsap.quickTo()` or `quickSetter()` once outside the callback and call it inside — or, for scroll, scrub a timeline instead of writing values by hand.",
  paintProperty:
    "Filters and shadows repaint the layer every frame, and the cost grows with the painted area. Animate `opacity` on a pre-blurred or pre-shadowed copy, or move a transform instead, and measure before defending anything else.",
  unownedLoop:
    "An infinite repeat keeps the ticker busy while it is off screen. Pause it from an IntersectionObserver, or let a ScrollTrigger's `onToggle` own it, so it costs nothing when nobody can see it.",
  ungatedHover:
    "A tap fires `mouseenter` on a touch device and nothing fires the leave, so the effect sticks. Gate it with `gsap.matchMedia()` on `(hover: hover)`, and decide what a coarse pointer gets instead.",
  delayChain:
    "Delays are a choreography nobody can change: moving one beat means re-adding every number after it. Build a timeline and position each beat with a label or a relative offset — `\"<\"`, `\"-=0.2\"`.",
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
  tweenPerFrame: "A tween is created here on every frame.",
  unownedLoop: "An infinite repeat that nothing pauses.",
  ungatedHover: "A hover animation with no `(hover: hover)` gate.",
  delayChain: "Three or more tweens in this scope are sequenced by `delay`.",
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
function handlersFor(ast, events, { followNames = true, perFrame = false } = {}) {
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

  /**
   * R3F's `useFrame(callback)` is a per-frame scope of its own: what is inside
   * runs on every rendered frame, whatever the pointer is doing.
   */
  if (perFrame) {
    for (const call of findAll(ast, (node) => calleeName(node) === "useFrame")) {
      const node = handler(call.arguments[0]);
      if (node) handlers.push({ name: "useFrame", node });
    }
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
/**
 * Events that fire once and are never removed by anyone: the document's own
 * start-up. The corpus reported two `DOMContentLoaded` handlers in an Astro
 * page as leaks, which is not what a leak is.
 */
const ONE_SHOT_EVENTS = new Set(["DOMContentLoaded", "load", "pageshow"]);

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

/**
 * The mount hooks each adapter uses. A context created in one of them lives as
 * long as the component does, so something has to revert it when the component
 * goes.
 */
const MOUNT_HOOKS = new Set([
  "onMounted",
  "onMount",
  "onActivated",
  "useEffect",
  "useLayoutEffect",
  "$effect",
]);

/**
 * Which mount hook `node` was created in, or null. Astro has no hook: its
 * equivalent is a listener for `astro:page-load`, which fires on the first load
 * and after every view transition.
 */
function mountHook(ast, node) {
  /** Nearest first, so a function's own parent is the entry after it. */
  const ancestors = ancestorsOf(ast, node);

  for (let i = 0; i < ancestors.length; i += 1) {
    if (!isFunction(ancestors[i])) continue;
    const parent = ancestors[i + 1];
    if (parent?.type !== "CallExpression") continue;

    const name = calleeName(parent);
    if (MOUNT_HOOKS.has(name)) return `\`${name}\``;
    if (
      name?.endsWith("addEventListener") &&
      staticString(parent.arguments[0]) === "astro:page-load"
    ) {
      return "the `astro:page-load` handler";
    }
  }

  return null;
}

/**
 * Properties whose animation repaints the element rather than moving a layer
 * the compositor already has.
 *
 * `clipPath` is deliberately absent. An inset or circle reveal is the technique
 * this skill recommends for image reveals, it is cheap on a simple shape, and a
 * rule that fires on its own guidance is noise.
 */
const PAINT_PROPERTIES = new Set([
  "filter",
  "webkitFilter",
  "backdropFilter",
  "boxShadow",
]);

const HOVER_EVENTS = new Set([
  "pointerenter",
  "pointerover",
  "mouseenter",
  "mouseover",
]);

/**
 * Every function that runs once per frame: the ticker, R3F's `useFrame`, an
 * `onUpdate`/`onMove`/`onChange` callback, and a function that schedules
 * itself with `requestAnimationFrame`.
 */
function perFrameScopes(ast) {
  const scopes = [];
  const add = (node) => {
    const fn = node && unwrap(node);
    if (isFunction(fn)) scopes.push(fn);
  };

  for (const call of findAll(ast, (node) => {
    const name = calleeName(node);
    return name === "gsap.ticker.add" || name === "useFrame";
  })) {
    add(call.arguments[0]);
  }

  /**
   * `onUpdate`, `onMove` and `onChange` are per-frame in a tween, a
   * ScrollTrigger, an Observer or a Draggable — and nowhere else. Every control
   * and form library in the world has an `onChange`, and the corpus duly
   * reported a Three.js `traverse` inside one of them as a per-frame tween.
   */
  const PER_FRAME_KEYS = new Set(["onUpdate", "onMove", "onChange"]);
  const GSAP_CONFIG = /^(?:gsap\.|ScrollTrigger\.|Observer\.|Draggable\.|ScrollSmoother\.|Flip\.)/;

  for (const property of findAll(
    ast,
    (node) => node.type === "Property" && PER_FRAME_KEYS.has(keyName(node)),
  )) {
    const owner = ancestorsOf(ast, property).find(
      (node) => node.type === "CallExpression",
    );
    if (!owner) continue;
    const name = calleeName(owner);
    if (tweenMethod(owner) === null && !(name && GSAP_CONFIG.test(name))) continue;
    add(property.value);
  }

  for (const call of findAll(
    ast,
    (node) => calleeName(node) === "requestAnimationFrame",
  )) {
    const fn = resolveFunction(ast, call.arguments[0]);
    if (isFunction(fn) && contains(fn, call)) scopes.push(fn);
  }

  return scopes;
}

/** The handlers a hover starts: a listener's callback, or a JSX `on*` prop. */
function hoverHandlers(ast) {
  const handlers = [];

  for (const call of findAll(
    ast,
    (node) => listenerMethod(node) === "addEventListener",
  )) {
    const event = staticString(call.arguments[0]);
    if (event === null || !HOVER_EVENTS.has(event)) continue;
    const fn = resolveFunction(ast, call.arguments[1]);
    if (isFunction(fn)) handlers.push(fn);
  }

  for (const attribute of findAll(
    ast,
    (node) => node.type === "JSXAttribute" && node.name.type === "JSXIdentifier",
  )) {
    if (!/^on(?:Mouse|Pointer)(?:Enter|Over)$/.test(attribute.name.name)) continue;
    if (attribute.value?.type !== "JSXExpressionContainer") continue;
    const fn = resolveFunction(ast, attribute.value.expression);
    if (isFunction(fn)) handlers.push(fn);
  }

  return handlers;
}

/** Whether anything in the file pauses, kills or reverts what is kept as `name`. */
function stopped(ast, name) {
  if (!name) return false;
  return (
    findAll(ast, (node) => {
      const method = methodName(node);
      if (method !== "pause" && !TEARDOWN.has(method)) return false;
      return dottedName(unwrap(node.callee).object) === name;
    }).length > 0
  );
}

export const RULES = [
  // --- Lifecycle ------------------------------------------------------------
  {
    id: "orphan-tween",
    level: "error",
    description:
      "A tween created outside `useGSAP`, `gsap.context` or `contextSafe` in React — never reverted, and doubled by StrictMode",
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
    description:
      "`matchMedia`, `Observer`, `Draggable`, `ScrollSmoother` or `SplitText` created outside a context and never torn down",
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
    id: "unreverted-context",
    level: "warn",
    description:
      "A `gsap.context` created on mount — `onMounted`, `onMount`, `useEffect`, `astro:page-load` — that nothing reverts",
    /**
     * Every adapter's teardown rule, in one shape: a context built when the
     * component mounts holds every tween, ScrollTrigger and matchMedia made
     * inside it, and reverting it is the whole cleanup. Nothing reverts it here.
     *
     * Only contexts created in a mount hook are read. A context built in a
     * function the module exports — the vanilla `mountReveal(root)` shape — hands
     * its teardown to the caller, and this file cannot see whether the caller
     * calls it.
     */
    test(file) {
      const contexts = findAll(
        file.ast,
        (node) => calleeName(node) === "gsap.context",
      );

      return contexts.flatMap((call) => {
        const hook = mountHook(file.ast, call);
        if (!hook || tornDown(file.ast, call)) return [];
        return [
          {
            index: call.start,
            message: `The \`gsap.context\` created in ${hook} is never reverted.`,
            hint: HINT.unrevertedContext,
          },
        ];
      });
    },
  },
  {
    id: "dangling-listener",
    level: "warn",
    description:
      "An event listener that is never removed, including inline handlers that cannot be",
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
          if (ONE_SHOT_EVENTS.has(event)) return [];
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
    description:
      "A new tween allocated on every pointer, scroll or wheel event",
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
    description:
      "React state set in a high-frequency handler — a re-render per frame",
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

      return handlersFor(file.ast, STATE_HOT_EVENTS, {
        followNames: false,
        perFrame: true,
      }).flatMap(
        (handler) =>
          setters
            .filter((setter) => contains(handler.node, setter))
            .filter((setter) => !debounced(handler, setter))
            .map((setter) => ({
              index: setter.start,
              message:
                handler.name === "useFrame"
                  ? "React state setter inside a `useFrame` callback, which runs every frame."
                  : `React state setter inside a ${handler.name} handler.`,
              hint: HINT.statePerEvent,
            })),
      );
    },
  },
  {
    id: "layout-property",
    level: "warn",
    description:
      "Animating `width`, `height`, `top`, `left`, margins or padding, which forces layout every frame",
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
    description:
      "A ScrollTrigger created per item in a loop",
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
    description:
      "An infinite repeat with an ease, which makes its own seam visible",
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
    description:
      "Easing inside a scrubbed ScrollTrigger, which fights the scrollbar",
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
    description:
      "An `onComplete` that can never run: on a timeline holding a `repeat: -1` child, or on a tween or timeline that repeats forever",
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
    description:
      "A `fromTo` whose origin is only in its to-vars while its from-vars scale, rotate or skew, which leaves an SVG element offset",
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
    description:
      "A hardcoded `#id` in MotionPath or MorphSVG config, which two instances of a component will share",
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
    description:
      "A plugin imported and never registered, whose properties are silently ignored",
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
    id: "tween-per-frame",
    level: "warn",
    description:
      "A tween created every frame — in `onUpdate`, the ticker, an Observer callback, `useFrame` or a `requestAnimationFrame` loop",
    /**
     * `gsap.set` is left out: writing a value straight to an element is what a
     * per-frame callback is for, and `quickSetter` is the faster shape of the
     * same thing rather than a different one. What this catches is a tween —
     * an object with its own duration and ease — being built sixty times a
     * second, each one overwriting the last before it can finish.
     */
    test(file) {
      const scopes = perFrameScopes(file.ast);
      if (scopes.length === 0) return [];

      const tweens = findAll(file.ast, (node) => {
        const method = tweenMethod(node);
        return method !== null && method !== "set";
      });

      const reported = new Set();
      const findings = [];
      for (const scope of scopes) {
        for (const tween of tweens) {
          if (!contains(scope, tween) || reported.has(tween.start)) continue;
          reported.add(tween.start);
          findings.push({
            index: tween.start,
            message: MESSAGE.tweenPerFrame,
            hint: HINT.tweenPerFrame,
          });
        }
      }
      return findings;
    },
  },
  {
    id: "paint-property",
    level: "warn",
    description:
      "Animating `filter`, `backdropFilter` or `boxShadow`, which repaints the element every frame",
    /** Read exactly as layout-property reads its own keys, and `set` is skipped too. */
    test(file) {
      const animates = (node) => {
        const method = tweenMethod(node);
        return method !== null && method !== "set";
      };

      return findAll(file.ast, animates).flatMap((call) => {
        const seen = new Set();
        return varsObjects(call, tweenMethod(call))
          .flatMap((vars) => vars.properties)
          .filter((property) => {
            const key = keyName(property);
            if (!PAINT_PROPERTIES.has(key) || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((property) => ({
            index: property.start,
            message: `Animating \`${keyName(property)}\` repaints on every frame.`,
            hint: HINT.paintProperty,
          }));
      });
    },
  },
  {
    id: "unowned-loop",
    level: "info",
    description:
      "An infinite repeat that nothing pauses, which keeps the ticker busy off screen",
    /**
     * Info, because "nothing pauses it" is read from one file and a loop can be
     * owned from elsewhere. A loop is taken as owned when its name is paused,
     * killed or reverted anywhere here, when the file builds an
     * IntersectionObserver, when the tween carries a `scrollTrigger` that
     * toggles it, or when a context holds it — unmount reverts that one.
     *
     * The last of those came from a real site's loader, where three loops sit
     * in a `useGSAP` body inside `matchMedia`. Reporting them would have meant
     * "nothing stops this" about an animation the component's own unmount stops.
     * What is left — a loop running while it is off screen but still mounted —
     * is a measurement, and 3.4's `inspect` is where that belongs.
     */
    test(file) {
      const observed = findAll(
        file.ast,
        (node) =>
          node.type === "NewExpression" &&
          dottedName(node.callee) === "IntersectionObserver",
      ).length > 0;
      if (observed) return [];

      const inside = gsapContexts(file.ast);

      return findAll(file.ast, (node) => tweenMethod(node) !== null).flatMap((call) => {
        if (inside(call)) return [];
        const vars = ownVars(call, tweenMethod(call));
        if (!vars) return [];
        const repeat = propertyOf(vars, "repeat");
        if (!repeat || numberValue(repeat.value) !== -1) return [];
        if (propertyOf(vars, "scrollTrigger")) return [];
        if (stopped(file.ast, keptUnder(file.ast, call)?.name)) return [];
        return [
          {
            index: repeat.start,
            message: MESSAGE.unownedLoop,
            hint: HINT.unownedLoop,
          },
        ];
      });
    },
  },
  {
    id: "ungated-hover",
    level: "warn",
    description:
      "A hover animation with no `(hover: hover)` gate, which a tap starts and nothing ends",
    /**
     * The gate is looked for as text, anywhere in the file: a `matchMedia`
     * condition, a CSS string, a constant. One finding per handler, on its first
     * tween, because the handler is what needs the gate.
     */
    test(file) {
      if (/\(\s*(?:any-)?hover\s*:\s*hover\s*\)/.test(file.code)) return [];

      return hoverHandlers(file.ast).flatMap((handler) => {
        const [tween] = findAll(file.ast, (node) => tweenMethod(node) !== null).filter(
          (node) => contains(handler, node),
        );
        if (!tween) return [];
        return [
          { index: tween.start, message: MESSAGE.ungatedHover, hint: HINT.ungatedHover },
        ];
      });
    },
  },
  {
    id: "delay-chain",
    level: "warn",
    description:
      "Three or more tweens in one scope sequenced by `delay`, which is a timeline nobody can retime",
    /**
     * Three is the threshold because two tweens with delays are a pair, and a
     * pair is still readable. Counted per scope — the function they share — so
     * three components each with one delayed tween are not a chain. A tween on a
     * timeline is not counted: a timeline already has positions.
     */
    test(file) {
      const scopes = new Map();

      for (const call of findAll(file.ast, (node) => tweenMethod(node) !== null)) {
        if (chainStart(call) !== call) continue;
        const vars = ownVars(call, tweenMethod(call));
        const delay = vars && propertyOf(vars, "delay");
        if (!delay || !(numberValue(delay.value) > 0)) continue;
        const scope = scopeOf(file.ast, call) ?? file.ast;
        if (!scopes.has(scope)) scopes.set(scope, []);
        scopes.get(scope).push(call);
      }

      return [...scopes.values()]
        .filter((calls) => calls.length >= 3)
        .map((calls) => ({
          index: calls[0].start,
          message: MESSAGE.delayChain,
          hint: HINT.delayChain,
        }));
    },
  },
  {
    id: "missing-reduced-motion",
    level: "warn",
    description:
      "An animating file with no `prefers-reduced-motion` branch",
    /**
     * A branch is the query written in code — a string, a template or JSX
     * text. A comment that mentions it is not a branch.
     *
     * Only a file that builds an animation of its own is reported, and the
     * finding lands on the first one. Three things are not that:
     * `registerPlugin` and `killTweensOf`, which animate nothing; `set`, which
     * has no duration; and a method called on a timeline the file was handed,
     * because a helper that adds beats to its caller's timeline does not own
     * the reduced-motion decision — the caller does.
     */
    test(file) {
      if (!file.usesGsap) return [];
      if (findAll(file.ast, (node) => spells(node, "prefers-reduced-motion")).length) {
        return [];
      }

      const [first] = findAll(file.ast, (node) => {
        const method = tweenMethod(node);
        if (method === null || method === "set") return false;
        /** Built here, rather than added to something passed in. */
        return calleeName(node)?.startsWith("gsap.") === true;
      }).sort((a, b) => a.start - b.start);
      if (!first) return [];

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
    description:
      "`GSDevTools` or `MotionPathHelper` imported statically, or unconditional `markers: true`",
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
    description:
      "Importing from `gsap/all`, which pulls in every plugin",
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
  {
    id: "matchmedia-never-runs",
    level: "warn",
    description:
      "A matchMedia callback that branches on its conditions, when every condition needs reduced motion",
    /**
     * `mm.add({ reduced: "(prefers-reduced-motion: reduce)" }, (context) => …)`
     * whose callback reads `context.conditions`. The callback runs only while a
     * named condition matches, and a visitor with no preference matches none —
     * so the branch written for them never runs, and neither does the
     * animation in it. Found in a head-to-head test on a real hero, where the
     * whole page shipped without motion.
     *
     * The reading of `conditions` is the whole signal. A reduced-only `add`
     * that does not branch is GSAP's documented pattern for setting end states,
     * meant to run for those visitors only, and is correct.
     */
    test(file) {
      const REDUCE = /prefers-reduced-motion\s*:\s*reduce/i;

      /** Names bound to `gsap.matchMedia()` in this file. */
      const media = new Set(
        findAll(
          file.ast,
          (node) =>
            node.type === "VariableDeclarator" &&
            node.id.type === "Identifier" &&
            /**
             * `let tl;` has no initializer, and `calleeName` does not accept
             * null. Every fixture initialised its declarations, so 133 passing
             * tests missed this; the first real project threw on it and took
             * the whole audit down with it.
             */
            Boolean(node.init) &&
            calleeName(unwrap(node.init)) === "gsap.matchMedia",
        ).map((node) => node.id.name),
      );

      const onMatchMedia = (call) => {
        const callee = unwrap(call.callee);
        if (callee?.type !== "MemberExpression") return false;
        const object = unwrap(callee.object);
        if (object?.type === "Identifier") return media.has(object.name);
        return calleeName(object) === "gsap.matchMedia";
      };

      /** Does the callback read the conditions it was handed? */
      const branches = (fn) => {
        const [param] = fn.params;
        if (!param) return false;
        if (param.type === "ObjectPattern") {
          return param.properties.some((p) => keyName(p) === "conditions");
        }
        if (param.type !== "Identifier") return false;
        return findAll(fn.body, (node) => {
          const member = unwrap(node);
          return (
            member?.type === "MemberExpression" &&
            !member.computed &&
            unwrap(member.object)?.type === "Identifier" &&
            unwrap(member.object).name === param.name &&
            member.property.name === "conditions"
          );
        }).length > 0;
      };

      return findAll(file.ast, (node) => methodName(node) === "add" && onMatchMedia(node))
        .filter((call) => {
          const conditions = unwrap(call.arguments[0]);
          if (conditions?.type !== "ObjectExpression" || !conditions.properties.length) return false;
          const everyReduces = conditions.properties.every((property) => {
            const value = staticString(property.value);
            return typeof value === "string" && REDUCE.test(value);
          });
          if (!everyReduces) return false;
          const callback = resolveFunction(file.ast, call.arguments[1]);
          return Boolean(callback) && branches(callback);
        })
        .map((call) => ({
          index: call.start,
          message:
            "This matchMedia callback branches on its conditions, but every condition needs reduced motion — so it never runs for a visitor without that preference.",
          hint: HINT.matchMediaNeverRuns,
        }));
    },
  },
  {
    id: "stacked-from",
    level: "warn",
    description:
      "A timeline's `from` or `fromTo` built more than once against the same target",
    /**
     * A `from` or `fromTo` on a timeline, without `immediateRender: false`,
     * that is built more than once against the same element: written out
     * twice, or inside a loop, or inside a helper a loop calls. Each applies
     * its start state the moment it is built, so the last one wins and holds
     * the element hidden until the playhead arrives. Found in a real hero,
     * where one call site in a helper ran six times and a badge stayed
     * invisible through the whole first state.
     *
     * Two shapes must stay quiet, and both sat in that same file. A target that
     * varies with the loop — `forEach((card) => tl.from(card, …))` — is a new
     * element each pass. And a tween inside a callback that is only passed
     * along is not known to run each pass, so it is not reported.
     */
    test(file) {
      const LOOPS = ["ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement", "DoWhileStatement"];
      const isLoopCallback = (fn) => {
        const parent = parentOf(file.ast, fn);
        return (
          parent?.type === "CallExpression" &&
          unwrap(parent.arguments[0]) === fn &&
          ["forEach", "map", "flatMap"].includes(methodName(parent))
        );
      };
      const renders = (call) =>
        !call.arguments.some((arg) => {
          const object = unwrap(arg);
          return (
            object?.type === "ObjectExpression" &&
            object.properties.some((p) => {
              const value = unwrap(p.value);
              return keyName(p) === "immediateRender" && value?.type === "Literal" && value.value === false;
            })
          );
        });

      const paramNames = (fn) =>
        fn.params.flatMap((param) =>
          findAll(param, (n) => n.type === "Identifier").map((n) => n.name),
        );
      const loopNames = (loop) => {
        const left = loop.left ?? loop.init;
        return left ? findAll(left, (n) => n.type === "Identifier").map((n) => n.name) : [];
      };

      /** Is this node inside a loop body or a loop callback? */
      const inLoop = (node) =>
        ancestorsOf(file.ast, node).some((a) => LOOPS.includes(a.type) || (isFunction(a) && isLoopCallback(a)));

      /**
       * Walk out from the tween. The names that change each pass are gathered on
       * the way; the walk stops at the first function that is neither a loop's
       * own callback nor a named helper some loop calls, because nothing then
       * says it runs more than once.
       */
      /**
       * Does a guard on the way out pick exactly one pass? `key === "money"`
       * does; `key !== "brand"` runs on most passes and still stacks. Only an
       * equality against a literal, on a name that changes each pass, counts —
       * the version of a real hero built without the skill guarded its one
       * per-state tween that way, and a first version of this rule credited it
       * with a bug it did not have.
       */
      const selectsOnePass = (guards, varying) =>
        guards.some((test) =>
          findAll(test, (node) => {
            if (node.type !== "BinaryExpression" || !["===", "=="].includes(node.operator)) return false;
            const sides = [unwrap(node.left), unwrap(node.right)];
            const name = sides.find((side) => side?.type === "Identifier" && varying.has(side.name));
            const literal = sides.find((side) => side?.type === "Literal");
            return Boolean(name && literal);
          }).length > 0,
        );

      /** Names that change each pass: its variable, and whatever its body declares. */
      const declaredIn = (body) =>
        body
          ? findAll(body, (n) => n.type === "VariableDeclarator" && n.id.type === "Identifier").map((n) => n.id.name)
          : [];

      const repetition = (tween, timeline) => {
        const varying = new Set();
        const guards = [];
        const settle = (loopBody) => {
          declaredIn(loopBody).forEach((n) => varying.add(n));
          return selectsOnePass(guards, varying) ? null : varying;
        };
        let inner = tween;
        for (const ancestor of ancestorsOf(file.ast, tween)) {
          if (contains(ancestor, timeline)) return null;
          if ((ancestor.type === "IfStatement" || ancestor.type === "ConditionalExpression") && contains(ancestor.consequent, inner)) {
            guards.push(ancestor.test);
          }
          inner = ancestor;
          if (LOOPS.includes(ancestor.type)) {
            loopNames(ancestor).forEach((n) => varying.add(n));
            return settle(ancestor.body);
          }
          if (!isFunction(ancestor)) continue;
          paramNames(ancestor).forEach((n) => varying.add(n));
          if (isLoopCallback(ancestor)) return settle(ancestor.body);

          const holder = parentOf(file.ast, ancestor);
          const name =
            holder?.type === "VariableDeclarator" && holder.id.type === "Identifier"
              ? holder.id.name
              : ancestor.type === "FunctionDeclaration"
                ? ancestor.id?.name
                : null;
          if (!name) return null;
          const calledInLoop = findAll(
            file.ast,
            (n) =>
              n.type === "CallExpression" &&
              unwrap(n.callee)?.type === "Identifier" &&
              unwrap(n.callee).name === name &&
              inLoop(n),
          ).length > 0;
          return calledInLoop ? varying : null;
        }
        return null;
      };

      /**
       * The properties a tween's start state sets, or null when they cannot be
       * read. "Last one wins" is per property: two from-tweens on one element
       * that set different properties hide nothing, and a real project relied on
       * exactly that — a line flying in on `opacity` and `y` while a second tween
       * turned it on `rotationY`. `autoAlpha` sets opacity, so they count as one.
       */
      const CONFIG = new Set([
        "duration", "delay", "ease", "stagger", "repeat", "yoyo", "repeatDelay",
        "immediateRender", "overwrite", "paused", "id", "data", "callbackScope",
        "onStart", "onUpdate", "onComplete", "onRepeat", "onReverseComplete", "scrollTrigger",
      ]);
      const startKeys = (tween) => {
        const vars = unwrap(tween.arguments[1]);
        if (vars?.type !== "ObjectExpression") return null;
        if (vars.properties.some((p) => p.type !== "Property" || p.computed)) return null;
        return new Set(
          vars.properties
            .map((p) => keyName(p))
            .filter((key) => key && !CONFIG.has(key))
            .map((key) => (key === "autoAlpha" ? "opacity" : key)),
        );
      };
      const overlap = (a, b) => {
        if (!a || !b) return false;
        for (const key of a) if (b.has(key)) return true;
        return false;
      };

      /**
       * Two calls that cannot both run: opposite branches of one `if` or one
       * ternary, or two cases of one `switch`. A real project built a fade-in in
       * the `if` and a fade-out in the `else` against the same element, and only
       * ever ran one of them.
       */
      const exclusive = (a, b) => {
        const upB = new Set(ancestorsOf(file.ast, b));
        for (const node of ancestorsOf(file.ast, a)) {
          if (!upB.has(node)) continue;
          if ((node.type === "IfStatement" || node.type === "ConditionalExpression") && node.alternate) {
            if (contains(node.alternate, a) !== contains(node.alternate, b)) return true;
          }
          if (node.type === "SwitchStatement") {
            const caseOf = (n) => node.cases.find((c) => contains(c, n));
            if (caseOf(a) && caseOf(a) !== caseOf(b)) return true;
          }
        }
        return false;
      };

      const mentions = (text, names) =>
        [...names].some((name) => new RegExp(`(^|[^\\w$])${name.replace(/\$/g, "\\$")}([^\\w$]|$)`).test(text));

      const findings = [];
      const timelines = findAll(file.ast, (node) => calleeName(node) === "gsap.timeline");
      for (const timeline of timelines) {
        const tweens = timelineLinks(file.ast, timeline).filter(
          (call) => ["from", "fromTo"].includes(methodName(call)) && call.arguments[0] && renders(call),
        );
        const reported = new Set();
        /** Earlier from-tweens on each target, to compare a later one against. */
        const earlier = new Map();

        for (const tween of tweens) {
          const target = unwrap(tween.arguments[0]);
          const text = file.raw.slice(target.start, target.end).replace(/\s+/g, "");
          if (reported.has(text)) continue;

          /** One call site built repeatedly always shares its own properties. */
          const varying = repetition(tween, timeline);
          const repeatedInPlace = varying !== null && !mentions(text, varying);

          const keys = startKeys(tween);
          const before = earlier.get(text) ?? [];
          const writtenTwice = before.some(
            (other) => !exclusive(other.tween, tween) && overlap(other.keys, keys),
          );
          earlier.set(text, [...before, { tween, keys }]);

          if (repeatedInPlace || writtenTwice) {
            reported.add(text);
            findings.push({
              /**
               * The method's own position, not the call's. A chained call starts
               * where its chain starts, so `tween.start` pointed a real report 25
               * lines above the `fromTo` it was about.
               */
              index: unwrap(tween.callee)?.property?.start ?? tween.start,
              message: `\`${text}\` gets a \`${methodName(tween)}\` more than once on this timeline, and each applies its start state as soon as it is built.`,
              hint: HINT.stackedFrom,
            });
          }
        }
      }
      return findings;
    },
  },
];
