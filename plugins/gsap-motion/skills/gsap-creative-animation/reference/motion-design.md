# Motion design

The craft half. Read this when an animation compiles, runs, and still feels
wrong — the fix is almost always here rather than in the API.

## What motion is for

Every animation earns its place by answering one of five questions. If it
answers none, delete it.

| It says | Example |
|---|---|
| **Hierarchy** — what matters | the heading arrives before the byline |
| **Causality** — this caused that | the panel grows out of the button that opened it |
| **Continuity** — it is the same thing | the thumbnail becomes the hero image |
| **State** — something changed | the row settles into place after saving |
| **Personality** — who this brand is | the mark writes itself rather than fading in |

"It looked empty" is not one of them.

## Duration

Numbers people actually perceive, not a scale copied from a blog post.

| Range | Reads as | Use for |
|---|---|---|
| 80–150ms | instant | hover, focus, toggle, press |
| 200–300ms | responsive | dropdowns, tooltips, small reveals |
| 350–500ms | deliberate | modals, panels, section reveals |
| 600–900ms | considered | hero entrances, page transitions |
| 1s+ | a performance | intros, loaders, scroll-scrubbed sequences |

Two rules bend all of these. **Distance buys time**: something crossing the
viewport may take three times as long as the same element moving 20px. And
**exits are faster than entrances** — usually 60–70% — because the visitor has
already decided and is waiting.

## Easing

The single biggest lever on how motion feels, and the one most often left at the
default.

| Ease | Feel | Use |
|---|---|---|
| `power2.out` | quick start, soft landing | the default for entrances |
| `power3.out` / `power4.out` | sharper, more expensive-feeling | see intents |
| `power2.in` | gathers then leaves | exits |
| `power2.inOut` | symmetric | moves between two resting states |
| `none` | mechanical, constant | **anything looping**, scrub, marquee |
| `back.out(1.4)` | overshoot | playful — never two at once |
| `elastic.out(1, 0.4)` | wobble | rarely; reads as a toy |
| `sine.inOut` | gentle breath | ambient loops |
| `expo.out` | dramatic arrival | one hero moment |

Two failures worth naming. **An ease other than `none` on a repeating tween**
puts a visible stutter at the seam — the loop decelerates into its own restart.
And **`inOut` on an entrance** makes it feel like it is being pushed rather than
arriving; entrances want `out`.

A house ease beats a stock one. `CustomEase` is free:

```ts
CustomEase.create("brand", "M0,0 C0.16,1 0.3,1 1,1");
```

## Rhythm

Stagger is where amateur motion shows. The wrong value makes a list look either
simultaneous or like a queue.

- **0.03–0.06s** — a wave. Reads as one gesture across many items.
- **0.08–0.12s** — countable. The eye tracks each item. Best for 3–6 items.
- **0.15s+** — a sequence of separate events. Only for a handful.

For more than about eight items, stagger a *total* rather than a per-item gap,
so twelve cards do not take four seconds:

```ts
stagger: { amount: 0.6, from: "start" }   // 0.6s total, however many items
stagger: { each: 0.08 }                   // 0.08s apart, grows without limit
```

`from: "center"` and `from: "edges"` change the story: centre-out reads as
radiating, start-to-end reads as reading order. In RTL, "reading order" is
`from: "end"` — see [project-rules.md](project-rules.md).

## Overlap

Sequential beats look like a slideshow. Overlap is where an animation stops
feeling like a list of steps.

```ts
tl.to(a, { ... })
  .to(b, { ... }, "-=0.3")   // b starts before a finishes
  .to(c, { ... }, "<")       // c starts with b
  .to(d, { ... }, "<0.15");  // d starts 0.15s after b started
```

A useful default: the next beat starts at **60–75%** of the previous one. Full
sequence only when the second thing is genuinely *caused* by the first
finishing.

## The principles that matter here

- **Weight** — a large or heavy-looking element should move slower and ease
  harder than a small one. Same duration on a hero image and a caption reads as
  a bug.
- **Anticipation** — a small counter-move before the main one: 80–120ms, on one
  element, not a group.
- **Follow-through** — elements should not all stop at once. A 0.05s offset on
  the last beat is the difference between mechanical and alive.
- **Contrast** — fast against slow is what creates emphasis. If everything moves
  at 400ms, nothing is emphasised.
- **Restraint** — the most premium-feeling motion is usually one or two things
  moving well, not six things moving at all.

Technique is chosen on a ladder — transition, tween, timeline, plugin, scroll
takeover — in [routing.md](routing.md).

## Reading a request

A feeling resolves to values from the tables above. **Say them in Analysis**: a
reviewer can argue with a reading, not with code.

| Intent | Duration | Ease | At once | Deliberately still |
|---|---|---|---|---|
| cinematic | 600–900ms, 1s+ for one hero beat | `power3.out`, `expo.out` once | one | the background |
| premium | 350–500ms | `power3.out`, no overshoot | few | anything that would bounce |
| playful | 200–350ms | `back.out(1.4)`, one element | few | every second overshoot |
| alive | 1s+, looping | `sine.inOut`, `none` | ambient only | the content itself |
| technical | 200–500ms | `none`, `power2.out`, stepped | a grid, together | curves |
| organic | 600–900ms, overlapping | `sine.inOut`, soft | several | straight lines |

**They compose, one column at a time.** "Cinematic but fast" keeps the ease and
the one-at-a-time, and moves down a duration band. [routing.md](routing.md)
reads the common adjustments.

## Validation

Before calling an animation done:

- Does it say one of the five things at the top of this file?
- Is the rhythm intentional, or are the delays arbitrary?
- Does anything looping use `ease: "none"`?
- Is the seam of the loop invisible?
- Do entrances use `out` easing and exits `in`?
- Does one element carry the emphasis, rather than all of them?
- Does it still read at 400px wide, and on a touch device with no hover?
- Does the reduced-motion branch still communicate the same thing?
- Is everything reverted on unmount?
- Is every plugin justified, and would a transform have done it?
- Watch it five times. Does anything start to irritate?
