# Refining

Writing the animation is the first draft. This is what turns it into something
worth shipping, and it is mostly checking rather than writing.

```text
generate → audit → fix → re-run every check → tune → final
```

The loop matters because the failures this skill exists to catch are silent: the
code compiles, the page looks right in a demo, and the leak shows up three
navigations later. Nothing downstream will tell you. So the check is part of
writing, not something done afterwards if there is time.

## Audit first, and mean it

Run `audit-gsap` on the file you just wrote, before reading it yourself. It
costs a second, it is deterministic, and it finds the mechanical failures so
your attention goes to the ones it cannot see.

With the plugin installed, a hook does this automatically after every edit and
hands the findings back — see the Tools section of SKILL.md. Without it, run the
script.

A finding you believe is wrong is a bug in the script. Report it; do not work
around it with a waiver.

When what the code says and what the page does disagree, `explain-motion.mjs`
reads both: the file's map, or — given a URL — the timeline GSAP actually built.

## Fix in this order

The order is not taste. A fix further down the list can be undone by a fix
further up it, so doing them in this order avoids fixing the same thing twice.

1. **Lifecycle and correctness** — does it clean up, does it run once, does it
   target what you think it targets.
2. **Accessibility** — the reduced-motion design, focus order, anything the
   motion hides from a keyboard.
3. **Performance** — layout and paint properties, per-frame allocation, work
   that scales with the number of items.
4. **Composition** — beats, hierarchy, what happens at the same time.
5. **Rhythm** — durations, eases, overlap. Last, because everything above
   changes it.

## Verify a claim before you fix

When a fix rests on a claim about how something behaves — "`clearProps` runs
after the plugin's last write", "this element is the one that moves under
`fill`" — check it before writing the fix. A minimal reproduction, one variable
at a time, and read what actually happened in the DOM.

A fix built on a guess usually works by accident, and the comment above it is
then wrong for everyone who reads it next.

## Watch it, when you can

A checker reads code. It cannot see a seam, a slideshow, or a hero that starts
so late the visitor has already scrolled past it. When a browser is on the
machine, run the page:

```bash
node <skill-dir>/scripts/capture-motion.mjs http://localhost:3000 --at 0,300,900
```

It reports a filmstrip, the timeline GSAP is actually running — which is not
always the one in the source — and the layouts, style recalculations and frames
the browser did. All observations; the judgement is yours.

Reach the state first, and change the conditions that usually break things:

- `--scroll <px|selector>`, `--hover <selector>`, `--click <selector>` run in
  the order written, before the first capture. A hover effect or a mid-page
  ScrollTrigger is invisible without them.
- `--reduced`, `--dark`, `--mobile`, `--cpu 4`. `--mobile` makes input touch,
  so it cannot be combined with `--hover`: a coarse pointer has no hover, which
  is the thing worth knowing.

**Without a browser, report the stage as not run.** Not "fine".

## Measure it, once you have watched it

`capture-motion.mjs` shows you frames. `review-motion.mjs` measures what the
motion did, and is where the visual stage of this loop gets its evidence:

```bash
node <skill-dir>/scripts/review-motion.mjs http://localhost:3000 --scroll 2000
```

It samples the DOM every frame rather than reading `gsap.globalTimeline`,
because a bundled app never publishes `gsap` to the page — so it works on a real
Next, Vite, Nuxt, Astro or Svelte app, and it sees CSS and Web Animations motion
that no source rule can reach.

| It says | Read it as |
| --- | --- |
| **first motion at N ms** | How long the page is still. Late enough and the visitor has scrolled past the thing you built. |
| **N elements moved, M of them GSAP's** | The gap is motion the audit never sees. A surprise there is worth chasing. |
| **X% of the screen in motion** | Everything moving at once reads as noise, not as choreography. |
| **seams** | A step far larger than that motion's own rhythm: a loop put back by hand instead of carried. |
| **motion over text** | Something painted over a line a reader is in the middle of. Hit-tested, so it is what is really on top. |

Three things it deliberately does not do, so you do not read them into it:

- **It does not report layout cost.** Reading every box every frame is what
  forces layout, so its numbers would be partly its own doing. `inspect`
  measures that without sampling; use it for cost.
- **It does not judge taste.** Composition, rhythm and whether the thing is any
  good are yours, with the filmstrip in front of you.
- **It does not report a seam a scroll caused.** Jumping the scrollbar is how it
  reaches a scene, and a scrubbed animation answers instantly and correctly.

A clean report is evidence, not proof: it watched one window, on one machine, at
one size. Say which.

## When to stop

Stop when every check is clean, or after **three rounds**, reporting what is
left.

Three is not a budget to spend. Most changes are right after one. Stopping on a
number matters for the case where a fix keeps moving the problem: the third
round is where you say what is still wrong and why, rather than trying a fourth
shape of the same idea.

**Leave what works alone.** The loop is for the animation you were asked about.
Retiming a neighbouring section because you noticed it is churn: it costs review
attention, it risks a regression nobody asked for, and it is exactly what the
`outcome-no-churn` eval measures.

**Depth scales with the request.** A hover retime does not need a composition
pass. A site intro does.

## Report what you checked

The answer's **Verification** section is one line per check, with its evidence:

```text
Verification
- audit-gsap: clean (3 warns waived: layout-property on the grid, with reasons)
- review: first motion 410ms, 38% of the screen at its busiest, no seams,
  nothing over text (1280x800, one 3s window)
- reduced motion: emulated, the static branch sets the end state
- StrictMode: mounted twice in dev, no doubled tweens
- not checked: frame cost on a real phone — no device to hand
```

Say what you did not check, too. "Not checked" is information; silence reads as
"checked and fine", and that is the one thing it must never mean.

### "Verified" names what you saw

**A check is a measurement, not a verb.** "Verified live", "tested at 390px" and
"works as expected" say that something was run; they do not say what came back,
so nobody can tell whether it would have caught the failure.

A head-to-head test made the cost concrete. An answer written with this skill
reported *"verified live, no horizontal overflow at 390px"* — and shipped two
bugs that a 390px browser shows at a glance: the visual pushed below the fold,
and a label invisible through its whole first state. Overflow was the one thing
checked, and it was not what was broken.

So a line states the value observed, at a time and a size:

| Not this | This |
|---|---|
| verified live | badge label opacity 1 at t=0 and at every state label, 1280x800 |
| works on mobile | 390x844: the visual's top edge at 96px, above the fold; no overflow |
| reduced motion handled | reduced emulated: heading and lead at end state, no tween ran |
| animation runs | `review`: first motion at 410ms; 0 elements invisible for the whole window |

**Check the failure, not the feature.** A reveal that works is easy to observe;
the failures that ship are an element that never appears, one that appears too
late, and one that is off screen at the size you did not look at. Look for those
by name. And a claim you did not observe is worse than "not checked": it tells
the reader to stop looking.
