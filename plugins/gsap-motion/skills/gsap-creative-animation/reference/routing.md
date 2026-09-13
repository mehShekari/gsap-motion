# Routing

What to load, and what to do when the request is a feeling rather than a
command.

## No argument

Do not guess a target and do not invent an animation. Ask what should move, and
offer the menu below — grouped, so the question is easy to answer.

> What are we animating?
>
> - **Entrance** — something appearing: a hero, a section, a list, an image
> - **Scroll** — something driven by scroll position: a sequence, a pin, a
>   horizontal run
> - **Interaction** — something answering the pointer: a button, a cursor, a
>   card
> - **Continuous** — something always moving: a marquee, an orbit, ambient drift
> - **Transition** — moving between two states: a route, a modal, a layout
> - **Loading** — a loader, a progress indicator, a site intro
> - **Existing** — something already animated that feels wrong, costs too much,
>   or should go

## Classifying a description

Most requests are a feeling, not a command. Classify, then route.

| What they say | What they mean | Route to |
|---|---|---|
| "make it cinematic" | slow, weighted, sequenced, one thing at a time | `intro` · [cinematic](../preset/cinematic.md) |
| "make it feel premium" | fewer moving parts, longer eases, no bounce | `tune` · [motion-design](motion-design.md) |
| "make it feel alive" | ambient continuous motion under static content | `ambient` · [marquee](../preset/marquee.md) |
| "make it pop / bolder" | more contrast in timing, not more elements moving | `tune` · [motion-design](motion-design.md) |
| "like Apple" | scroll-scrubbed, pinned, one idea per screen | `scroll` · [scroll-storytelling](../preset/scroll-storytelling.md) |
| "futuristic / technical" | scramble, draw-on, mechanical easing, grid reveals | `text` + `svg` |
| "liquid / organic" | morph, path motion, overlapping soft easing | `svg` · [loader](../preset/loader.md) |
| "something crazy" | layered techniques with one clear concept | see below |
| "smooth image reveal" | clip-path or mask, not opacity | [reveal](../preset/reveal.md) |
| "the hero is boring" | hierarchy problem before a motion problem | `tune`, then `reveal` |
| "it feels janky" | cost or trigger problem | `audit` · [performance](performance.md) |

### "Something crazy"

A fade-and-scale is a failure of nerve; twelve techniques at once is a failure
of taste. Pick **one concept** and let three techniques serve it. The concept is
the thing you can say in a sentence — "the logo writes itself, then the dot that
drew it runs off and writes the word" — and every technique either serves that
sentence or is cut.

## Load map

The project's own rules come first, then the size tiers in SKILL.md, setup step
3: a one-element change loads [motion-design](motion-design.md) and the
command's own reference only. The table applies from component size up — a
single hover takes [interaction](interaction.md) and nothing else from its row.

| Request | Add |
|---|---|
| SVG draw / morph / path | [svg](svg.md), [timeline](timeline.md) |
| Scroll sequence, pin, scrub | [scrolltrigger](scrolltrigger.md), [timeline](timeline.md), [performance](performance.md) |
| Horizontal scroll | [scrolltrigger](scrolltrigger.md), [scroll-storytelling](../preset/scroll-storytelling.md) |
| Text reveal, kinetic type | [text](text.md), [timeline](timeline.md) |
| Magnetic, cursor, hover | [interaction](interaction.md), [performance](performance.md) |
| Drag, flick, inertia | [interaction](interaction.md) |
| Layout / shared element / modal | [flip](flip.md) |
| Page or route transition | [flip](flip.md), [page-transition](../preset/page-transition.md), [react-nextjs](react-nextjs.md) or [frameworks](frameworks.md) |
| Loader, splash, intro | [svg](svg.md), [timeline](timeline.md), [accessibility](accessibility.md) |
| Marquee, orbit, ambient | [timeline](timeline.md), [performance](performance.md) |
| Three.js / R3F | [three-r3f](three-r3f.md), [performance](performance.md) |
| Audit an existing animation | [performance](performance.md), [accessibility](accessibility.md), [react-nextjs](react-nextjs.md) or [frameworks](frameworks.md) |
| Retime / re-ease | [motion-design](motion-design.md) only |

Do not load a domain file "for completeness". Loading `three-r3f.md` for a
button hover is the failure this map exists to prevent.

## `audit`

**Run the checker first.** It is deterministic, it costs a second, and it finds
the mechanical failures before you spend attention on them:

```bash
node .claude/skills/gsap-creative-animation/scripts/audit-gsap.mjs <path>
```

**When an animation is not visible, ask whether it was ever built.** Before
touching timings or transforms, check that the code which creates it actually
runs. Animation is routinely built behind a condition — an image decode race, a
`ready.then()`, a ScrollTrigger that has not fired, a `matchMedia` branch that
does not match, an early `return` on a missing ref — and a tween that was never
created looks exactly like one that is mis-timed. A typical case: an image wipe
added only once the image decodes inside a short budget. On a first visit the
image is never cached, the branch never runs, and every hypothesis about the
wipe's geometry is wasted effort.

Then read for what it cannot see. Check in this order — the first two are where
real bugs live:

1. **Lifecycle** — is every animation inside a `useGSAP`/`gsap.context` scope?
   Are ScrollTriggers killed? Are listeners removed? Does a `matchMedia` get
   reverted? See [react-nextjs](react-nextjs.md).
2. **Cost** — layout-triggering properties, per-frame React state, filters on
   large areas, one ScrollTrigger per item where one would do. See
   [performance](performance.md).
3. **Reduced motion** — is there a branch, and does it still communicate?
4. **Craft** — rhythm, easing on loops, contrast. See [motion-design](motion-design.md).

Report findings most-severe first, with the file and line. Do not rewrite
unless asked.

## `strip`

Removing motion is a legitimate outcome and often the right one. Cut an
animation when it answers none of hierarchy, causality, continuity, state, or
personality; when it delays content the visitor came for; when it repeats on
every route and stopped being noticed on the second one; or when it exists
because a plugin was available.

Say what you removed and what it was costing. Do not replace it with a smaller
animation unless the user asks.
