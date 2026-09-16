# Accessibility

Reduced motion is the part people get wrong, and they get it wrong in the same
way: they treat it as an off switch.

## Reduced motion is a design

`prefers-reduced-motion: reduce` is set by people who get motion sickness,
vertigo, or migraines from movement — and by people who simply find it
distracting. Vestibular triggers are specific: **large travel, parallax,
zooming, spinning, and anything the visitor did not initiate.** A cross-fade is
usually fine. A modal scaling from 0.96 to 1 is usually fine.

So the question is never "animate or not". It is: *what was this motion saying,
and how do I say it without the travel?*

| Full | Reduced | Why |
|---|---|---|
| Section slides up 60px and fades | fades over 200ms | the arrival still reads |
| Logo draws itself over 1.2s | appears drawn, holds | the brand moment survives |
| Loader spins | pulses opacity gently | "still working" is the message |
| Parallax layers | static, correctly composed | parallax says nothing essential |
| Scroll-scrubbed sequence | each state on entry, no scrub | the content still arrives |
| Card lifts and scales on hover | border and shadow change | the affordance is what matters |
| Page transition wipe | instant swap | it was continuity decoration |

**A loader with nothing moving reads as a page that has hung** — which is the
one thing a loader exists to rule out. Keep a gentle opacity pulse.

## Implementing it

`gsap.matchMedia` handles the preference *changing mid-session*, which a plain
check does not:

```ts
const mm = gsap.matchMedia();

mm.add(
  {
    motion: "(prefers-reduced-motion: no-preference)",
    reduced: "(prefers-reduced-motion: reduce)",
  },
  (context) => {
    const { reduced } = context.conditions as Record<string, boolean>;

    if (reduced) {
      gsap.set("[data-item]", { autoAlpha: 1, y: 0 });
      return;
    }

    gsap.from("[data-item]", { y: 60, autoAlpha: 0, stagger: 0.06 });
  },
);

```

**Both conditions are required, and dropping `motion` breaks everything.** The
callback runs only while at least one named condition matches. With `reduced`
alone, a visitor who has no preference — nearly all of them — matches nothing,
so the callback never runs and **the page ships with no animation at all**,
silently: no error, and every test with reduced motion on still passes. The
audit reports it as `matchmedia-never-runs`.

A reduced-only `add` is still correct when it does not branch — the shape below
is GSAP's own, and each callback is meant to run only for its own visitors:

```ts
mm.add("(prefers-reduced-motion: no-preference)", () => { /* the animation */ });
mm.add("(prefers-reduced-motion: reduce)", () => { /* the end states */ });
```

Built inside a `useGSAP` body this needs no explicit teardown — `matchMedia`
registers with the active context and is reverted with it.

Everything built in the losing branch is reverted when the preference flips.
Without `matchMedia`, a visitor who turns reduced motion on mid-session keeps
the animation they asked to stop.

**The reduced branch must still set the end state.** A `from` tween that never
runs leaves the element at its authored start — invisible. This is the most
common reduced-motion bug, and it hides content rather than just skipping
motion.

## Announcement

- A loader that blocks content: `role="status"` and an accessible name. It
  announces politely without stealing focus.
- Decorative artwork: `aria-hidden="true"`, and make sure nothing inside it is
  focusable.
- **Never both.** An `sr-only` label inside an `aria-hidden` container is never
  read — it is dead markup.
- An overlay covering the page: the content beneath is still in the accessibility
  tree. For a transient splash that is the right outcome — the visitor reaches
  the content immediately. For a modal it is not, and you need `inert` or
  `aria-modal` with focus management.

## Focus

- Never destroy the focus ring. A transform that moves an element out from under
  its outline, or an `overflow: hidden` ancestor clipping it mid-animation, both
  count.
- Hover and focus should produce the same visual state. An effect that only
  exists on `:hover` is invisible to a keyboard.
- An animation must not move a focused element out of the viewport.
- If an animation reveals interactive content, it must not be focusable before
  it is visible. `autoAlpha` handles this; plain `opacity` does not.

## Timing

- Nothing essential should depend on motion. If the animation is the only thing
  that says "saved", that is a failure for anyone who cannot see it.
- Anything auto-playing for longer than 5 seconds and looping needs a way to
  stop it — WCAG 2.2.2. A marquee of logos qualifies.
- Do not delay content the visitor came for behind an entrance. An intro that
  cannot be skipped needs a hard time ceiling, and dismissal should be a race
  against that ceiling rather than a sequence that can hang.

## Flashing

Nothing should flash more than three times per second — WCAG 2.3.1. Rapid
opacity or colour cycling, scramble effects at high speed, and strobing hover
states all get close.

## Touch

- Gate hover effects on `(hover: hover) and (pointer: fine)`. On touch,
  `:hover` sticks after a tap and the state never clears.
- A cursor follower on a touch device is dead weight sitting in a corner.
- Anything that only responds to drag needs a keyboard path to the same outcome.

## A marker that means "current"

A pill, underline or tint whose *position* says which tab, section or page is
current is a user-interface component, not decoration. WCAG 1.4.11 asks 3:1
against what it sits on. Motion makes a marker easy to notice while it travels;
at rest it has to be readable without that.

Brand fills rarely manage it on a light ground. `#FFD400` on white is 1.43:1,
and the soft brand tints are lower still. That does not rule a tint out — it
rules out the tint being the **only** thing that says "current". Carry the
state twice more:

- **In the label.** The current item keeps a colour that meets text contrast
  even while the marker has moved off to follow the pointer.
- **In `aria-current`.** `page` for a route, `location` for a section inside
  the page being read. This is the part that survives with no eyes on it.

## Checklist

- Is there a reduced-motion branch, and does it still communicate?
- Does the reduced branch set the end state, not just skip the tween?
- Is `matchMedia` used, so a mid-session change is honoured?
- Is the artwork either announced or hidden — and not both?
- Does hover have a focus equivalent?
- Is the focus ring intact throughout?
- Can a long loop be stopped?
- Does anything essential exist only as motion?
- Does a "current" marker reach 3:1 — or is the state also in the label and `aria-current`?
