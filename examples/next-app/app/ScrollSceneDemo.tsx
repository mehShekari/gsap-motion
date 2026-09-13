"use client";

import { useScrollScene } from "../../../plugins/gsap-motion/skills/gsap-creative-animation/template/useScrollScene";

export function ScrollSceneDemo() {
  const rootRef = useScrollScene();

  return (
    <div ref={rootRef} className="scene">
      <h2>template/useScrollScene.ts</h2>
      <div data-beat="1">Beat one: pinned on desktop, revealed in view on phones</div>
      <div data-beat="2">Beat two: scrubbed with ease none</div>
      <div data-progress />
    </div>
  );
}
