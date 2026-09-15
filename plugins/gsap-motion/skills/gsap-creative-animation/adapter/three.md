# Three.js

GSAP is the **orchestration layer**, not the renderer. Three owns the scene, the
camera and the draw loop. GSAP owns *when* values change and *how* they ease
between states. With React Three Fiber, read [r3f.md](r3f.md) instead.

Three does not come with GSAP, and most projects have neither. Check
`package.json` before writing code against it, and say so if it is not there.

## The division

| GSAP | Three |
|---|---|
| timing, easing, sequencing | geometry, materials, lights |
| camera moves between positions | camera projection, the render loop |
| object transforms over time | the transforms themselves |
| material property transitions | shaders |
| tying it all to scroll | rendering the result |

Do not rebuild a physics engine or a particle system in GSAP, and do not
hand-write easing in the render loop when a tween says it in one line.

## Where it is created

Three objects are plain JavaScript objects, so GSAP tweens them directly. Nested
properties are their own targets:

```ts
gsap.to(mesh.position, { x: 2, y: 1, duration: 1.2, ease: "power3.inOut" });
gsap.to(mesh.rotation, { y: Math.PI * 2, duration: 3, ease: "none", repeat: -1 });
gsap.to(mesh.material, { opacity: 0, duration: 0.6 });
gsap.to(mesh.scale, { x: 1.4, y: 1.4, z: 1.4, duration: 0.5 });
```

`gsap.to(mesh, { position: { x: 2 } })` does not work. Target `mesh.position`.

For a material to animate opacity, `transparent` must already be true — setting
it mid-tween causes a shader recompile.

Shader uniforms are `{ value }` objects, which tween cleanly and are the usual
bridge between a timeline and a custom effect:

```ts
gsap.to(material.uniforms.uProgress, { value: 1, duration: 1.5, ease: "power2.inOut" });
```

Create all of it inside a `gsap.context`, as in [vanilla.md](vanilla.md): the
lifecycle is the vanilla one, because Three has no component model of its own.

## Where it is torn down

Two separate jobs, and GSAP only does the first:

- `ctx.revert()` for tweens, timelines and ScrollTriggers.
- **Three's own disposal is yours**: geometries, materials, textures, render
  targets, and the renderer itself. GSAP's cleanup does not touch them, and
  nothing else will.

Stop the render loop too. A `requestAnimationFrame` loop that outlives the
canvas keeps the GPU busy for a page nobody is looking at.

## Scope

Selector strings do not apply: targets are object references. The scoping
question becomes ownership — a module-level scene shared by two mounts animates
twice. Build the scene per mount, or key the timeline to the instance.

## Server rendering and hydration

None: WebGL exists only in the browser. Import the module that creates the scene
dynamically, after mount, so the server never evaluates it and the bundle does
not carry Three on routes that have no canvas.

## Reaching the element

By reference, held from where the object was created. Traversing the scene by
name (`scene.getObjectByName("Cube.003")`) binds the animation to whatever the
exporter happened to call it, which the next export changes.

## Every frame

The render loop is already per-frame; GSAP does not need to be. Use a tween for
transitions between states, and the loop for values that follow the clock. When
a tween must write something the loop reads, tween a proxy object and read it in
the loop rather than calling into Three from `onUpdate` many times per frame.

The one exception is a camera with `lookAt`, which overwrites the rotation you
tween. Tween a proxy target and call `lookAt` from `onUpdate`:

```ts
const look = { x: 0, y: 0, z: 0 };
gsap.to(look, {
  x: 2,
  duration: 2,
  onUpdate: () => camera.lookAt(look.x, look.y, look.z),
});
```

For scroll-driven 3D, scrub a timeline rather than computing from `scrollY` in
the loop, with `ease: "none"` on every child, as with any scrub. See
[scrolltrigger.md](../reference/scrolltrigger.md).

## Page and route changes

Dispose on leaving, and rebuild on arriving. A canvas kept across a navigation
is a live GPU context for a page that is gone.

## Failures

| Symptom | Cause |
|---|---|
| Nothing moves | tweened `mesh` instead of `mesh.position` |
| Opacity does nothing, or the frame stutters once | `transparent` set during the tween |
| The GPU stays busy after leaving the page | the render loop or the renderer was never stopped |
| Memory grows on every visit | geometries, materials or textures never disposed |
| The camera snaps back every frame | `lookAt` overwriting a tweened rotation |
| The page is slow on phones before anything moves | Three in the initial bundle instead of imported dynamically |

## Cost and accessibility

3D is the most expensive thing on a page, and the constraints are harder than
for DOM animation:

- A WebGL canvas runs the GPU continuously. On a phone that is battery and heat.
- Give the canvas a real fallback — a static image — for low-power devices and
  for `prefers-reduced-motion`. Stopping the animation while leaving a running
  canvas is not a reduced-motion design.
- Nothing essential — text, navigation, product information — should exist only
  inside the canvas.

## What the audit covers

Every rule except the React-specific three, on the `.js`, `.ts` and `.mjs`
modules that build the scene. It cannot see disposal, the render loop or GPU
cost: those are read by hand, and measured with
[performance.md](../reference/performance.md).

## Versions

Verified against `gsap@3.15`. Written for `three@0.150` and later, whose
disposal and uniform shapes these are.
