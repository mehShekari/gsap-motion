"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

/**
 * Starting point for a scroll-driven scene.
 *
 * The shape here is the lesson: one trigger owning one timeline, a genuinely
 * different strategy on mobile rather than a smaller one, and `ease: "none"`
 * throughout because the scrollbar — not an ease curve — is the playhead.
 *
 * Copy it, rename it, replace the beats. Typechecked for the same reason as
 * the sibling template.
 */
gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Scroll distance the pinned sequence is spread across, in pixels. */
const SCROLL_LENGTH = 2400;

export function useScrollScene() {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const mm = gsap.matchMedia();

      mm.add(
        {
          desktop: "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
          mobile: "(max-width: 767px) and (prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { desktop, reduced } = context.conditions as Record<
            string,
            boolean
          >;

          /**
           * Scroll-scrubbed pinning is a textbook vestibular trigger: the
           * content moves while the page does not. Under `reduce` the beats
           * simply exist, composed, with no pin and no scrub.
           */
          if (reduced) {
            gsap.set("[data-beat]", { autoAlpha: 1, y: 0 });
            return;
          }

          /**
           * Not the desktop sequence scaled down. A 2400px pin on a phone is a
           * long time to be stuck, and pinning fights the address bar
           * collapsing — so each beat becomes an ordinary in-view reveal
           * instead. Same content, different strategy.
           */
          if (!desktop) {
            gsap.utils.toArray<HTMLElement>("[data-beat]").forEach((beat) => {
              gsap.from(beat, {
                autoAlpha: 0,
                y: 24,
                duration: 0.6,
                ease: "power3.out",
                scrollTrigger: { trigger: beat, start: "top 78%" },
              });
            });
            return;
          }

          gsap
            .timeline({
              /**
               * `ease: "none"` on every child. Easing inside a scrubbed
               * timeline fights the visitor's own scrolling and reads as lag —
               * `scrub` is where the smoothing belongs.
               */
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: root,
                start: "top top",
                end: `+=${SCROLL_LENGTH}`,
                pin: true,
                scrub: 1,
                /** Reduces the flicker when the pin engages at speed. */
                anticipatePin: 1,
                /** Recomputes measured start values after a resize. */
                invalidateOnRefresh: true,
                markers: process.env.NODE_ENV === "development",
              },
            })
            /**
             * Labels rather than offsets. A scrubbed sequence gets retimed
             * many times, and two children sharing a label stay together when
             * the beat before them changes length.
             */
            .addLabel("open")
            .from("[data-beat='1']", { autoAlpha: 0, y: 24, duration: 0.4 }, "open")

            .addLabel("detail")
            .to("[data-beat='1']", { autoAlpha: 0, duration: 0.3 }, "detail")
            .from("[data-beat='2']", { autoAlpha: 0, y: 24, duration: 0.4 }, "detail+=0.3")

            /**
             * Placed at position 0 with the timeline's full span, so it tracks
             * overall progress regardless of what else is happening.
             */
            .to("[data-progress]", { scaleX: 1, transformOrigin: "0% 50%" }, 0);
        },
      );

      /**
       * ScrollTriggers and the `matchMedia` above are both reverted with the
       * context — each registers itself when constructed inside one. Only
       * things GSAP never sees (timers, raw listeners, observers) need a
       * cleanup returned from here.
       */
    },
    { scope: rootRef },
  );

  return rootRef;
}
