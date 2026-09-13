# Roadmap

Intentions, not promises. Open a discussion to argue for something, or against it.

## The plan to 4.0

Today the skill writes an animation and checks its code. The plan is for it to
compose a scene before it writes, watch what it built, refine until the evidence
is clean, and keep what it learned. The phases ship in dependency order, each on
its own, and each carries the evals that show it changes behaviour.

Three rules hold throughout:

- **Evidence over self-assessment.** Every finding, check mark or rating points
  at an audit rule, a measurement or a captured frame. What was not checked is
  reported as not checked.
- **Verified before recorded.** A claim about GSAP or browser behaviour is a
  hypothesis until a minimal repro isolates it. A wrong rule that has been
  written down is worse than none, because the next session trusts it.
- **Budgets are decided, not drifted.** SKILL.md and the React sequence tier are
  at their word limits. New behaviour goes in references loaded when needed, and
  a budget rises only on purpose, in the change that needs the room.

### 3.0.x — close the gaps the audit already claims to cover

- `tween-per-event` matches event names case-insensitively, and adds `resize`,
  `pointerrawupdate` and the JSX props `onScroll`, `onWheel` and `onTouchMove`.
  It misses all of them today.
- `eased-scrub` follows a timeline's variable when its chain starts with a label.

### 3.1 — compose before writing

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
  measured, downgrade once. The templates use the three axes.
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
    an Observer's `onMove` or `onChange`, or a `requestAnimationFrame` loop.
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

### 3.2 — watch what was built

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
  motion, motion over text being read, and mobile, and diffs the 3.1 plan
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

### 3.3 — keep what it learned

- **New scenarios** (`reference/new-pattern.md`):
  1. Name the gap: the nearest reference, and what it does not answer.
  2. Compose from what exists before inventing.
  3. Verify behaviour claims with a minimal repro, one variable at a time.
  4. Record the finding in the project's ANIMATION.md, with what it was verified
     against and how it was found. An unverified finding is not recorded.
  5. If it is general, draft the upstream issue. If it is mechanically
     detectable, draft the audit rule with its fires and quiet cases.
- **Pattern lifecycle.** A solution becomes a precedent in ANIMATION.md, a
  project pattern on its second use, and a preset only through a pull request
  with a portability check and an eval. A pattern states:
  - its concept in a sentence
  - what is fixed and what is a parameter
  - when not to use it
  - its reduced-motion branch and its failures
  - what it was verified against
- **`learn`** records a verified finding. **`patterns`** lists, extracts and
  applies the project's patterns.
- **Seed examples**, from the site intro where 3.0.0's rules were found:
  - ink laid behind a moving pen, by a mask sharing the path's duration and ease
  - an arc whose pulse and turn run at 2:3, so it never collapses in the same
    place
  - a curtain with a CSS exit
- A "new pattern" issue template.

### 4.0 — the command surface

| Group | Commands |
|---|---|
| Build | `create` — the front door, classifies the request · `design` — plan only: scene, budget, device strategy, no code · `build` — implements an approved plan through the loop · the ten domain commands, unchanged |
| Evaluate | `audit` — verdict · `inspect` — observation · `explain` — architecture |
| Refine | `tune` — timing and easing only · `strip` — removes motion · `evolve` — audit → fix → tune → extract patterns |
| Knowledge | `learn` · `patterns` |

- `evolve` has guards:
  - It needs a target, and keeps to one component or scene.
  - It shows its plan before a large change.
  - It stops after three rounds and leaves approved motion alone.
  - It extracts a pattern only on its second use.
- `animate` stays as an alias of `create` through 4.x.
- `tween-per-frame` is promoted to error.
- Each command keeps one line in SKILL.md, with its detail in its reference.

## Next

- **Published eval scores.** Run the full suite with its no-plugin baseline on
  each release, and publish the with-and-without scores in the release notes.
- **Demo recordings.** Short before-and-after captures for three flagship
  results: a scroll reveal, a card-to-panel Flip, and an SVG logo loader.
- **Community marketplace.** Submit `gsap-motion` for review.
- **Install notes for other agents.** Tested instructions for Agent Skills
  clients beyond Claude Code.

## Later

- **Checked snippets.** Extract the TypeScript blocks from the Markdown
  references and type-check them, as the templates already are.
- **Framework files in the audit.** Read the `<script>` of `.vue`, `.svelte`
  and `.astro` files.
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
- **Device detection by user agent,** or an `isMobile` flag.
