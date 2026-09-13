# Reveal

Entrance and in-view reveals. The most common request and the easiest to make
generic — the difference between a stock reveal and a good one is the mask and
the rhythm, not the duration.

## Distance over opacity

A 60px slide reads as arrival; a 200px slide reads as a slideshow. Start small.

```ts
gsap.from("[data-item]", {
  y: 32,
  autoAlpha: 0,
  duration: 0.7,
  stagger: 0.06,
  ease: "power3.out",
});
```

`autoAlpha`, not `opacity`, so nothing invisible takes pointer events. For a
`from` tween outside a layout effect, set the start state first or it flashes.

## Mask reveal

The upgrade that makes a reveal look authored. The element rises out of nothing
instead of sliding in from somewhere.

```tsx
<span className="block overflow-hidden">
  <span data-line className="block">Built in Iran.</span>
</span>
```

```ts
gsap.from("[data-line]", {
  yPercent: 110,
  duration: 0.8,
  stagger: 0.08,
  ease: "power3.out",
});
```

`yPercent: 110` rather than `100` — a descender pokes below the box at exactly
100.

## Image reveal

Clip the container, counter-move the image. The image appears to be uncovered
rather than to slide, and the parallax inside the mask is what sells it.

```tsx
<div data-frame className="overflow-hidden">
  <img data-img alt="" />
</div>
```

```ts
gsap.timeline({ defaults: { ease: "power3.inOut", duration: 1 } })
  .from("[data-frame]", { clipPath: "inset(0 0 100% 0)" })
  .from("[data-img]", { scale: 1.25 }, "<");
```

`clipPath` animates on the compositor in modern browsers. `scale` on the image
must be a counter-move — if both travel the same way it just looks like a zoom.

For RTL, a horizontal wipe direction must mirror: `inset(0 100% 0 0)` becomes
`inset(0 0 0 100%)`.

## In-view

```ts
gsap.from("[data-item]", {
  y: 32,
  autoAlpha: 0,
  stagger: 0.06,
  scrollTrigger: {
    trigger: section,
    start: "top 75%",
    toggleActions: "play none none none",
  },
});
```

`"top 75%"` fires a quarter into the viewport — early enough that it is not
already read, late enough that it is not missed. `play none none none` plays
once; `play none none reverse` replays on scroll back, which is usually
irritating on a long page.

**One trigger for the group.** Forty cards is one trigger with a stagger, not
forty triggers — see [scrolltrigger.md](../reference/scrolltrigger.md).

## Stagger shapes

```ts
stagger: { amount: 0.5 }                       // 0.5s total, any count
stagger: { each: 0.06, from: "center" }        // radiates outward
stagger: { each: 0.05, from: "end" }           // reading order in RTL
stagger: { amount: 0.6, grid: [4, 3], from: "start" }   // diagonal across a grid
```

`amount` over `each` for anything that can grow — twelve cards at `each: 0.1`
take 1.2s of nothing happening.

## Composed section entrance

Hierarchy in time: the thing that matters arrives first.

```ts
gsap.timeline({
  defaults: { ease: "power3.out", duration: 0.8 },
  scrollTrigger: { trigger: section, start: "top 70%" },
})
  .from("[data-eyebrow]", { autoAlpha: 0, y: 12, duration: 0.5 })
  .from("[data-heading-line]", { yPercent: 110, stagger: 0.08 }, "-=0.25")
  .from("[data-body]", { autoAlpha: 0, y: 20 }, "-=0.5")
  .from("[data-cta]", { autoAlpha: 0, y: 16, duration: 0.6 }, "-=0.45")
  .from("[data-media]", { clipPath: "inset(0 0 100% 0)", duration: 1 }, "-=0.8");
```

The negative offsets overlap each beat into the one before at roughly 60–70%.
Nothing waits for the previous thing to finish, which is what stops it reading
as a list.

## Reduced motion

```ts
if (reduced) {
  gsap.set("[data-item]", { autoAlpha: 1, y: 0, clipPath: "none" });
  return;
}
```

**The reduced branch must set the end state.** A `from` that never runs leaves
the element at its authored start — invisible. This hides content rather than
skipping motion, and it is the most common bug in this preset.

## Tuning

| Feels | Change |
|---|---|
| like a slideshow | overlap the beats — `<` or negative offsets |
| cheap | mask instead of fade; `power3.out` instead of `power1` |
| slow | reduce distance before duration; overlap more |
| chaotic | fewer things moving; one carries the emphasis |
| janky | `y` not `top`; check the trigger count |
