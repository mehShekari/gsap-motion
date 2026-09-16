# Eval progress

Where the suite stands: which cases have run, on which version, with what result,
and what is still to run. It also lists the cases the roadmap plans.

Scores here are working numbers, not published ones. A single run is noisy. A score
reaches the release notes only after 3 runs with the no-plugin baseline. Raw results
stay in `results/`, which git ignores.

**Updated:** 2026-09-16 · **Plugin on npm:** 4.1.0 · **Cases today:** 17 · **Planned
by 4.0:** 44

> **Two cases added 2026-09-16, unrun** (`outcome-intent-values`,
> `outcome-intent-composes`). They grade the intent layer: whether a named
> feeling resolves to stated values, and whether two at once compose instead of
> one winning. Written with the layer so it is falsifiable; they run in phase 8
> with the rest. **Until they run, the intent guidance is unproven.**
>
## The grader phase 8 uses

`scripts/grade/grade.mjs <url> <source dir>` — built 2026-09-16 on the method of
a head-to-head test that the skill lost: a real browser, a check independent of
the agent, no trust in what the agent says it verified. It answers one question,
**is this implementation fragile**, and never whether the animation is good.

It runs two instruments because the bugs split between them. The browser catches
an animation that never runs and a visual off screen on mobile; the audit catches
a label a stacked `fromTo` hides, which no browser threshold can tell from a
normal reveal (1308ms buggy against 1178-1574ms clean, in the same page).

**Validated in-sample: 5 of 5** — both clean implementations not fragile, each of
the three real bugs restored and caught. The thresholds were set on those five,
so this proves the grader can see those bugs, not that it is right elsewhere.
Calibrating it also found four errors in the instruments themselves, each of
which would have scored the skill wrongly:

- It first accused the implementation built **without** the skill of two bugs.
  Both were stacked per-state labels hidden on purpose.
- It missed a visual 57% below the fold, because it wanted three quarters.
- A stuck-invisible check could not be made to work at all, and was removed.
- The new audit rule `stacked-from` flagged a loop guarded to run once.

**The first agent runs are its real test.** Read every failure it reports there
before counting it, until it has seen code it was not tuned on.

### Round 1, first attempt (2026-09-16) — a test of the grader, not of the skill

The user's fintech hero brief, one Sonnet subagent with the skill and one without,
graded with the grader above. **Not a verdict on the skill**, for two reasons:

- **The control arm was contaminated.** Both were subagents of a session with the
  gsap-motion 4.1.0 plugin enabled, so its `PostToolUse` audit hook ran on the
  without-skill agent's edits too. Arms must be separate `claude` processes in
  projects with no plugin enabled.
- **The brief was wrong.** It said `@gsap/react` was installed; it was not. Only
  `gsap` is.

Also seen: the with-skill agent took 139k tokens, 41 tool uses and 559s against
87k, 20 and 334s, and edited `src/index.css` outside the hero, which the other did
not. Both graded not fragile.

**What it taught the grader.** `below-fold-mobile` took the largest svg, canvas,
img or video as the main visual. Both heroes built theirs from divs around a small
SVG chart, so it measured the 64-72px chart and reported 100% on screen. The
verdict was right by luck: the real visuals were 100% and 80% shown. A first fix,
the largest block, picked the section below the hero and reported 0%. The visual
is now the largest in-flow, non-copy block inside the headline's section, which
matches the hand measurements on both and still grades the in-sample five 5 of 5.

## Keeping the cost down without testing less

Agreed 2026-09-16, after the first baseline run cost $2.10 for one case and
showed where the money actually goes. The design — 44 cases, 3 runs, both arms,
about $75 — pays for the same information many times over. Four levers, in
order of what they save.

**1. Measure each baseline once, not every release.** The baseline arm answers
*would the model do this unaided?* That answer does not change between our
releases, because the model does not. Record it per case with the model version
beside it, then run only the with-skill arm afterwards and take the delta
against the stored number. **Halves every release run.** When the model changes,
the baselines expire together and are re-measured in one batch.

**2. Two runs, and a third only on disagreement.** Three runs exist to average
out noise, but a case that scored 1.00 twice has none to average. Spend the
third run only where the first two differ — which is exactly where the noise
is. About a third off the stable cases, nothing off the unstable ones.

**3. Run the cases this release can actually have changed.** Most releases touch
one or two references: 4.1 touched `motion-design.md` and `routing.md` and
nothing else. Record for each case which files it exercises, and a release runs
three to six cases rather than forty-four. This is the largest lever, and the
only one that needs anything built: a `touches:` list in each case.

**4. A free grader wherever the property is mechanical.** `regex` and
`tool_used` cost nothing; `llm` and `baseline` are paid, and are skipped anyway
when a run breaches its budget. `ease: "none"`, `repeat: -1` and `useGSAP(` are
regex checks — `outcome-marquee-loop` grades five properties for free. Keep
`llm` for what genuinely needs judgement, such as whether a declined plugin was
explained.

| | as designed | with the four levers |
|---|---|---|
| One full pass, 44 cases with baselines | ~$75 | ~$40 |
| Each release after that | ~$75 | **~$5–10** |

**What must not be cut.** A baseline at least once per case per model, or the
score means nothing on its own. More runs wherever variance is real — one case
here scored 1.00 and 0.00 on the same prompt. And budgets that fit the skill:
a timed-out run costs full price and returns no data, which makes it the most
expensive kind of run there is.

**A timed-out run is missing data, not a zero.** Averaging it as zero is what
turned a case the skill answered perfectly into evidence against the skill.
Exclude it and say how many runs were counted.
> **The expensive half waits for the roadmap** (decided 2026-09-14, refined
> 2026-09-15). Outcome cases and baselines are not run while 3.0.x through 4.0 are
> built: they grade guidance that each phase still changes, three runs with a
> baseline cost about $75, and any number bought early is discarded. After the
> roadmap the suite is updated to the finished skill — the 15 cases revised, the 29
> planned ones written — and then every case is run. Releases until then carry no
> eval scores.
>
> **The cheap half runs every release.** The seven `trigger-` and `ignore-` cases
> cost about $3 and ten minutes, and they catch the one failure that is both
> catastrophic and invisible: a skill that silently stops firing, or starts firing
> on work it should ignore. One edit to SKILL.md's description can cause either.

## At a glance

| Group | Cases | Usable result | Re-run needed | Never run |
|---|---|---|---|---|
| `trigger-` | 4 | 4, on 3.4.0 | — | — |
| `ignore-` | 3 | 3, on 3.4.0 | — | — |
| `outcome-` | 8 | 1, on 2.1.0 | 2 | 5 |
| **Total** | **15** | **8** | **2** | **5** |

- **Usable result:** it ran on the case as it is now.
- **Re-run needed:** the prompt or graders changed after the run, so the old score
  no longer describes the case.

The trigger and ignore groups were re-run on 3.4.0; every outcome result still comes
from 2.1.0, one run each. **No release has a full baseline yet**, so no release has
"before" numbers.

## Every case

`W` is with the plugin, `B` is without it (the baseline), and `Δ` is W minus B.

### `trigger-` — the skill loads when it should

| Case | Measures | Added | Last run | Runs | Score | Next |
|---|---|---|---|---|---|---|
| `trigger-audit` | A debugging question about existing GSAP code | 2.1.0 | 2026-09-16 on 4.1.0 | 1 | 1.00 | Run at the next release |
| `trigger-feeling` | A request about how motion should feel, naming no library | 2.1.0 | 2026-09-16 on 4.1.0 | 1 | 1.00 | Run at the next release |
| `trigger-persian` | A request in Persian | 2.1.0 | 2026-09-16 on 4.1.0 | 1 | 1.00 | Run at the next release |
| `trigger-scroll-reveal` | A plain reveal request in a Next.js project | 2.1.0 | 2026-09-16 on 4.1.0 | 1 | 1.00 | Run at the next release |

### `ignore-` — the skill stays out of unrelated work

| Case | Measures | Added | Last run | Runs | Score | Next |
|---|---|---|---|---|---|---|
| `ignore-backend` | Backend work | 2.1.0 | 2026-09-16 on 4.1.0 | 1 | 1.00 | Run at the next release |
| `ignore-framer-motion` | An animation request naming another library | 2.1.0 | 2026-09-16 on 4.1.0 | 1 | 1.00 | Run at the next release |
| `ignore-tailwind-colour` | A styling change with no motion | 2.1.0 | 2026-09-16 on 4.1.0 | 1 | 1.00 | Run at the next release |

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

### After the roadmap — update, then run

1. **Update.** Revise the 15 existing cases against the finished skill: prompts,
   graders, and the references a case expects to be read. Write the 29 planned cases
   below. A case whose behaviour the roadmap removed is deleted, with the reason given
   here.
2. **Run.** Run every case: outcome cases 3 times with the baseline, trigger and ignore
   cases once. Every result above is replaced, including the ones marked usable,
   because they were measured on 2.1.0.

### Cost of the full run

At 4.0 the suite has 37 outcome cases and 7 trigger and ignore cases. The pilot cost
about $0.67 per outcome case with its baseline, so 3 runs of each is about **$75**,
plus about $3 for the trigger and ignore cases. Run it in batches with
`--max-cost-usd`, and record progress here after each batch, since `plugin eval` has
no resume.

### Cases the roadmap plans

| Phase | Cases | Count |
|---|---|---|
| 3.2 adapters | `outcome-vue-lifecycle`, `outcome-astro-swap`, `outcome-r3f-camera`, `outcome-next-image-reveal`, a Vite variant of `outcome-react-lifecycle`, one load case per stack (react, next, vue, svelte, astro, vanilla, three, r3f) graded on which references were read | 13 |
| 3.3 compose | `outcome-hero-scene`, `outcome-busy-page`, `outcome-scroll-progress`, `outcome-device-hero`, `outcome-no-churn`; plus a loop ablation, which is a run mode, not a case | 5 |
| 3.4 inspect | One planted defect per visual-audit item: hierarchy order, time to first motion, beat overlap, loop seam, repetition, area in motion, motion over text being read, mobile | 8 |
| 3.5 maturity | `outcome-offers-not-writes`, `outcome-candidate-not-default`, `outcome-retired-warns` | 3 |
| 4.0 commands | None named yet | 0 |
| **Total new** | | **29** |

Names written as descriptions are settled when the case is written. All of these are
written after the roadmap is finished, against the finished skill, not while their
phase is built. Until then a phase proves its behaviour with unit tests and fixtures.

## Release runs

| Release | Date | Cases | Runs | Cost | Result |
|---|---|---|---|---|---|
| 2.1.0 (pilot) | 2026-09-13 | 10 of 13 | 1 each | ≈ $5.81 | `results/2026-09-13-pilot/SUMMARY.md` |
| 3.3.0 | 2026-09-15 | 7 of 15 (`trigger-` and `ignore-`) | 1 each, no baseline | $2.70 | 7 of 7 at 1.00 — firing survived the adapter split, Persian included |
| 4.1.0 | 2026-09-16 | 7 of 17 (`trigger-` and `ignore-`) | 1 each, no baseline | $3.33 | 7 of 7 at 1.00. The point of this run: SKILL.md was rewritten twice since the last one — 4.0 replaced the whole command table, 4.1 changed the Analysis contract — and firing is the one failure nothing else catches. `trigger-feeling` ("make the entrance feel more cinematic") exercises the path 4.1 rewrote; `trigger-audit` also passed its `names-the-leak` judge 3-0 |
| 3.4.0 | 2026-09-15 | 7 of 15 (`trigger-` and `ignore-`) | 1 each, no baseline | $3.30 | 7 of 7 at 1.00. The `trigger-` arm ran on the 3.4.0 content before the version bump landed, so its report names 3.3.0 |
| 3.0.0 | — | — | — | — | not run |
| 3.0.1 | — | — | — | — | not run: evals wait for the roadmap |

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
