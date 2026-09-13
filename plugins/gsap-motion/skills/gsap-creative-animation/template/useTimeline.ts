"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useCallback, useRef } from "react";

/**
 * Starting point for a component-scoped GSAP timeline.
 *
 * Copy it into the project's hooks folder or next to the component that owns
 * it, rename it, and replace the timeline body. The structure is the part worth
 * keeping: plugin registration at module scope, a scoped `useGSAP`, a
 * `matchMedia` branch that treats reduced motion as a design rather than an off
 * switch, and an explicit teardown for the things the GSAP context does not
 * own.
 *
 * Worth typechecking where the skill is installed: add the skill's `template/`
 * folder to `tsconfig.json`'s `include`. TypeScript's globs skip dot-directories
 * such as `.claude/`, and an example that has quietly stopped compiling is worse
 * than none.
 */
gsap.registerPlugin(useGSAP);

/** One place for the numbers, so retiming is not a hunt through the body. */
const TIMING = {
  enter: 0.8,
  stagger: 0.08,
  hold: 0.4,
} as const;

export function useTimeline() {
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * Kept on a ref rather than returned directly: the timeline is built inside
   * the effect, and a caller that wants to replay it needs a stable handle that
   * does not exist until then.
   */
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      /**
       * `matchMedia` rather than a one-off query, because a visitor can change
       * the preference or the viewport while the component is mounted. GSAP
       * reverts the losing branch and builds the other one; a plain `if` leaves
       * the first animation running forever.
       */
      const mm = gsap.matchMedia();

      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { reduced } = context.conditions as Record<string, boolean>;

          /**
           * The reduced branch must set the END state, not merely skip the
           * tween. A `from` that never runs leaves its target at the authored
           * start — which hides the content rather than calming it. This is the
           * most common reduced-motion bug there is.
           */
          if (reduced) {
            gsap.set("[data-item]", { autoAlpha: 1, y: 0 });
            return;
          }

          timelineRef.current = gsap
            .timeline({ defaults: { ease: "power3.out" } })
            .from("[data-item]", {
              y: 32,
              autoAlpha: 0,
              duration: TIMING.enter,
              stagger: TIMING.stagger,
            })
            /**
             * Positions, not delays. `<` starts a child with the previous one
             * and survives a duration change upstream, where `-=0.3` silently
             * drifts.
             */
            .to("[data-accent]", { scaleX: 1, duration: 0.5 }, "<0.2");
        },
      );

      /**
       * Nothing is returned, and that is deliberate. `matchMedia` registers
       * itself with whatever GSAP context is active when it is constructed, so
       * this one is reverted along with every tween above — as are Observer,
       * Draggable, SplitText and ScrollTrigger when built in here.
       *
       * What a context never sees is the rest: timers, raw `addEventListener`,
       * ResizeObserver, Three.js disposal. Return a cleanup for those.
       */
    },
    { scope: rootRef },
  );

  /**
   * Playing a timeline that already exists creates nothing, so this needs no
   * `contextSafe` — the context already owns it. Wrapping it would also be a
   * lint error, because `contextSafe` runs during render and reading a ref
   * there is what React forbids. Reserve `contextSafe` for a handler that
   * *creates* a tween.
   */
  const replay = useCallback(() => timelineRef.current?.restart(), []);

  return { rootRef, replay };
}
