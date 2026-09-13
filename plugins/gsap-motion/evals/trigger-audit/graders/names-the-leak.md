---
type: llm
---

PASS if the reply identifies that the tweens and ScrollTriggers are created in a plain useEffect with no cleanup, so they are never reverted when the component unmounts, AND recommends useGSAP, gsap.context or an explicit revert/kill in a cleanup.

FAIL if the reply does not mention the missing cleanup, or attributes the lingering animation only to something else.
