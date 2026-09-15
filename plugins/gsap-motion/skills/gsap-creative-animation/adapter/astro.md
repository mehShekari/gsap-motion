# Astro

Astro ships no JavaScript unless you ask for it, and its pages can be swapped
without a reload. Both facts decide where an animation lives.

## Where it is created

In a component's `<script>`, which Astro bundles and defers. With view
transitions enabled, a page swap does not re-run it, so build on the page-load
event rather than at the top level:

```astro
<script>
  import gsap from "gsap";

  let ctx;

  document.addEventListener("astro:page-load", () => {
    ctx = gsap.context(() => {
      gsap.from("[data-item]", { autoAlpha: 0, y: 24, stagger: 0.06 });
    });
  });

  document.addEventListener("astro:before-swap", () => ctx?.revert());
</script>
```

`astro:page-load` fires on the first load and after every swap, so this one
shape covers both. Without view transitions the event still fires once, so the
same code is correct either way.

Inside a React, Vue or Svelte island, use that framework's adapter instead —
the island owns its own lifecycle.

## Where it is torn down

`astro:before-swap`, with `ctx.revert()`. Skipping it leaves the previous page's
ScrollTriggers and listeners bound to elements that are about to be replaced,
and they accumulate for as long as the visit lasts.

Timers, listeners and observers are yours, in the same handler.

## Scope

Astro's `<script>` is page-wide, not component-scoped: a component used twice on
a page runs its script once, and selector strings match both instances. Either
animate them as a set — which is usually what you want — or pass the root in
with a `data-*` attribute and build one context per matching element.

Plugin config is not scoped either, so generate ids per instance rather than
hardcoding them.

## Server rendering and hydration

Astro components render to HTML on the server and ship no client JavaScript of
their own, so there is no hydration to mismatch. The script runs only in the
browser: reading `window` in it is safe, and the markup it animates is already
painted.

`client:*` directives decide when an island hydrates. An animation inside one
does not run until it does — `client:visible` on a section that animates on
entrance is a race worth avoiding; prefer `client:load` there, or keep the
animation in the page's own script.

## Reaching the element

`data-*` attributes in the markup, queried inside the context. Astro scopes its
component styles by adding its own attributes to elements, so a class in the
markup is not always the class in the DOM — a `data-*` attribute you wrote is.

## Every frame

`gsap.quickTo` or `quickSetter`, created once inside the context. There is no
component state here to get wrong, which removes the most common React mistake
and leaves the ordinary one: allocating a tween per event.

## Page and route changes

The events are the contract:

- `astro:page-load` — build, on first load and after every swap
- `astro:before-swap` — revert, before the old page goes
- `astro:after-swap` — for anything that must run against the new DOM before it
  paints, such as `ScrollTrigger.refresh()`

View transitions are opt-in: they come from Astro's router component in the
layout, named `<ClientRouter />` in current versions and `<ViewTransitions />`
in older ones. Check which one the project imports before telling anyone to add
it.

## Failures

| Symptom | Cause |
|---|---|
| Animation runs on the first page only | built at the top of `<script>` instead of on `astro:page-load` |
| Triggers pile up while browsing | no `astro:before-swap` revert |
| The script never runs | `is:inline`, which skips bundling, so the bare import fails |
| Both instances animate as one | a page-wide script with a document-wide selector |
| An entrance animation starts late | the island hydrates on `client:visible` |

## What the audit covers

From 3.2 the audit reads the `<script>` block of `.astro` files, with offsets
kept, so reported lines match the file. It checks that a context built on
`astro:page-load` is reverted on `astro:before-swap`, along with every rule that
is not React-specific.

## Versions

Verified against `gsap@3.15`. Written for `astro@7`; the swap events are the
same in Astro 5 and later, though the router component was renamed.
