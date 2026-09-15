# Vanilla JavaScript

No framework: you own the mount and the unmount, so the only question is
whether the element this animates can ever be removed.

## Where it is created

Inside `gsap.context(fn, root)`, in a function that runs when the element is in
the document:

```js
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function mountReveal(root) {
  const ctx = gsap.context(() => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        motion: "(prefers-reduced-motion: no-preference)",
        reduced: "(prefers-reduced-motion: reduce)",
      },
      ({ conditions }) => {
        if (conditions.reduced) {
          gsap.set("[data-item]", { autoAlpha: 1, y: 0 });
          return;
        }
        gsap.from("[data-item]", {
          autoAlpha: 0,
          y: 24,
          stagger: { amount: 0.4 },
          scrollTrigger: { trigger: root, start: "top 75%" },
        });
      },
    );
  }, root);

  return () => ctx.revert();
}
```

The returned function is the whole teardown contract. Hand it to whatever owns
the element's life.

## Where it is torn down

`ctx.revert()` undoes every tween, ScrollTrigger, Observer, Draggable, SplitText
and matchMedia created inside the context, and restores inline styles.

Timers, `addEventListener` calls and observers are not GSAP's. Clear them in the
same cleanup.

A static page that never removes the element can skip teardown. Anything that
swaps content — a client-side router, HTMX, Turbo, a modal, a web component —
cannot: every swap would otherwise leave the previous run's triggers behind.

## Scope

The context's second argument is the root. Selector strings inside resolve
within it, so the same widget mounted twice does not animate the other's
elements.

Plugin config is not scoped: `motionPath.path` and `morphSVG.shape` resolve
against the whole document. Generate an id per instance rather than hardcoding
one, in every framework and here too.

## Server rendering and hydration

There is none unless you add it. If the markup is rendered by a server template,
the only rule that carries over is that the script runs after the element
exists — a `defer`red module, or a `DOMContentLoaded` handler.

## Reaching the element

Pass the root in, and query inside it. A module that reaches for
`document.querySelector` at import time binds to whatever happened to be on the
first page, and silently animates nothing after a swap.

## Every frame

Use `gsap.quickTo` or `gsap.quickSetter` created once, outside the handler, and
call it from the event. Creating a tween per pointer event allocates one tween
per frame, each fighting the last.

## Page and route changes

If a router swaps content, mount on the new page and revert before the swap. The
library's own events are the hooks: Turbo's `turbo:load` and
`turbo:before-render`, HTMX's `htmx:afterSwap`, or your router's equivalent.
Call `ScrollTrigger.refresh()` after the new content settles.

## Failures

| Symptom | Cause |
|---|---|
| Animation stops working after a page swap | mounted once at import, never again |
| Triggers pile up over a session | no `ctx.revert()` before the swap |
| Selector matches another instance's element | no root passed to `gsap.context` |
| Scroll positions drift | no `ScrollTrigger.refresh()` after content changed |

## What the audit covers

Every rule except the React-specific three: `orphan-tween`, `state-per-event`
and `shared-plugin-id` apply to React files only. Cost, loops, scrub, listeners,
unmanaged instances, plugin registration, reduced motion and shipped dev tooling
are checked here.

Keep the animation in a `.js`, `.mjs` or `.ts` module — the files the audit
reads — rather than in an inline `<script>` in an HTML page, which it does not.

## Versions

Verified against `gsap@3.15`. No framework version applies.
