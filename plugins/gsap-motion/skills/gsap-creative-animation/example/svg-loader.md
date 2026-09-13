# Example: SVG logo loader

A loader built from a logo, end to end. The code is trimmed to the parts worth
copying — adapt the selectors, path data and timings to your own artwork.

## The brief

A loading indicator carrying the brand, working from 32px to 200px, in light and
dark themes, and on right-to-left pages.

## Analysis

The mark is three **filled** paths. DrawSVG animates a stroke, so the artwork as
delivered could not be drawn at all — that constraint decided the structure.

Sequence: the outline writes itself, the fills arrive underneath, the outline
retires, and a dot takes up an orbit for as long as the wait lasts.

## What is worth copying

**Two layers of one geometry.** The same `d` is rendered twice — once stroked
(`data-outline`), once filled (`data-fill`, starting transparent). The stroke
draws, the fill fades in under it, the stroke fades out.

```tsx
// A sketch of the markup. MARK is the logo's path data; uid is below.
<svg viewBox="-24 -24 248 248" role="img" aria-label={label}>
  {MARK.map((d, i) => (
    <path key={`o${i}`} data-outline d={d} fill="none" stroke="currentColor" />
  ))}
  {MARK.map((d, i) => (
    <path key={`f${i}`} data-fill d={d} fill="currentColor" opacity="0" />
  ))}
  <path id={`${uid}-track`} d={ORBIT} fill="none" />
  <path id={`${uid}-orbiter`} d={DOT} fill="currentColor" opacity="0" />
  <path id={`${uid}-dash`} d={DASH} visibility="hidden" />
</svg>
```

The side effect is better than the effect: with JavaScript unavailable the
stroked layer is what renders, so the fallback is the mark in outline rather
than an empty box. `useGSAP` runs in a layout effect, so the full outline never
paints before the draw begins.

```ts
gsap.registerPlugin(useGSAP, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin);

gsap
  .timeline()
  .fromTo(
    "[data-outline]",
    { drawSVG: "0%" },
    { drawSVG: "100%", duration: WRITE_SECONDS, stagger: 0.18, ease: "power2.inOut" },
  )
  // The fills land before the outlines finish, so the mark is never hollow.
  .to(
    "[data-fill]",
    { autoAlpha: 1, duration: 0.5, stagger: 0.1, ease: "power1.out" },
    `-=${WRITE_SECONDS * 0.45}`,
  )
  .to("[data-outline]", { autoAlpha: 0, duration: 0.35 }, "<0.2")
  .to(orbiter, { autoAlpha: 1, duration: 0.3 }, "<");
```

**Per-instance ids.** `useGSAP` scopes the selectors it resolves, but
`motionPath.path` and `morphSVG.shape` are resolved by the plugins against the
whole document. With a fixed id, three loaders on one page all drive the first
one's orbit — silently. Use `useId()`, stripped to word characters because
React's id carries delimiters a CSS selector cannot hold:

```ts
const uid = `ldr${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
const track = `#${uid}-track`;
const orbiter = `#${uid}-orbiter`;
const dash = `#${uid}-dash`;
```

**Direction without a second path.** A loader spinning against the reading
direction reads as rewinding. Run the same path backwards:

```ts
const isRtl = document.documentElement.dir === "rtl";

gsap.to(orbiter, {
  motionPath: {
    path: track,
    align: track,
    alignOrigin: [0.5, 0.5],
    autoRotate: true,
    start: isRtl ? 1 : 0,
    end: isRtl ? 0 : 1,
  },
  duration: ORBIT_SECONDS,
  repeat: -1,
  ease: "none", // any other ease stutters at the seam where the loop restarts
  delay: WRITE_SECONDS * 0.8,
});
```

**A morph pair authored to match.** The dot and the dash are both six-node
stadiums with the same command sequence — the dot is the dash with its straight
run closed to nothing. Identical structure is what makes the morph glide, and it
is cheaper to author in than to correct later with `shapeIndex`.

```ts
gsap.to(orbiter, {
  morphSVG: { shape: dash, type: "rotational" },
  duration: ORBIT_SECONDS / 2,
  repeat: -1,
  yoyo: true,
  ease: "sine.inOut",
  delay: WRITE_SECONDS * 0.8,
});
```

**The viewBox contains the orbit, not just the ink.** Sized to the artwork
alone, the dot is clipped for part of every lap.

**Lettering follows the theme.** Paint with `currentColor` over a theme-aware
colour. A brand colour that is fixed across themes — a dark graphite, say — can
read at about 1.3:1 on a dark page.

**Reduced motion keeps something moving.** The mark arrives drawn and the
orbiter breathes. A loader with nothing moving reads as a page that has hung.

```ts
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        motion: "(prefers-reduced-motion: no-preference)",
        reduced: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { reduced } = context.conditions as { reduced: boolean };
        if (reduced) {
          gsap.set("[data-outline]", { autoAlpha: 0 });
          gsap.set("[data-fill]", { autoAlpha: 1 });
          gsap.to(orbiter, {
            autoAlpha: 0.3,
            duration: 1.2,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
          });
          return;
        }
        // …the timeline, orbit and morph above
      },
    );
  },
  { scope: rootRef },
);
```

No cleanup is returned, deliberately: the `matchMedia` is created inside
`useGSAP`, so it is reverted with the context along with every tween it built.

## Mistakes made while building it

Both were caught by checking output, not by reading code:

1. **A theme-fixed colour on the lettering** — invisible on the dark page.
2. **Hardcoded ids** — found by reading the server-rendered HTML and seeing the
   same `id` three times on one page.

## Usage

```tsx
<Loader label={t("loading")} className="size-24" />
```

The label comes from the caller. A client component that imported the
project's messages itself could bundle every locale.

## Related

[preset/loader.md](../preset/loader.md) · [reference/svg.md](../reference/svg.md)
· [reference/react-nextjs.md](../reference/react-nextjs.md)
