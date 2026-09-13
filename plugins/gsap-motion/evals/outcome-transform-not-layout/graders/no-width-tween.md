---
type: llm
---

PASS if the code animates the bar with a transform (for example scaleX with a left or start transform origin) and does not tween the width property.

FAIL if any tween in the code animates `width`, or if the reply writes no animation code.
