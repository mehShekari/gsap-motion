# Card stack

Cards that arrive from a pile, stack as you scroll, or reflow on filter. Three
different stories — pick the one the content actually tells.

## Deal in

A pile that spreads into place. Says "these belong together" before showing what
they are.

```ts
gsap.timeline({
  defaults: { duration: 0.8, ease: "power3.out" },
  scrollTrigger: { trigger: grid, start: "top 70%" },
})
  .from("[data-card]", {
    y: 60,
    scale: 0.92,
    rotation: () => gsap.utils.random(-6, 6),
    autoAlpha: 0,
    stagger: { amount: 0.5, from: "center" },
  });
```

`rotation` as a function is evaluated per element, so each card gets its own
angle. `stagger: { amount }` keeps twelve cards inside half a second —
`each: 0.08` would take nearly a second of nothing happening.

Keep the rotation under ~8°. Beyond that it reads as a mess rather than a
shuffle.

## Stacking on scroll

Cards pin and pile up as the visitor scrolls — one shared trigger, each card
offset. This is the "Apple pricing page" pattern.

```ts
const cards = gsap.utils.toArray<HTMLElement>("[data-card]");

cards.forEach((card, i) => {
  gsap.to(card, {
    scale: 1 - (cards.length - i) * 0.03,
    y: i * 12,
    ease: "none",
    scrollTrigger: {
      trigger: card,
      start: "top 20%",
      end: "bottom 20%",
      scrub: 1,
      pin: true,
      pinSpacing: false,
      invalidateOnRefresh: true,
    },
  });
});

// The card itself must stick:
// .card { position: sticky; top: 5vh; }
```

`pinSpacing: false` is what lets the cards overlap instead of each reserving its
own scroll height. This is the rare case where **one trigger per card is
correct** — each pins independently.

The scale is what creates depth: the card behind must read as further away, or
the stack looks like a rendering bug.

## Explode out

Reverse of deal-in, for an exit or a filter change.

```ts
gsap.to("[data-card]", {
  y: () => gsap.utils.random(-120, 120),
  x: () => gsap.utils.random(-80, 80),
  rotation: () => gsap.utils.random(-25, 25),
  autoAlpha: 0,
  scale: 0.85,
  duration: 0.6,
  ease: "power2.in",
  stagger: { amount: 0.25, from: "center" },
});
```

`power2.in` for an exit — it gathers speed as it leaves, where `out` would make
it drift.

## Reflow on filter

Use Flip. Hand-computing positions here is exactly the work Flip exists to
remove — see [flip.md](../reference/flip.md).

```ts
const state = Flip.getState(cards);
cards.forEach((el) => {
  el.style.display = matches(el) ? "" : "none";
});
Flip.from(state, {
  duration: 0.5,
  scale: true,
  absolute: true,
  ease: "power2.inOut",
  stagger: 0.03,
  onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, scale: 0.9 },
                                      { autoAlpha: 1, scale: 1 }),
  onLeave: (els) => gsap.to(els, { autoAlpha: 0, scale: 0.9 }),
});
```

`absolute: true` or the surviving cards jitter as the grid reflows under them.

## Hover lift

Small and immediate. The shadow is what sells the lift — a card that moves
without its shadow changing looks like it slid, not rose.

```ts
const lift = gsap.timeline({ paused: true })
  .to(card, { y: -6, duration: 0.3, ease: "power2.out" })
  .to(card, { boxShadow: "var(--shadow-lifted)", duration: 0.3 }, "<");
```

`box-shadow` repaints. For a grid of many cards, cross-fade two stacked shadow
layers with `opacity` instead.

## Tilt

Pointer-driven rotation on the card's own axes:

```ts
const rx = gsap.quickTo(card, "rotationX", { duration: 0.5, ease: "power3" });
const ry = gsap.quickTo(card, "rotationY", { duration: 0.5, ease: "power3" });

const onMove = (e: PointerEvent) => {
  const r = card.getBoundingClientRect();
  rx((0.5 - (e.clientY - r.top) / r.height) * 12);
  ry(((e.clientX - r.left) / r.width - 0.5) * 12);
};
```

Needs `perspective` on the parent, or the rotation is a flat squash:

```css
.grid { perspective: 1000px; }
.card { transform-style: preserve-3d; }
```

Keep it under ~15°. Gate on `(hover: hover)` — see
[interaction.md](../reference/interaction.md).

## Reduced motion

Set the end state and keep the hover affordances as instant state changes:

```ts
if (reduced) {
  gsap.set("[data-card]", { autoAlpha: 1, y: 0, scale: 1, rotation: 0 });
  return;
}
```

For the stacking variant, drop the pin entirely — pinned scroll-scrubbing is
precisely the vestibular trigger. Let the cards flow normally.

## Choosing

| Content | Pattern |
|---|---|
| A set that arrives together | deal in |
| A sequence the visitor walks through | stacking on scroll |
| A filterable collection | Flip reflow |
| A gallery | reveal + hover lift |

If the cards are a list of links, none of this. A list of links wants a fast
stagger and nothing else.
