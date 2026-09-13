# React and Next.js

Written for the Next.js App Router with React 19 and Server Components, and
verified against `@gsap/react` 2.1. Most of it applies to any React app; the
RSC sections apply only where Server Components exist. Animation is always a
client concern, and the interesting problems are all lifecycle. Not using
React? Read [frameworks.md](frameworks.md) instead.

## `useGSAP`

`useGSAP`, from `@gsap/react`, is `useLayoutEffect` with an SSR fallback
plus automatic `gsap.context()` cleanup — which is what makes it survive React
19 StrictMode's double invoke.

```ts
"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);          // module scope, once

export function useThing() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from("[data-item]", { y: 20, stagger: 0.05 });  // scoped to root
      return () => { /* anything the context does not own */ };
    },
    { scope: root },
  );

  return root;
}
```

`{ scope: root }` is not optional in practice: it makes selector strings resolve
inside the component, so two instances on a page do not animate each other's
elements.

Options: `scope`, `dependencies`, `revertOnUpdate`. With `dependencies`, the
body re-runs when they change; `revertOnUpdate: true` also reverts the previous
run first.

Being a layout effect matters: it runs **before paint**, so a `from` or a `set`
lands without a flash of the end state.

## `contextSafe`

Anything that creates a tween *outside* the hook body — an event handler, a
promise, a callback — is created outside the context and never reverted.

```ts
const { contextSafe } = useGSAP(() => { ... }, { scope: root });

const onEnter = contextSafe(() => {
  gsap.to(el.current, { scale: 1.05 });   // now owned by the context
});
```

Two things to get right:

- **Only wrap functions that create animations.** Playing a timeline that
  already exists creates nothing and needs no wrapper.
- **`contextSafe` runs during render.** Reading a ref inside the callback you
  pass it trips React's "cannot access refs during render" lint rule. Build the
  timeline inside the hook body, keep it on a ref, and expose a plain
  `useCallback` that plays it.

## Refs, never state

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

## The RSC boundary

A component that animates is `"use client"`. Keep it a leaf so the page above it
stays a Server Component.

**If the target is currently a Server Component, converting it is part of the
cost, and you have to price it before you design.** Two questions:

1. *Is the library already on this route?* Grep for existing GSAP use in the
   sections the page renders. If a sibling already loads `gsap` and
   `ScrollTrigger`, the marginal cost is this component's own JS — a kilobyte or
   two — rather than thirty-odd. That usually settles the argument. If nothing
   on the route loads GSAP yet, this animation is buying the whole library for
   one reveal, and it had better be worth it.
2. *Does anything claim otherwise?* A comment saying the section ships no client
   JavaScript stops being true the moment you add the hook. Update it in the
   same change — a stale claim in a docblock is worse than none, because the
   next person believes it.

State both in the Notes section of your answer. "It becomes a client component"
is a fact the reader needs, not a detail.

### Reaching the element

A shared component that does not forward props has nowhere to hang a `data-*`
attribute. Widening it to take the rest of its element's props is usually right
and is often already the house pattern — check a sibling before inventing one.
Finding the element positionally instead (`row.firstElementChild`,
`querySelectorAll("path")[3]`) is a selector that breaks silently the next time
the markup moves.

Two consequences worth planning for:

- **Data and copy come down as props.** A client component importing a content
  or locale module bundles every locale into the browser payload. Resolve on the
  server, pass what the visitor needs. The same applies to large generated data
  — path tables, keyframe sets: hand them down rather than importing them
  client-side.
- **`"use client"` module scope still runs during SSR.** Registering plugins
  there is fine — GSAP defers anything touching `window` — but reading `window`
  or `document` at module scope is not.

## Reading the environment

Read direction and preferences from the DOM inside the effect, not from a
prop or a locale constant:

```ts
const isRtl = document.documentElement.dir === "rtl";
```

The layout stamps `dir` before first paint, and reading it there keeps the hook
independent of the i18n library.

## Cleanup: what the context already owns

Wider than it is usually given credit for, and worth knowing precisely —
otherwise you write cleanup that does nothing and still miss the real leaks.

While a context's function runs, GSAP points `_context` at that context, and
these register themselves with it on construction. `context.revert()` then
reverts them:

- tweens and timelines
- `ScrollTrigger`
- `Observer`
- `Draggable`
- `SplitText`
- `gsap.matchMedia()`

So inside a `useGSAP` body, none of those need a manual `.kill()` or
`.revert()`. An explicit one is redundant rather than wrong.

**These are genuinely yours**, because GSAP never sees them:

- `setTimeout` / `setInterval` — clear them
- `addEventListener` on `window` or `document` — remove them
- `ResizeObserver` / `IntersectionObserver` — `.disconnect()`
- Three.js geometries, materials, textures — dispose them
- **anything created outside the context body** — module scope, a plain
  `useEffect`, or a handler that never went through `contextSafe`. That last one
  is the real leak, and the one people write cleanup for the wrong things
  instead of catching.

```ts
useGSAP(() => {
  const mm = gsap.matchMedia();        // reverted with the context
  const io = new ResizeObserver(onResize);   // not — disconnect it
  mm.add({ ... }, () => { ... });
  io.observe(root.current!);
  return () => io.disconnect();
}, { scope: root });
```

`node .claude/skills/gsap-creative-animation/scripts/audit-gsap.mjs <path>`
checks this distinction, among others.

## Unique ids

A scope does **not** reach inside plugin config. `motionPath.path` and
`morphSVG.shape` are resolved by the plugin against the whole document, so a
hardcoded id in a component rendered twice makes both instances drive the first
one's geometry — silently.

```ts
const uid = `rs${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
```

React's generated id carries delimiters a CSS selector cannot hold, so strip it
to word characters. It is stable across server and client, which a counter is
not. Then `id={`${uid}-track`}` in the markup and `#${uid}-track` in the config.

## Route transitions

The App Router unmounts the old tree before the new one paints, so an exit
animation has nowhere to play. Options, in order of how much they cost:

1. **Animate entrance only.** Keyed off `usePathname()`. Honest, cheap, and what
   most sites actually want.
2. **An overlay that outlives the route.** Mounted in the layout, so it is not
   unmounted by the navigation. See [page-transition](../preset/page-transition.md).
3. **`router.push` behind a played-out timeline.** Intercept, play the exit,
   navigate on complete. Breaks the back button's feel — use sparingly.

After any navigation, call `ScrollTrigger.refresh()` once the new layout has
settled.

## Hydration

Anything read from `localStorage`, `sessionStorage`, or `matchMedia` during
render makes the server and client disagree. Render the neutral state, then
correct it in the layout effect — before paint, so nothing is seen.

## Failures

| Symptom | Cause |
|---|---|
| Animation runs twice in dev | tweens created outside `useGSAP` — StrictMode |
| Animation leaks after navigation | ScrollTrigger or listener created outside the scope |
| Flash of the end state | `from` outside a layout effect |
| Two components animate each other | missing `scope`, or a shared hardcoded id |
| Hydration mismatch | storage or media query read during render |
| Janky pointer effect | React state in the handler |
| Hover sticks halfway | no `overwrite: "auto"` on the retriggered tween |
| `gsap.set` lands but `gsap.to` sits mid-flight — only under test | the harness waited on a timer while rAF was throttled, so the ticker never ran. Not a lifecycle bug: wait in frames — see "Timing in milliseconds, settling in frames" in performance.md |
