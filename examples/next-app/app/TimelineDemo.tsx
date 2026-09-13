"use client";

import { useTimeline } from "../../../plugins/gsap-motion/skills/gsap-creative-animation/template/useTimeline";

export function TimelineDemo() {
  const { rootRef, replay } = useTimeline();

  return (
    <div ref={rootRef}>
      <div data-item>Arrives first</div>
      <div data-item>Then this</div>
      <div data-item>Then this</div>
      <div data-accent />
      <button type="button" onClick={replay}>
        Replay
      </button>
    </div>
  );
}
