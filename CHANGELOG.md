# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](CONTRIBUTING.md#versioning).

## [Unreleased]

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

[Unreleased]: https://github.com/mehShekari/gsap-motion/compare/v3.0.1...HEAD
[3.0.1]: https://github.com/mehShekari/gsap-motion/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/mehShekari/gsap-motion/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/mehShekari/gsap-motion/releases/tag/v2.1.0
