# Contributing

Thank you for helping. This project is a **skill** — instructions an AI agent
follows — plus two small static-analysis scripts, packaged as a Claude Code
plugin. Most contributions are one of the workflows below, and each is short
and specific.

## Setup

You need Node.js 18 or later. The skill and its tests have no dependencies.

```bash
git clone https://github.com/mehShekari/gsap-motion
cd gsap-motion
node scripts/test.mjs
```

Optional, depending on what you change:

| To check | Run |
| --- | --- |
| The Agent Skills specification | `pip install skills-ref`, then `agentskills validate plugins/gsap-motion/skills/gsap-creative-animation` |
| The plugin manifests | `claude plugin validate plugins/gsap-motion --strict` |
| The example app against the templates | `npm install`, then `npm run example:build` |
| Your change in Claude Code itself | `claude --plugin-dir ./plugins/gsap-motion`, then `/reload-plugins` after each edit |
| Whether GSAP has moved on | `npm run freshness` |
| The npm package, exactly as users download it | `npm run pack:check` |

## Repository layout

```text
.claude-plugin/marketplace.json         the marketplace users add
plugins/gsap-motion/
├── .claude-plugin/plugin.json          the plugin manifest — version lives here
├── skills/gsap-creative-animation/     the skill
│   ├── SKILL.md                        loaded on every invocation: keep it lean
│   ├── reference/ preset/ example/     loaded on demand, by command
│   ├── template/                       typed starting points, built by the example app
│   └── scripts/                        audit-gsap, audit-svg, and their tests
└── evals/                              behaviour tests for `claude plugin eval`
examples/next-app/                      a Next.js app that compiles the templates
packages/cli/                           the npm package: `npx @mehshekari/gsap-motion`
scripts/                                repository tooling: test runner, freshness check
tests/                                  checks that the manifests and versions agree
```

## Workflows

### Fix a wrong audit finding

1. Add the smallest case that shows it to
   `plugins/gsap-motion/skills/gsap-creative-animation/scripts/test/rules.test.mjs`
   — `fires(...)` for a missed problem, `quiet(...)` for a false alarm.
2. Run the tests and watch that case fail.
3. Change the rule in `scripts/lib/rules.mjs` until it passes without breaking
   any other case.

A wrong finding is a bug in the rule. Never make a test pass with a waiver.

### Add an audit rule

A rule must catch a failure that is **silent** — no error, and no obvious
symptom until later, on a slower device or after a navigation. Taste is out of
scope: no rule judges an ease or a rhythm.

1. Cases first: a `describe` block with at least one `fires` and one `quiet`.
   The coverage test fails until both exist.
2. Then the rule, with:
   - an `id` in kebab-case. It is permanent, because users' waivers name it.
   - a `level`: `error` only for a real bug. See [Versioning](#versioning).
   - a `message` saying what is wrong, and a `hint` saying what to do instead.

### Add or change a reference, preset or example

1. Link it from SKILL.md's reference map. The tests require every file to be
   reachable one level deep.
2. Add it to the load map in `reference/routing.md` for the requests that need
   it, and nowhere else.
3. Any claim about GSAP's behaviour names the version it was verified against.
4. Keep it project-agnostic: no brand names, token names or paths from your own
   app. The portability test lists the markers it knows about.
5. A new command or behaviour gets an eval case.

### Change SKILL.md

SKILL.md loads on every invocation, so it has a word budget, enforced in
`scripts/test/skill.test.mjs`. If a change needs room, cut something first.
Raise the budget only in the same pull request as the content that needs it,
and explain why in the description.

### Add an eval case

Evals measure what unit tests cannot: whether Claude picks the skill up, and
whether the result is better than without it. Each case is a directory in
`plugins/gsap-motion/evals/`, named for what it measures:

| Prefix | Measures | Typical grader |
| --- | --- | --- |
| `trigger-` | a prompt that should use the skill does | `tool_used` on `Skill` |
| `ignore-` | a prompt that should not use the skill does not | `tool_used` on `Skill`, `max: 0` |
| `outcome-` | the code produced has the property the skill teaches | `regex` over the reply or a file |

Write prompts the way a person would type them, and never name the skill.
Prefer `regex`, `tool_used` and `file_exists` graders: they are free and
deterministic. Keep `llm` graders for short outputs, with concrete PASS and
FAIL conditions.

Eval runs are real model calls billed to whoever runs them. Iterate on one case
cheaply:

```bash
claude plugin eval plugins/gsap-motion --case <name> --runs 1 --ablation none
```

Maintainers run the full suite, with its no-plugin baseline, from the
**Evals** workflow.

### When GSAP releases a new version

The **GSAP freshness** workflow turns red. Re-check every claim marked
"verified against" in the references, fix what changed, then update
`metadata.verified-gsap` (or `verified-gsap-react`) in SKILL.md.

## Versioning

Semantic versioning, applied to what users depend on:

| Bump | When |
| --- | --- |
| **Major** | A command is renamed or removed. An audit rule's id is renamed or removed, which breaks waivers. A CLI flag is removed or changes meaning. A rule is added at, or promoted to, `error` level, which can fail builds. The minimum GSAP version rises. |
| **Minor** | A new command, reference, preset or example. A new `warn` rule. A new CLI flag. |
| **Patch** | A wrong finding fixed. Guidance corrected or clarified. Documentation. |

## Releasing

For maintainers:

1. Set the same version in three places: `plugins/gsap-motion/.claude-plugin/plugin.json`,
   SKILL.md's `metadata.version`, and `packages/cli/package.json`. The tests
   fail if they differ, and the npm package refuses to pack.
2. In `CHANGELOG.md`, move the **Unreleased** entries under the new version,
   with today's date.
3. Run `node scripts/test.mjs` and `npm run pack:check`, then merge.
4. Publish a GitHub Release tagged `vX.Y.Z`, with that changelog section. The
   **Release to npm** workflow then publishes the package, with provenance.

Marketplace users receive an update only when `plugin.json`'s version changes;
npm users with `npx @mehshekari/gsap-motion@latest`.

## Pull requests

- One concern per pull request, with the template's checklist filled in.
- An entry under **Unreleased** in `CHANGELOG.md`.
- Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
