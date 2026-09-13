---
type: llm
---

Look at every `fromTo` in the reply that animates `scale`, `scaleX` or `scaleY` on the SVG circles.

PASS if, for each of them, the transform origin (`transformOrigin` or `svgOrigin`) is present in the from-vars (the second argument), or was already set on those elements before the tween, for example with `gsap.set`. Also PASS if `smoothOrigin: false` is set on the tween. A `from` or `to` tween, rather than `fromTo`, that carries its own `transformOrigin` also passes.

FAIL if any such `fromTo` sets `transformOrigin` or `svgOrigin` only in the to-vars (the third argument) and nowhere earlier, or if the circles are scaled with no origin set at all.
