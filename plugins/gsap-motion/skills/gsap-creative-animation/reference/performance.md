# Performance

A frame is 16.7ms at 60Hz, 8.3ms at 120Hz, and **6.2ms at 165Hz** — a rate
ordinary gaming and creator monitors ship with now. GSAP drives tweens at
whatever rate the display reports, so the budget you actually have is often less
than half the figure people quote. Everything below is about staying inside it.

That also makes 60Hz the wrong thing to design against in both directions: a
high-refresh display hides jank a 60Hz laptop shows, and a mid-range phone
throttling to 30Hz shows jank neither reveals.

## What animating a property costs

| Property | Browser does | Cost |
|---|---|---|
| `transform`, `opacity` | composite only | cheap — animate freely |
| `filter`, `backdrop-filter` | paint, often per frame | expensive over large areas |
| `background-position`, `box-shadow`, `border-radius` | repaint | moderate |
| `width`, `height`, `top`, `left`, `margin`, `padding` | **layout** | expensive — avoid |

The substitutions that matter:

```ts
{ left: 100 }      →  { x: 100 }
{ width: "50%" }   →  { scaleX: 0.5, transformOrigin: "0% 50%" }
{ top: 0 }         →  { y: 0 }
{ display }        →  { autoAlpha }
```

`autoAlpha` is `opacity` plus `visibility`, so a hidden element stops taking
pointer events without a layout-triggering `display` change.

Animating `height: auto` is the classic trap. Use a `scaleY` on a wrapper, a
`grid-template-rows: 0fr → 1fr` transition, or Flip with `scale: true`.

### The swap is not always one for one

`top: 50%` is half the **containing block**. `y: "50%"` and `yPercent: 50` are
half the **element itself**. Swap them on a 1px rule and its full-height travel
becomes half a pixel — silently, and worse than the layout cost it replaced.

Two ways out:

1. **Give the moving element its container's height** and translate that, with
   the visible mark pinned inside it. The percentages then agree and nothing has
   to be measured. A scanner line is the usual case: a full-height box
   carrying a 1px line at its top, moved with `yPercent`.
2. **Measure the container once** and translate in pixels — then keep the
   measurement fresh across resizes yourself.

The same asymmetry applies to `left`/`x` and to any percentage `width` or
`height` swapped for a scale.

### `scale`, `rotate` and `translate` are not `transform`

They are CSS properties of their own, and they **compose** with `transform`
rather than being replaced by it. Tailwind v4 compiles its `scale-*`,
`rotate-*` and `translate-*` utilities to them. GSAP accommodates them: the
first time it reads an element's transform, it folds their computed values into
its own and sets all three to `none` inline (verified against gsap 3.15). Two
silent failures follow:

- **Code that writes `style.transform` itself** — a rAF loop, a `useFrame`, a
  scroll store — still composes with a class's `scale`. `scale-y-0` plus an
  inline `scaleY(0.6)` is still zero, so the element never shows. Give the
  initial state in the property the code writes: `gsap.set`, or an arbitrary
  `transform` class in place of the utility.
- **On an element GSAP has transformed, those classes stop working.** The inline
  `none` outranks them, so a `hover:scale-105`, or a breakpoint's
  `translate-x-*`, does nothing from then on. Animate those states with GSAP
  too, or put them on a wrapper GSAP never touches.

## The pointer rule

One tween per pointer event allocates an object per frame and creates tweens
that fight each other. Create the retargeting function once:

```ts
const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
```

See [interaction.md](interaction.md).

## The React rule

State that changes every frame is a re-render every frame — the whole subtree
reconciles so one element can move 3px.

```ts
// Wrong
const [x, setX] = useState(0);

// Right
const xTo = gsap.quickTo(ref.current, "x", { duration: 0.4 });
```

State owns *what exists*. GSAP owns *how it moves*.

## ScrollTrigger cost

- **One trigger for one visual moment.** Forty cards revealing together is one
  trigger with a stagger, not forty triggers. Each carries its own start/end
  maths on every scroll.
- Anything measuring layout inside `onUpdate` runs on every scroll frame. Cache
  it, or move it to `onRefresh`.
- `scrub: 1` is smoother *and* cheaper than `scrub: true` — it batches into the
  ticker instead of tracking exactly.
- Pinning adds wrapper elements. Pinning many sections adds many.

## `will-change`

Promotes an element to its own compositor layer. Useful in small doses,
counterproductive in large ones — every layer costs memory, and dozens can be
slower than none.

GSAP sets it automatically during a tween when it helps. Add it by hand only for
something that animates continuously, and never on a long list.

## Filters and blur

`filter: blur()` is repainted every frame and scales with area. A blurred
full-screen backdrop animating is one of the most reliable ways to drop frames
on a mid-range phone.

Alternatives: a pre-blurred image, a `radial-gradient`, a lower-resolution
layer scaled up, or animating `opacity` between two static states — one sharp,
one blurred.

## SVG cost

Large or complex SVG animation is CPU work, not GPU work. Watch for:

- Paths with thousands of nodes — simplify in the design tool first.
- Filters (`feGaussianBlur`, `feTurbulence`) animating — very expensive.
- `MorphSVGPlugin.convertToPath()` at runtime on every mount — convert in the
  source file.
- Many elements on motion paths — each is a per-frame path calculation.

## Measuring

Do not optimise from intuition — and time your instrumentation in
**milliseconds, never frames**. A fixed frame count is a different duration on
every display: 90 frames is 1.5s at 60Hz and 0.56s at 165Hz, which is the
difference between capturing the end of an animation and stopping just before
the part that was going wrong.

```js
const t0 = performance.now();
const tick = () => {
  const ms = performance.now() - t0;
  /* record */
  if (ms < 4000) requestAnimationFrame(tick);
};
```

Counting frames to infer a refresh rate does not work either: an eased tween
rounds to its end value long before it mathematically finishes, so "frames until
it stopped changing" undercounts badly.

### Timing in milliseconds, settling in frames

The rule above is about *how long* something takes. *Has it finished?* is a
different question, and a timer answers it wrongly.

GSAP's ticker runs on `requestAnimationFrame`. A page driven by automation, or a
tab in the background, throttles or pauses rAF while `setTimeout` keeps firing
on schedule. So a harness that waits with `setTimeout(done, 800)` and then reads
computed styles sees every `gsap.set` exactly where it belongs and every
`gsap.to` frozen part-way — a pill holding the last target's width, an opacity
still at its class value. That reads precisely like a lifecycle bug, and it is
not one.

It is an expensive misdiagnosis. A sliding nav pill checked this way was
blamed on a `useGSAP` revert under StrictMode, refactored onto a plain effect,
and given a lint waiver — and all three were undone once the same test waited
in frames. The original code had been right throughout.

Wait for a duration, but only let the wait end on a rendered frame:

```js
const settle = (ms) =>
  new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () =>
      performance.now() - t0 >= ms ? resolve() : requestAnimationFrame(tick);
    requestAnimationFrame(tick);
  });
```

That keeps the duration independent of the display, and guarantees the ticker
had frames to run in. If it never resolves, the page is not rendering at all —
bring it to the front. A hang is a loud failure; a timer's stale reading is a
silent one.

**If `gsap.set` lands and `gsap.to` does not, suspect the harness before the
code.** Read the value twice a few frames apart: unchanged and short of its
target means the ticker is not running.

1. **Performance panel, 4× or 6× CPU throttling.** Record the interaction. Long
   tasks and "Recalculate Style" / "Layout" bars are the signal.
2. **Rendering panel → Paint flashing** shows what is repainting.
3. **Layers panel** shows how many compositor layers exist.
4. Test on a real mid-range phone. A desktop hides almost every problem here.

If the trace shows time in Layout, you are animating a layout property. If it
shows Paint, something is repainting — usually a filter or a shadow. If it shows
Scripting, it is your handler, and usually React.

## WebGL: the first frame of each material

Three compiles a material's shader the first time it draws it, and uploads a
texture the first time it samples it. Both run on the main thread, inside that
frame's render — so an object first seen mid-scroll costs one frame of hundreds
of milliseconds, once, and never shows again in a trace recorded after it.

Compile ahead, behind the loader or before scroll can reach the object:

```ts
await renderer.compileAsync(scene, camera);   // R3F: gl, scene, camera from useThree
renderer.initTexture(texture);                 // uploads now, not on first sample
```

- **Objects with `visible: false` are compiled too** — `compile` walks every
  mesh. Lights are not: a light that is off at compile time and turned on later
  changes the lighting state, and every lit material recompiles then.
- **Inside a render target it is a different program.** Drawing into one turns
  tone mapping off and outputs the working colour space, so post-processing,
  a portal or a render-to-texture uses a variant the screen compile never made.
  Compile once more with any render target bound:

  ```ts
  const warm = new WebGLRenderTarget(1, 1);
  renderer.setRenderTarget(warm);
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  warm.dispose();
  ```

- **Fog, shadows, clipping planes, a new environment map**, and a changed light
  count or tone mapping, each change the program. Set them before compiling.
- `compileAsync` waits on `KHR_parallel_shader_compile` where it exists. Where it
  does not, the work still happens on the main thread — which is why it belongs
  before the scroll, not at the moment the object appears.
- What cannot be warmed can be timed: mount the heavy object on ScrollTrigger's
  `scrollEnd` event, when a dropped frame costs nothing visible.

Verified against `three@0.186`.

## Budget

- A frame means everything in it — your handler, style, layout, paint,
  composite — inside the display's interval: 16.7ms at 60Hz, 6.2ms at 165Hz.
- A handful of transform/opacity tweens costs almost nothing.
- One full-screen blur can cost the whole budget on a phone.
- Dozens of simultaneous timelines are fine; dozens of simultaneous *layouts*
  are not.

## Loading

GSAP core is roughly 23KB min+gzip. Plugins are extra, so import from subpaths —
`gsap/ScrollTrigger`, never `gsap/all` — and only in the component that needs
them. A component that is below the fold can be dynamically imported with its
animation code.

## Checklist

- Only `transform` and `opacity` in anything continuous or scroll-driven?
- One tween retargeted for pointer, not one per event?
- No React state changing per frame?
- One ScrollTrigger per visual moment?
- No layout measurement inside `onUpdate`?
- Filters limited in area, or avoided?
- Everything reverted on unmount — no orphaned triggers or listeners?
- Verified on a throttled CPU and a real phone?
- End states read after waiting in rendered frames, not on a timer?
