# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](CONTRIBUTING.md#versioning).

## [Unreleased]

## [3.3.0] - 2026-09-15

Minor: five new rules — four warn, one info — a device strategy, a refinement
loop, and a hook that audits what you just wrote. Nothing reports at error level
that did not before, and two rules now report *less*, so this release cannot
fail a build that 3.2.0 passed. No eval scores: the eval suite is updated and
run once the roadmap is finished.

### Added

- Five rules. `tween-per-frame` (warn): a tween built in `onUpdate`, the ticker,
  an Observer callback, `useFrame` or a `requestAnimationFrame` loop.
  `paint-property` (warn): animating `filter`, `backdropFilter` or `boxShadow`.
  `ungated-hover` (warn): a hover animation with no `(hover: hover)` gate, which
  a tap starts and nothing ends. `delay-chain` (warn): three or more tweens in
  one scope sequenced by `delay`. `unowned-loop` (info): an infinite repeat that
  nothing pauses.
- `reference/devices.md`: layout, input and motion tier as three independent
  axes, instead of a width breakpoint standing in for a device. Each beat
  declares a full, a light and a static version; the device changes a beat's
  technique, never the scene's story.
- `reference/refine.md`: generate, audit, fix, re-run, tune — with a fixed fix
  order, a three-round stop, and "leave what works alone". An answer now ends
  with a **Verification** section: one line per check with its evidence, and what
  was not checked.
- Scene and beats in `timeline.md`: a scene is named beats, each a label, with
  at most one emphasis, and an ambient loop handed off after the scene rather
  than added inside it. The technique ladder in `routing.md`, and a motion
  budget in `project-rules.md`'s ANIMATION.md template.
- A Claude Code hook: `PostToolUse` runs the audit on every file the agent
  edits and hands the findings back, so the loop's first step does not depend on
  memory. It says nothing when a file is clean, and never blocks an edit.

### Changed

- `missing-reduced-motion` lands on the first animation a file builds itself,
  rather than the first mention of `gsap`. A file whose only GSAP calls are
  `registerPlugin`, `killTweensOf` or `set` is not animating, and neither is a
  helper that adds beats to a timeline it was handed — its caller owns that
  branch.
- `dangling-listener` no longer reports `DOMContentLoaded`, `load` or
  `pageshow`: those fire once and nobody removes them.
- Precision measured again on the same 14 projects, now that single-file
  components are read: 111 findings, every one read and labelled, all true.
  Nine rules have measured precision, against four in 3.1.0.

## [3.2.0] - 2026-09-15

Minor: lifecycle guidance is now one adapter per stack, and `unreverted-context`
is a new warn rule. No rule id, level, command or flag changed — but
`state-per-event` reads `useFrame` as a per-frame scope, so an error-level rule
catches a case it used to miss and a build that gates on errors can fail on code
that passed 3.1.1: pin the exact version. No eval scores: the eval suite is
updated and run once the roadmap is finished.

### Added

- `adapter/`, one file per stack: `react`, `next`, `vue`, `svelte`, `astro`,
  `vanilla`, `three` and `r3f`. Each answers the same questions — where an
  animation is created and torn down, scope, server rendering and hydration,
  reaching the element, values that change every frame, page and route changes,
  failures, what the audit covers, and the versions it was written against — and
  a test holds every adapter to that contract.
- Setup step 3 picks the adapter from `package.json` and composes it: `next`
  loads react and next, `@react-three/fiber` loads react and r3f, `nuxt` loads
  vue, `astro` loads astro plus the adapter of an island being animated, and a
  project with none of them loads vanilla.
- The audit reads `.vue`, `.svelte` and `.astro` files. Their `<script>` blocks
  are read as code and everything else — template, styles, Astro's server-side
  `---` frontmatter, and any `<script>` that is not JavaScript — is blanked,
  keeping every offset, so a finding's line is the line in the file.
- `unreverted-context` (warn): a `gsap.context` created in a mount hook —
  `onMounted`, `onMount`, `$effect`, `useEffect`, or an `astro:page-load`
  listener — that nothing reverts. Every adapter's teardown rule in one shape. A
  context a module hands to its caller is not reported: this file cannot see
  whether the caller tears it down.
- `gsap-motion doctor` names the adapters a project gets, read from
  `package.json` exactly as the skill reads it.
- The freshness check reads the versions each adapter names, so Next, Vue, Nuxt,
  Svelte, Astro, Three and React Three Fiber moving on is reported too, not only
  GSAP and `@gsap/react`.

### Changed

- `reference/react-nextjs.md`, `reference/frameworks.md` and
  `reference/three-r3f.md` are replaced by the adapters, and every link to them
  now points at one. Vue, Svelte, Astro, Three and R3F gained the sections they
  never had: teardown, hydration, per-frame values and route changes, each
  written for that stack.
- The context budget has a tier per stack. Next's component tier costs about
  4,100 words, against 3,873 before, because it is the one stack that loads two
  adapters; every other stack falls to between 2,980 and 3,300. The component
  budget is 4,150 and the largest build tier 5,200.
- `state-per-event` reads React Three Fiber's `useFrame` callback as a per-frame
  scope, so React state set inside it is reported. It is an error-level rule
  catching a case it used to miss, so a build that gates on errors can fail on
  code that passed 3.1.1: pin the exact version.

## [3.1.1] - 2026-09-15

Patch: no rule id, level, command or flag changed, and the command line reports
what 3.1.0 reported. The audit's rules also run as an ESLint plugin, a new
package that starts at this version and moves in lockstep with the command
line. No eval scores: the eval suite is updated and run once the roadmap is
finished.

### Added

- `@mehshekari/eslint-plugin-gsap-motion`, a new npm package from
  `packages/eslint-plugin`: the 16 audit rules and `not-parsed` as ESLint rules,
  for ESLint 9 and 10 with flat config, and a `recommended` config at the
  audit's levels. Each rule runs the audit's own rule on the audit's own parse
  of the file, so the editor and `gsap-motion audit` report the same findings on
  the same lines, and a waiver means the same in both. Its version moves in
  lockstep with the command line's.
- In ESLint, `unregistered-plugin` takes a `registered` option naming plugins
  registered in another file, because ESLint reads one file at a time.
- Every rule has a `description`, which ESLint shows. A test holds it to the
  rule's row in both READMEs.
- CI: an `eslint` job runs the plugin's tests on ESLint 9 with Node 18 and on
  ESLint 10 with Node 24, then installs the packed plugin into an empty project
  and lints a file there. Its parity test runs every fixture of the audit's rule
  tests through ESLint and compares each finding's rule, line, column and
  message.

### Changed

- What happens to one file — skipping a file that never mentions GSAP,
  `not-parsed`, waivers, line and column — moved from `audit-gsap.mjs` into
  `scripts/lib/audit.mjs`, which both entry points run. `source.mjs` gains
  `fromText`, which reads a file from text already in memory.

### Fixed

- The README's Limitations still said precision per rule was not published; it
  has been since 3.1.0. SECURITY.md still listed 2.x as the supported version.
- `check-pack` failed on npm 12, which prints `npm pack --json` as an object
  keyed by package name rather than an array. It reads both.

## [3.1.0] - 2026-09-14

Minor: no rule id, level, command or flag changed. The audit now reads a syntax
tree, `not-parsed` is a new info finding, and precision per rule is measured on
a corpus of public projects and published in the README. Some rules report cases
they used to miss — `unmanaged-instance` now includes `ScrollTrigger.create` — so
a build that gates on errors can fail on code that passed 3.0.1: pin the exact
version. No eval scores: the eval suite is updated and run once the roadmap is
finished.

### Added

- A JavaScript and TypeScript parser for the audit: acorn 8.18.0 with
  @sveltejs/acorn-typescript 1.0.13, bundled into `scripts/lib/vendor/parser.mjs`
  by `scripts/vendor-parser.mjs` from exact pinned versions. The audit still
  installs nothing and runs on Node 18. No rule reads it yet; the rules move onto
  it group by group. The npm package grows to about 487 kB unpacked, and
  `check-pack` now fails above 600 kB.
- CI: a `vendor` job regenerates the parser and fails if the committed file
  differs from its pinned sources.
- `not-parsed` (info): a file that uses GSAP and does not parse is reported as
  not checked, with the parser's line, instead of being skipped.
- Measured precision: a corpus of 14 public GSAP projects pinned to commits,
  every finding labelled with a reason, and `scripts/corpus.mjs` to fetch, audit
  and report. The README publishes precision per rule.

### Changed

- The audit reads a syntax tree instead of matching text. Every rule was moved
  onto the tree with the old engine running beside it, and both had to agree on
  every fixture, and on the example app, the templates and a real Next.js site,
  before the text engine was deleted. Messages, levels, waivers, `--json` and
  exit codes are unchanged.
- A helper function counts as inside a context when every use of it is a call
  from inside one, so the audit follows calls within a file.

### Fixed

What the text engine got wrong and the tree gets right:

- `orphan-tween` no longer reports a helper called only from `useGSAP`, an
  aliased `useGSAP` or `contextSafe`, or a module-scope tween after an arrow.
- `unmanaged-instance` reports `ScrollTrigger.create` outside a context.
- `layout-property` and `eased-loop` read timeline children and a `fromTo`'s
  to-vars, no longer read an unrelated object after `gsap.timeline()`, and
  report a key a `fromTo` names twice once.
- `trigger-per-item` reads `for`, `for…of` and `for…in`, and no longer reads the
  block after `.map(fn)`.
- `tween-per-event` follows a handler passed by name.
- `never-completes` and `eased-scrub` follow a timeline kept on `this`.
- `shared-plugin-id` reads a fixed id in a template literal and the `motionPath`
  and `morphSVG` string shorthands.
- `unregistered-plugin` reads a plugin's default import.
- `missing-reduced-motion` is no longer silenced by a comment after a quote in a
  regular expression or a plural possessive.

What the corpus showed was wrong, measured on real projects — 33 of the first
80 findings:

- `orphan-tween` and `unmanaged-instance` no longer report a value torn down by
  hand: kept under a name that is killed, reverted or finished with
  `progress(1)`, directly or through a helper that returns it.
- `unregistered-plugin` counts a registration anywhere in the audited files,
  because registration is global.
- `layout-property` skips `gsap.set`, which animates nothing.
- `tween-per-event` skips a tween inside a completion callback, or behind an
  in-flight flag the handler raises first.
- `state-per-event` skips a setter called with a constant: React skips the
  render once the value is unchanged.
- `dangling-listener` skips a target the code creates, and outside React
  reports only listeners on the window and the document.

## [3.0.1] - 2026-09-14

A patch: no rule id, level, command or flag changed. Two error-level rules now
report cases they used to miss, so a build that gates on the audit can fail on
code that passed 3.0.0 — pin the exact version, as the README advises.

### Fixed

- `tween-per-event` reads the event from a listener's first argument, in any
  quote style, and from a JSX prop, instead of a substring anywhere in the file.
  It now reports `resize`, `pointerrawupdate`, `onScroll`, `onWheel`,
  `onTouchMove` and expression-bodied handlers, and no longer reads the next
  function as the body of a handler passed by name. A debounced handler —
  wrapped in `debounce(…)`, or a `setTimeout` it clears first — is not reported.
- `state-per-event` reads handlers the same way but leaves `resize` out: a width
  kept in state decides what exists, not a frame of motion. A member call such as
  `el.style.setProperty(…)`, and `setTimeout`, are no longer read as state
  setters.
- `eased-scrub` follows a timeline's variable when its chain opens with a label,
  reads that variable only up to its next declaration, and leaves
  `scrub: false` alone.
- An apostrophe in JSX text, as in `Don't`, no longer inverts every string and
  comment after it. A comment could survive stripping, and a `useGSAP` span
  could run past its parenthesis and report `orphan-tween` errors inside it.
- The README says 16 audit rules, as there are, and a test keeps the number true.
- Known wrong findings that need a parser, and the probe cases for the rules 3.3
  adds, are kept as skipped test fixtures.

## [3.0.0] - 2026-09-13

Major because `never-completes` is a new error-level audit rule: a project that
gates its build on the audit can fail on code that passed 2.1.0. No command,
rule id or flag was renamed or removed.

### Added

- `never-completes`, an error-level audit rule: an `onComplete` that can never
  run, on a timeline holding a `repeat: -1` child or on a tween or timeline that
  repeats forever. The guidance had described this failure since 2.1.0, and a
  site intro still shipped with it, waiting for its ceiling on every visit. A
  new error-level rule makes the next release a major version.
- `late-transform-origin`, a warn-level audit rule: a `fromTo` whose transform
  origin is only in its to-vars while its from-vars scale, rotate or skew. On an
  SVG element `smoothOrigin` then leaves it offset, silently. It warns rather
  than errors because the audit cannot tell an SVG target from an HTML one.
- `reference/svg.md` explains when an SVG transform origin has to be set, with
  the offsets measured in gsap 3.15; `reference/core-gsap.md` points to it.
- Eval: `outcome-curtain-css-exit`, whether an intro curtain gets an exit that
  needs no JavaScript and leaves hit-testing.
- Eval: `outcome-svg-origin-in-from`, whether a `fromTo` that scales an SVG
  element puts its transform origin in the from-vars. With the origin only in
  the to-vars, `smoothOrigin` leaves the element offset by the origin's distance
  from its own top-left corner × (1 − starting scale) — a whole radius for a
  circle grown from nothing — silently. Verified in gsap 3.15.0 in Chrome; HTML
  elements are unaffected.

### Changed

- When a simpler technique does what the user asked for, the skill writes only
  the simpler one and offers the requested version in a sentence. The first
  eval pilot caught it shipping both.
- References load by the size of the request: a one-element change loads
  `motion-design.md` and the command's own reference only.
- A whole page or site with nothing in it named counts as no target, so the
  skill asks what should move instead of inventing an animation.
- Evals: `outcome-marquee-loop` also checks for `useGSAP` and an RTL decision,
  and `outcome-asks-for-target` gives a real page with no target named.

### Fixed

- The loader and cinematic guidance said rendering the page underneath keeps a
  visitor whose JavaScript fails from a permanent curtain. It does not: a
  server-rendered curtain is exactly what that visitor gets.
  `preset/cinematic.md` now gives the curtain a CSS exit, verified in Chrome to
  win over GSAP's inline styles.
- `reference/svg.md` still referred to the colour rule of the project the skill
  was developed in. The portability test missed it because the phrase wrapped
  across a line; it now collapses whitespace before matching.

## [2.1.0] - 2026-09-13

The first public release. Earlier versions were developed privately, inside a
production website.

### Added

- Packaged as the `gsap-motion` Claude Code plugin, with a marketplace.
- The `@mehshekari/gsap-motion` npm package: `npx @mehshekari/gsap-motion add`,
  `remove`, `audit`, `audit-svg` and `doctor`, with no dependencies and no
  install scripts, and a release workflow that publishes it with provenance.
- `reference/frameworks.md`: the animation lifecycle in vanilla JavaScript, Vue
  and Nuxt, Svelte and Astro.
- 70 tests for the skill: each audit rule shown to fire and to stay quiet, both
  command-line scripts, the frontmatter against the Agent Skills specification,
  a context budget, links and portability.
- Eval cases for `claude plugin eval`: triggering, not triggering, and outcomes.
- An example Next.js app that builds the templates and passes the audit.
- `audit-svg.mjs --hues`, reporting hue literals for projects whose colours must
  come from tokens.
- `LICENSE`, `NOTICE.md` on GSAP's separate licence, and the project's
  contributing, security and conduct documents.
- Continuous integration on Node 18, 20, 22 and 24, and a weekly check for new
  GSAP releases.

### Changed

- The skill no longer assumes any particular project. It reads the project's
  own `ANIMATION.md` first, and `reference/project-rules.md` explains what to
  derive when there is none.
- SKILL.md loads less: project rules only when a project has no rules file, and
  React guidance only for React projects. A typical React task loads under 5,000
  words, down from about 6,400.
- Frontmatter follows the Agent Skills specification: `version` moved under
  `metadata`, `compatibility` added, and the Claude Code-only `argument-hint` and
  `user-invocable` removed.
- `audit-gsap.mjs` resolves paths from the directory it is run in, so it works
  wherever the skill is installed.
- `audit-svg.mjs` no longer reports hue literals unless asked with `--hues`.
- The worked examples carry their code inline, rather than linking to one
  project's files.

### Fixed

- `unmanaged-instance` was silenced by any `.kill()` or `.revert()` anywhere in
  the file.
- `dangling-listener` compared counts, so it missed inline handlers and removals
  for the wrong event, and flagged listeners cleaned up by `signal` or `once`.
- `eased-scrub` missed an eased tween inside a scrubbed timeline — chained on,
  added through the timeline's variable, or set in its `defaults`.
- `unregistered-plugin` treated any mention after `registerPlugin` as
  registration, and flagged plugins registered under an alias.
- `orphan-tween` exempted tweens in arrow-function handlers, and misread the
  scope of a bodiless `useGSAP()` and of an expression-bodied `contextSafe`.
- The site intro example claimed a trailing tween lets a timeline with an
  endless child complete. It does not; the example now hands over with `.call()`.
- The date GSAP became free: version 3.13, in April 2025.

[Unreleased]: https://github.com/mehShekari/gsap-motion/compare/v3.3.0...HEAD
[3.3.0]: https://github.com/mehShekari/gsap-motion/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/mehShekari/gsap-motion/compare/v3.1.1...v3.2.0
[3.1.1]: https://github.com/mehShekari/gsap-motion/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/mehShekari/gsap-motion/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/mehShekari/gsap-motion/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/mehShekari/gsap-motion/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/mehShekari/gsap-motion/releases/tag/v2.1.0
