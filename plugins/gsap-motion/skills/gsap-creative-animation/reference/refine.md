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
- reduced motion: emulated, the static branch sets the end state
- StrictMode: mounted twice in dev, no doubled tweens
- not checked: frame cost on a real phone — no device to hand
```

Say what you did not check, too. "Not checked" is information; silence reads as
"checked and fine", and that is the one thing it must never mean.
