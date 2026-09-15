# Vue and Nuxt

Composition API with `<script setup>`. Nuxt renders on the server, so everything
here is written to run only in the browser.

## Where it is created

In `onMounted`, inside a `gsap.context` rooted at the component's element:

```vue
<script setup>
import gsap from "gsap";
import { onMounted, onUnmounted, ref } from "vue";

const root = ref(null);
let ctx;

onMounted(() => {
  ctx = gsap.context(() => {
    gsap.from("[data-item]", { autoAlpha: 0, y: 24, stagger: 0.06 });
  }, root.value);
});

onUnmounted(() => ctx?.revert());
</script>

<template>
  <section ref="root">…</section>
</template>
```

Animation that reacts to state belongs in a `watch` that adds its tweens to the
same context with `ctx.add(() => { /* … */ })`, so they are reverted with it
rather than outliving it.

## Where it is torn down

`onUnmounted`, with `ctx.revert()`. That covers every tween, ScrollTrigger,
Observer, Draggable, SplitText and matchMedia created inside the context.

Timers, listeners and observers are yours, in the same hook. A `watch` stopper
is yours too if you created it outside `setup`'s own scope.

`<KeepAlive>` does not unmount: it deactivates. Use `onActivated` and
`onDeactivated` to pause and resume, or the animation keeps running in a
component the visitor cannot see.

## Scope

`gsap.context(fn, root.value)` scopes selector strings to the component's root,
so a component used twice on a page does not animate the other's elements.

Plugin config is not scoped. `motionPath.path` and `morphSVG.shape` resolve
against the whole document, so generate an id per instance —
`useId()` in Vue 3.5 and later, or a module counter — rather than hardcoding
one.

## Server rendering and hydration

`onMounted` never runs on the server, so this is safe under Nuxt as written. Two
rules follow:

- Do not read `window`, `document` or `matchMedia` in `setup`'s body — it runs
  on the server. Read them inside `onMounted`.
- Render the neutral state on the server and correct it after mount, or the
  hydrated markup disagrees with what was sent.

In Nuxt, `<ClientOnly>` is a way to skip server rendering for a widget entirely,
at the cost of rendering nothing until hydration — a poor trade for a section
that carries content, a reasonable one for a canvas.

## Reaching the element

A template ref for the root, and `data-*` attributes inside it for the parts.
Querying by tag or position (`root.value.children[2]`) breaks the next time the
template changes.

A child component's root element is reachable with a ref only when it is a
single-root component; otherwise pass a class or a `data-*` attribute down and
query it inside the context.

## Every frame

Refs, not reactive state. A `ref()` written every frame triggers Vue's
reactivity and re-renders the component; `gsap.quickTo` writes straight to the
element. Reactive state is for what exists — is the panel open, which tab is
active.

## Page and route changes

Vue Router replaces the view, and `onUnmounted` runs, so the context goes with
it. For an exit animation, either put the overlay in the layout, which the
navigation does not unmount, or use the router's own guards to hold the
navigation while a timeline plays.

Call `ScrollTrigger.refresh()` after the new view settles — in Nuxt, after
`nextTick()` on the route change.

## Failures

| Symptom | Cause |
|---|---|
| `window is not defined` during a Nuxt build | `window` read in `setup` instead of `onMounted` |
| Hydration mismatch warning | state derived from storage or a media query during render |
| The animation keeps running after leaving the page | `<KeepAlive>` deactivation treated as unmount |
| Tweens from a `watch` are never reverted | created outside the context instead of through `ctx.add` |
| Two instances animate each other | no root passed to `gsap.context` |

## What the audit covers

From 3.2 the audit reads the `<script>` block of `.vue` files, with offsets
kept, so reported lines match the file. It checks that a context created in
`onMounted` is reverted, along with every rule that is not React-specific.

`orphan-tween`, `state-per-event` and `shared-plugin-id` are React-only and do
not run here.

## Versions

Verified against `gsap@3.15`. Written for `vue@3.5` and `nuxt@4`.
