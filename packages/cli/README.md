# @mehshekari/gsap-motion

Install the **gsap-creative-animation** Agent Skill — a senior motion engineer
for GSAP — and run its audits for silent animation failures, with `npx`.

```bash
npx @mehshekari/gsap-motion add            # this project: .claude/skills/
npx @mehshekari/gsap-motion add --global   # every project: ~/.claude/skills/
npx @mehshekari/gsap-motion audit src      # find silent GSAP failures; exits 1 on an error
npx @mehshekari/gsap-motion doctor         # what is installed, and is your GSAP recent enough
```

No dependencies, no install scripts, Node.js 22 or later.

## Commands

| Command | What it does |
| --- | --- |
| `add` | Installs or updates the skill in `.claude/skills/` for this project. `--global` installs it in `~/.claude/skills/` for your user; `--dir <path>` installs it into any agent's skills directory. `--force` reinstalls the same version. |
| `remove` | Uninstalls it. Takes the same `--global` and `--dir`. It only ever removes a directory that holds this skill. |
| `audit [path...]` | Scans for leaks, per-frame cost, eased loops, shared plugin ids, unregistered plugins and shipped dev tooling. Default path `src`. `--quiet` for errors only, `--json` for scripts. |
| `audit-svg <file...>` | Reports what DrawSVG can draw, what MorphSVG can morph, and what will fail silently. `--morph a.svg b.svg` compares a pair; `--hues` also reports hard-coded hues. |
| `inspect <url>` | Watches a page animate over the DevTools Protocol and reports what it saw: a filmstrip, the timeline GSAP is running, and the layouts, style recalculations and frames the browser did. `--scroll`, `--hover` and `--click` reach the state first; `--reduced`, `--dark`, `--mobile` and `--cpu` change the conditions. Needs a Chrome on the machine; installs nothing. |
| `explain <file...|url>` | Maps an animation and changes nothing: where it lives, its preference branches, its beats in order with the reasons their comments give, its scroll configuration, and what the audit says. Given a URL it reads the running page instead, where the timeline is the one GSAP actually built. |
| `review <url>` | Measures what the motion actually did, by sampling the DOM every frame rather than by reading GSAP's timeline — which a bundled app never exposes, and which would make it work on demo pages and fail on real ones. Reports time to first motion, the share of the screen moving at its busiest, loop seams, and motion over text being read. Sampling forces layout, so it does not report layout counts; `inspect` measures those. Takes the same `--scroll`, `--reduced`, `--dark`, `--mobile` and `--cpu`. |
| `patterns check [file]` | Validates the Patterns section of your `ANIMATION.md`: the fields each status needs, the recorded uses behind `validated`, the named reviewer behind `canonical`, and entries verified against an older GSAP than the one installed. Exits 1 on a claim the evidence does not support, so it belongs in `lint` beside `audit`. A project with no Patterns section passes. |
| `doctor` | Checks Node.js, the installed skill's version for this project and your user, your project's `gsap` and `@gsap/react`, and whether an `ANIMATION.md` exists. |

## In CI

The audit needs no install. Pin the version, so a new rule cannot fail your
build without warning:

```json
"lint": "eslint && npx @mehshekari/gsap-motion@3.6.0 audit src --quiet"
```

Or install it with `npm install --save-dev --save-exact @mehshekari/gsap-motion`.
The command it adds is `gsap-motion`:

```json
"lint": "eslint && gsap-motion audit src --quiet"
```

The same rules also run inside ESLint, so findings appear in your editor:
[`@mehshekari/eslint-plugin-gsap-motion`](https://www.npmjs.com/package/@mehshekari/eslint-plugin-gsap-motion).

## Claude Code plugin

The same skill is also a Claude Code plugin:

```text
/plugin marketplace add mehShekari/gsap-motion
/plugin install gsap-motion@mehshekari
```

## Documentation

Everything else — the commands the skill gives your agent, the audit's rules,
waivers, configuration with `ANIMATION.md`, compatibility and limitations — is in
the [repository](https://github.com/mehShekari/gsap-motion#readme).

## License

MIT. GSAP is licensed separately; see `NOTICE.md`. This project is not affiliated
with GreenSock or Webflow.
