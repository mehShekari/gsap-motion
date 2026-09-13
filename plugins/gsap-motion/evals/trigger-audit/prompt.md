---
description: A debugging question about existing GSAP code should load the skill.
tags: [trigger, audit]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

This hook stutters on my phone, and after I navigate to another page the animation seems to keep running in the background. What is wrong with it?

```tsx
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

export function useParallax(selector: string) {
  useEffect(() => {
    document.querySelectorAll(selector).forEach((el) => {
      gsap.to(el, {
        top: "-20%",
        ease: "power1.inOut",
        scrollTrigger: { trigger: el, scrub: true },
      });
    });
  }, [selector]);
}
```
