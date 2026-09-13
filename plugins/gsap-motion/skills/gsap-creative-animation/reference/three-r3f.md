# Three.js and React Three Fiber

GSAP is the **orchestration layer**, not the renderer. Three owns the scene,
the camera, and the draw loop. GSAP owns *when* values change and *how* they
ease between states.

Neither library comes with GSAP, and most projects have neither. Check
`package.json` before writing code against them, and say so if they are not
there.

## The division

| GSAP | Three / R3F |
|---|---|
| timing, easing, sequencing | geometry, materials, lights |
| camera moves between positions | camera projection, the render loop |
| object transforms over time | the transforms themselves |
| material property transitions | shaders |
| tying it all to scroll | rendering the result |

Do not rebuild a physics engine or a particle system in GSAP. Do not hand-write
easing in `useFrame` when a tween would say it in one line.

## The core pattern

Three objects are plain JS objects, so GSAP tweens them directly. The only thing
to remember is that nested properties are their own targets:

```ts
gsap.to(mesh.position, { x: 2, y: 1, duration: 1.2, ease: "power3.inOut" });
gsap.to(mesh.rotation, { y: Math.PI * 2, duration: 3, ease: "none", repeat: -1 });
gsap.to(mesh.material, { opacity: 0, duration: 0.6 });
gsap.to(mesh.scale, { x: 1.4, y: 1.4, z: 1.4, duration: 0.5 });
```

`gsap.to(mesh, { position: { x: 2 } })` does not work. Target `mesh.position`.

For a material property to animate opacity, `transparent` must already be true —
setting it mid-tween causes a shader recompile.

## Uniforms

Shader uniforms are `{ value }` objects, which tween cleanly:

```ts
gsap.to(material.uniforms.uProgress, { value: 1, duration: 1.5, ease: "power2.inOut" });
```

This is the usual bridge between a GSAP timeline and a custom shader effect —
one uniform, driven by the timeline, interpreted by the shader.

## R3F

The renderer runs its own loop, so nothing needs invalidating on demand unless
the canvas is set to `frameloop="demand"` — in which case call `invalidate()`
from `onUpdate`.

```tsx
"use client";

import { useGSAP } from "@gsap/react";
import { useFrame, useThree } from "@react-three/fiber";
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

**Never drive a 3D transform through React state.** `useState` per frame
re-renders the React tree for a value Three reads directly. Refs and GSAP only.

`useFrame` and GSAP are complementary, not competing: `useFrame` for continuous
per-frame logic that depends on the clock, GSAP for transitions between states.

## Camera

Camera moves are where GSAP earns its place — easing a camera by hand is how
scroll-driven 3D ends up feeling mechanical.

```ts
const { camera } = useThree();

gsap.timeline({ defaults: { ease: "power2.inOut", duration: 2 } })
  .to(camera.position, { x: 0, y: 1.5, z: 4 })
  .to(camera.rotation, { x: -0.2 }, "<");
```

If the camera uses `lookAt`, tween a proxy target and call `lookAt` in
`onUpdate` — otherwise the rotation you tween is overwritten every frame:

```ts
const look = { x: 0, y: 0, z: 0 };
gsap.to(look, {
  x: 2,
  duration: 2,
  onUpdate: () => camera.lookAt(look.x, look.y, look.z),
});
```

## Scroll-driven 3D

Scrub a timeline, do not compute from `scrollY` in `useFrame`:

```ts
gsap.timeline({
  scrollTrigger: { trigger: section, start: "top top", end: "+=2000",
                   pin: true, scrub: 1 },
})
  .to(camera.position, { z: 3, ease: "none" })
  .to(material.uniforms.uProgress, { value: 1, ease: "none" }, "<");
```

`ease: "none"` on every child, as with any scrub. See
[scrolltrigger.md](scrolltrigger.md).

## Cost and accessibility

3D is the most expensive thing on a page, and the constraints are harder than
for DOM animation:

- A WebGL canvas runs the GPU continuously. On a phone that is battery and heat.
- Give the canvas a real fallback — a static image — for low-power devices and
  for `prefers-reduced-motion`. Do not merely stop the animation and leave a
  running canvas.
- Dynamically import the 3D component so Three is not in the initial bundle.
- `frameloop="demand"` when the scene is static between interactions.
- Dispose geometries, materials and textures on unmount; GSAP's cleanup does not
  do that.
- Nothing essential — text, navigation, product information — should exist only
  inside the canvas.

## Cleanup

```ts
useGSAP(() => {
  const tl = gsap.timeline({ scrollTrigger: { ... } });
  return () => { tl.scrollTrigger?.kill(); };
});
```

Plus Three's own disposal, which is separate and yours to do.
