<div align="center">

# GSAP Creative Animation

**A senior motion engineer for GSAP, packaged as an Agent Skill.**

It designs and builds production animation with your AI agent, then audits the
animation you already have for leaks, jank and accessibility failures.

[![CI](https://github.com/mehShekari/gsap-motion/actions/workflows/ci.yml/badge.svg)](https://github.com/mehShekari/gsap-motion/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/mehShekari/gsap-motion)](https://github.com/mehShekari/gsap-motion/releases)
[![npm](https://img.shields.io/npm/v/@mehshekari/gsap-motion.svg)](https://www.npmjs.com/package/@mehshekari/gsap-motion)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GSAP 3.13+](https://img.shields.io/badge/GSAP-3.13%2B-88ce02.svg)](https://gsap.com)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-spec%20valid-6b4fbb.svg)](https://agentskills.io/specification)

[Install](#install) · [Before and after](#before-and-after) ·
[Commands](#commands) · [The audit](#the-audit) · [FAQ](#faq) ·
[Contributing](CONTRIBUTING.md)

</div>

---

## Why it exists

Ask an AI agent for a scroll animation and you will usually get code that
compiles, runs, and looks right in a demo. Then it keeps running after you
navigate away, stutters on a phone, does nothing because a plugin was never
registered, and ignores visitors who asked for reduced motion. None of those
failures throws an error, so none of them gets caught.

This skill gives the agent two things it lacks:

- **Judgement.** A motion-design pipeline — intent, precedent, trigger, timeline,
  performance, accessibility — so every animation has a reason to exist, matches
  what the site already does, and has a reduced-motion design rather than an off
  switch.
- **A deterministic check.** Two dependency-free scripts that find the silent
  failures in real code, so a mistake is caught by a tool rather than by a
  visitor.

## What you get

- **14 commands**, from `reveal` and `scroll` to `audit`, `tune` and `strip`.
- **Deep references** on ScrollTrigger, Flip, SVG, text, pointer interaction,
  Three.js, performance, accessibility, React and Next.js, and other frameworks.
  They load only when a request needs them.
- **Presets and worked examples** for reveals, marquees, card stacks, loaders,
  site intros, page transitions and scroll storytelling.
- **`audit-gsap`**: 16 rules for leaks, per-frame cost, eased loops, shared
  plugin ids, unregistered plugins and shipped dev tooling.
- **`audit-svg`**: what an SVG can do before you animate it — what DrawSVG can
  draw, what MorphSVG can morph, and what will fail silently.
- **Typed templates** for a component timeline and a scroll scene, compiled in
  CI.

## Install

### Claude Code

```text
/plugin marketplace add mehShekari/gsap-motion
/plugin install gsap-motion@mehshekari
```

The skill loads by itself when a request is about animation. You can also call
it directly:

```text
/gsap-motion:gsap-creative-animation scroll the pricing cards in as they enter
```

To update, run `/plugin marketplace update mehshekari`.

### With npx

```bash
npx @mehshekari/gsap-motion add                      # this project: .claude/skills/
npx @mehshekari/gsap-motion add --global             # every project: ~/.claude/skills/
npx @mehshekari/gsap-motion add --dir <skills-dir>   # another agent's skills directory
```

Run it again after a release to update, and
`npx @mehshekari/gsap-motion doctor` to see what is installed and whether your
project's GSAP is recent enough. The cross-agent installer
[`skills`](https://github.com/vercel-labs/skills) finds this skill too:
`npx skills add mehShekari/gsap-motion`.

### Any Agent Skills client

The skill folder follows the
[Agent Skills specification](https://agentskills.io/specification) and passes its
reference validator. Copy
[`plugins/gsap-motion/skills/gsap-creative-animation`](plugins/gsap-motion/skills/gsap-creative-animation)
into your client's skills directory — for Claude Code without the plugin system,
that is `~/.claude/skills/` for yourself or `.claude/skills/` for one project.

### Requirements

GSAP 3.13 or later in your project, where every plugin is free. The audit
scripts need Node.js 18 or later and nothing else.

## Quick start

Talk to your agent the way you normally would. You do not need to name the
skill.

| You say | What happens |
| --- | --- |
| "Fade the feature cards up as they scroll into view" | `reveal`: one ScrollTrigger with a stagger, cleaned up on unmount, with a reduced-motion branch |
| "Make the hero feel more cinematic" | `animate`: it classifies the feeling — pacing, one beat at a time — before choosing any technique |
| "Pin this section and scrub three steps as I scroll" | `scroll`: a pinned timeline with `ease: "none"`, and a different strategy on phones |
| "Use MotionPath to nudge this button on hover" | It declines the plugin, explains why a transform is enough, and writes that instead |
| "Why does my scroll animation keep running after I navigate?" | `audit`: runs `audit-gsap`, then reads for lifecycle, cost and accessibility |
| "انیمیشن اسکرول برای بخش خدمات بساز" | The same skill, in Persian |

## Before and after

A typical AI-written component. It works in a demo.

```tsx
"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

export function Features({ items }: { items: string[] }) {
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    list.current?.querySelectorAll("li").forEach((item) => {
      gsap.from(item, {
        opacity: 0,
        height: 0,
        ease: "power2.out",
        scrollTrigger: { trigger: item, scrub: 1, markers: true },
      });
    });
  }, []);

  return (
    <ul ref={list}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
```

`audit-gsap` on that file — real output:

```text
Features.tsx
  ✗ 3:  `ScrollTrigger` is imported but never passed to `gsap.registerPlugin`.  [unregistered-plugin]
  ✗ 11:  `gsap.from` is created outside any useGSAP/gsap.context scope.  [orphan-tween]
  ✗ 15:  `markers: true` is unconditional.  [dev-tool-shipped]
  ! 11:  No `prefers-reduced-motion` branch in an animating file.  [missing-reduced-motion]
  ! 13:  Animating `height` forces layout on every frame.  [layout-property]
  ! 14:  Easing inside a scrubbed ScrollTrigger timeline.  [eased-scrub]
  ! 15:  A ScrollTrigger created per item in a loop.  [trigger-per-item]

3 error, 4 warn
```

Each finding also prints a one-line fix, trimmed here. The same component, the
way the skill writes it:

```tsx
"use client";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function Features({ items }: { items: string[] }) {
  const list = useRef<HTMLUListElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        ({ conditions }) => {
          if (conditions?.reduced) {
            gsap.set("[data-feature]", { autoAlpha: 1, y: 0 });
            return;
          }
          gsap.from("[data-feature]", {
            autoAlpha: 0,
            y: 24,
            duration: 0.6,
            ease: "power3.out",
            stagger: { amount: 0.4 },
            scrollTrigger: { trigger: list.current, start: "top 75%" },
          });
        },
      );
    },
    { scope: list },
  );

  return (
    <ul ref={list}>
      {items.map((item) => (
        <li key={item} data-feature>
          {item}
        </li>
      ))}
    </ul>
  );
}
```

```text
gsap-audit: clean
```

This exact component is built in CI as part of the
[example app](examples/next-app).

## Commands

| Command | What it does |
| --- | --- |
| `animate [target]` | General entry: analyse the intent, then route |
| `reveal [target]` | Entrance and in-view reveals, staggers, masks |
| `scroll [target]` | Scroll-driven sequences, pinning, scrubbing, horizontal scroll |
| `text [target]` | Kinetic typography, split reveals, scramble |
| `svg [file]` | Draw, morph and path-follow SVG timelines |
| `interact [target]` | Pointer, magnetic, cursor, drag, inertia |
| `ambient [target]` | Marquees, orbits, floating and breathing loops |
| `transition [target]` | Page, route, modal and layout transitions |
| `loader` | Loading and progress animation |
| `intro` | A site or section entry sequence |
| `three [target]` | GSAP orchestrating Three.js or React Three Fiber |
| `audit [target]` | Check existing animation for leaks, cost and accessibility |
| `tune [target]` | Retime, re-ease and fix rhythm, adding no new motion |
| `strip [target]` | Remove motion that is not earning its place |

## The audit

Run it from your project root. Paths resolve from where you run it, wherever the
skill is installed.

```bash
npx @mehshekari/gsap-motion audit                          # scans ./src
npx @mehshekari/gsap-motion audit app components --quiet   # errors only
npx @mehshekari/gsap-motion audit src --json               # for scripts and CI
```

It needs no install, and exits `1` when there is an error-level finding, so it
can gate a build. Pin the version, so a new rule cannot fail your build without
warning:

```json
"lint": "eslint && npx @mehshekari/gsap-motion@3.0.1 audit src --quiet"
```

Or install it with `npm install --save-dev --save-exact @mehshekari/gsap-motion`;
the command it adds is `gsap-motion`, so the script becomes
`eslint && gsap-motion audit src --quiet`.

With the skill installed, the same scripts are in its folder:
`node <skill-dir>/scripts/audit-gsap.mjs`.

| Rule | Level | Catches |
| --- | --- | --- |
| `orphan-tween` | error | A tween created outside `useGSAP`, `gsap.context` or `contextSafe` in React — never reverted, and doubled by StrictMode |
| `unmanaged-instance` | error | `matchMedia`, `Observer`, `Draggable`, `ScrollSmoother` or `SplitText` created outside a context and never torn down |
| `tween-per-event` | error | A new tween allocated on every pointer, scroll or wheel event |
| `state-per-event` | error | React state set in a high-frequency handler — a re-render per frame |
| `shared-plugin-id` | error | A hardcoded `#id` in MotionPath or MorphSVG config, which two instances of a component will share |
| `unregistered-plugin` | error | A plugin imported and never registered, whose properties are silently ignored |
| `never-completes` | error | An `onComplete` that can never run: on a timeline holding a `repeat: -1` child, or on a tween or timeline that repeats forever |
| `dev-tool-shipped` | error | `GSDevTools` or `MotionPathHelper` imported statically, or unconditional `markers: true` |
| `dangling-listener` | warn | An event listener that is never removed, including inline handlers that cannot be |
| `layout-property` | warn | Animating `width`, `height`, `top`, `left`, margins or padding, which forces layout every frame |
| `trigger-per-item` | warn | A ScrollTrigger created per item in a loop |
| `eased-loop` | warn | An infinite repeat with an ease, which makes its own seam visible |
| `eased-scrub` | warn | Easing inside a scrubbed ScrollTrigger, which fights the scrollbar |
| `late-transform-origin` | warn | A `fromTo` whose origin is only in its to-vars while its from-vars scale, rotate or skew, which leaves an SVG element offset |
| `missing-reduced-motion` | warn | An animating file with no `prefers-reduced-motion` branch |
| `barrel-import` | warn | Importing from `gsap/all`, which pulls in every plugin |

### Waiving a finding

When a finding is deliberate, put the rule's id plus `-ok`, and a reason, on the
flagged line or in the eight lines above it. It waives that one rule, nowhere
else:

```ts
/* shared-plugin-id-ok — mounted exactly once, by the root layout. */
gsap.to("#dot", { motionPath: { path: "#track" } });
```

A waiver without a reason is a rule switched off, not answered. If you believe a
finding is simply wrong, that is a bug —
[report it](https://github.com/mehShekari/gsap-motion/issues/new?template=1-wrong-audit-finding.yml).

### Checking an SVG

```bash
npx @mehshekari/gsap-motion audit-svg logo.svg
npx @mehshekari/gsap-motion audit-svg --morph from.svg to.svg
npx @mehshekari/gsap-motion audit-svg --hues logo.svg    # also flag hard-coded hues
```

## Configuration

### Your project's animation rules

The skill reads an **`ANIMATION.md`** at your repository root before writing any
code, and your rules outrank its own. Use it for what an agent cannot guess: what
fails your build, where colours come from, whether the site is right-to-left,
where hooks live, and the motion language already on the page. There is a
template in
[`reference/project-rules.md`](plugins/gsap-motion/skills/gsap-creative-animation/reference/project-rules.md#writing-an-animationmd).

With no `ANIMATION.md`, the skill works these out from `package.json`, your lint
setup and the animation already in the codebase, and tells you what it assumed.

### Script options

| Script | Option | Effect |
| --- | --- | --- |
| `audit-gsap` | `[path...]` | Files or folders to scan. Default `src` |
| `audit-gsap` | `--quiet` | Report error-level findings only |
| `audit-gsap` | `--json` | Machine-readable findings on stdout |
| `audit-svg` | `--morph a.svg b.svg` | Compare a morph pair's node counts |
| `audit-svg` | `--hues` | Report hue literals, for projects whose colours must be tokens |

## Compatibility

| | Supported | Notes |
| --- | --- | --- |
| GSAP | 3.13 and later | References verified against 3.15 |
| `@gsap/react` | 2.x | Verified against 2.1 |
| React | 18 and 19 | Lifecycle rules in the audit target React |
| Next.js | App Router | Includes Server Component boundaries |
| Vue 3 and Nuxt, Svelte, Astro, vanilla JS | Guidance | See [`frameworks.md`](plugins/gsap-motion/skills/gsap-creative-animation/reference/frameworks.md) |
| Node.js, for the scripts | 18 and later | Tested in CI on 18, 20, 22 and 24 |
| Clients | Claude Code, as a plugin; any Agent Skills client, as a folder | |

A weekly workflow warns when GSAP publishes a version newer than the one the
references were verified against.

## How it works

The skill is built for a small context footprint. `SKILL.md` holds the pipeline
and a map, and loads on every request. Everything else loads by command: a
button hover never loads the Three.js reference. A typical React task loads
under 5,000 words, and a test fails if that budget creeps.

Behaviour is tested at three levels:

1. **Unit tests** — each audit rule is shown to fire on its failure and to stay
   quiet on the correct code beside it.
2. **Package tests** — the frontmatter against the specification, the context
   budget, every link, and that nothing project-specific has leaked in.
3. **Evals** — realistic prompts run through `claude plugin eval`, scoring
   whether the skill triggers, whether it stays out of unrelated work, and
   whether the code it produces has the properties it teaches, against a
   no-plugin baseline.

## Limitations

- **The audit is static analysis without a parser.** It is conservative and can
  still be wrong. A tween inside a helper that only a `useGSAP` body calls reads
  as outside, because the audit does not follow calls.
- **`.vue`, `.svelte` and `.astro` files are not scanned.** Keep animation logic
  in a `.ts` module if you want it checked.
- **The audit judges no craft.** Rhythm and easing choices are the skill's job,
  not the script's.
- **Code inside the Markdown references is not compiled.** The templates and the
  example app are.
- **Eval scores are not published yet.** The suite exists; running it costs
  model usage, and published scores are on the [roadmap](ROADMAP.md).

## Troubleshooting

**The skill does not load.** Check it is enabled with `/plugin`. Name the
technique in your request ("with GSAP", "ScrollTrigger"), or call it directly
with `/gsap-motion:gsap-creative-animation`. If a natural request should have
loaded it,
[tell us the exact prompt](https://github.com/mehShekari/gsap-motion/issues/new?template=3-trigger.yml).

**`No such path: …/src`.** The audit resolves paths from the directory you run
it in. Run it from your project root, or pass the folder: `audit-gsap.mjs app`.

**A plugin's properties do nothing.** The plugin was probably never registered —
`unregistered-plugin` catches it. Pass it to `gsap.registerPlugin(...)` at module
scope.

**An animation looks frozen part-way in automated tests.** GSAP runs on
`requestAnimationFrame`, which background and automated tabs throttle while
timers keep firing. Wait in rendered frames, not with `setTimeout` — see
"Timing in milliseconds, settling in frames" in
[`performance.md`](plugins/gsap-motion/skills/gsap-creative-animation/reference/performance.md).

## FAQ

**Is GSAP free?** Yes. Since version 3.13, released in April 2025, GSAP and every
former Club plugin are free, including for commercial work, under
[GSAP's own licence](https://gsap.com/standard-license). See
[NOTICE.md](plugins/gsap-motion/skills/gsap-creative-animation/NOTICE.md) for the
one notable restriction.

**Is this project affiliated with GSAP or Webflow?** No.

**Does it work without React?** The design guidance is framework-free, and
[`frameworks.md`](plugins/gsap-motion/skills/gsap-creative-animation/reference/frameworks.md)
covers the lifecycle in vanilla JavaScript, Vue, Svelte and Astro. The audit's
React-specific rules only apply to React files.

**Why did it refuse the plugin I asked for?** When a transform does the job, the
skill says so and uses the transform. It always tells you when it declines
something, and why — it never quietly substitutes.

**Does anything leave my machine?** The skill is text, and its scripts only read
the files you point them at: no network, no dependencies, and they never run your
code. `npx @mehshekari/gsap-motion` downloads the package from npm; it has no dependencies and
no install scripts, and each release is published with provenance. See
[SECURITY.md](SECURITY.md).

**Can I use it commercially?** The skill is MIT-licensed. GSAP has its own
licence, linked above.

## Contributing

Bug reports with a small reproduction, new audit rules for silent failures, and
corrections to guidance are all welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md). Questions and show-and-tell belong in
[Discussions](https://github.com/mehShekari/gsap-motion/discussions),
and security reports go through [SECURITY.md](SECURITY.md).

## Project status

Maintained by [@mehShekari](https://github.com/mehShekari) as a volunteer
project. Releases follow [semantic versioning](CONTRIBUTING.md#versioning), and
every change is recorded in the [changelog](CHANGELOG.md). Plans live in the
[roadmap](ROADMAP.md).

## License

[MIT](LICENSE) for this project. GSAP is licensed separately; see
[NOTICE.md](plugins/gsap-motion/skills/gsap-creative-animation/NOTICE.md).
