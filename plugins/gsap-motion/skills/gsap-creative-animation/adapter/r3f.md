# React Three Fiber

R3F is React's renderer for Three, so both lifecycles apply: read
[react.md](react.md) for the context and cleanup rules, and
[three.md](three.md) for what GSAP may tween on a Three object. This file is the
part that is neither.

## Where it is created

In a `useGSAP` body inside the `<Canvas>` subtree, against refs to the objects:

```tsx
"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import type { Mesh } from "three";

export function Box() {
  const mesh = useRef<Mesh>(null);

  useGSAP(() => {
    if (!mesh.current) return;
    gsap.to(mesh.current.rotation, {
      y: Math.PI * 2,
      duration: 6,
      ease: "none",
      repeat: -1,
    });
  });

  return (
    <mesh ref={mesh}>
      <boxGeometry />
      <meshStandardMaterial />
    </mesh>
  );
}
```

A camera move is where GSAP earns its place — easing a camera by hand is how
scroll-driven 3D ends up feeling mechanical:

```ts
const { camera, invalidate } = useThree();

gsap.timeline({ defaults: { ease: "power2.inOut", duration: 2 } })
  .to(camera.position, { x: 0, y: 1.5, z: 4 })
  .to(camera.rotation, { x: -0.2 }, "<");
```

## Where it is torn down

The `useGSAP` context reverts the tweens, as in react.md.

R3F disposes what it created for elements it rendered, when they unmount.
Anything you built yourself — a geometry, material or texture made outside JSX,
a loader's result you cached — is yours to dispose.

## Scope

There are no selector strings here: targets are refs. `{ scope: root }` still
matters for any DOM overlay the component renders beside the canvas.

## Server rendering and hydration

The canvas is client-only. Import the component dynamically so Three is not in
the initial bundle, and render a fallback while it loads — that fallback is also
the reduced-motion and low-power design, so it is not wasted work.

## Reaching the element

Refs, held where the object is declared. `useThree` reaches the camera, the
renderer and the scene without prop-drilling. Traversing by name binds to the
exporter's names, which the next export changes.

## Every frame

**Never drive a 3D transform through React state.** `useState` per frame
re-renders the React tree for a value Three reads directly. Refs and GSAP only.

`useFrame` and GSAP are complementary, not competing: `useFrame` for continuous
logic that follows the clock, GSAP for transitions between states. Inside
`useFrame`, the rules are the ones for any per-frame scope — no allocation, no
state, no `setState` from a callback.

With `frameloop="demand"`, the canvas renders only when something asks it to, so
a GSAP tween that changes a Three value must ask:

```ts
gsap.to(mesh.current.position, { y: 1, onUpdate: invalidate });
```

Without that, the tween runs and nothing is drawn — the most confusing failure
in this file, because every value is correct.

## Page and route changes

The canvas unmounts with the route, and R3F disposes its own objects. What
survives is anything you created outside JSX, plus any ScrollTrigger built
against a DOM element that is now gone — which the context reverts, provided it
was created inside the body.

## Failures

| Symptom | Cause |
|---|---|
| Values change but nothing is drawn | `frameloop="demand"` with no `invalidate` from `onUpdate` |
| The whole tree re-renders while animating | 3D values held in React state |
| Nothing moves | tweened the object instead of `object.position` / `.rotation` |
| The tween starts before the object exists | no early return on a null ref |
| Memory grows across route changes | objects created outside JSX, never disposed |
| Scroll-driven camera drifts out of sync | a scrub with an ease on a child, instead of `ease: "none"` |

## What the audit covers

The React rules from react.md, since these are `.tsx` files. From 3.2,
`useFrame` counts as a per-frame scope, so React state set inside it is reported
as `state-per-event`.

Disposal, GPU cost and the render loop are not checkable — read for them, and
measure with [performance.md](../reference/performance.md).

## Versions

Verified against `gsap@3.15` and `@gsap/react@2.1`. Written for
`@react-three/fiber@8` and `@react-three/fiber@9`.
