# Example: magnetic CTA

A worked interaction, end to end, showing the shape of the answer this skill
should produce.

## Analysis

- **Animating** — a primary CTA and its label.
- **Why** — the button should feel like it wants to be pressed. The response
  begins before the cursor arrives, which reads as intent rather than as a
  hover state.
- **Style** — premium and restrained. Small travel, long ease, no overshoot.
- **Trigger** — pointer movement inside a padded zone; leave returns it.
- **Techniques** — `gsap.quickTo` for the tracking, a paused timeline for the
  hover state. No plugins. MotionPath and Draggable would both be wrong here.

## Motion strategy

1. The pointer enters the zone — a 32px halo around the button.
2. The button eases toward the cursor at 32% of the offset.
3. The label travels half again as far, so the face has depth.
4. Simultaneously the button scales to 1.04 and its shadow deepens.
5. On leave, everything eases back to rest over 0.6s.

The return is the part that makes it feel physical, and the part most
implementations get wrong by snapping.

## Architecture

- `quickTo` functions created once, in the `useGSAP` body — not a tween per
  pointer event. This is the whole performance story.
- A paused hover timeline, played and reversed, so the return matches the
  arrival without a second definition.
- `gsap.matchMedia` gating on `(hover: hover) and (pointer: fine)` **and**
  `prefers-reduced-motion: no-preference`. Both gates are load-bearing.
- Listeners removed in the `matchMedia` callback's own cleanup. `mm` itself
  needs no revert: it registers with the active GSAP context and goes with it.

## Implementation

The hook is in [preset/magnetic.md](../preset/magnetic.md) — copy it rather than
duplicating it here.

```tsx
"use client";

import { useMagnetic } from "./useMagnetic";

export function MagneticCta({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) {
  const { zoneRef, targetRef, labelRef } = useMagnetic();

  return (
    // The zone's padding is the field radius — the pull starts here, not at
    // the button's edge. That is what turns a hover state into a field.
    <div ref={zoneRef} className="inline-flex p-8">
      <button
        ref={targetRef as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={onPress}
        // The focus ring carries the whole affordance for a keyboard, which
        // never sees the pull at all.
        className="rounded-full bg-neutral-900 px-7 py-3 text-sm font-medium text-white shadow-lg focus-visible:ring-2"
      >
        <span ref={labelRef} className="inline-block">
          {label}
        </span>
      </button>
    </div>
  );
}
```

## Usage

```tsx
<MagneticCta label={t("cta.contact")} onPress={open} />
```

The label is a message key resolved by the caller.

## Notes

- **Responsive** — the effect does not exist on touch. The button is an
  ordinary button there, which is correct; nothing is lost.
- **Performance** — two `quickTo` functions, no allocation per event, only
  transforms. The rect is measured per move because scroll shifts it; if that
  shows in a profile, cache on enter and invalidate on scroll.
- **Reduced motion** — no pull, no scale. The hover and focus states remain as
  instant colour and shadow changes, so the affordance survives.
- **Accessibility** — focus state equals hover state. The transform is small
  enough that the focus ring stays under the element.
- **Dependencies** — none beyond `gsap` and `@gsap/react`.

## Related

[preset/magnetic.md](../preset/magnetic.md) ·
[reference/interaction.md](../reference/interaction.md) ·
[reference/performance.md](../reference/performance.md)
