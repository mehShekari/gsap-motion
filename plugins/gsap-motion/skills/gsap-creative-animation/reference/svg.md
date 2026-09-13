# SVG

SVG is one domain among several — reach for it when the shape itself is the
idea, not because the asset happens to be an SVG. A logo fading in is a
transform job.

**Run the audit first.** Every failure below is silent at runtime: DrawSVG on a
fill-only path animates nothing and throws nothing.

```bash
node .claude/skills/gsap-creative-animation/scripts/audit-svg.mjs <file.svg>
node .claude/skills/gsap-creative-animation/scripts/audit-svg.mjs --morph <a.svg> <b.svg>
```

## Preparation

### It must be inline in the DOM

GSAP animates DOM nodes. `<img src="x.svg">`, `next/image`, and a CSS
`background` all put the shapes somewhere GSAP cannot reach. Inline the markup
as JSX.

### Ids on everything the timeline targets

Without them you end up at `querySelectorAll("path")[3]`, which breaks on the
next export. Prefix them, and namespace per instance — see
[react-nextjs.md](react-nextjs.md). For a set animated together, one
`data-*` attribute beats a run of ids:

```tsx
<path data-petal d="…" />
```

### `viewBox` in, `width`/`height` out

MotionPath aligns in user units and converts coordinate systems through the
`viewBox`. Without one there is nothing to convert from. Size with CSS — that is
also what lets one loader work at 32px and 200px.

**The box must contain everything the animation draws, not just the ink.** An
orbit that circles a wide lockup is taller than the artwork, and sized to the
artwork alone the element is clipped for part of every lap.

### Colours

A theme cannot reach a hard-coded hue, and many projects lint for them — SVG
attributes are string literals like any other. Prefer `currentColor`, then one
of the project's CSS variables. `audit-svg.mjs --hues` lists every hue literal
in a file before it is pasted. See [project-rules.md](project-rules.md).

Export tools put paint in a `<style>` block keyed by generated class names
(`.st0`, `.cls-1`). Two traps: an attribute-only scan of the JSX will not see
those hues, and **the class names are not stable between files** — the same
`st0` can be the brand yellow in one export and a grey in another. Read the
declared fill, never the class name.

### Strip the export noise

`<title>`/`<desc>` (decide accessibility deliberately instead), whole-drawing
`clip-path` wrappers, `pathLength` (it rescales the dash maths DrawSVG relies
on), `style` blocks, `xlink:href`. In JSX: `class`→`className`,
`stroke-width`→`strokeWidth`, `stop-color`→`stopColor`, `fill-rule`→`fillRule`.

## DrawSVGPlugin

Animates a **stroke** by driving `stroke-dasharray` and `stroke-dashoffset`.

```ts
gsap.fromTo("#outline", { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.4 });
```

| Value | Means |
|---|---|
| `"0%"` | zero-length at the start — invisible |
| `"100%"` | the whole stroke |
| `"50% 100%"` | only the second half visible |
| `"20% 20%"` | zero-length at 20% along |

A travelling dash — the comet loader — is a tween between two same-width
windows:

```ts
gsap.fromTo("#ring", { drawSVG: "0% 25%" },
  { drawSVG: "75% 100%", repeat: -1, ease: "none", duration: 1.2 });
```

**It does nothing on a shape with no stroke, and throws nothing.** A filled
logo that must draw itself needs two layers of the same geometry: a stroked copy
that draws, then the filled version fading in under it, then the outline fading
out. A useful side effect — with JavaScript unavailable the outline is what
renders, so the fallback is the mark in outline rather than an empty box.

Set `strokeLinecap="round"` unless the design says otherwise; a half-drawn butt
cap ends in a visible flat edge.

## MorphSVGPlugin

Tweens one path's `d` into another's.

```ts
gsap.to("#shape", {
  morphSVG: { shape: "#target", shapeIndex: 3, type: "rotational" },
});
```

- `shapeIndex` decides which node of the target lines up with node 0 of the
  source. It is the difference between a glide and a spin, and the default is a
  guess. Find it once with `MorphSVGPlugin.findShapeIndex("#a", "#b")` in the
  browser console, then hardcode the number.
- `type: "rotational"` keeps segment angles instead of straight-lining points.
  Much better for organic shapes.
- `map` decides how the two shapes' **subpaths** are paired when each has
  several — a letter with a counter, a logo of separate marks. `"size"` is the
  default and pairs by area; `"position"` pairs by where they sit; and
  `"complexity"` pairs by node count, which is the one to reach for when the
  subpaths are similar in size but not in detail.

Both sides must be `<path>`:

```ts
MorphSVGPlugin.convertToPath("circle, rect, ellipse, line, polygon, polyline");
```

Convert in the source file where you can — a runtime conversion mutates the DOM
React thinks it owns. It is safe for static markup React never re-renders.

**Keep node counts within about 3×.** Beyond that MorphSVG subdivides the
simpler path, which is mathematically right and reads as a smear; the fix is to
redraw a shape, not to tune the tween. Best of all, author both shapes with the
**same command sequence** — a dot as a stadium with its straight run closed to
nothing morphs into a dash perfectly.

Target shapes should be unpainted (`fill="none" stroke="none"`) but **still
rendered** — `display: none` leaves no geometry to read.

## MotionPathPlugin

Moves an element along a path.

```ts
gsap.to("#dot", {
  motionPath: {
    path: "#track",
    align: "#track",
    alignOrigin: [0.5, 0.5],
    autoRotate: true,
    start: 0,
    end: 1,
  },
  duration: 3,
  repeat: -1,
  ease: "none",
});
```

- **`align` is the one people forget.** Without it the path's coordinates are
  offsets from the element's current position — the cause of "it moves, but
  nowhere near the path".
- `alignOrigin: [0.5, 0.5]` centres the element; the default is its top-left.
- `autoRotate: true` points it along travel. A number adds degrees, for art
  whose "forward" is not to the right.
- **`start: 1, end: 0` runs the path backwards** — which is how you mirror for
  RTL without authoring a second path.

A route is geometry, not decoration: `fill="none" stroke="none"`, still
rendered. `ease: "none"` on anything looping.

To author a path by eye, use `MotionPathHelper` in development only and bake the
`d` it gives you. It is an editor — never ship it.

## Masks and clip paths

Often better than either plugin, and cheaper. A mask reveal is a transform on a
rect inside a `<mask>`:

```tsx
<mask id={`${uid}-wipe`}>
  <rect data-wipe x="0" y="0" width="100%" height="100%" fill="#fff" />
</mask>
<g mask={`url(#${uid}-wipe)`}>…</g>
```

```ts
gsap.from("[data-wipe]", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.8 });
```

Greyscale in a mask is an alpha stop, not a colour — the one literal this
repo's colour rule allows.

## Choosing

```text
stroke, and the drawing is the idea        → DrawSVG
two shapes, and the change is the idea     → MorphSVG
something travelling a route               → MotionPath
a reveal                                   → mask or clip-path
moving, scaling, rotating whole groups     → plain transforms
```

Never force MorphSVG or DrawSVG onto a structure that does not support it. Say
why, and offer the alternative.
