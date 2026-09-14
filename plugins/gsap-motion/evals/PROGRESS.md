# Eval progress

Where the suite stands: which cases have run, on which version, with what result,
and what is still to run. It also lists the cases the roadmap plans.

Scores here are working numbers, not published ones. A single run is noisy. A score
reaches the release notes only after 3 runs with the no-plugin baseline. Raw results
stay in `results/`, which git ignores.

**Updated:** 2026-09-14 · **Plugin on npm:** 3.0.0 · **Cases today:** 15 · **Planned
by 4.0:** 44

## At a glance

| Group | Cases | Usable result | Re-run needed | Never run |
|---|---|---|---|---|
| `trigger-` | 4 | 4, on 2.1.0 | — | — |
| `ignore-` | 3 | 3, on 2.1.0 | — | — |
| `outcome-` | 8 | 1 | 2 | 5 |
| **Total** | **15** | **8** | **2** | **5** |

- **Usable result:** it ran on the case as it is now.
- **Re-run needed:** the prompt or graders changed after the run, so the old score
  no longer describes the case.

Every result so far comes from plugin 2.1.0, one run each. **No release has a full
baseline yet**, so 3.0.0 has no "before" numbers.

## Every case

`W` is with the plugin, `B` is without it (the baseline), and `Δ` is W minus B.

### `trigger-` — the skill loads when it should

| Case | Measures | Added | Last run | Runs | Score | Next |
|---|---|---|---|---|---|---|
| `trigger-audit` | A debugging question about existing GSAP code | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | Run at the next release |
| `trigger-feeling` | A request about how motion should feel, naming no library | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | Run at the next release |
| `trigger-persian` | A request in Persian | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | Run at the next release |
| `trigger-scroll-reveal` | A plain reveal request in a Next.js project | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | Run at the next release |

### `ignore-` — the skill stays out of unrelated work

| Case | Measures | Added | Last run | Runs | Score | Next |
|---|---|---|---|---|---|---|
| `ignore-backend` | Backend work | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | Run at the next release |
| `ignore-framer-motion` | An animation request naming another library | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | Run at the next release |
| `ignore-tailwind-colour` | A styling change with no motion | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | Run at the next release |

### `outcome-` — the answer has the property the skill teaches

| Case | Measures | Added | Last run | Runs | W | B | Δ | Status |
|---|---|---|---|---|---|---|---|---|
| `outcome-declines-unneeded-plugin` | Declines a plugin a transform can replace, and says so | 2.1.0 | W 2026-09-13 on 2.1.0 + pilot fixes; B 2026-09-13 on 2.1.0 | 1 | 1.00 | 0.00 | ≈ +1.00 | Usable; confirm with 3 runs |
| `outcome-asks-for-target` | A whole page with nothing named is no target: ask what should move | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | 1.00 | 0.00 | **Re-run**: prompt and a grader changed after the run |
| `outcome-marquee-loop` | An endless loop: `ease: "none"`, pausable, `useGSAP`, an RTL decision | 2.1.0 | 2026-09-13 on 2.1.0 | 1 | 1.00 | 1.00 | 0.00 | **Re-run**: two graders added after the run |
| `outcome-react-lifecycle` | A React reveal is scoped, cleaned up, registered and reduced-motion aware | 2.1.0 | — | 0 | — | — | — | **Never run** |
| `outcome-scrub-sequence` | A scrubbed, pinned sequence does not ease its children | 2.1.0 | — | 0 | — | — | — | **Never run** |
| `outcome-transform-not-layout` | A width-shaped request is answered with a transform | 2.1.0 | — | 0 | — | — | — | **Never run** |
| `outcome-curtain-css-exit` | A server-rendered intro curtain gets a CSS exit | 3.0.0 | — | 0 | — | — | — | **Never run** |
| `outcome-svg-origin-in-from` | An SVG `fromTo` scale keeps its origin in the from-vars | 3.0.0 | — | 0 | — | — | — | **Never run** |

## What remains

### Before 3.0.1 — the "before" numbers

These are the 7 outcome cases without a usable result, each with its baseline, one run
(`--runs 1`):

- the 5 never run
- the 2 that need a re-run

That is 14 runs. The pilot cost about $0.67 per outcome case with its baseline, so
**expect about $5**. `outcome-declines-unneeded-plugin` already has a usable pair.

### At each release

- Outcome cases: 3 runs with the baseline.
- Trigger and ignore cases: 1 run each, with no baseline.

At today's 15 cases that is about **$15–20**, with `--max-cost-usd 20`. The estimate
rises with every case added.

### Cases the roadmap plans

| Phase | Cases | Count |
|---|---|---|
| 3.2 adapters | `outcome-vue-lifecycle`, `outcome-astro-swap`, `outcome-r3f-camera`, `outcome-next-image-reveal`, a Vite variant of `outcome-react-lifecycle`, one load case per stack (react, next, vue, svelte, astro, vanilla, three, r3f) graded on which references were read | 13 |
| 3.3 compose | `outcome-hero-scene`, `outcome-busy-page`, `outcome-scroll-progress`, `outcome-device-hero`, `outcome-no-churn`; plus a loop ablation, which is a run mode, not a case | 5 |
| 3.4 inspect | One planted defect per visual-audit item: hierarchy order, time to first motion, beat overlap, loop seam, repetition, area in motion, motion over text being read, mobile | 8 |
| 3.5 maturity | `outcome-offers-not-writes`, `outcome-candidate-not-default`, `outcome-retired-warns` | 3 |
| 4.0 commands | None named yet | 0 |
| **Total new** | | **29** |

Names written as descriptions are settled when their phase starts. While a phase is
being built, each new case runs once. It joins the release runs above when the phase
is released.

## Release runs

| Release | Date | Cases | Runs | Cost | Result |
|---|---|---|---|---|---|
| 2.1.0 (pilot) | 2026-09-13 | 10 of 13 | 1 each | ≈ $5.81 | `results/2026-09-13-pilot/SUMMARY.md` |
| 3.0.0 | — | — | — | — | not run |

## Cost so far

About **$5.81** at list price, all on 2026-09-13. The account is a claude.ai
subscription, so this was plan usage rather than a bill.

## Running what is open

Run from the repository root:

```bash
npx @anthropic-ai/claude-code plugin eval plugins/gsap-motion --case "outcome-react-lifecycle" --runs 1 --threshold 0 --keep-temp --no-publish --max-cost-usd 5
npx @anthropic-ai/claude-code plugin eval plugins/gsap-motion --case "outcome-scrub-sequence" --runs 1 --threshold 0 --keep-temp --no-publish --max-cost-usd 5
npx @anthropic-ai/claude-code plugin eval plugins/gsap-motion --case "outcome-transform-not-layout" --runs 1 --threshold 0 --keep-temp --no-publish --max-cost-usd 5
npx @anthropic-ai/claude-code plugin eval plugins/gsap-motion --case "outcome-curtain-css-exit" --runs 1 --threshold 0 --keep-temp --no-publish --max-cost-usd 5
npx @anthropic-ai/claude-code plugin eval plugins/gsap-motion --case "outcome-svg-origin-in-from" --runs 1 --threshold 0 --keep-temp --no-publish --max-cost-usd 5
npx @anthropic-ai/claude-code plugin eval plugins/gsap-motion --case "outcome-asks-for-target" --runs 1 --threshold 0 --keep-temp --no-publish --max-cost-usd 5
npx @anthropic-ai/claude-code plugin eval plugins/gsap-motion --case "outcome-marquee-loop" --runs 1 --threshold 0 --keep-temp --no-publish --max-cost-usd 5
```

`plugin eval` has no resume, so run one case per command. On Windows, `--keep-temp`
sandboxes are not sealed: read only their `out/` folder, then delete
`%TEMP%\claude-eval-*`.

## Keeping this file true

After every run, in the same commit as anything the run changed:

1. Update the case's row: date, plugin version, runs, scores, status.
2. Update the counts in "At a glance" and the cost.
3. Mark a result for re-run in the same commit that changes its prompt or graders.
4. Add a row to "Release runs" for every release.
