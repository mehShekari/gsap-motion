# Scroll storytelling

A pinned section where scrolling drives a sequence. The "Apple product page"
pattern. Expensive in build time and in the visitor's attention, so it has to
be carrying a story that genuinely has an order.

Mechanics are in [scrolltrigger.md](../reference/scrolltrigger.md); this is how
to compose one.

## Decide the beats first

Write them out before any code. Each beat is one idea, and scroll distance is
your pacing:

```text
0.0 – 0.2   the product, whole
0.2 – 0.45  it opens; the first claim arrives
0.45 – 0.7  detail view; the second claim
0.7 – 1.0   it closes; the CTA
```

Roughly 600–1000px of scroll per beat. Less and it flicks past; more and the
visitor thinks the page is stuck.

## One timeline, one trigger

Every element in the sequence belongs to the same timeline. Separate triggers
drift apart the moment you retime anything.

```ts
const tl = gsap.timeline({
  defaults: { ease: "none" },        // scrubbed — the scrollbar owns the feel
  scrollTrigger: {
    trigger: section,
    start: "top top",
    end: "+=3000",
    pin: true,
    scrub: 1,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    markers: process.env.NODE_ENV === "development",
  },
});

tl.addLabel("open")
  .to("[data-lid]", { rotationX: -110, duration: 1 })
  .from("[data-claim-1]", { autoAlpha: 0, y: 20, duration: 0.4 }, "open+=0.4")

  .addLabel("detail")
  .to("[data-claim-1]", { autoAlpha: 0, duration: 0.3 }, "detail")
  .to("[data-product]", { scale: 1.6, x: "-20%", duration: 1 }, "detail")
  .from("[data-claim-2]", { autoAlpha: 0, y: 20, duration: 0.4 }, "detail+=0.4");
```

`ease: "none"` on every child. Easing inside a scrubbed timeline fights the
visitor's own scrolling and reads as lag — `scrub: 1` is where the smoothing
belongs.

## Horizontal

```ts
const panels = gsap.utils.toArray<HTMLElement>("[data-panel]");

gsap.to(panels, {
  xPercent: -100 * (panels.length - 1),
  ease: "none",
  scrollTrigger: {
    trigger: track,
    pin: true,
    scrub: 1,
    end: () => `+=${track.offsetWidth}`,
    snap: { snapTo: 1 / (panels.length - 1), duration: 0.4 },
    invalidateOnRefresh: true,
  },
});
```

`end` as a function is re-evaluated on refresh, which keeps it correct after a
resize. `xPercent` avoids measuring widths.

In RTL the direction inverts — `+100 *` rather than `-100 *`. Read `dir` from
the document; see [project-rules.md](../reference/project-rules.md).

Horizontal scroll costs the visitor their scroll intuition. Justify it with
content that is genuinely a sequence.

## Snapping

```ts
snap: { snapTo: "labels", duration: 0.4, ease: "power2.inOut", delay: 0.1 }
```

`"labels"` snaps to the timeline's own labels, which is why naming the beats
pays off twice. Snapping suits discrete steps and fights continuous motion —
do not snap a scrubbed camera move.

## Progress

A scrubbed indicator is cheap and orients the visitor inside a long pin:

```ts
.to("[data-progress]", { scaleX: 1, transformOrigin: "0% 50%" }, 0);
```

Placed at position `0` with the timeline's full duration, it tracks overall
progress regardless of what else is happening.

## Mobile

**Do not scale the desktop sequence down.** A 3000px pin on a phone is a long
time to be stuck, and pinning fights the address bar collapsing.

```ts
mm.add({ desktop: "(min-width: 768px)", mobile: "(max-width: 767px)" }, (c) => {
  if (c.conditions!.mobile) {
    // Each beat becomes its own in-view reveal. Same content, no pin.
    gsap.utils.toArray("[data-beat]").forEach((beat) =>
      gsap.from(beat as HTMLElement, {
        autoAlpha: 0, y: 24,
        scrollTrigger: { trigger: beat as HTMLElement, start: "top 75%" },
      }),
    );
    return;
  }
  // the pinned sequence
});
```

This is the single most important decision in this preset. A different strategy,
not a smaller one.

## Reduced motion

Drop the pin and the scrub. Each beat appears on entry:

```ts
if (reduced) {
  gsap.set("[data-claim-1], [data-claim-2]", { autoAlpha: 1, y: 0 });
  return;
}
```

Scroll-scrubbed pinning is a textbook vestibular trigger — the content moves
while the page does not. The content must still be reachable and readable.

## Image sequences

Frame-by-frame scrubbing looks expensive because it is. Before committing:
30–120 frames at a sensible resolution, preloaded, drawn to a `<canvas>` — not
120 `<img>` elements.

```ts
const frame = { i: 0 };
gsap.to(frame, {
  i: images.length - 1,
  snap: "i",
  ease: "none",
  scrollTrigger: { trigger: section, start: "top top", end: "+=3000",
                   pin: true, scrub: 1 },
  onUpdate: () => ctx.drawImage(images[frame.i], 0, 0),
});
```

Do not start this until every frame is decoded, or the first scroll shows gaps.
On a slow connection, offer a static hero instead.

## Failures

| Symptom | Cause |
|---|---|
| Pin does nothing | an ancestor has `overflow: hidden` |
| Motion lags behind scroll | easing inside a scrubbed timeline |
| Beats drift after an edit | separate triggers instead of one timeline |
| Wrong positions after load | images without dimensions — refresh |
| Unusable on mobile | desktop sequence scaled instead of replaced |
| Flicker when the pin engages | missing `anticipatePin` |
