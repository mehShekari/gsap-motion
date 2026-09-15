# @mehshekari/eslint-plugin-gsap-motion

The [gsap-motion](https://github.com/mehShekari/gsap-motion) audit as ESLint
rules. It reports the GSAP failures that raise no error — a tween that outlives
its component, a tween allocated per pointer event, a plugin imported and never
registered — in your editor and in any lint run.

It runs the audit's own rules on the audit's own parse of each file. So it
reports exactly what `npx @mehshekari/gsap-motion audit` reports, on the same
lines, and the audit's
[measured precision](https://github.com/mehShekari/gsap-motion#measured-precision)
holds here too.

## Install

```bash
npm install --save-dev --save-exact @mehshekari/eslint-plugin-gsap-motion
```

It needs ESLint 9 or 10 with flat config, and Node.js 18.18 or later. Pin the
exact version: a release can add a rule, or catch a case a rule used to miss,
and fail a build that passed.

## Configure

```js
// eslint.config.mjs
import gsapMotion from "@mehshekari/eslint-plugin-gsap-motion";

export default [
  // …your own config, with a parser for each kind of file you lint
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    ...gsapMotion.configs.recommended,
  },
];
```

`recommended` turns on every rule at the audit's level. It sets no `files` and
no parser. ESLint must already be able to read the file: `typescript-eslint` for
TypeScript, and JSX enabled for `.jsx`. The plugin never reads the tree that
parser builds.

### Plugins registered in another file

`gsap.registerPlugin` is global, and most apps call it once, in an entry file.
The command line collects registrations across every file it reads. ESLint reads
one file at a time, so name them:

```js
{
  rules: {
    "gsap-motion/unregistered-plugin": ["error", { registered: ["ScrollTrigger", "SplitText"] }],
  },
}
```

## Waiving a finding

The same waiver as the audit's: the rule's id plus `-ok`, with a reason, on the
flagged line or in the eight lines above it.

```ts
/* shared-plugin-id-ok — mounted exactly once, by the root layout. */
gsap.to("#dot", { motionPath: { path: "#track" } });
```

An `eslint-disable` comment silences ESLint only. The audit does not read those,
so a finding waived that way still fails `gsap-motion audit`.

## Rules

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
| `not-parsed` | warn | A file that uses GSAP and that the audit's parser could not read, so no other rule checked it |

`not-parsed` is an info finding in the command line; ESLint has no info level.

The plugin checks the files the command line checks: `.js`, `.jsx`, `.mjs`,
`.ts` and `.tsx`. A file that never mentions GSAP is not parsed at all.

## License

MIT. The bundled parser — acorn, with @sveltejs/acorn-typescript — is MIT too;
see `NOTICE.md`.
