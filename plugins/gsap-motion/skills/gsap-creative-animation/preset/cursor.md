# Cursor

A custom pointer. High reward and high risk: done well it makes a site feel
authored, done badly it makes it unusable.

**Decide first whether to hide the native cursor.** Keeping it and adding a
follower is almost always the better trade — you get the character without
taking away the visitor's most reliable affordance.

## Two layers, two speeds

One element tracking instantly, one lagging. That difference is the whole
effect; a single follower reads as a laggy cursor.

```ts
"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

export function useCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const mm = gsap.matchMedia();

    /**
     * A follower on a touch device is dead weight parked in a corner, and one
     * that chases a pointer for someone who asked for reduced motion is the
     * kind of unrequested movement the preference exists to stop.
     */
    mm.add(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
      () => {
        const to = (el: HTMLElement, axis: "x" | "y", duration: number) =>
          gsap.quickTo(el, axis, { duration, ease: "power3" });

        const dotX = to(dot, "x", 0.12);
        const dotY = to(dot, "y", 0.12);
        const ringX = to(ring, "x", 0.5);
        const ringY = to(ring, "y", 0.5);

        gsap.set([dot, ring], { xPercent: -50, yPercent: -50, autoAlpha: 0 });

        let seen = false;
        const onMove = (event: PointerEvent) => {
          if (!seen) {
            seen = true;
            /** Revealed on first move, so it never paints in the corner. */
            gsap.to([dot, ring], { autoAlpha: 1, duration: 0.3 });
          }
          dotX(event.clientX);
          dotY(event.clientY);
          ringX(event.clientX);
          ringY(event.clientY);
        };

        /** Hidden when the pointer leaves the document entirely. */
        const onOut = () => gsap.to([dot, ring], { autoAlpha: 0, duration: 0.2 });

        window.addEventListener("pointermove", onMove);
        document.addEventListener("pointerleave", onOut);

        return () => {
          window.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerleave", onOut);
        };
      },
    );

    /* The context reverts `mm` itself; the listeners above are ours. */
  });

  return { dotRef, ringRef };
}
```

`xPercent: -50, yPercent: -50` centres each layer on the pointer without knowing
its size.

## Markup

```tsx
<div ref={ringRef} aria-hidden="true"
     className="pointer-events-none fixed start-0 top-0 z-200 size-9 rounded-full border" />
<div ref={dotRef} aria-hidden="true"
     className="pointer-events-none fixed start-0 top-0 z-200 size-1.5 rounded-full" />
```

`pointer-events: none` and `aria-hidden` on both, always. `fixed` positioning so
the coordinates are viewport coordinates — no scroll maths.

## Reacting to what is under it

The character comes from the follower changing over different targets. Drive it
from a data attribute rather than a list of selectors:

```tsx
<a data-cursor="expand">…</a>
<video data-cursor="play">…</video>
```

```ts
const onOver = (event: PointerEvent) => {
  const hit = (event.target as Element).closest("[data-cursor]");
  const mode = hit?.getAttribute("data-cursor");

  gsap.to(ring, {
    scale: mode === "expand" ? 2.4 : 1,
    borderWidth: mode === "expand" ? 1 : 2,
    duration: 0.4,
    ease: "power3.out",
    overwrite: "auto",
  });
};

document.addEventListener("pointerover", onOver);
```

`overwrite: "auto"` matters here — moving quickly across several targets
otherwise leaves the ring blended between two states.

## Capture

The ring sticks to an element's centre while the pointer is over it. This is the
effect that makes navigation feel magnetic without moving the link itself:

```ts
const rect = hit.getBoundingClientRect();
ringX(rect.left + rect.width / 2);
ringY(rect.top + rect.height / 2);
```

Combine with [magnetic.md](magnetic.md) carefully — both moving at once reads as
instability. Pick one.

## Hiding the native cursor

If you must:

```css
@media (hover: hover) and (pointer: fine) {
  body { cursor: none; }
}
```

Then the replacement must be at least as legible over every surface — dark,
light, image, video — and must never apply over text inputs or textareas, where
the I-beam carries real information:

```css
input, textarea, [contenteditable] { cursor: auto; }
```

Restore the cursor on any surface where your follower might not render: a
`<canvas>`, an `<iframe>`, a native `<select>` popup.

## Accessibility

The follower is decoration. Nothing about it may carry information — a "click
me" that only exists as a cursor state is invisible to a keyboard, to touch, and
to a screen reader.

The `(hover: hover)` and reduced-motion gates in the `matchMedia` query are not
optional.

## Failures

| Symptom | Cause |
|---|---|
| Sits in the corner on mobile | missing `(hover: hover)` gate |
| Flashes at 0,0 on load | not hidden until the first move |
| Blocks clicks | missing `pointer-events: none` |
| Blends between hover states | missing `overwrite: "auto"` |
| Offset by the scroll | `absolute` instead of `fixed` |
| Survives navigation | listeners not removed |
