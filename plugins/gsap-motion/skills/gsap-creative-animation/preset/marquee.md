# Marquee and ambient

Continuous motion. The engineering problem is the seam: a loop whose restart is
visible is worse than no loop at all.

## Seamless marquee

Duplicate the content, translate by exactly one copy's width, reset. Because the
two copies are identical, the reset is a jump between identical frames.

```tsx
<div className="overflow-hidden">
  <div ref={trackRef} className="flex w-max">
    <div data-copy className="flex shrink-0">{items}</div>
    <div data-copy className="flex shrink-0" aria-hidden="true">{items}</div>
  </div>
</div>
```

```ts
useGSAP(() => {
  const copy = trackRef.current?.querySelector<HTMLElement>("[data-copy]");
  if (!copy) return;

  const loop = gsap.to(trackRef.current, {
    x: () => -copy.offsetWidth,
    duration: copy.offsetWidth / 60,     // px per second, not a fixed time
    ease: "none",
    repeat: -1,
  });

  /** Re-reads the width after a resize or a font load. */
  const ro = new ResizeObserver(() => loop.invalidate());
  ro.observe(copy);

  return () => ro.disconnect();
}, { scope: trackRef });
```

Three things that are all load-bearing:

- **`ease: "none"`.** Any other ease decelerates into the restart and the seam
  becomes visible.
- **`x` as a function.** It is re-evaluated on `invalidate()`, which is what
  survives a resize. A fixed number goes wrong the moment the layout changes.
- **Duration derived from width.** A fixed duration means a long list scrolls
  fast and a short one crawls. Pick a speed in px/sec and divide.

The second copy is `aria-hidden` — a screen reader should hear the list once.

### RTL

A marquee has a handedness, so a right-to-left page needs a decision. Either
mirror it, or pin the direction deliberately and say why:

```ts
const isRtl = document.documentElement.dir === "rtl";
x: () => (isRtl ? copy.offsetWidth : -copy.offsetWidth);
```

Logos and product shots usually read better pinned to one direction in both
locales. If the project lints for logical CSS, that pin needs its waiver
comment, carrying the reason — see [project-rules.md](../reference/project-rules.md).

### Pausing

WCAG 2.2.2: anything moving for more than five seconds needs a way to stop it.
Pause on hover and on focus-within:

```ts
el.addEventListener("pointerenter", () => loop.timeScale(0.2));
el.addEventListener("pointerleave", () => loop.timeScale(1));
el.addEventListener("focusin", () => loop.pause());
el.addEventListener("focusout", () => loop.resume());
```

Slowing rather than stopping on hover keeps it alive while making a logo
readable. Focus must actually stop it — a keyboard user cannot chase a moving
link.

## Scroll-reactive speed

Ties the marquee to the page and costs almost nothing:

```ts
ScrollTrigger.create({
  onUpdate: (self) => {
    loop.timeScale(gsap.utils.clamp(0.4, 3, 1 + Math.abs(self.getVelocity()) / 1500));
    // Direction follows the scroll:
    loop.reversed(self.direction === -1);
  },
});
```

Clamp it — unclamped velocity produces absurd values on a flick.

## Ambient float

Background motion under static content. The rule is **irregularity**: identical
periods read as mechanical.

```ts
gsap.utils.toArray<HTMLElement>("[data-float]").forEach((el, i) => {
  gsap.to(el, {
    y: gsap.utils.random(-14, -26),
    x: gsap.utils.random(-8, 8),
    duration: gsap.utils.random(3.5, 6),
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    delay: i * 0.3,
  });
});
```

`sine.inOut` is the breath ease — it has no hard stop at either end.
`yoyo: true` reverses rather than resetting, so there is no seam to hide.

Keep the distance small. Ambient motion is felt, not watched; if the visitor can
track it, it is too much.

## Orbit

An element circling a point. Rotating a wrapper is cheaper than a motion path
when the route is a circle:

```tsx
<div data-orbit className="absolute inset-0">
  <div className="absolute start-1/2 top-0 size-2 rounded-full" />
</div>
```

```ts
gsap.to("[data-orbit]", { rotation: 360, duration: 8, ease: "none", repeat: -1 });
```

Use MotionPath only when the route is not a circle — see
[svg.md](../reference/svg.md).

## Breathing

```ts
gsap.to("[data-pulse]", {
  scale: 1.04,
  autoAlpha: 0.85,
  duration: 2.2,
  repeat: -1,
  yoyo: true,
  ease: "sine.inOut",
});
```

Two seconds is roughly resting breath and reads as calm. Under a second reads as
urgency — correct for a recording indicator, wrong for a background.

## Cost

Continuous animation never stops, so it is the one category where cost
compounds. Only `transform` and `opacity`. Pause anything off-screen:

```ts
ScrollTrigger.create({
  trigger: section,
  onToggle: (self) => (self.isActive ? loop.resume() : loop.pause()),
});
```

A dozen paused timelines cost nothing; a dozen running ones on a phone do.

## Reduced motion

Ambient motion is unrequested and continuous — exactly what the preference is
for. Stop it entirely and leave the composition static; nothing is lost, because
ambient motion carries no information by definition.

A marquee is different: it may be the only way to see the whole list. Keep the
content reachable — make it a scrollable row rather than a moving one.
