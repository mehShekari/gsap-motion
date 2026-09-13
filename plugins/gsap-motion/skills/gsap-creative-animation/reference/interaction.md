# Interaction

Pointer-driven motion. The engineering constraint is that these fire at 60–120Hz,
so the wrong architecture costs a frame budget rather than a few milliseconds.

Every interaction has three parts, and the third is the one people skip:

```text
input → response → recovery
```

The recovery is what makes it feel physical. A button that springs toward the
cursor and snaps back on leave feels broken; the same button easing back over
0.6s feels alive.

## The rule: `quickTo`, not a tween per event

```ts
// Wrong — allocates a tween per pointer event, and they fight each other
onMouseMove = (e) => gsap.to(el, { x: e.clientX, duration: 0.5 });

// Right — one tween, retargeted
const moveX = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
const moveY = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
onMouseMove = (e) => { moveX(e.clientX); moveY(e.clientY); };
```

Create the `quickTo` functions once, inside the `useGSAP` body. This is the
single most important performance decision in pointer work.

## Magnetic element

The element leans toward the cursor while it is near, and returns when it
leaves.

```ts
const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3" });
const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3" });

const onMove = (e: PointerEvent) => {
  const r = el.getBoundingClientRect();
  xTo((e.clientX - (r.left + r.width / 2)) * 0.35);
  yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
};

const onLeave = () => { xTo(0); yTo(0); };
```

- **Strength 0.2–0.4.** Above that the element outruns the cursor and feels
  unmoored.
- **Measure in the handler, not once.** Scroll and layout change the rect. If
  that shows up as cost, cache it on enter and invalidate on scroll.
- **The hit area should be larger than the element** — a padded wrapper listens,
  the inner element moves. That is what makes the pull feel like a field rather
  than a hover state.

## Cursor follower

```ts
const xTo = gsap.quickTo(dot, "x", { duration: 0.35, ease: "power3" });
const yTo = gsap.quickTo(dot, "y", { duration: 0.35, ease: "power3" });

window.addEventListener("pointermove", (e) => { xTo(e.clientX); yTo(e.clientY); });
```

- Two layers at different durations (0.1 and 0.5) give the trailing-ring look
  without a trail of elements.
- `pointer-events: none` on the follower, always.
- **Only on devices that have a cursor.** Gate on
  `(hover: hover) and (pointer: fine)` — a follower on a touch device is dead
  weight and sits in the corner.
- Hiding the native cursor is a real accessibility cost. Do it only if the
  replacement is at least as legible over every surface, and never over text
  inputs.

## Observer

One unified handler for wheel, touch, and pointer — the right tool when you want
a gesture rather than a scroll position.

```ts
import { Observer } from "gsap/Observer";
gsap.registerPlugin(Observer);

const obs = Observer.create({
  target: window,
  type: "wheel,touch,pointer",
  onUp: () => next(),
  onDown: () => prev(),
  tolerance: 10,
  preventDefault: true,
});

obs.kill();   // only needed outside a useGSAP body — see react-nextjs.md
```

This is how full-screen section-snapping and swipe carousels are built without
ScrollTrigger. `preventDefault: true` takes over native scrolling — a large
commitment, and it must not trap a keyboard or screen-reader user.

## Draggable and Inertia

```ts
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
gsap.registerPlugin(Draggable, InertiaPlugin);

Draggable.create(el, {
  type: "x",
  bounds: container,
  inertia: true,
  snap: { x: (v) => Math.round(v / 320) * 320 },
  onDragEnd() { /* ... */ },
});
```

`inertia: true` gives the flick-and-settle that makes a drag feel native.
`Draggable.create` returns instances — `.kill()` them on unmount.

Anything draggable needs a keyboard path to the same outcome. A carousel that
only responds to drag is unusable without a pointer.

## Hover with a timeline

Build once, play and reverse. Better than creating tweens per event, and the
return matches the arrival for free.

```ts
const hover = gsap.timeline({ paused: true })
  .to(el, { scale: 1.04, duration: 0.3, ease: "power2.out" })
  .to(label, { y: -2, duration: 0.3 }, "<");

onEnter = () => hover.play();
onLeave = () => hover.reverse();
```

In React, if the timeline is built inside `useGSAP` and only *played* from the
handler, no `contextSafe` is needed — see [react-nextjs.md](react-nextjs.md).

## `overwrite: "auto"`

The classic bug: enter, leave, enter fast, and the element sits halfway.
Whatever retriggers needs `overwrite: "auto"` so the conflicting tween is killed
rather than blended.

## Spotlight

A pointer-tracked gradient. Drive CSS variables rather than re-rendering:

```ts
const setX = gsap.quickSetter(card, "--spot-x", "px");
const setY = gsap.quickSetter(card, "--spot-y", "px");
```

```css
background: radial-gradient(
  240px at var(--spot-x) var(--spot-y),
  var(--glow), transparent 70%
);
```

Cheap, and the styling stays in CSS where it can follow the theme.

## Accessibility

- **Everything reachable by pointer must be reachable by keyboard.** Hover state
  and focus state should be the same visual.
- Never destroy the focus ring with a transform that moves the element out from
  under it.
- Gate hover effects on `(hover: hover)`. On touch, `:hover` sticks after a tap.
- Under `prefers-reduced-motion: reduce`, keep the state change and drop the
  travel — see [accessibility.md](accessibility.md).

## Failures

| Symptom | Cause |
|---|---|
| Janky on move | a tween per event, or React state in the handler |
| Element sticks halfway | missing `overwrite: "auto"` |
| Magnetic pull feels wrong | strength too high, or rect measured once |
| Follower stuck in a corner | mounted on a touch device |
| Hover sticks after tap | no `(hover: hover)` gate |
| Effects survive navigation | `Observer`/`Draggable` not killed, listeners not removed |
