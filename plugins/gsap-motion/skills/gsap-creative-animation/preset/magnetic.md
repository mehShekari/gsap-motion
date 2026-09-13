# Magnetic

An element that leans toward the cursor while it is near and eases back when it
leaves. Says "this is interactive" more convincingly than any hover state,
because the response starts before the pointer arrives.

Mechanics and the `quickTo` rule are in
[interaction.md](../reference/interaction.md); this is the tuned recipe.

## The hook

```ts
"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

/** Fraction of the cursor's offset the element travels. Above ~0.4 it outruns
 *  the pointer and stops feeling attached. */
const PULL = 0.32;
/** How much further the inner label travels, so the button has some depth. */
const LABEL_PULL = 0.5;

export function useMagnetic() {
  const zoneRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement>(null);
  const labelRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const zone = zoneRef.current;
      const target = targetRef.current;
      if (!zone || !target) return;

      const mm = gsap.matchMedia();

      /**
       * Gated on a real cursor. On touch there is no hover to leave, so the
       * element would stick wherever the last tap put it. Reduced motion keeps
       * the affordance and drops the travel.
       */
      mm.add(
        "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
        () => {
          const to = (el: HTMLElement, axis: "x" | "y") =>
            gsap.quickTo(el, axis, { duration: 0.6, ease: "power3" });

          const move = { x: to(target, "x"), y: to(target, "y") };
          const label = labelRef.current
            ? { x: to(labelRef.current, "x"), y: to(labelRef.current, "y") }
            : null;

          const onMove = (event: PointerEvent) => {
            /** Measured per move: scroll and layout both shift the rect. */
            const rect = target.getBoundingClientRect();
            const dx = event.clientX - (rect.left + rect.width / 2);
            const dy = event.clientY - (rect.top + rect.height / 2);

            move.x(dx * PULL);
            move.y(dy * PULL);
            label?.x(dx * PULL * LABEL_PULL);
            label?.y(dy * PULL * LABEL_PULL);
          };

          const onLeave = () => {
            move.x(0);
            move.y(0);
            label?.x(0);
            label?.y(0);
          };

          zone.addEventListener("pointermove", onMove);
          zone.addEventListener("pointerleave", onLeave);

          return () => {
            zone.removeEventListener("pointermove", onMove);
            zone.removeEventListener("pointerleave", onLeave);
          };
        },
      );

      /* The context reverts `mm` itself; the listeners are ours. */
    },
    { scope: zoneRef },
  );

  return { zoneRef, targetRef, labelRef };
}
```

## The markup

The listening zone is larger than the element. That is what turns a hover state
into a field — the pull begins before the cursor arrives.

```tsx
<div ref={zoneRef} className="inline-flex p-6">
  <button ref={targetRef} className="rounded-full px-6 py-3">
    <span ref={labelRef} className="inline-block">Get in touch</span>
  </button>
</div>
```

The padding is the field radius. 24–40px is usually right; larger and the
element starts moving for pointers that were never coming.

## Values

| Value | Range | Note |
|---|---|---|
| `PULL` | 0.2–0.4 | above 0.4 it detaches from the cursor |
| duration | 0.4–0.8 | shorter feels twitchy, longer feels like lag |
| ease | `power3` | `power2` is softer; avoid `elastic` here |
| zone padding | 24–40px | the field radius |
| `LABEL_PULL` | 0.4–0.6 | the parallax that gives it depth |

## Variations

**Scale on enter** — one paused timeline, played and reversed, so the return
matches without a second definition:

```ts
const hover = gsap.timeline({ paused: true })
  .to(target, { scale: 1.05, duration: 0.3, ease: "power2.out" });
```

**Rotation instead of translation** — a subtle `rotation: dx * 0.02` reads as
the element tilting to face the cursor. Good for cards, wrong for buttons.

**Magnetic cursor, static button** — invert it: the follower is captured by the
button's centre on enter. See [cursor.md](cursor.md).

## Accessibility

The pull is decoration and a keyboard never sees it, so **the focus state must
carry the whole affordance on its own** — the same visual change the hover
implies, not a fallback. And the transform must not move the element out from
under its focus ring.

Both gates in the `matchMedia` query above are load-bearing: without
`(hover: hover)` the element sticks after a tap on touch; without the
reduced-motion clause it moves for someone who asked it not to.

## Failures

| Symptom | Cause |
|---|---|
| Janky | a tween per event instead of `quickTo` |
| Drifts and never returns | `pointerleave` on the element, not the zone |
| Wrong offset after scrolling | rect cached instead of measured |
| Stuck after a tap on mobile | missing `(hover: hover)` gate |
| Feels detached | `PULL` too high |
