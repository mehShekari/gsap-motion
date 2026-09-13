# Frameworks other than React

GSAP has no framework. What changes between frameworks is only **where an
animation is created and where it is torn down** — the lifecycle. Everything
else in this skill applies unchanged: motion design, timelines, ScrollTrigger,
SVG, text, Flip, performance and accessibility.

One pattern sits under every framework below:

1. Create animations inside `gsap.context(fn, root)`, so selector strings
   resolve inside the component's own root element.
2. Build the reduced-motion branch with `gsap.matchMedia()` inside that context,
   so it goes with it.
3. Call `ctx.revert()` when the component goes away. That undoes every tween,
   ScrollTrigger, SplitText and matchMedia created inside, and restores inline
   styles.

Timers, raw `addEventListener` calls and observers are not GSAP's — clear them
yourself in the same cleanup.

## Vanilla JavaScript

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

  return () => ctx.revert(); // call when root is removed
}
```

A static page that never removes the element can skip the cleanup. Anything that
swaps content — a client-side router, HTMX, Turbo, a modal — cannot.

## Vue 3 and Nuxt

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

- `onMounted` never runs during server rendering, so this is safe under Nuxt as
  written.
- Animation that reacts to state belongs in a `watch` that adds its tweens to
  the same context with `ctx.add(() => { … })`, so they are reverted with it.

## Svelte

```svelte
<script>
  import gsap from "gsap";
  import { onMount } from "svelte";

  let root;

  onMount(() => {
    const ctx = gsap.context(() => {
      gsap.from("[data-item]", { autoAlpha: 0, y: 24, stagger: 0.06 });
    }, root);
    return () => ctx.revert();
  });
</script>

<section bind:this={root}>…</section>
```

A function returned from `onMount` runs when the component is destroyed.
`onMount` does not run during server rendering. The markup uses Svelte's
classic syntax; check how your Svelte version declares a `bind:this` variable
before copying it.

## Astro

An Astro `<script>` runs once. With view transitions enabled, the page is
swapped without a reload, so build on each page load and revert before each
swap:

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

Inside a React, Vue or Svelte island, use that framework's section instead.

## Mounting twice

Selector strings are scoped to the context's root, but `motionPath.path` and
`morphSVG.shape` are resolved by the plugins against the whole document. A
component rendered twice with a hardcoded id drives the first instance's
geometry. Generate an id per instance in every framework, not only React.

## What the audit covers here

- `audit-gsap.mjs` reads `.js`, `.ts`, `.jsx`, `.tsx` and `.mjs` files only.
  Logic inside `.vue`, `.svelte` or `.astro` files is not scanned — keep the
  animation in a sibling module, like `mountReveal` above, if you want it
  checked.
- Its React-specific rules — `orphan-tween`, `state-per-event` and
  `shared-plugin-id` — apply only to React files. The rest apply to every file
  it reads: cost, loops, scrub, listeners, unmanaged instances, plugin
  registration, reduced motion and shipped dev tooling.
