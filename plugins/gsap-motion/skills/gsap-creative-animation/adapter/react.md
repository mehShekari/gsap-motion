# React

Animation is a client concern, and the interesting problems are all lifecycle.
This covers any React app — Vite, Remix, Next. With Next, read
[next.md](next.md) too; with React Three Fiber, [r3f.md](r3f.md).

## Where it is created

`useGSAP`, from `@gsap/react`: `useLayoutEffect` with an SSR fallback, plus
automatic `gsap.context()` cleanup — which is what makes it survive StrictMode's
double invoke in development.

```ts
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);          // module scope, once

export function useReveal() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from("[data-item]", { y: 20, stagger: 0.05 });   // scoped to root
  }, { scope: root });

  return root;
}
```

It is a layout effect, so it runs **before paint**: a `from` or a `set` lands
with no flash of the end state. Its options are `scope`, `dependencies` (the
body re-runs on change) and `revertOnUpdate` (the previous run reverts first).

A tween created *outside* the body — in a handler, a promise, a callback — is
never reverted. Wrap that function in `contextSafe`, from the same hook, and the
context owns it again. Only wrap functions that *create* animations: playing an
existing timeline creates nothing. `contextSafe` runs during render, so reading a
ref inside the callback trips React's "cannot access refs during render" rule —
build the timeline in the body, keep it on a ref, and expose a `useCallback`
that plays it.

## Where it is torn down

`useGSAP` reverts its context on unmount. Tweens, timelines, `ScrollTrigger`,
`Observer`, `Draggable`, `SplitText` and `gsap.matchMedia()` register themselves
with the context while its function runs and are reverted with it, so none needs
a manual `kill()` inside the body.

**These are yours**, because GSAP never sees them: timers, listeners on `window`
or `document`, `ResizeObserver` and `IntersectionObserver` — and **anything
created outside the body**, at module scope, in a plain `useEffect`, or in a
handler that never went through `contextSafe`. That last one is the real leak,
and the one people write cleanup for the wrong things instead of catching.

## Scope

`{ scope: root }` is not optional in practice: selector strings resolve inside
the component, so two instances cannot animate each other's elements.

A scope does **not** reach inside plugin config: `motionPath.path` and
`morphSVG.shape` resolve against the whole document, so a hardcoded id in a
component rendered twice makes both instances drive the first one's geometry,
silently. Generate one per instance from `useId()`, stripped to word characters
— React's id carries delimiters a CSS selector cannot hold, and unlike a counter
it is stable across server and client.

## Server rendering and hydration

Reading `localStorage`, `sessionStorage` or `matchMedia` **during render** makes
the server and the client disagree. Render the neutral state and correct it in
the layout effect, before paint, so nothing is seen.

Read direction and preferences from the DOM inside the effect, never from a prop:
`document.documentElement.dir === "rtl"` keeps the hook independent of the i18n
library, and the layout stamps `dir` before first paint.

## Reaching the element

A shared component that does not forward props has nowhere to hang a `data-*`
attribute; widening it to take its element's remaining props is usually right,
and often already the house pattern. A positional selector
(`row.firstElementChild`) breaks the next time the markup moves.

## Every frame

React state for a value that changes every frame is a re-render per frame.

```ts
// Wrong
const [x, setX] = useState(0);
onMouseMove = (e) => setX(e.clientX);

// Right
const moveX = gsap.quickTo(el.current, "x", { duration: 0.5, ease: "power3" });
onMouseMove = (e) => moveX(e.clientX);
```

State is for *what exists* — is the modal open, which tab is active. GSAP owns
*how it moves*. Crossing that line is the most common performance bug in
animated React.

## Page and route changes

A client router unmounts the outgoing tree, so an exit animation needs something
that outlives the route — an overlay in the layout, not in the page. See
[page-transition](../preset/page-transition.md), and [next.md](next.md) for the
App Router. After a navigation, `ScrollTrigger.refresh()` once it settles.

## Failures

| Symptom | Cause |
|---|---|
| Animation runs twice in dev | tweens created outside `useGSAP` — StrictMode |
| Animation leaks after navigation | ScrollTrigger or listener created outside the scope |
| Flash of the end state | `from` outside a layout effect |
| Two components animate each other | missing `scope`, or a shared hardcoded id |
| Hydration mismatch | storage or a media query read during render |
| Janky pointer effect | React state in the handler |
| Hover sticks halfway | no `overwrite: "auto"` on the retriggered tween |

## What the audit covers

`orphan-tween`, `state-per-event` and `shared-plugin-id` are React-specific: the
audit applies them to `.jsx` and `.tsx` files, and to any file importing `react`
or `@gsap/react`. Every other rule applies to every file it reads. It follows a
helper within one file — a function only a `useGSAP` body calls counts as inside
the context — but never into another file.

## Versions

Verified against `gsap@3.15` and `@gsap/react@2.1`. Written for `react@18` and
`react@19`.
