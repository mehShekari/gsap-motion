---
type: llm
---

PASS if the reply treats "cinematic but quick" as one reading rather than two requests to choose between. It keeps what cinematic decides apart from pace — one thing moves at a time, and something deliberately stays still — keeps a cinematic ease (`power3.out`, `power4.out` or `expo.out`), and shortens the duration into roughly 350–500ms. It says that this is what it did.

PASS also if it tightens overlap rather than shortening duration, provided it says so: "too sequential, not too long" is a reading the skill itself offers.

FAIL if it silently drops one half of the request — a slow cinematic hero that ignores "quick", or a fast generic reveal with none of the cinematic structure — or if it keeps 600–900ms durations while calling the result quick, or drops to a default `power2.out` because speed was asked for.
