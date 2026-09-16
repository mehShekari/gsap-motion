---
description: A width-shaped request should be answered with a transform, not a layout property.
tags: [outcome, performance]
timeout_seconds: 600
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

In React with GSAP, animate this progress bar from empty to full over two seconds when the component mounts. Reply with the component.

```tsx
export function Progress() {
  return (
    <div className="track">
      <div className="bar" />
    </div>
  );
}
```
