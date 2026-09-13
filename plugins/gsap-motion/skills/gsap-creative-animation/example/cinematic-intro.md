# Example: site intro

An arrival curtain. Composed rather than singular: SVG drawing, motion path,
morph and a staggered reveal, all serving one sentence. The code is trimmed to
the parts worth copying.

## The concept

> The mark writes itself, then the dot that drew it runs off and writes the
> word.

One sentence, and every technique either serves it or was cut. That is the test
for "something crazy" — not how many plugins are involved.

## Sequence

1. Mark outlines draw on, staggered (DrawSVG)
2. Fills arrive underneath; outlines retire
3. A dot emerges and runs the wordmark's baseline (MotionPath)
4. Letters draw in its wake, staggered to its travel (DrawSVG)
5. The dot stretches to a dash and back as it moves (MorphSVG)
6. It settles onto an orbit around the mark — the loader's idle, so the two read
   as one family
7. The curtain lifts

Under 3 seconds. Once per session, not once per route.

## What is worth copying

**Both halves in one coordinate space.** Build from the lockup master that holds
the mark and the wordmark together, so synchronising the dot's travel with the
letters is one timeline rather than a coordinate conversion between two SVGs.
Choosing the right source asset removed the hard problem.

**Labels, not offsets.** The dot's run and the letter stagger share a `"write"`
label, so they stay together when the beat before them changes length:

```ts
tl.addLabel("write")
  .to(orbiter, { autoAlpha: 1, duration: 0.25 }, "write")
  .to(
    orbiter,
    {
      motionPath: { path: baseline, align: baseline, alignOrigin: [0.5, 0.5] },
      duration: WRITE_SECONDS,
      ease: "power1.inOut",
    },
    "write",
  )
  // The letters are sorted along the dot's direction of travel, so a plain
  // stagger puts each one under the dot as it passes. The span is a shade
  // shorter than the run, so the last letter finishes before the dot leaves.
  .fromTo(
    "[data-word-outline]",
    { drawSVG: "0%" },
    {
      drawSVG: "100%",
      duration: 0.5,
      stagger: { each: (WRITE_SECONDS * 0.82) / LETTER_COUNT },
      ease: "power2.out",
    },
    "write+=0.1",
  );
```

**A hard ceiling, and dismissal as a race.** A splash that waits on a signal can
wait forever, and the result is not a slow page — it is a site nobody can
reach. Whatever ends first, the animation or the ceiling, lifts the curtain,
and only once:

```ts
useGSAP(
  () => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      seen.set();
      onDone();
    };

    if (seen.get()) {
      finish();
      return;
    }

    const ceiling = window.setTimeout(finish, MAX_VISIBLE_MS);

    // …a matchMedia with a motion branch and a reduced branch, both ending in
    // finish() — see below.

    // The one thing here the GSAP context does not own.
    return () => window.clearTimeout(ceiling);
  },
  { scope: rootRef },
);
```

**An endless loop makes its timeline endless.** The dot settles into an orbit
that repeats forever. A timeline holding a `repeat: -1` child is given an
effectively infinite duration — `1e10` seconds, measured in gsap 3.15 — so its
`onComplete` never fires, and a short tween added after the loop does not
change that. Hand over at a *position* instead:

```ts
tl.addLabel("hold")
  .to(
    orbiter,
    {
      motionPath: { path: orbit, align: orbit, alignOrigin: [0.5, 0.5], autoRotate: true },
      duration: ORBIT_SECONDS,
      repeat: -1,
      ease: "none",
    },
    "hold",
  )
  // Fires when the playhead passes it, however long the timeline is.
  .call(finish, [], `hold+=${SETTLE_SECONDS}`);
```

Get this wrong and nothing visibly breaks: the ceiling still lifts the curtain,
just late, on every visit. That is exactly why it is worth checking.

**The page renders underneath the whole time.** The curtain only covers. A
JavaScript failure leaves the visitor on the site, not behind a curtain.

**Session gating in the layout effect, behind storage's real failures.**
Storage cannot be read during render without the server and client
disagreeing; `useGSAP` runs before paint, so a returning visitor never sees a
frame. Storage also throws in locked-down browsers and embedded webviews:

```ts
const seen = {
  get() {
    try {
      return window.sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  },
  set() {
    try {
      window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* Storage blocked: the visitor sees the intro again. That is all. */
    }
  },
};
```

An intro shown twice is a far smaller failure than one that takes the page down
with it.

**Reduced motion gets the lockup, not the performance.** An intro is
unskippable and is the first thing a visitor meets, so it is the worst place to
insist on movement:

```ts
if (reduced) {
  gsap.set("[data-outline]", { autoAlpha: 0 });
  gsap.set("[data-fill]", { autoAlpha: 1 });
  gsap.set(orbiter, { autoAlpha: 0 });
  gsap.delayedCall(0.9, finish);
  return;
}
```

**Artwork as a prop, not an import.** Path data for a lockup runs to ~15KB per
language. A Server Component picks the right set and passes it down; check the
build output that the other languages are absent from the client chunks.

**Geometry is generated, not transcribed.** Three ~900-character `d` attributes
retyped by hand is a logo subtly wrong in one curve. A generator script also
catches what reading by eye misses:

- **Exports disagree about class names.** Two masters from one design file can
  use `st0` for the brand colour in one and a grey in the other. Read the
  declared `fill`, never the class name.
- **Near-identical greys.** A master can carry a third graphite one step away
  from the others. Collapsing every grey to `currentColor` fixes it on the way
  past.
- **The mark moves between variants.** When it sits at opposite ends of two
  lockups, find it by its node signature, not by index.
- **The orbit is bigger than the art.** Expand the viewBox to contain it, or the
  dot is clipped for part of every lap.

Keep the generator in the project's `scripts/`, not a scratch directory. Its
output says "not hand-editable"; without a re-runnable generator that is a dead
end.

## Usage

```tsx
// A Server Component picks the language's artwork and passes it down.
<SiteIntro art={INTRO_ART[locale]} />
```

## Related

[preset/cinematic.md](../preset/cinematic.md) ·
[reference/svg.md](../reference/svg.md) ·
[reference/accessibility.md](../reference/accessibility.md)
