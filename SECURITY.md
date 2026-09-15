# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 3.x (latest minor) | Yes |
| Older | No — please upgrade |

## What this project can and cannot do on your machine

The skill is instructions an AI agent reads. Its two scripts are the only code
it ships, and both are deliberately narrow:

- `audit-gsap.mjs` and `audit-svg.mjs` **only read** the files and folders you
  pass them. They never import, require or execute that code, never write to
  disk, make no network requests, and have no dependencies.
- The ESLint plugin, `@mehshekari/eslint-plugin-gsap-motion`, runs the same
  rules on the text ESLint hands it. It reads no other file, never executes the
  code, writes nothing, makes no network requests, and needs nothing but
  ESLint.
- `scripts/check-freshness.mjs` and the GitHub workflows are repository tooling,
  not part of the plugin. The freshness check makes one request per package to
  the public npm registry.
- Evals run through `claude plugin eval`, in the sandbox Claude Code provides.

## Prompt injection

The skill tells the agent to read a project's `ANIMATION.md`, and agent
instruction files that point to one. Those files steer what the agent does.
Treat an `ANIMATION.md` from an untrusted repository the way you would treat
its build scripts: read it before letting an agent act on it.

## Reporting a vulnerability

Please report privately through
[GitHub's private vulnerability reporting](https://github.com/mehShekari/gsap-motion/security/advisories/new),
not in a public issue. Include what an attacker could do, and the smallest
reproduction you have.

This is a volunteer-maintained project. You will get an acknowledgement as soon
as the maintainer can, and a fix or a mitigation will be published with credit
to you unless you prefer otherwise.
