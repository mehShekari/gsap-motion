"use client";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function Features({ items }: { items: string[] }) {
  const list = useRef<HTMLUListElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        ({ conditions }) => {
          if (conditions?.reduced) {
            gsap.set("[data-feature]", { autoAlpha: 1, y: 0 });
            return;
          }
          gsap.from("[data-feature]", {
            autoAlpha: 0,
            y: 24,
            duration: 0.6,
            ease: "power3.out",
            stagger: { amount: 0.4 },
            scrollTrigger: { trigger: list.current, start: "top 75%" },
          });
        },
      );
    },
    { scope: list },
  );

  return (
    <ul ref={list}>
      {items.map((item) => (
        <li key={item} data-feature>
          {item}
        </li>
      ))}
    </ul>
  );
}
