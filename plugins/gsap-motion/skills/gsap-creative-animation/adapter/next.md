# Next.js

The App Router, with Server Components. Read [react.md](react.md) first: this is
only what Next adds.

## Where it is created

In a `"use client"` component, in the `useGSAP` body react.md describes. Keep
that component a **leaf**, so the page above it stays a Server Component.

**Converting a Server Component is part of the cost, and it is priced before the
design.** *Is GSAP already on this route?* If a sibling section loads `gsap` and
`ScrollTrigger`, the marginal cost is this component's own JavaScript — a
kilobyte or two rather than thirty-odd, which usually settles the argument. If
nothing on the route loads GSAP, this animation buys the whole library for one
reveal. *Does anything claim otherwise?* A comment saying the section ships no
client JavaScript stops being true the moment you add the hook; update it in the
same change.

Say so in the Notes of your answer: "it becomes a client component" is a fact
the reader needs.

## Where it is torn down

By the context, as in react.md. A navigation unmounts the page, so anything that
must survive one belongs in the layout.

## Scope

As in react.md, and `useId` matters more here: the markup is rendered on the
server and again on the client, and a counter would disagree between them.

## Server rendering and hydration

- **`"use client"` module scope still runs during server rendering.**
  Registering plugins there is fine — GSAP defers anything touching `window` —
  but reading `window` or `document` at module scope is not.
- **Data and copy come down as props.** A client component importing a content
  or locale module bundles every locale into the browser payload. Large
  generated data — path tables, keyframe sets — is handed down too.
- Storage and media queries are read after mount, never during render.

## Reaching the element

`next/image` renders the `<img>` itself and controls its `src`, `srcset` and
sizing:

- **Animate a wrapper you own**, not the image, when the effect needs a mask, a
  clip or a transform that must survive the placeholder-to-loaded swap. Under
  `fill` the image is positioned against the nearest positioned ancestor, so
  that wrapper is already there.
- **A reveal that depends on the image waits for load**, with a short budget
  after which it plays anyway. A cached image can finish before the hook runs,
  and a mask opening over an empty box reads as a bug.
- If the animation starts by hiding a hero image, **measure what it does to
  LCP** first. A mask over an image that is already painted usually avoids the
  question.

## Every frame

Refs and `quickTo`, never React state — and it costs more here, since state held
in a layout re-renders every page under it.

## Page and route changes

The App Router unmounts the old tree before the new one paints, so an exit
animation has nowhere to play. Options, by cost:

1. **Animate entrance only**, keyed off `usePathname()`. Honest, cheap, and what
   most sites want.
2. **An overlay that outlives the route**, mounted in the layout so the
   navigation does not unmount it. See
   [page-transition](../preset/page-transition.md).
3. **`router.push` behind a played-out timeline** — intercept, play the exit,
   navigate on complete. Breaks the back button's feel; use sparingly.

Then `ScrollTrigger.refresh()` once the new layout settles.

## Failures

| Symptom | Cause |
|---|---|
| `window is not defined` during a build | `window` read at module scope in a client component |
| Hydration mismatch | storage, a media query or a random value read during render |
| The whole page ships as client JavaScript | `"use client"` on the page or layout instead of a leaf |
| A reveal opens over an empty box | the tween did not wait for the image to load |
| Positions are wrong after a navigation | no `ScrollTrigger.refresh()` once it settled |
| The exit animation never plays | written in the page the navigation unmounts |

## What the audit covers

The React rules from react.md, on the same files. It reads `.ts`, `.tsx`, `.js`,
`.jsx` and `.mjs`, so `"use client"` placement, `next.config` and route
structure are yours to review.

## Versions

Verified against `gsap@3.15` and `@gsap/react@2.1`. Written for `next@15` and
`next@16`, App Router.
