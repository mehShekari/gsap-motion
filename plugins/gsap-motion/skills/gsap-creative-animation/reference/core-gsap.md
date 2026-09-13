# Core GSAP

The API you actually reach for. Plugin-specific surfaces live in their own
files; this is what is true everywhere.

## Imports

Every plugin is in the public package. Import each from its own subpath so the
bundler can drop the ones a route does not use — never `gsap/all`.

```ts
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
```

Register once, at module scope of the file that owns the animation:

```ts
gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin);
```

Registering `useGSAP` alongside them is what makes GSAP warn about a missing
plugin instead of silently ignoring the property that needed it.

Available here, all free, all typed: `ScrollTrigger`, `ScrollSmoother`,
`ScrollToPlugin`, `Observer`, `Draggable`, `InertiaPlugin`, `Flip`, `SplitText`,
`ScrambleTextPlugin`, `TextPlugin`, `DrawSVGPlugin`, `MorphSVGPlugin`,
`MotionPathPlugin`, `MotionPathHelper`, `CustomEase`, `CustomWiggle`,
`CustomBounce`, `Physics2DPlugin`, `PhysicsPropsPlugin`, `GSDevTools`,
`PixiPlugin`, `EaselPlugin`, `CSSRulePlugin`, `EasePack`.

## The four verbs

```ts
gsap.to(target, vars);              // from current state to vars
gsap.from(target, vars);            // from vars to current state
gsap.fromTo(target, fromVars, to);  // explicit both ends
gsap.set(target, vars);             // instant, no tween
```

`from` is convenient and it is also the usual cause of a flash: the element
paints at its natural state before the tween applies. `fromTo` with an explicit
start, or a `gsap.set` before, is what removes that. In React, `useGSAP` runs in
a layout effect so the set lands before paint — that is most of why it matters.

## Targets

A selector string, an element, a ref's `.current`, an array, or an object.
Inside a `useGSAP` or `gsap.context` scope, selector strings resolve against the
scope rather than the document — which is the whole reason to use one.

```ts
gsap.to("[data-card]", { ... });     // scoped, when inside useGSAP
gsap.to(ref.current, { ... });       // explicit
gsap.to({ v: 0 }, { v: 100, onUpdate });  // tween a plain object
```

That last form is how you animate anything GSAP cannot touch directly — a
canvas value, a counter, a Three.js material, a CSS variable on a distant node.

## Properties

Transforms are first-class and composable, and GSAP writes them as one matrix
rather than fighting over `transform`:

```ts
{ x: 100, y: -20, xPercent: -50, rotation: 45, scale: 1.2, skewX: 8,
  transformOrigin: "50% 100%" }
```

**On SVG, the origin comes with the first transform.** One that arrives after
the element is already scaled, rotated or skewed — in a `fromTo`'s to-vars —
leaves it offset, silently. Put it in the from-vars; see
[svg.md](svg.md#transform-origin).

`xPercent`/`yPercent` are percentages of the element's own size, which is what
centres something without knowing its dimensions.

`autoAlpha` is `opacity` plus `visibility` — it hides the element from pointer
events at 0, which plain `opacity` does not.

CSS variables work, and are the cheapest way to drive something whose styling
lives in CSS:

```ts
gsap.to(root, { "--glow-strength": 1, duration: 0.6 });
```

## Useful vars

```ts
{
  duration, delay, ease,
  repeat: -1,            // forever
  yoyo: true,            // reverse on alternate repeats
  repeatDelay: 0.4,
  stagger: 0.06,         // or { each, amount, from, ease }
  overwrite: "auto",     // kill conflicting tweens on the same props
  paused: true,
  onComplete, onUpdate, onStart,
}
```

`overwrite: "auto"` is the fix for the classic hover bug where leaving and
re-entering fast leaves an element halfway. Use it on anything an event can
retrigger.

## `gsap.utils`

Small functions that remove most of the arithmetic from animation code.

```ts
gsap.utils.clamp(0, 1, v);
gsap.utils.mapRange(0, 500, 0, 1, scrollY);   // remap one range onto another
gsap.utils.interpolate("#000", "#fff", 0.5);
gsap.utils.wrap(0, 10, 13);                   // → 3, for infinite loops
gsap.utils.snap(0.1, 0.34);                   // → 0.3
gsap.utils.random(-20, 20, 1);
gsap.utils.toArray("[data-card]");            // NodeList → real array
gsap.utils.selector(ref);                     // scoped selector function
gsap.utils.shuffle(items);
```

## `quickTo` and `quickSetter`

For values driven by a high-frequency event — pointer move, scroll, rAF —
creating a tween per event allocates garbage and fights itself.

```ts
const moveX = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
const moveY = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });

// In the handler — reuses one tween, no allocation:
moveX(e.clientX);
moveY(e.clientY);
```

`quickSetter` is the same idea with no interpolation, for when you are already
smoothing the value yourself:

```ts
const setX = gsap.quickSetter(el, "x", "px");
```

This is the single most important performance tool for pointer work. See
[interaction.md](interaction.md).

## `matchMedia`

Different strategies per breakpoint or preference, with automatic teardown when
the condition stops matching.

```ts
const mm = gsap.matchMedia();

mm.add(
  {
    desktop: "(min-width: 768px)",
    mobile: "(max-width: 767px)",
    reduced: "(prefers-reduced-motion: reduce)",
  },
  (context) => {
    const { desktop, reduced } = context.conditions as Record<string, boolean>;
    if (reduced) { /* the reduced design */ return; }
    gsap.to(el, { x: desktop ? 200 : 60 });
  },
);

// Teardown, when it was not created inside a context:
mm.revert();
```

Everything created inside the callback is reverted when the condition stops
matching. A plain `window.matchMedia` check leaves the first animation running
forever when a visitor turns reduced motion on mid-session, or rotates a tablet.

**Created inside a `useGSAP` or `gsap.context` body, it reverts itself with
that context** — `MatchMedia`'s constructor registers with whatever context is
active (verified against gsap 3.15), and `Context.add` makes itself active while your
function runs. An explicit `mm.revert()` there is redundant, not wrong. Created
outside one — module scope, a plain `useEffect` — it is yours to revert. See
[react-nextjs.md](react-nextjs.md).

## `context`

Scopes selectors and collects everything for teardown. In React you get this
through `useGSAP` and rarely call it directly.

```ts
const ctx = gsap.context(() => {
  gsap.to(".card", { y: 0 });      // resolved inside `root`
}, root);

ctx.revert();                       // undoes everything, restores inline styles
```

`revert()` restores original inline styles; `kill()` only stops the tweens. For
a component unmount you almost always want `revert`.

**A scope does not reach inside plugin config.** `motionPath.path` and
`morphSVG.shape` are resolved by the plugin against the whole document, so a
fixed id in a component rendered twice makes both instances drive the first
one's geometry — with no error. Namespace those ids per instance.

## Control

```ts
tl.play(); tl.pause(); tl.reverse(); tl.restart();
tl.progress(0.5);        // jump
tl.timeScale(2);         // twice as fast, live
tl.seek("label");
```

Tweening a timeline's own progress is how you smooth a jumpy external value:

```ts
gsap.to(tl, { progress: uploaded, duration: 0.4, overwrite: true });
```

## Easing

Named: `power1`–`power4`, `back`, `elastic`, `bounce`, `circ`, `expo`, `sine`,
`steps(n)`, `none`, each with `.in`/`.out`/`.inOut`. Which to pick is a craft
question — see [motion-design.md](motion-design.md).

`CustomEase` takes an SVG path and is free:

```ts
CustomEase.create("brand", "M0,0 C0.16,1 0.3,1 1,1");
gsap.to(el, { y: 0, ease: "brand" });
```
