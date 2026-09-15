# Roadmap

Intentions, not promises. Open a discussion to argue for something, or against it.

## The plan to 4.0

Today the skill writes an animation and checks its code. The plan is for it to
check with an audit that has measured its own accuracy, write for the framework
the project actually uses, compose a scene before it writes, watch what it
built, refine until the evidence is clean, and keep only what it has proven. The
phases ship in dependency order, each on its own, and each carries the evals or
tests that show it changes behaviour.

Four rules hold throughout:

- **Evidence over self-assessment.** Every finding, check mark or rating points
  at an audit rule, a measurement or a captured frame. What was not checked is
  reported as not checked.
- **Verified before recorded.** A claim about GSAP or browser behaviour is a
  hypothesis until a minimal repro isolates it. A wrong rule that has been
  written down is worse than none, because the next session trusts it.
- **Budgets are decided, not drifted.** SKILL.md and the React sequence tier are
  at their word limits. New behaviour goes in references loaded when needed, and
  a budget rises only on purpose, in the change that needs the room.
- **Deterministic work needs no agent.** Anything that takes no judgement ships
  as a command that runs on its own — `audit` and `audit-svg` today, then
  `inspect` and `patterns check` — and the skill calls that command instead of
  doing the work in a prompt. Writing the animation is the one part only an
  agent can do.

### 3.0.x — close the gaps the audit already claims to cover

- `tween-per-event` reads the event from a listener's first argument and from a
  JSX prop, not from a substring anywhere in the file, and adds `resize`,
  `pointerrawupdate` and the JSX props `onScroll`, `onWheel` and `onTouchMove`.
  It misses all of them today.
- `eased-scrub` follows a timeline's variable when its chain starts with a label.
- These fixtures become part of the regression suite 3.1 is checked against.

### 3.1 — an audit you can trust

The audit reads braces and regular expressions, and the README's Limitations say
so. Every rule after this phase is written once, on a syntax tree.

- **A parser.** Chosen by measurement against the fixture suite — size, speed,
  and TypeScript and JSX coverage — between `@babel/parser`, `acorn` with a
  TypeScript plugin, and oxc's WebAssembly build. It is bundled, so the audit
  still installs nothing and depends on nothing at run time. Its size counts
  against it: the skill folder is copied into every project that installs it.
- **Parity before replacement.** Every rule's fires and quiet cases pass on both
  engines before the old one is deleted. A finding that changes between them is
  either proved false, and becomes a fixture, or is a bug in the new engine.
- **Calls followed within a file.** A helper that only a `useGSAP` body calls
  counts as inside it. A call into another file is reported as not followed,
  never guessed.
- **One set of rules, two entry points.** Rules are written against ESTree and
  run from the CLI and from an ESLint plugin. The plugin runs the audit's own
  parser inside ESLint rather than reading the project parser's tree, so the
  editor and the CLI report the same findings on the same lines. Findings appear
  in the editor and in any lint pipeline, with no agent involved.
- **Measured precision.**
  - A public corpus of real GSAP projects, each pinned to a commit.
  - Every finding labelled true or false by hand. Precision per rule is
    published in the README and in each release's notes.
  - A false finding becomes a fixture before it is fixed. A missed failure found
    by hand becomes one too. Recall is not published: misses nobody found
    cannot be counted.
  - An error-level rule below 95% precision drops to warn until it is fixed.
- The README's Limitations are rewritten from what the corpus shows.

### 3.2 — framework adapters

Lifecycle guidance is three files today: `react-nextjs.md`, `frameworks.md` for
everything else, and `three-r3f.md`. A Vite React app pays for Server Component
sections it cannot use, and a Vue project reads past Svelte and Astro to find
its own.

- **`adapter/`, one file per stack:** `react`, `next`, `vue`, `svelte`, `astro`,
  `vanilla`, `three` and `r3f`. They replace the three files. An adapter is a
  file, not a folder, until it has a template CI can type-check.
- **Picked from `package.json`, and composed.**
  - `next` loads `react` and `next`.
  - `@react-three/fiber` loads `react` and `r3f`. `three` alone loads `three`.
  - `nuxt` loads `vue`. `astro` loads `astro`, plus the adapter of an island
    being animated.
  - Nothing detected loads `vanilla`.
  - Setup step 3 names the adapters instead of branching on `react`, and
    `doctor` prints which ones a project gets.
- **One contract.** Every adapter answers the same questions under the same
  headings, and a test checks the headings: where an animation is created, where
  it is torn down, scope, server rendering and hydration, reaching the element,
  values that change every frame, route transitions, failures, what the audit
  covers, and the versions it was verified against.
- **What each carries.**
  - `react`: `useGSAP`, `gsap.context`, `contextSafe`, refs instead of state,
    StrictMode's double invoke, and which cleanup the context already owns.
  - `next`: the client boundary as a leaf and its price, module scope during
    server rendering, hydration, App Router route transitions, and `next/image`
    — which element moves under `fill`, a reveal that waits for load, and
    whether hiding the LCP image delays LCP. That last one is a behaviour claim,
    verified before it is written.
  - `r3f`: `useFrame` for values that follow the clock and GSAP for transitions
    between states, refs, one timeline orchestrating camera, uniforms and
    objects, no React state per frame, `frameloop="demand"` with `invalidate()`,
    and disposal.
  - `three`: the renderer's loop and disposal, on the vanilla lifecycle.
  - `vue`, `svelte`, `astro` and `vanilla`: today's sections of `frameworks.md`,
    each with its own server-rendering and page-swap rules.
- **Budgets.** Next's component tier — SKILL.md, `motion-design.md`, `react` and
  `next` — stays under today's 4,000 words. Every other stack loads less. The
  budget test gains a tier per stack.
- **The audit follows the adapters.**
  - It reads the `<script>` of `.vue`, `.svelte` and `.astro` files, with
    offsets kept so reported lines stay right.
  - Lifecycle rules learn each adapter's teardown: a context made in `onMounted`
    with no revert in `onUnmounted`, an Astro one with no `astro:before-swap`.
  - `useFrame` is a per-frame scope, so `state-per-event` fires for React state
    set inside it.
- **Freshness per adapter.** `check-freshness.mjs` reads each adapter's verified
  versions — `next`, `vue`, `svelte`, `astro`, `three`, `@react-three/fiber` —
  not only the two keys in SKILL.md.
- **Evals.**
  - `outcome-vue-lifecycle`, `outcome-astro-swap`, `outcome-r3f-camera` and
    `outcome-next-image-reveal`.
  - `outcome-react-lifecycle` gains a Vite variant, which must not add
    `"use client"`.
  - A load case per stack, graded on which references the trace shows were read.

### 3.3 — compose before writing

- **Scene and beats** (`reference/timeline.md`). A scene is a set of named beats
  — entrance, emphasis (at most one), pause, exit — and each beat is a label in
  the code. A beat that is more than one tween is a function returning its own
  timeline. An ambient loop is handed off after the scene with `.call()`, never
  added inside it. The Output format's numbered beats become those labels, and
  `template/useTimeline.ts` becomes a small labelled scene.
- **Technique ladder and motion budget.**
  - `motion-design.md`: CSS transition → one transform tween → timeline →
    plugin → scroll takeover. Each rung up says why the one below is not enough.
  - `project-rules.md`: an ANIMATION.md section for a perceptual budget — moving
    groups at once, visible loops, scroll-bound and pointer effects per viewport
    — and plugins per route. Going over is allowed, with a stated reason.
  - The precedent step inventories a route's existing motion before adding to it.
- **Device strategy** (`reference/devices.md`). Three independent axes, instead
  of a width breakpoint standing in for a device:
  - layout, from the viewport
  - input, from `hover` and `pointer`
  - motion tier, from preferences and capability

  The device changes a beat's technique, never the scene's story: each beat
  declares a full, a light and a static version. Only device-sensitive
  techniques branch. Start from a safe default and enhance; if capability is
  measured, downgrade once. Each adapter says where the axes can be read without
  a hydration mismatch. The templates use the three axes.
- **Refinement loop, minimum version** (`reference/refine.md`).
  - generate → audit → fix → re-run every check → tune → final.
  - Fixes go in a fixed order: lifecycle and correctness, accessibility,
    performance, composition, rhythm.
  - A behaviour claim behind a fix is verified before the fix.
  - Stop when the checks are clean, or after three rounds with what remains
    reported. Leave what works alone. Depth scales with the size of the request.
  - The Output format gains a Verification section: one line per attempt, with
    its evidence.
- **Audit on write.** A plugin `PostToolUse` hook runs `audit-gsap` on an
  animation file after it is edited and hands the findings back, so the loop's
  first step does not depend on memory. Confirm the plugin hook contract against
  current Claude Code documentation first.
- **Rules.**
  - `tween-per-frame` (warn): a tween created in `onUpdate`, `gsap.ticker.add`,
    an Observer's `onMove` or `onChange`, R3F's `useFrame`, or a
    `requestAnimationFrame` loop.
  - `paint-property` (warn): `filter`, `backdropFilter`, `boxShadow`, `clipPath`.
  - `unowned-loop` (info): a `repeat: -1` with nothing that pauses it.
  - `ungated-hover` (warn): a pointer-driven tween with no `(hover: hover)` gate.
  - `delay-chain` (warn): three or more tweens sequenced by `delay` in one scope.
- **Evals.**
  - `outcome-hero-scene`: labelled beats, the loop outside the scene, no delay
    chain.
  - `outcome-busy-page`: replaces or declines rather than adds.
  - `outcome-scroll-progress`: no tween inside `onUpdate`.
  - `outcome-device-hero`: a hover gate; mobile replaced rather than scaled.
  - A loop ablation, and `outcome-no-churn`: a correct animation, where the
    expected change is none.

### 3.4 — watch what was built

- **`inspect`**, backed by `scripts/capture-motion.mjs`: zero dependencies, over
  the Chrome DevTools Protocol, so it works when no browser tool is available or
  one is busy. It observes and gives no verdicts:
  - a filmstrip at given times
  - the observed timeline, from `gsap.globalTimeline.getChildren()`
  - frame gaps, and layout and style recalculations from
    `Performance.getMetrics`
  - `--reduced`, `--dark`, `--mobile` and `--cpu=4`
- **`explain`**: a read-only map of the scene tree, beats, triggers, device
  branches and lifecycle.
  - What the code does is extracted from the running page when a URL is given,
    and statically — marked approximate — when not.
  - Why it does it comes from comments, ANIMATION.md or history, or is marked
    inferred.
  - Every check mark cites the rule or measurement behind it.
- **Visual audit**, as `audit`'s second phase. It checks hierarchy order, time
  to first motion, beat overlap, loop seams by frame diff, repetition, area in
  motion, motion over text being read, and mobile, and diffs the 3.3 plan
  against the observed timeline. Deterministic dimensions report pass or fail
  with findings. Judgement dimensions — composition, rhythm, visual quality —
  report good, concern or problem, each with a time and a frame. This is
  evidence for a reviewer, not an audit rule about taste.
- **Performance, measured.** Layout per frame and long tasks under CPU
  throttling confirm or dismiss what the static rules suspect.
- The refinement loop gains its visual stage. Without a browser, it reports that
  stage as not run.
- **Evals:** one planted defect per checklist item — a seam, a slideshow, a slow
  start — graded on whether it is reported with its evidence.

### 3.5 — keep only what it has proven

Learning is not autonomous. Nothing the skill writes becomes guidance by having
been written: a bad pattern loaded as guidance repeats in every session after
it.

- **New scenarios** (`reference/new-pattern.md`):
  1. Name the gap: the nearest reference, and what it does not answer.
  2. Compose from what exists before inventing.
  3. Verify behaviour claims with a minimal repro, one variable at a time.
  4. Offer the finding as an `experimental` entry, with what it was verified
     against and how it was found. An unverified finding is not offered.
  5. If it is general, draft the upstream issue. If it is mechanically
     detectable, draft the audit rule with its fires and quiet cases.
- **Maturity.** Every entry in a new Patterns section of ANIMATION.md carries a
  status, and the status decides how it is loaded:

  | Status | Reached when | Loaded as |
  |---|---|---|
  | `experimental` | Built for one request, its claims verified, the audit clean. Offered in the answer, not written. | Nothing |
  | `candidate` | The user accepts it into ANIMATION.md. That is its first use. | An option to mention, never a default |
  | `validated` | Used successfully again — twice in all by default, a project can raise it — in a different component, each use recorded with its file, commit and a clean audit, plus `inspect` evidence where a browser was available. No open failure. | The house way, unless the request gives a reason not to |
  | `canonical` | A named person has reviewed it | A precedent, followed like the house motion language |

- **Who moves it.**
  - The skill offers entries and proposes promotions with their evidence. It
    never changes a status on its own.
  - `candidate` needs the user's yes.
  - `validated` is computed by `patterns check` from the recorded uses, never
    asserted.
  - `canonical` needs a reviewer's name: the project's owner for a project
    pattern, or a pull request with a portability check and an eval for an
    upstream preset.
- **Moving down,** on evidence too.
  - A finding or a bug traced to a pattern returns it to `candidate`, with the
    failure recorded.
  - A GSAP or framework release past its verified versions marks it for
    re-verification. It stays loaded, marked.
  - A disproved pattern becomes `retired`, kept with its reason so it is not
    reinvented, and loaded only as a warning.
  - A use that was later reverted does not count.
- **A pattern states:**
  - its concept in a sentence
  - what is fixed and what is a parameter
  - when not to use it
  - its reduced-motion branch and its failures
  - what it was verified against
  - its status, its uses, and who reviewed it
- **`patterns check`** validates the section in lint: the fields each status
  needs, the uses behind `validated`, the reviewer behind `canonical`, and stale
  verified versions.
- **`learn`** writes a verified finding as a `candidate`, once the user agrees.
  **`patterns`** lists by status, extracts and applies — `validated` and
  `canonical` by default, a `candidate` only when named.
- **Seed examples** enter as `candidate` — verified, with one use each — from the
  site intro where 3.0.0's rules were found:
  - ink laid behind a moving pen, by a mask sharing the path's duration and ease
  - an arc whose pulse and turn run at 2:3, so it never collapses in the same
    place
  - a curtain with a CSS exit
- A "new pattern" issue template, for proposing a project's `canonical` pattern
  as an upstream preset.
- **Evals.**
  - `outcome-offers-not-writes`: after a successful build, the skill offers an
    entry and writes nothing unasked.
  - `outcome-candidate-not-default`: a fitting `candidate` exists. It is
    mentioned, and the house language is followed.
  - `outcome-retired-warns`: a request that matches a retired pattern gets the
    warning and its reason.

### 4.0 — the command surface

| Group | Commands |
|---|---|
| Build | `create` — the front door, classifies the request · `design` — plan only: scene, budget, device strategy, no code · `build` — implements an approved plan through the loop · the ten domain commands, unchanged |
| Evaluate | `audit` — verdict · `inspect` — observation · `explain` — architecture |
| Refine | `tune` — timing and easing only · `strip` — removes motion · `evolve` — audit → fix → tune → offer patterns |
| Knowledge | `learn` · `patterns` |

- `evolve` has guards:
  - It needs a target, and keeps to one component or scene.
  - It shows its plan before a large change.
  - It stops after three rounds and leaves approved motion alone.
  - It offers at most an `experimental` entry, and never changes a status.
- `animate` stays as an alias of `create` through 4.x.
- `tween-per-frame` is promoted to error, once its corpus precision clears 3.1's
  bar.
- Each command keeps one line in SKILL.md, with its detail in its reference.

## Next

The project is young and has one maintainer, so nobody should have to take it on
trust. These make the evidence public.

- **Published scores.** Each release's notes carry the eval suite's scores with
  and without the plugin, and the audit's precision per rule on the 3.1 corpus.
- **Demo recordings.** Short before-and-after captures for three flagship
  results: a scroll reveal, a card-to-panel Flip, and an SVG logo loader.
- **Community marketplace.** Submit `gsap-motion` for review.
- **Other agents, checked.** Install notes per client — Cursor, Codex, Copilot,
  Gemini CLI — each with the release it was last checked on.
- **An MCP server.** `audit`, `audit-svg`, `inspect` and `patterns check` as
  tools, for clients that speak MCP but not Agent Skills.
- **First contributions.** False findings from the corpus filed as "good first
  rule" issues. Each comes with its fixture, so the change is small and the test
  says when it is done.

## Later

- **Checked snippets.** Extract the TypeScript blocks from the Markdown
  references and adapters and type-check them, as the templates already are.
- **Images and media.** A reference for image, video and canvas animation, and a
  micro-interactions preset.
- **Model-release tracking.** Re-run the evals on a schedule, with the model
  pinned, and chart the scores across model releases.
- **A calibrated motion score.** Numbers per dimension, only after evals show a
  model's ratings agree with human ratings of reference animations, and with
  themselves across runs.

## Not planned

- **Audit rules about taste.** Rhythm and easing are not mechanically decidable,
  and a checker that guesses at them buries the findings that are real.
- **Bundling GSAP.** It is installed from npm under its own licence.
- **A `motion` command prefix.** Motion is also the name of another animation
  library, and the plugin already namespaces the commands.
- **A `simplify` command.** Claude Code has a built-in `/simplify`; `strip` and
  `tune` cover the ground.
- **An `analyze` command.** It is `explain` plus `audit`.
- **Fixed structural limits,** such as a maximum number of timelines. A timeline
  is code structure, not perceived cost.
- **A composition engine or DSL compiled to GSAP.** A timeline with labels is
  the engine, and a wrapper would hide GSAP from debugging, ScrollTrigger, Flip
  and matchMedia.
- **The skill editing its own files.** An installed copy is shared across
  projects and replaced on update. What it learns goes to the project, and
  upstream by pull request.
- **Promotion without a person.** A use count can make a pattern `validated`,
  but only a named reviewer makes it `canonical`, and the skill changes no status
  by itself.
- **Device detection by user agent,** or an `isMobile` flag.
