# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](CONTRIBUTING.md#versioning).

## [Unreleased]

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

## [2.1.0] - 2026-09-13

The first public release. Earlier versions were developed privately, inside a
production website.

### Added

- Packaged as the `gsap-motion` Claude Code plugin, with a marketplace.
- The `gsap-motion` npm package: `npx gsap-motion add`, `remove`, `audit`,
  `audit-svg` and `doctor`, with no dependencies and no install scripts, and a
  release workflow that publishes it with provenance.
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

[Unreleased]: https://github.com/mehShekari/gsap-motion/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/mehShekari/gsap-motion/releases/tag/v2.1.0
