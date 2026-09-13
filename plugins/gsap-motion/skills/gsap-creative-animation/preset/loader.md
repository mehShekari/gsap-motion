# Loader

A loader's job is to say "this is working" and, if possible, "for about this
long". Everything else is decoration.

Two rules that outrank craft: **it must never be able to hang**, and **it must
show something under reduced motion** — a loader with nothing moving reads as a
page that has crashed.

A worked example, with the code that matters: [example/svg-loader.md](../example/svg-loader.md).

## Travelling dash

The one to reach for. No DOM churn, no layout, one property.

```ts
gsap.timeline({ repeat: -1 })
  .fromTo("#ring", { drawSVG: "0% 0%" },
                   { drawSVG: "0% 75%", duration: 0.9, ease: "power2.inOut" })
  .to("#ring", { drawSVG: "100% 100%", duration: 0.9, ease: "power2.inOut" });

gsap.to("#ring", {
  rotation: 360, transformOrigin: "50% 50%",
  repeat: -1, duration: 1.8, ease: "none",
});
```

Two tweens because growing and shrinking have different origins — that
difference is what reads as a pulse rather than a slide. The rotation runs
separately so the dash never appears to stall at the seam.

Needs a stroke. See [svg.md](../reference/svg.md).

## Morph cycle

```ts
const tl = gsap.timeline({ repeat: -1 });

for (const shape of ["#b", "#c", "#a"]) {
  tl.to("#morph", {
    morphSVG: { shape, type: "rotational" },
    duration: 0.7,
    ease: "power2.inOut",
  }).to({}, { duration: 0.3 });     // hold, so each shape is legible
}
```

The empty tween is a hold that is visible in the structure. Keep node counts
within 3× or the morph smears.

## Orbit

```ts
gsap.to("#dot", {
  motionPath: { path: "#track", align: "#track",
                alignOrigin: [0.5, 0.5], autoRotate: true },
  duration: 2.4, repeat: -1, ease: "none",
});
```

`ease: "none"` — anything else stutters at the loop seam. Several orbiters:
`stagger: { each: duration / count, repeat: -1 }`.

**The viewBox must contain the orbit, not just the artwork.** An orbit around a
wide lockup is taller than it, and the dot is clipped for part of every lap.

## Logo that draws itself

A filled logo has no stroke for DrawSVG to animate. Two layers of the same
geometry: a stroked copy draws, the filled version fades in under it, the
outline fades out.

```ts
tl.fromTo("[data-outline]", { drawSVG: "0%" },
          { drawSVG: "100%", duration: 1.2, stagger: 0.12, ease: "power2.inOut" })
  .to("[data-fill]", { autoAlpha: 1, duration: 0.4 }, "-=0.5")
  .to("[data-outline]", { autoAlpha: 0, duration: 0.3 }, "<0.15");
```

A useful side effect: with JavaScript unavailable the stroked layer is what
renders, so the fallback is the mark in outline rather than an empty box.

## Determinate progress

When there is a real number, drive the timeline instead of looping it.

```ts
const tl = gsap.timeline({ paused: true });
tl.fromTo("#ring", { drawSVG: "0%" }, { drawSVG: "100%", ease: "none" });

gsap.to(tl, { progress, duration: 0.4, ease: "power2.out", overwrite: true });
```

Tween the progress rather than setting it — that is what smooths a value
arriving as 0 → 40 → 100. `overwrite: true` stops two updates fighting.

Never let a determinate bar sit at 100% while work continues. Cap the animated
value at ~90% until the work actually completes.

## Dismissal must be a race

This is the part that breaks in production. A loader waiting on a signal can
wait forever — a failed request, a missed event, a `load` that never fires
because one image is stuck. The result is not a slow page; it is a page nobody
can reach.

```ts
let done = false;
const finish = () => { if (done) return; done = true; onDone(); };

const ceiling = window.setTimeout(finish, MAX_VISIBLE_MS);
tl.eventCallback("onComplete", finish);

return () => window.clearTimeout(ceiling);
```

A timeline containing an infinitely repeating child **never completes**, so its
`onComplete` never fires. Give the timeline a finite beat of its own to end on,
or drive the handover from elsewhere.

Render the real page underneath the whole time, so a visitor whose JavaScript
fails gets the site rather than a permanent curtain.

## Exit

A loader that vanishes abruptly makes the page feel like it broke.

```ts
const exit = gsap.timeline({ paused: true })
  .to("#ring", { drawSVG: "100% 100%", duration: 0.4, ease: "power2.in" })
  .to(root, { autoAlpha: 0, duration: 0.3 }, "-=0.1");
```

## Accessibility

- `role="status"` and an accessible name on the container. It announces
  politely without stealing focus.
- The artwork inside is `aria-hidden`. Never put an `sr-only` label inside an
  `aria-hidden` container — it is never read.
- Reduced motion: the artwork arrives already drawn, with a slow opacity pulse.
  Keep *something* moving.

```ts
if (reduced) {
  gsap.set("[data-outline]", { drawSVG: "100%" });
  gsap.to("[data-pulse]", { autoAlpha: 0.35, duration: 1.1,
                            repeat: -1, yoyo: true, ease: "sine.inOut" });
  return;
}
```

## Duration

| Wait | Show |
|---|---|
| under 300ms | nothing — a flashed loader is worse than none |
| 300ms–1s | a simple spinner |
| 1–5s | a loader with character; a brand moment is affordable |
| over 5s | determinate progress, or explain what is happening |

Delay the loader's own appearance by ~300ms so fast responses never flash one.

## Failures

| Symptom | Cause |
|---|---|
| Nothing moves, no error | `drawSVG` on a shape with no stroke |
| Curtain never lifts | dismissal waits on a signal with no ceiling |
| `onComplete` never fires | an infinitely repeating child |
| Stutters once per loop | an ease other than `none` on a repeat |
| Dot clipped mid-orbit | viewBox sized to the artwork, not the orbit |
| Two loaders move as one | shared hardcoded ids in plugin config |
