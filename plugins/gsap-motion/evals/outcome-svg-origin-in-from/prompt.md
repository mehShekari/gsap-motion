---
description: On an SVG element, a fromTo that scales from a value other than 1 with transformOrigin only in the to-vars ends offset by the origin's distance from the element's own top-left corner × (1 − starting scale) — smoothOrigin compensates while the element is still at its from-scale, and the translate stays. A circle grown from 0 around its centre lands a whole radius up and left, with no error. Verified in gsap 3.15.0 in Chrome; HTML elements are unaffected. Not yet piloted.
tags: [outcome, svg]
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill]
---

In React with GSAP, when this component mounts, make each dot grow out of its own centre from nothing to full size, one after another, and after they have all appeared make them pulse bigger once. Use fromTo so the start and end values are explicit. Reply with the component.

```tsx
export function Dots() {
  return (
    <svg viewBox="0 0 300 100">
      <circle data-dot cx="50" cy="50" r="30" fill="currentColor" />
      <circle data-dot cx="150" cy="50" r="30" fill="currentColor" />
      <circle data-dot cx="250" cy="50" r="30" fill="currentColor" />
    </svg>
  );
}
```
