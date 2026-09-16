# Project rules

This skill is project-agnostic. The project it is working in is not: it has a
linter, colour tokens, a folder layout, a text direction, and usually a motion
language already on the page. Those outrank anything in this skill.

## Finding them

Before writing code, look for the project's animation rules, in this order:

1. **`ANIMATION.md` at the repository root.**
2. **A file an agent-instructions file points to** — `AGENTS.md`, `CLAUDE.md`,
   `.cursor/rules`, or similar — for animation or motion.
3. **Nothing.** Derive them (below), and say in your answer which ones you
   assumed.

Read the whole file. Where it disagrees with this skill, the project wins. If a
project rule looks wrong, say so — do not quietly follow the skill instead.

## A motion budget

A page gets busy one reasonable addition at a time. A budget makes the cost
visible before the tenth one lands: how many groups may move at once, how many
loops may be visible, how many scroll-bound and pointer effects a viewport
carries, and which plugins a route may load.

Going over is allowed — with a reason stated in the answer, not by accident.
Before adding to a route, inventory what it already animates: that is step 2 of
the pipeline, and it is also how you find the animation this one should replace
rather than join.

## Deriving them when there is no file

A few minutes here is cheaper than a page with two motion languages.

- **What fails the build.** Read the `lint`, `check` and `test` scripts in
  `package.json` and whatever they run. A rule that fails CI is a constraint,
  not a preference.
- **Colour.** CSS variables, a Tailwind theme, a design-token file? An
  animation that tweens to a literal the theme cannot reach breaks dark mode.
- **Direction.** Is `dir="rtl"` ever set? If so, the RTL rules below apply.
- **Where code goes.** Where do existing hooks and client components live, and
  where does copy come from?
- **The house motion language.** Grep for `gsap.`, `ScrollTrigger` and
  `useGSAP`. The trigger point, ease, durations and stagger shape already on the
  page are the precedent — step 2 of the pipeline in SKILL.md.

## Writing an `ANIMATION.md`

If the project will be animated more than once, suggest creating one. A useful
one is short, and each section is an instruction rather than an essay:

````markdown
# Animation rules

## What fails the build
<!-- Lint rules that catch animation or SVG code, and their escape hatches. -->

## Colour
<!-- Where colours come from; what an SVG paint may be. -->

## Direction
<!-- LTR, RTL or both; how the layout mirrors (logical CSS, `rtl:` variants). -->

## Where animation code lives
<!-- Hook and component folders; the client/server boundary; where copy comes from. -->

## House motion language
| | |
|---|---|
| Trigger | e.g. `start: "top 75%"`, plays once |
| Ease | e.g. `power3.out` |
| Durations | heading / body / groups |
| Stagger | `amount` (a total) or `each` (per item) |
| Reduced motion | what the reduced branch shows |

## Motion budget
<!-- Per viewport: groups moving at once, visible loops, scroll-bound effects,
     pointer effects. Plugins per route. Going over is allowed, with a reason. -->

## Verify with
<!-- The commands to run before calling it done. -->

## Precedents
<!-- Files that already do this well, by path, and what each one taught. -->

## Patterns
<!-- Shapes this project has proven. Format and statuses below; `patterns
     check` validates this section. Omit the section until there is one. -->
````

---

## Patterns: what the project has proven

A pattern is a shape of animation this project has used and can use again. The
section is optional, and empty is the honest state for a new project.

**Nothing becomes guidance by having been written.** A pattern loaded as
guidance repeats in every session after it, so a wrong one is not one mistake,
it is every future mistake. That is why a status is evidence, not a claim.

| Status | Reached when | Loaded as |
|---|---|---|
| `experimental` | Built for one request, its claims verified, the audit clean. **Offered in the answer, never written to the file.** | Nothing |
| `candidate` | The user accepts it into ANIMATION.md. That acceptance is its first use. | An option to mention, never a default |
| `validated` | Used again in a **different component** — two uses by default — each recorded with its file and commit, and each audit clean | The house way, unless the request gives a reason not to |
| `canonical` | A **named person** has reviewed it | A precedent, followed like the house motion language |
| `retired` | Disproved. Kept, with the reason, so it is not reinvented | A warning only |

**Who moves an entry.** The skill offers entries and proposes promotions with
their evidence; it never changes a status on its own. `candidate` needs your
yes. `validated` is counted by `patterns check` from the recorded uses, never
asserted by the entry. `canonical` needs a reviewer's name.

**Moving down is evidence too.** A bug traced to a pattern returns it to
`candidate` with the failure recorded. A GSAP release past its verified version
marks it for re-verification — it stays loaded, marked. A use later reverted
does not count.

### The format

```markdown
### Ink behind a moving pen

- **Status:** candidate
- **Concept:** a mask shares the pen's duration and ease, so ink appears only
  where the nib has already been.
- **Fixed:** the mask and the path share one duration and one ease.
- **Parameters:** duration, ease, nib radius.
- **Not when:** the stroke crosses itself — the mask reveals the crossing early.
- **Reduced motion:** the finished stroke is set, and no tween runs.
- **Verified against:** gsap 3.15, DrawSVGPlugin
- **Uses:**
  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean
  - `src/components/Hero.tsx` — `e4f5a6b` — audit clean, review: no seams
- **Reviewed by:** <!-- a name, for canonical only -->
```

`Concept`, `Not when`, `Reduced motion` and `Verified against` are required of
every entry that is in the file. A `retired` entry needs only **Why**. Two uses
in the same file count once: one component is one use.

Run it with the rest of the checks:

```bash
gsap-motion patterns check          # or: patterns check path/to/ANIMATION.md
```

It exits 1 on a claim the evidence does not support, so it belongs in `lint`
beside `audit`. Where a candidate has earned `validated`, it says so and leaves
the promotion to you.

### `patterns` and `learn`

- **`patterns`** lists what the project has proven, by status, and what has
  earned a promotion. Asked to apply one, it uses `validated` and `canonical`
  entries by default and a `candidate` only when you name it — a candidate is an
  option to mention, not a default to reach for.
- **`learn`** offers a finding as a `candidate`, once you agree, and writes
  nothing before that. It offers only what it has verified: the claim tested
  with a minimal repro, the audit clean, and the entry carrying its concept,
  what is fixed, when not to use it, its reduced-motion branch, and what it was
  verified against. **An unverified finding is not offered at all**, and neither
  command ever changes a status — `validated` is counted by `patterns check`,
  and `canonical` is a person's signature.

A new shape is composed from what exists before anything is invented, and a
behaviour claim is verified one variable at a time before it is written down.
Something that turns out to be general is worth an upstream issue; something
mechanically detectable is worth an audit rule, with its fires and quiet cases.

---

## Rules worth knowing without a file

Each of these fails silently in any project that has the condition.

### RTL: everything with a handedness is decided, not inherited

GSAP transforms are physical — `x` means left-to-right on every page. That is
fine; leaving them unmirrored on a right-to-left page is not.

| Has a direction | Mirror by |
|---|---|
| `x` / `xPercent` travel | negating the value |
| `stagger` reading order | `from: "end"` |
| MotionPath | `start: 1, end: 0` — no second path needed |
| Horizontal ScrollTrigger | `+100 *` instead of `-100 *` |
| Marquee | negating the target `x` |
| `clipPath` wipe | `inset(0 100% 0 0)` becomes `inset(0 0 0 100%)` |
| Flip | nothing — it measures both real layouts |

```ts
const isRtl = document.documentElement.dir === "rtl";
gsap.from("[data-item]", { x: isRtl ? 40 : -40, stagger: 0.06 });
```

Read `dir` off the document rather than importing a locale: the layout sets it,
and the hook stays independent of the i18n library. Vertical motion needs no
mirroring at all, which is a good reason to prefer it.

### A CSS transform is not a base GSAP adds to

Projects that mirror with CSS often put the whole arrangement in a transform:

```tsx
<div className="translate-x-3.5 rotate-3 rtl:-translate-x-3.5 rtl:-rotate-3" />
```

A GSAP transform **replaces that matrix rather than composing with it**, and
takes the `rtl:` variant with it, because an inline style outranks the class.
Animate `x` or `rotation` on that element and the mirroring is gone — in one
direction only, with nothing failing in the other.

Three ways out, in order:

1. **Animate a property CSS is not using.** `autoAlpha` on an element whose
   transform CSS owns costs nothing and breaks nothing. Usually enough.
2. **Animate a wrapper.** The wrapper carries the GSAP transform; the child
   keeps its CSS one.
3. **Move the arrangement into GSAP entirely**, mirroring it yourself from
   `document.documentElement.dir`. Only worth it when the offset itself is what
   animates, and it costs the no-JavaScript rendering.

`gsap.from(el, { x: 0 })` looks like it solves this. It animates to the right
place and then leaves an inline transform behind that no longer mirrors.

### Positioned from a measurement, anchored physically

A marker that slides to what it points at — a nav pill, a tab underline — is
best placed from the target's own geometry: `x: link.offsetLeft`,
`width: link.offsetWidth`. Measuring needs no `isRtl` branch, because the layout
is already mirrored by the time you read it.

But `offsetLeft` is physical, and so is `x`, so the marker's CSS anchor must be
physical too: `left: 0`. A lint rule that enforces logical CSS will suggest
`inset-inline-start: 0` instead, which resolves to `right: 0` on an RTL page
while the measurement still counts from the left — and the marker lands
off-screen in one direction only. Keep the physical anchor and use the
project's waiver, with this reason.

### Hue literals in SVGs

If the project requires colours to come from tokens, an inline SVG is the
easiest place to break that: it arrives as one paste with the literal in forty
attributes, sometimes hidden in an export tool's `<style>` block. Run
`audit-svg.mjs --hues` on the file first, and repaint with `currentColor` or
the project's CSS variables.

### Waivers carry reasons

The skill's `audit-gsap.mjs` waives a rule with its id plus `-ok` — for
example `shared-plugin-id-ok` — on the flagged line or in the eight above, and
every waiver carries a sentence saying why:

```ts
/* shared-plugin-id-ok — one instance only: this is the page-level backdrop,
   mounted once by the root layout and never by a component. */
gsap.to("#dot", { motionPath: { path: "#track" } });
```

A bare token with no reason is a rule someone switched off rather than
answered. If the project has its own waiver convention, follow that one.

### Templates under a dot-directory are not typechecked

TypeScript's default globs skip dot-directories such as `.claude/`, so the
skill's `template/*.ts` files are invisible to `tsc` unless the project's
`tsconfig.json` names them in `include`. Snippets inside Markdown are never
checked — treat them as starting points, and let the project's own checks be
the authority once the code is in its source tree.

## Before you call it done

Run the project's checks and `audit-gsap.mjs` on what you changed. Then watch
it run: both themes if there are two, with reduced motion emulated, at phone
width. A green build says the code compiles, not that the animation is right.
If you have not seen it move, say so rather than implying you have.
