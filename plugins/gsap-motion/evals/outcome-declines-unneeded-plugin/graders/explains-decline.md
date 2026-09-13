---
type: llm
---

PASS if the reply tells the user that MotionPathPlugin is not needed for a straight 12px move, explains that a transform tween (such as `x`) does it, and provides code using that transform.

FAIL if the reply uses MotionPathPlugin for the hover, or silently uses a transform without saying it declined the plugin the user asked for.
