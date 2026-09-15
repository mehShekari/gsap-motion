# Devices

A width breakpoint is not a device. A 1024px window can be a phone in landscape,
a tablet with a keyboard, or a desktop browser scaled to half the screen, and
"mobile" has stood in for all three for so long that most animation ships one
guess about which it is.

Read three axes instead. They are independent, and each answers a different
question.

| Axis | Question | Read from |
|---|---|---|
| Layout | How much room is there? | the viewport, in `matchMedia` |
| Input | Can the visitor hover, and how precise are they? | `(hover: hover)`, `(pointer: fine)` |
| Motion tier | How much motion should run, and can this device run it? | `prefers-reduced-motion`, then capability |

```ts
const mm = gsap.matchMedia();

mm.add(
  {
    wide: "(min-width: 48em)",
    hoverable: "(hover: hover) and (pointer: fine)",
    motion: "(prefers-reduced-motion: no-preference)",
  },
  (context) => {
    const { wide, hoverable, motion } = context.conditions;
    // …one branch, three facts
  },
);
```

`matchMedia` re-runs the body when any condition changes and reverts what the
previous run created, so a visitor who rotates a phone, plugs in a mouse or
turns on reduced motion gets the right version without a reload.

## The device changes the technique, never the story

A scene says something — this section arrived, that item is now first, the page
is loading. That does not change with the screen. What changes is how much
motion is spent saying it.

So each beat has three versions, and the beat decides which parts of itself are
device-sensitive:

- **Full** — the designed version.
- **Light** — the same meaning, less work: a shorter travel, no blur, fewer
  elements moving, a stagger that runs as one group.
- **Static** — the end state, set. Still says *what* happened, with no travel.

Only branch the techniques that actually depend on the device. A fade is a fade
everywhere; a magnetic cursor is not. Writing three whole timelines where one
beat differs is how a page ends up with two motion languages and one of them
untested.

## Start safe, then enhance

Begin from the version that works everywhere — the light one — and add to it
when an axis says there is room. The opposite order ships the expensive version
to the device least able to run it and then tries to claw it back.

If you measure capability at run time, **downgrade once**. A scene that keeps
sampling frame rate and flipping between versions spends its budget on the
flipping, and the visitor sees the page change its mind. Decide early, once, and
stay there.

Device memory and core count (`navigator.deviceMemory`, `hardwareConcurrency`)
are hints, not facts: they are absent on some browsers and rounded on others.
Use them to pick a tier, never to decide whether a thing works.

## Where to read each axis

`prefers-reduced-motion`, `hover` and `pointer` are media queries, so
`gsap.matchMedia` is the one place to read them — inside the animation's own
context, where its cleanup already is.

The trap is reading them during render. A server has no viewport and no pointer,
so anything that branches on them before mount is a hydration mismatch waiting
to happen. Each adapter says where its own safe point is:

- **React and Next** — in the `useGSAP` body, never in render. See
  [react.md](../adapter/react.md).
- **Vue and Nuxt** — in `onMounted`. See [vue.md](../adapter/vue.md).
- **Svelte** — in `$effect` or `onMount`. See [svelte.md](../adapter/svelte.md).
- **Astro** — in the component script, which is already browser-only. See
  [astro.md](../adapter/astro.md).
- **Vanilla** — wherever you mount. See [vanilla.md](../adapter/vanilla.md).

## What each axis is allowed to change

| Axis | Changes | Does not change |
|---|---|---|
| Layout | travel distance, stagger shape, which elements move, pinning | what the scene says |
| Input | hover effects, cursors, magnetic pulls, drag affordances | entrance and scroll behaviour |
| Motion tier | travel, loops, parallax, blur and shadow work | the end state the visitor is left in |

A hover effect with no input branch is the common failure: a tap on a touch
device fires `mouseenter`, nothing fires the leave, and the effect sticks. The
audit reports that as `ungated-hover`.

## Reduced motion is a tier, not an off switch

The static version still communicates. It sets the end state, keeps the
hierarchy the motion was carrying — by order, weight or a very short fade — and
drops travel, loops and parallax. An empty branch is a page that looks broken to
the people who asked for less motion.

See [accessibility.md](accessibility.md) for what "reduced" means in practice,
and [performance.md](performance.md) for measuring a tier rather than guessing
it.
