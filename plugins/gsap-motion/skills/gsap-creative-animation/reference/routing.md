# Routing

What to load, and what to do when the request is a feeling rather than a
command.

## No argument

Do not guess a target and do not invent an animation. Ask what should move, and
offer the menu below — grouped, so the question is easy to answer.

> What are we animating?
>
> - **Entrance** — something appearing: a hero, a section, a list, an image
> - **Scroll** — something driven by scroll position: a sequence, a pin, a
>   horizontal run
> - **Interaction** — something answering the pointer: a button, a cursor, a
>   card
> - **Continuous** — something always moving: a marquee, an orbit, ambient drift
> - **Transition** — moving between two states: a route, a modal, a layout
> - **Loading** — a loader, a progress indicator, a site intro
> - **Existing** — something already animated that feels wrong, costs too much,
>   or should go

## Classifying a description

Most requests are a feeling, not a command. Classify, then route.

**A named feeling routes here, and resolves to values** in
[motion-design](motion-design.md)'s *Reading a request* — duration, ease, how
many move at once, and what stays still. They compose, so a request that names
two is not a coin toss.

| What they say | Route to |
|---|---|
| "make it cinematic" | `intro` · [cinematic](../preset/cinematic.md) |
| "make it feel premium" | `tune` · [motion-design](motion-design.md) |
| "make it feel alive" | `ambient` · [marquee](../preset/marquee.md) |
| "futuristic / technical" | `text` + `svg` |
| "liquid / organic" | `svg` · [loader](../preset/loader.md) |
| "like Apple" | `scroll` · [scroll-storytelling](../preset/scroll-storytelling.md) |

**A diagnosis is not a feeling**, and routes on what is actually wrong:

| What they say | What it usually is | Route to |
|---|---|---|
| "make it pop / bolder" | contrast in timing, not more elements moving | `tune` |
| "the hero is boring" | a hierarchy problem before a motion problem | `tune`, then `reveal` |
| "it feels janky" | cost or trigger | `audit` · [performance](performance.md) |
| "smooth image reveal" | clip-path or mask, not opacity | [reveal](../preset/reveal.md) |
| "something crazy" | layered techniques, one clear concept | see below |
| "smoother" | longer and softer — or a cost problem, so check which | `tune`, or `audit` |
| "snappier" | shorter, less stagger | `tune` |
| "subtle" | less distance, before less duration | `tune` |
| "it feels cheap" | linear easing, or one uniform duration | `tune` |
| "it feels slow" | usually too sequential, not too long: try overlap | `tune` |

### "Something crazy"

A fade-and-scale is a failure of nerve; twelve techniques at once is a failure
of taste. Pick **one concept** and let three techniques serve it. The concept is
the thing you can say in a sentence — "the logo writes itself, then the dot that
drew it runs off and writes the word" — and every technique either serves that
sentence or is cut.

## The technique ladder

Start at the bottom, and each rung up says why the one below is not enough:

1. **A CSS transition** — one property, one state change, no sequencing.
2. **One transform tween** — it needs an ease or a duration CSS cannot say.
3. **A timeline** — two or more things must be ordered or overlapped.
4. **A plugin** — the shape needs it: draw, morph, path, split. Its weight ships
   to every visitor.
5. **A scroll takeover** — the scroll position *is* the story. It takes the
   visitor's control of the page, so it needs the strongest reason of all.

Say the rung in Analysis: "a transition would not sequence these, so this is a
timeline". A plugin named without that sentence is one nobody justified.

## Load map

The project's own rules come first, then the size tiers in SKILL.md, setup step
3: a one-element change loads [motion-design](motion-design.md) and the
command's own reference only. The table applies from component size up — a
single hover takes [interaction](interaction.md) and nothing else from its row.

| Request | Add |
|---|---|
| SVG draw / morph / path | [svg](svg.md), [timeline](timeline.md) |
| Scroll sequence, pin, scrub | [scrolltrigger](scrolltrigger.md), [timeline](timeline.md), [performance](performance.md) |
| Horizontal scroll | [scrolltrigger](scrolltrigger.md), [scroll-storytelling](../preset/scroll-storytelling.md) |
| Text reveal, kinetic type | [text](text.md), [timeline](timeline.md) |
| Magnetic, cursor, hover | [interaction](interaction.md), [performance](performance.md) |
| Drag, flick, inertia | [interaction](interaction.md) |
| Layout / shared element / modal | [flip](flip.md) |
| Page or route transition | [flip](flip.md), [page-transition](../preset/page-transition.md), this project's adapter |
| Loader, splash, intro | [svg](svg.md), [timeline](timeline.md), [accessibility](accessibility.md) |
| Marquee, orbit, ambient | [timeline](timeline.md), [performance](performance.md) |
| Three.js / R3F | [three](../adapter/three.md) or [r3f](../adapter/r3f.md), [performance](performance.md) |
| Audit an existing animation | [performance](performance.md), [accessibility](accessibility.md), this project's adapter |
| Retime / re-ease | [motion-design](motion-design.md) only |
| Hover, touch or reduced-motion branching | [devices](devices.md) |
| Fixing what an audit found | [refine](refine.md) |

Do not load a domain file "for completeness". Loading `adapter/three.md` for a
button hover is the failure this map exists to prevent.

## `create`, `design` and `build`

Three commands for one piece of work, separated so that the expensive part —
writing code — is not where a disagreement about the idea surfaces.

- **`create`** is the front door, and the alias `animate` still reaches it. It
  classifies the request and routes: a domain command if one fits, `design`
  first if the request is large or vague, straight to the work if it is small
  and clear. A one-element hover does not need a plan; a site intro does.
- **`design`** produces a plan and **no code**: what moves and why, the beats in
  order, the device and reduced-motion strategy, the techniques with the reason
  each is needed, and what it will cost against the project's motion budget.
  It ends by asking whether to build it. Writing code here defeats the point —
  the plan is cheap to argue with, and an implementation is not.
- **`build`** implements a plan that was approved, and needs one in hand. Given
  no plan it asks for one rather than inventing something to build; given a plan
  it follows it through the pipeline, and says plainly where it departed and
  why. A departure is not a failure — a plan meets the real markup for the first
  time during `build` — but a silent one is.

## `evolve`

Improve motion that already exists: `audit`, fix what it found, `tune` the
timing, then offer what was learned. It adds no new motion; that is `create`.

Its guards, all four of which exist because an improvement loop is the easiest
place for an assistant to do damage while feeling useful:

- **It needs a target, and keeps to one component or scene.** "Evolve the site"
  is not a request, it is an invitation to churn.
- **It shows its plan before a large change.** A retime is not a large change;
  restructuring a timeline is.
- **It stops after three rounds** and reports what is left, rather than trying a
  fourth shape of the same idea.
- **It leaves approved motion alone.** Something the project accepted is not a
  defect because this run would have done it differently.
- **It offers at most an `experimental` pattern, and never changes a status.**
  See [project-rules.md](project-rules.md): standing comes from evidence, and a
  loop that promotes its own output is the failure the maturity model exists to
  prevent.

## `audit`

**Run the checker first.** It is deterministic, it costs a second, and it finds
the mechanical failures before you spend attention on them:

```bash
node .claude/skills/gsap-creative-animation/scripts/audit-gsap.mjs <path>
```

**Read the map before reading the code.** `explain-motion.mjs` prints what a
file animates — scopes, preference branches, beats in order with the reasons
their comments give, and the scroll configuration — and cites the audit rather
than judging. Given a URL it reads the running page instead, which is the only
way to see the timeline GSAP actually built, after every branch and early
return:

```bash
node <skill-dir>/scripts/explain-motion.mjs src/hooks/useHero.ts
node <skill-dir>/scripts/explain-motion.mjs http://localhost:3000
```

**When an animation is not visible, ask whether it was ever built.** Before
touching timings or transforms, check that the code which creates it actually
runs. Animation is routinely built behind a condition — an image decode race, a
`ready.then()`, a ScrollTrigger that has not fired, a `matchMedia` branch that
does not match, an early `return` on a missing ref — and a tween that was never
created looks exactly like one that is mis-timed. A typical case: an image wipe
added only once the image decodes inside a short budget. On a first visit the
image is never cached, the branch never runs, and every hypothesis about the
wipe's geometry is wasted effort.

Then read for what it cannot see. Check in this order — the first two are where
real bugs live:

1. **Lifecycle** — is every animation inside a `useGSAP`/`gsap.context` scope?
   Are ScrollTriggers killed? Are listeners removed? Does a `matchMedia` get
   reverted? See this project's adapter.
2. **Cost** — layout-triggering properties, per-frame React state, filters on
   large areas, one ScrollTrigger per item where one would do. See
   [performance](performance.md).
3. **Reduced motion** — is there a branch, and does it still communicate?
4. **Craft** — rhythm, easing on loops, contrast. See [motion-design](motion-design.md).

Report findings most-severe first, with the file and line. Do not rewrite
unless asked.

## `strip`

Removing motion is a legitimate outcome and often the right one. Cut an
animation when it answers none of hierarchy, causality, continuity, state, or
personality; when it delays content the visitor came for; when it repeats on
every route and stopped being noticed on the second one; or when it exists
because a plugin was available.

Say what you removed and what it was costing. Do not replace it with a smaller
animation unless the user asks.
