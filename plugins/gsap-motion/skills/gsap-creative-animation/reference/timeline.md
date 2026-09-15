# Timeline architecture

A timeline is how choreography stays editable. Five tweens with hand-tuned
delays encode the same animation in a form nobody can retime without redoing
the arithmetic.

## Position

The third argument places a child on the timeline. This is the whole API.

```ts
tl.to(a, { ... })                  // after everything before it
  .to(b, { ... }, "<")             // with the previous tween's start
  .to(c, { ... }, "<0.2")          // 0.2s after the previous start
  .to(d, { ... }, "-=0.3")         // 0.3s before the timeline's current end
  .to(e, { ... }, ">")             // at the previous tween's end (explicit)
  .to(f, { ... }, 1.5)             // absolute time
  .to(g, { ... }, "reveal")        // at a label
  .to(h, { ... }, "reveal+=0.4");  // relative to a label
```

`<` is the one to reach for most. "Start with the previous thing, slightly
after" is what overlap sounds like in code, and it survives a duration change
upstream — `-=0.3` does not.

## Labels

Labels turn a timeline into something you can read and something you can seek.

```ts
const tl = gsap.timeline();

tl.addLabel("mark")
  .fromTo("[data-outline]", { drawSVG: "0%" }, { drawSVG: "100%", duration: 1 })
  .addLabel("word")
  .to("[data-letter]", { autoAlpha: 1, stagger: 0.05 }, "word")
  .to(dot, { motionPath: { ... } }, "word")
  .addLabel("hold");
```

Two children sharing a label start together and stay together when the beat
before them changes length. That is the point — a label is a commitment about
*structure*, where a number is a commitment about *time*.

`tl.seek("word")` and `tl.tweenTo("hold")` then work without counting.

## Nesting

Build each beat as its own timeline and assemble them. This is what keeps a
long sequence readable, and it lets you reuse a beat.

```ts
const enter = () =>
  gsap.timeline().from("[data-line]", { yPercent: 110, stagger: 0.06 });

const master = gsap.timeline()
  .add(enter())
  .add(revealImage(), "-=0.4")
  .add(settle());
```

A nested timeline keeps its own internal timing when the parent's `timeScale`
changes, which is how you slow a whole sequence without touching each beat.

## Defaults

Repeating `duration` and `ease` on every child is noise and drifts:

```ts
const tl = gsap.timeline({
  defaults: { duration: 0.6, ease: "power3.out" },
});
```

Children override individually. Set the house values once here.

## Where `repeat` belongs

On the child, not the parent, when only part of the sequence loops:

```ts
tl.from("[data-mark]", { ... })          // plays once
  .to(dot, { rotation: 360, repeat: -1, ease: "none" });  // loops forever
```

`repeat: -1` on the timeline replays the entrance too. And a timeline containing
an infinitely repeating child **never completes**, so its `onComplete` never
fires — if something downstream waits on that, give the timeline a finite beat
of its own to end on, or drive the handover from elsewhere. `audit-gsap`
reports it as `never-completes`.

## Paused timelines as state

Build once, play on demand. Far better than creating a tween per event.

```ts
const hover = gsap.timeline({ paused: true })
  .to(el, { scale: 1.05, duration: 0.3 });

onMouseEnter = () => hover.play();
onMouseLeave = () => hover.reverse();
```

`reverse()` uses the same easing backwards, so the return matches the arrival
without a second definition. In React, anything built outside the `useGSAP`
body must go through `contextSafe` — see [react.md](../adapter/react.md).

## Holds

An empty tween is a pause that is visible in the structure:

```ts
tl.to(shape, { morphSVG: "#b" })
  .to({}, { duration: 0.4 })     // hold, legible in the timeline
  .to(shape, { morphSVG: "#c" });
```

Clearer than `delay` on the next tween, because the hold is a beat rather than a
property of something else.

## Scrubbing

A paused timeline driven by an external value is the pattern behind every
progress-bound animation:

```ts
const tl = gsap.timeline({ paused: true });
tl.fromTo(ring, { drawSVG: "0%" }, { drawSVG: "100%", ease: "none" });

gsap.to(tl, { progress, duration: 0.4, ease: "power2.out", overwrite: true });
```

Tween the progress rather than setting it — that is what smooths a value
arriving as 0 → 40 → 100. `overwrite: true` stops two updates in flight from
fighting. `ease: "none"` inside, because the outer tween owns the feel.

ScrollTrigger's `scrub` is this same mechanism with scroll as the value.

## Common failures

| Symptom | Cause |
|---|---|
| Reads like a slideshow | no overlap — nothing uses `<` or a negative offset |
| Retiming one beat breaks the rest | `-=` offsets instead of labels |
| `onComplete` never fires | an infinitely repeating child |
| Entrance replays on loop | `repeat: -1` on the timeline, not the child |
| Flash of the end state before it runs | `from` without a `set`, outside a layout effect |
| Two beats drift apart after an edit | both timed by number instead of sharing a label |
