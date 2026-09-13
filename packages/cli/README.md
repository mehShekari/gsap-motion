# @mehshekari/gsap-motion

Install the **gsap-creative-animation** Agent Skill — a senior motion engineer
for GSAP — and run its audits for silent animation failures, with `npx`.

```bash
npx @mehshekari/gsap-motion add            # this project: .claude/skills/
npx @mehshekari/gsap-motion add --global   # every project: ~/.claude/skills/
npx @mehshekari/gsap-motion audit src      # find silent GSAP failures; exits 1 on an error
npx @mehshekari/gsap-motion doctor         # what is installed, and is your GSAP recent enough
```

No dependencies, no install scripts, Node.js 18 or later.

## Commands

| Command | What it does |
| --- | --- |
| `add` | Installs or updates the skill in `.claude/skills/` for this project. `--global` installs it in `~/.claude/skills/` for your user; `--dir <path>` installs it into any agent's skills directory. `--force` reinstalls the same version. |
| `remove` | Uninstalls it. Takes the same `--global` and `--dir`. It only ever removes a directory that holds this skill. |
| `audit [path...]` | Scans for leaks, per-frame cost, eased loops, shared plugin ids, unregistered plugins and shipped dev tooling. Default path `src`. `--quiet` for errors only, `--json` for scripts. |
| `audit-svg <file...>` | Reports what DrawSVG can draw, what MorphSVG can morph, and what will fail silently. `--morph a.svg b.svg` compares a pair; `--hues` also reports hard-coded hues. |
| `doctor` | Checks Node.js, the installed skill's version for this project and your user, your project's `gsap` and `@gsap/react`, and whether an `ANIMATION.md` exists. |

## In CI

The audit needs no install. Pin the version, so a new rule cannot fail your
build without warning:

```json
"lint": "eslint && npx @mehshekari/gsap-motion@2.1.0 audit src --quiet"
```

Or install it with `npm install --save-dev --save-exact @mehshekari/gsap-motion`.
The command it adds is `gsap-motion`:

```json
"lint": "eslint && gsap-motion audit src --quiet"
```

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
