# ScrollTrigger

Scroll position as a trigger or as a playhead. The difference between those two
is the first decision.

```ts
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
```

## Trigger or playhead

| Want | Use | Ease |
|---|---|---|
| Play once when it comes into view | no `scrub` | normal easing |
| Motion tied to scroll position | `scrub: true` | **`ease: "none"`** |
| Motion tied to scroll, slightly lagged | `scrub: 1` | `none` |

`scrub` makes the scrollbar the playhead. Easing inside a scrubbed timeline
fights the visitor's own scrolling and reads as lag — use `none` on every child
and let `scrub: 1` provide the smoothing.

## The config that matters

```ts
ScrollTrigger.create({
  trigger: section,
  start: "top 80%",     // trigger's top hits 80% down the viewport
  end: "bottom 20%",
  scrub: 1,             // true = locked, number = seconds of catch-up
  pin: true,
  anticipatePin: 1,     // reduces the flicker when pinning at speed
  snap: { snapTo: 1 / 4, duration: 0.4, ease: "power2.inOut" },
  markers: process.env.NODE_ENV === "development",
  invalidateOnRefresh: true,
  toggleActions: "play none none reverse",
});
```

`start` / `end` read as `"<trigger edge> <viewport position>"`. Both accept
`"top"`, `"center"`, `"bottom"`, a percentage, or a px offset — and `end` also
accepts `"+=800"`, meaning "800px of scrolling after the start", which is what
you want for a pinned sequence.

`toggleActions` is four states in order: **onEnter, onLeave, onEnterBack,
onLeaveBack**. `"play none none reverse"` is the usual reveal. `"play none none
none"` plays once and never again.

## One trigger, many elements

The most common mistake is one ScrollTrigger per card. If a group belongs to one
visual moment, it is one trigger with a staggered timeline:

```ts
// Wrong — 40 triggers, 40 sets of scroll maths
cards.forEach((card) =>
  gsap.from(card, { y: 40, scrollTrigger: { trigger: card } }),
);

// Right — one trigger, one timeline
gsap.from("[data-card]", {
  y: 40,
  autoAlpha: 0,
  stagger: 0.06,
  scrollTrigger: { trigger: grid, start: "top 75%" },
});
```

Per-item triggers are correct when items are genuinely far apart and reveal
independently. For a grid on one screen they are not.

## Pinning

`pin` holds the element while the page scrolls past its `end`. The scroll
distance is what you are really authoring:

```ts
gsap.timeline({
  scrollTrigger: {
    trigger: section,
    start: "top top",
    end: "+=2000",        // 2000px of scroll drives the sequence
    pin: true,
    scrub: 1,
  },
})
  .to(a, { autoAlpha: 1 })
  .to(b, { autoAlpha: 1 });
```

Things that bite:

- **A pinned element cannot be inside a container with `overflow: hidden`** on
  the scroll axis. This is the usual cause of "pin does nothing".
- Pin adds a wrapper and a spacer to the DOM. Sibling selectors and
  `:first-child` break.
- `position: sticky` is cheaper and needs no plugin. Use it when you only need
  the element to stay put, not to drive a timeline.

## Horizontal scroll

A vertical scroll driving a horizontal translation. `xPercent` avoids measuring:

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
    snap: 1 / (panels.length - 1),
    invalidateOnRefresh: true,
  },
});
```

`end` as a function is re-evaluated on refresh, which is what keeps it right
after a resize. In RTL the direction inverts — see
[project-rules.md](project-rules.md).

Horizontal scroll costs the visitor their scroll intuition. Use it when the
content is genuinely a sequence, not to be interesting.

## Refresh

ScrollTrigger measures once and caches. Anything that changes layout after that
invalidates the measurement.

```ts
ScrollTrigger.refresh();   // after fonts, images, accordions, route changes
```

- `invalidateOnRefresh: true` recomputes tween start values too, which is what
  you want when a `from` depends on measured size.
- Images without dimensions are the usual cause of triggers drifting: the page
  grows after measurement. Give them width/height or an aspect ratio.
- Web fonts shift text height on load. Refresh after `document.fonts.ready`.

## Velocity

Scroll speed as an input — a cheap way to make a section feel responsive:

```ts
const skew = gsap.quickTo("[data-card]", "skewY", { duration: 0.6, ease: "power3" });

ScrollTrigger.create({
  onUpdate: (self) => skew(gsap.utils.clamp(-12, 12, self.getVelocity() / -250)),
});
```

`getVelocity()` is px/sec and signed. Clamp it — unclamped it produces absurd
values on a flick.

## ScrollSmoother

Free, and a large commitment: it takes over the scroll container, which
interferes with `position: fixed`, anchor links, and native scroll on some
touch devices. Do not add it to make a reveal smoother — fix the reveal. Add it
only when the whole page is designed around smoothed scrolling.

## React

The lifecycle is the hard part. `useGSAP` reverts its context on unmount, which
kills ScrollTriggers created inside it. Anything created outside must be killed
by hand:

```ts
useGSAP(() => {
  gsap.to(el, { scrollTrigger: { ... } });   // reverted automatically
}, { scope: root });
```

After a route change in the App Router, the new page's layout is measured before
images settle. `ScrollTrigger.refresh()` on mount is usually needed. See
[react.md](../adapter/react.md).

## Failures

| Symptom | Cause |
|---|---|
| Nothing happens | `trigger` element not in the DOM when created |
| Pin does nothing | an ancestor has `overflow: hidden` |
| Triggers fire at wrong positions | layout changed after measurement — refresh |
| Scrubbed motion feels laggy | easing inside a scrubbed timeline |
| Janky while scrolling | layout-triggering properties — see [performance](performance.md) |
| Works, then breaks after navigation | ScrollTriggers not killed on unmount |
| Wrong on mobile after address-bar hide | viewport resize — `invalidateOnRefresh` |
