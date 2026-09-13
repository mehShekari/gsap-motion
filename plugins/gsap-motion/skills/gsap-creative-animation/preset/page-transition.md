# Page and modal transitions

The App Router unmounts the old tree before the new one paints, so an exit
animation has nowhere to play. Every approach below is a way around that fact.

## Pick the cheapest that works

| Approach | Cost | Use when |
|---|---|---|
| Entrance only | trivial | almost always — this is what most sites want |
| Overlay in the layout | moderate | you need a real cover between pages |
| Shared element (Flip) | high | continuity is the point: a thumbnail becoming a hero |
| Intercepted navigation | high, breaks back-button feel | rarely |

Start at the top. A 400ms entrance keyed off the pathname is indistinguishable
from a "real" transition for most content, and costs nothing in complexity.

## Entrance only

```tsx
"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { usePathname } from "next/navigation";
import { useRef } from "react";

export function PageEnter({ children }: Readonly<{ children: React.ReactNode }>) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      gsap.from(root.current, {
        autoAlpha: 0,
        y: 12,
        duration: 0.5,
        ease: "power2.out",
      });
    },
    { scope: root, dependencies: [pathname] },
  );

  return <div ref={root}>{children}</div>;
}
```

`dependencies: [pathname]` re-runs it per navigation. Keep the travel small —
the visitor asked for this page and is waiting.

## Overlay in the layout

Mounted in the layout so the navigation does not unmount it. It covers, the
route changes underneath, it uncovers.

```tsx
// In the locale layout, above {children}
<RouteCurtain />
```

```ts
const pathname = usePathname();

useGSAP(() => {
  gsap.timeline()
    .set(curtain, { yPercent: 100 })
    .to(curtain, { yPercent: 0, duration: 0.45, ease: "power3.in" })
    .to(curtain, { yPercent: -100, duration: 0.55, ease: "power3.out" }, "+=0.05");
}, { dependencies: [pathname] });
```

This covers *after* the new route has rendered, which is a compromise — it reads
as a wipe rather than a true out-and-in. Honest and robust. `pointer-events:
none` on the curtain except while it covers, and `aria-hidden` throughout.

## Shared element

Use Flip. The element must be identifiable in both trees via `data-flip-id` —
see [flip.md](../reference/flip.md).

```ts
// Before navigating, from the grid:
const state = Flip.getState("[data-flip-id]");
sessionStorage.setItem("flip", JSON.stringify(state));  // survives the route

// On the detail page, in a layout effect:
Flip.from(state, { duration: 0.6, absolute: true, ease: "power3.inOut" });
```

In practice this is fragile across a real route change — the image must be
loaded in both places, and a cache miss produces a jump. It works reliably
inside a single route (a grid expanding into a panel) and is worth the cost
there.

## Modal

The common case, and simpler because nothing unmounts unexpectedly.

```ts
const open = gsap.timeline({ paused: true })
  .set(overlay, { autoAlpha: 0 })
  .to(overlay, { autoAlpha: 1, duration: 0.25 })
  .from(panel, { yPercent: 4, scale: 0.98, autoAlpha: 0,
                 duration: 0.35, ease: "power3.out" }, "<0.05");

// Open:  open.play()
// Close: open.reverse()   — same easing backwards, no second definition
```

Exits run faster than entrances — the visitor has already decided. If you write
the close by hand rather than reversing, make it ~65% of the open duration.

Accessibility is the bigger half of a modal:

- Move focus into the panel on open, restore it to the trigger on close.
- Trap focus while open; `inert` on the rest of the document.
- `Escape` closes.
- `role="dialog"` and `aria-modal="true"` with an accessible name.

Animation must not delay any of that. Set focus immediately, not in
`onComplete` — a 350ms wait for a keyboard user is a bug.

## Reduced motion

```ts
if (reduced) {
  gsap.set(panel, { autoAlpha: 1, yPercent: 0, scale: 1 });
  gsap.set(overlay, { autoAlpha: 1 });
  return;
}
```

The state change still happens; only the travel goes. For a page transition
under `reduce`, skip the curtain entirely — a full-screen wipe on every
navigation is exactly the unrequested movement the preference exists to stop.

## After navigating

`ScrollTrigger.refresh()` once the new layout has settled, or every trigger on
the new page measures against the old one.

## Failures

| Symptom | Cause |
|---|---|
| Exit animation never plays | the route unmounted the tree — use an overlay |
| Curtain traps clicks | `pointer-events` not cleared |
| Flip jumps on the detail page | the image was not loaded when measured |
| Triggers wrong after navigation | no `ScrollTrigger.refresh()` |
| Focus lost after a modal closes | not restored to the trigger |
| Transition replays on every render | missing `dependencies`, or the wrong one |
