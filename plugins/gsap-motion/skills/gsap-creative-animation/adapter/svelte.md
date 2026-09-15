# Svelte and SvelteKit

Svelte 5 runs effects in runes mode; `onMount` still works and reads the same in
both versions. Either way the animation is created after mount, in a context
that is reverted when the component is destroyed.

## Where it is created

```svelte
<script>
  import gsap from "gsap";

  let root;

  $effect(() => {
    const ctx = gsap.context(() => {
      gsap.from("[data-item]", { autoAlpha: 0, y: 24, stagger: 0.06 });
    }, root);

    return () => ctx.revert();
  });
</script>

<section bind:this={root}>…</section>
```

`$effect` runs after the component is mounted in the browser, and the function
it returns runs before the next run and when the component is destroyed. In
Svelte 4, or in a codebase that has not moved to runes, the same body goes in
`onMount` and returns the same cleanup.

Check how the project declares a bound element before copying this: `let root`
in classic syntax, `let root = $state()` in runes.

## Where it is torn down

The function returned from `$effect` or from `onMount`, calling `ctx.revert()`.
That reverts every tween, ScrollTrigger, Observer, Draggable, SplitText and
matchMedia created inside.

An effect re-runs whenever a rune it read changes. If the body creates
animations, either keep it free of reactive reads, or accept the re-run and let
the returned cleanup revert the previous one first — which it does, before the
body runs again.

Timers, listeners and observers are yours, in the same cleanup.

## Scope

`gsap.context(fn, root)` scopes selector strings to the component's element.
Plugin config is not scoped: `motionPath.path` and `morphSVG.shape` resolve
against the whole document, so generate an id per instance — from whatever
unique-id helper your Svelte version provides, or a module counter — rather than
hardcoding one.

## Server rendering and hydration

Neither `$effect` nor `onMount` runs during server rendering, so this is safe
under SvelteKit as written. Do not read `window`, `document` or `matchMedia` at
the top level of `<script>`: that runs on the server. Read them inside the
effect.

Render the neutral state on the server and correct it after mount, so the
hydrated markup matches what was sent.

## Reaching the element

`bind:this` for the root, `data-*` attributes for the parts. Svelte scopes CSS
classes by compiling them, so a class selector in a tween may not match what is
in the DOM — a `data-*` attribute is stable and says what it is for.

## Every frame

Refs, not `$state`. Writing a rune every frame re-renders the component;
`gsap.quickTo` writes straight to the element. State is for what exists — is the
drawer open, which tab is active.

## Page and route changes

SvelteKit destroys the outgoing component, so the context goes with it. For an
exit animation, put the overlay in a layout, which navigation does not destroy,
or hold the navigation while a timeline plays with the router's own hooks.

After navigation, call `ScrollTrigger.refresh()` once the new page settles.

## Failures

| Symptom | Cause |
|---|---|
| `window is not defined` during a build | `window` read at the top of `<script>` instead of inside the effect |
| Animations stack up on every state change | an effect that reads a rune, with no cleanup reverting the previous run |
| Tween targets nothing | a class selector the compiler rewrote; use `data-*` |
| Hydration mismatch | markup derived from storage or a media query during render |

## What the audit covers

From 3.2 the audit reads the `<script>` block of `.svelte` files, with offsets
kept, so reported lines match the file. Every rule that is not React-specific
applies; `orphan-tween`, `state-per-event` and `shared-plugin-id` do not run
here.

## Versions

Verified against `gsap@3.15`. Written for `svelte@5`, with the `onMount` form
for `svelte@4`.
