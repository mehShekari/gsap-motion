# Cinematic

"Make it feel cinematic" is a request about **pacing**, not about effects. The
techniques below are ordinary; what makes them cinematic is that one thing
happens at a time, each beat is given room, and nothing is rushed.

A worked example, with the code that matters:
[example/cinematic-intro.md](../example/cinematic-intro.md).

## What the word means

| Cinematic | Not cinematic |
|---|---|
| one thing moving at a time | six things arriving together |
| 0.8–1.6s beats | 300ms beats |
| `power3.inOut`, `expo.out` | `back.out`, `elastic` |
| holds between beats | continuous motion |
| slow reveal of one subject | a grid of cards staggering in |
| dark, contrasty, generous space | busy layout |

The most common failure is treating it as "add more motion". Cinematic is
usually **less** motion, held longer.

## Structure

Three acts, and the hold is not optional — it is where the weight comes from.

```text
establish → the subject arrives alone, slowly
develop   → supporting elements enter, each given its own beat
hold      → everything settles; nothing moves for 300–600ms
release   → the interface returns, or the scene hands over
```

## Site intro

```ts
const tl = gsap.timeline({
  defaults: { ease: "power3.out" },
  onComplete: finish,
});

tl.addLabel("establish")
  .fromTo("[data-mark-outline]", { drawSVG: "0%" },
          { drawSVG: "100%", duration: 1.2, stagger: 0.14, ease: "power2.inOut" })
  .to("[data-mark-fill]", { autoAlpha: 1, duration: 0.5 }, "-=0.5")
  .to("[data-mark-outline]", { autoAlpha: 0, duration: 0.35 }, "<0.15")

  .addLabel("develop")
  .from("[data-word-line]", { yPercent: 110, duration: 0.9, stagger: 0.08 }, "develop")

  .addLabel("hold")
  .to({}, { duration: 0.5 })

  .addLabel("release")
  .to("[data-curtain]", { yPercent: -100, duration: 0.9, ease: "power4.inOut" });
```

Labels rather than offsets: a cinematic sequence gets retimed many times, and
labels are what survive that.

## Curtain lift

The release beat. A wipe reads more deliberate than a fade.

```ts
.to(curtain, { yPercent: -100, duration: 0.9, ease: "power4.inOut" })
.from(content, { yPercent: 8, autoAlpha: 0, duration: 0.9 }, "<0.15");
```

The content lagging slightly behind the curtain is what makes it feel revealed
rather than switched.

## Letterbox

Two bars closing in, then opening. Cheap and unmistakably filmic — but it is a
strong gesture, so once per site.

```ts
gsap.from("[data-bar]", { scaleY: 0, transformOrigin: "top", duration: 0.6 });
```

## Camera language

Real depth comes from layers moving at different rates. The subject barely
moves; the background does.

```ts
tl.from("[data-bg]",      { scale: 1.15, duration: 2.4, ease: "power2.out" })
  .from("[data-mid]",     { scale: 1.08, duration: 2.4, ease: "power2.out" }, "<")
  .from("[data-subject]", { scale: 1.02, autoAlpha: 0, duration: 1.6 }, "<0.3");
```

Same direction, different magnitudes. A slow push-in on the background under a
still subject is the single most effective cinematic device available in CSS.

## Ceiling

An unskippable intro must have a hard time limit, and dismissal must be a
**race** rather than a sequence:

```ts
let done = false;
const finish = () => { if (done) return; done = true; onDone(); };
const ceiling = window.setTimeout(finish, 4200);
return () => window.clearTimeout(ceiling);
```

Keep the total under ~3s. Play it once per session, not once per route — an
intro on every navigation is an obstacle. Render the page underneath the whole
time so a JavaScript failure cannot trap the visitor behind a curtain.

## Reduced motion

Cinematic motion is the most likely thing on a page to cause discomfort: large
travel, scaling, unrequested, unskippable. Give the composed final frame and a
shorter hold.

```ts
if (reduced) {
  gsap.set("[data-mark-outline]", { autoAlpha: 0 });
  gsap.set(["[data-mark-fill]", "[data-word-line]"], { autoAlpha: 1, yPercent: 0 });
  gsap.delayedCall(0.9, finish);
  return;
}
```

Note the second `gsap.set`: a `from` tween that never runs leaves its target at
the authored start — invisible. The reduced branch must set the end state, not
just skip the motion.

## Tuning

| Feels | Change |
|---|---|
| rushed | lengthen the holds before lengthening the beats |
| sluggish | overlap more; keep the durations |
| cheap | `power3.inOut` instead of `power1`; remove any overshoot |
| busy | cut elements until one carries each beat |
| like a slideshow | overlap at 60–70%, and add the hold |
