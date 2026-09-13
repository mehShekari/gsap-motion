# Flip

Animates between two layouts you did not have to compute. You change the DOM or
the CSS however you like, and Flip works out the transform that makes the old
state look like the new one, then animates it away.

Use it when the animation's meaning is **continuity** — this thing is still that
thing. A thumbnail becoming a hero image, a card expanding into a panel, an item
moving between lists, a grid reflowing on filter.

```ts
import { Flip } from "gsap/Flip";
gsap.registerPlugin(Flip);
```

## The pattern

Three steps, always in this order:

```ts
const state = Flip.getState("[data-card]");   // 1. record

container.classList.toggle("expanded");        // 2. change — anything at all

Flip.from(state, {                             // 3. animate the difference
  duration: 0.6,
  ease: "power3.inOut",
  absolute: true,
});
```

Step 2 can be a class toggle, a React re-render, a reparent, a sort — Flip does
not care how the layout changed, only what it was and what it is.

## Options that matter

```ts
Flip.from(state, {
  duration: 0.6,
  ease: "power3.inOut",
  absolute: true,          // position: absolute during the flip
  nested: true,            // children also move — compensates their transforms
  scale: true,             // scale instead of animating width/height
  stagger: 0.05,
  spin: true,
  simple: true,            // skip rotation/skew maths when there is none
  onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { opacity: 1 }),
  onLeave: (els) => gsap.to(els, { opacity: 0 }),
});
```

- **`absolute: true`** takes the moving elements out of flow for the duration.
  Without it, siblings reflow during the animation and the whole grid jitters.
  Reach for it whenever more than one element moves.
- **`scale: true`** animates a transform instead of `width`/`height`. That is a
  GPU-friendly property against a layout-triggering one — almost always the
  right choice. The cost is that borders and text scale too; for a card with a
  1px border, animating size may look better.
- **`nested: true`** when the flipped elements contain their own flipped
  children, so the child transform is compensated rather than compounded.
- **`onEnter` / `onLeave`** handle elements that did not exist in one of the two
  states. Flip cannot interpolate something that has no "before" — these are
  where you fade them.

## Shared element between routes or views

The element must be identifiable in both states. `data-flip-id` is how Flip
matches a node in the old state to a *different* node in the new one:

```tsx
<img data-flip-id="hero" … />   // in the grid
<img data-flip-id="hero" … />   // in the detail view
```

```ts
const state = Flip.getState("[data-flip-id]");
setOpen(true);                                   // React swaps the tree
Flip.from(state, { duration: 0.6, absolute: true });
```

In React, run `Flip.from` **after** the DOM has updated — in a layout effect
keyed on the state that changed, so it measures the new layout before paint:

```ts
useGSAP(() => {
  if (!state.current) return;
  Flip.from(state.current, { duration: 0.6, absolute: true });
}, { dependencies: [open] });
```

## Filtering a grid

The case Flip is best at, and where hand-rolling is worst:

```ts
const state = Flip.getState(items);
items.forEach((el) => {
  el.style.display = el.dataset.tag === filter || filter === "all" ? "" : "none";
});
Flip.from(state, {
  duration: 0.5,
  scale: true,
  absolute: true,
  ease: "power2.inOut",
  onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 }),
  onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.9 }),
});
```

## Holding the container's height

`absolute: true` lifts every target out of flow, so a container that took its
height from them collapses to nothing and the whole page below jumps up. Flip's
own docs prescribe holding the height and tweening it alongside:

```ts
tl.fromTo(grid, { height: fromHeight }, { height: toHeight, duration: D }, 0);
```

**Release it on Flip's completion, never on the parent timeline's.** Flip
restores the targets to flow as the last child of its own timeline
(`_setFinalStates`, added with `animation.call()` at its end — internals,
verified against gsap 3.15), and its
`onComplete` fires immediately after that:

```ts
tl.add(
  Flip.from(state, {
    targets: shells,
    absolute: true,
    onComplete: () => gsap.set(grid, { clearProps: "height" }),
  }),
  0,
);
```

Hanging it on the parent's `onComplete` only looks equivalent. The parent ends
when its **longest** child ends, so the gap between "Flip put things back in
flow" and "the height was released" becomes whatever else happens to be on that
timeline. Add a long sibling and it works; take that sibling away — a branch
that skipped, an async tween that never got added — and the release lands on the
same frame as the restore, for a one-frame collapse that only reproduces on the
path where the sibling is missing. A card-to-panel Flip had exactly this:
correct on every click but the first, where an image had not decoded and a
sibling image pass was never added.

The general rule: **tie the release of a held layout property to the event that
actually restores the layout, not to a timeline whose length is incidental.**

### The held height distorts the layout Flip is about to measure

This one is worse, because it produces a wrong animation rather than a flicker.

`gsap.fromTo(grid, { height: from }, { height: to })` renders its start value
immediately, so by the time `Flip.from` measures where the targets should land,
the container is already pinned to the **old** height. A grid or flex container
that is taller than its content **stretches its auto rows to fill it** —
`align-content` defaults to `normal`, which behaves as `stretch`. Flip therefore
measures a stretched layout, animates everything to those positions, and the
elements snap when it releases them into the real one.

```
held 744, natural 632, two rows  →  each row +56px
  Flip's target:  138 + 476 + 24 = 638
  where they go:  138 + 420 + 24 = 582     ← a 56px snap on release
```

The fix is on the container, not the animation:

```tsx
<ul className="grid content-start gap-6">   {/* align-content: start */}
```

The held height then sits as space at the foot instead of inflating every row,
and it is inert whenever the height is not being held.

It reproduces only when the held height **exceeds** the natural one — opening a
panel that makes the grid shorter. Close it again, or switch between two open
states, and the container is shorter than its content, nothing stretches, and
the bug hides. That asymmetry is why it reads as "only on the first click".

## `Flip.fit`

Makes one element match another's position and size without changing the DOM —
useful for an overlay that must land exactly on a card:

```ts
Flip.fit(overlay, card, { duration: 0.5, scale: true, ease: "power3.inOut" });
```

## When not to use it

- **A simple show/hide.** Flip measures every target twice; a fade does not need
  that.
- **Something that is not the same object.** If the visitor would not say "that
  became this", continuity is the wrong story and Flip is just an expensive
  transition.
- **Very large sets.** Two full layout reads plus a transform per element. A
  hundred items is fine; a thousand is not.

## Accessibility

Flip moves things across the screen, which is exactly the motion
`prefers-reduced-motion` exists for. Under `reduce`, apply the layout change
with `duration: 0` — the state still changes, the travel does not. Never skip
the change itself.

Focus stays on the element being flipped, which is correct. Just make sure the
focus ring is not clipped by an `overflow: hidden` ancestor during the flip.

## Failures

| Symptom | Cause |
|---|---|
| Siblings jitter during the flip | missing `absolute: true` |
| Nothing animates | state captured after the change, not before |
| New items pop in | no `onEnter` |
| Children double-transform | missing `nested: true` |
| Blurry text mid-flight | `scale: true` on text-heavy elements — animate size |
| Wrong in React | `Flip.from` ran before the DOM updated |
