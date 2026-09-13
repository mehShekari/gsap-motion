# Text animation

Text is the content the visitor came for. Animating it delays reading, so the
bar is higher than for decoration: it must be fast, it must not break selection
or screen readers, and it must not reflow.

## SplitText

Free and installed. Splits into chars, words, or lines and gives you the arrays.

```ts
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(SplitText);

const split = new SplitText(heading, {
  type: "lines,words",
  linesClass: "rs-line",
  mask: "lines",          // wraps each line in an overflow-hidden parent
  autoSplit: true,        // re-splits on resize and font load
});

gsap.from(split.lines, {
  yPercent: 110,
  duration: 0.8,
  stagger: 0.08,
  ease: "power3.out",
});

// Cleanup — puts the original markup back:
split.revert();
```

`mask: "lines"` is what makes a line rise out of nothing instead of sliding in
from below. It is the single option that separates a polished reveal from a
generic one.

`autoSplit: true` handles the two things that silently break a split: a web font
loading after the split and changing line breaks, and a resize reflowing them.
Without it, lines end up wrapped mid-phrase.

### Which unit

- **Lines** — the default for headings and paragraphs. Reads as writing.
- **Words** — for short, deliberate phrases. Six words maximum.
- **Chars** — for a logo, a number, a single word. Never a sentence: a paragraph
  revealing per character is unreadable and produces hundreds of nodes.

### Accessibility

Splitting replaces the text with a pile of `<div>`s. SplitText sets
`aria-label` on the container from the original text and hides the fragments —
verify it, because a heading read as forty letters is a serious regression.

Always `revert()` on unmount. Leaving a split in place breaks copy-paste and
leaves the DOM heavier than it needs to be.

### Cost

Splitting a paragraph into characters can produce a thousand elements. Split
lines, animate lines. If you must animate characters, cap it at a headline.

## ScrambleTextPlugin

Cycles characters before settling on the target — the "decoding" effect.

```ts
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

gsap.to(el, {
  duration: 1.2,
  scrambleText: {
    text: "LAUNCHING",
    chars: "upperCase",     // or "lowerCase", "upperAndLowerCase", or your own
    speed: 0.4,
    revealDelay: 0.3,
    tweenLength: false,
  },
});
```

`tweenLength: false` keeps the element's width fixed, which stops the layout
jumping as the string grows. Almost always what you want.

Reads as technical and futuristic. It also makes text unreadable while it runs,
so keep it under ~1.2s and never use it on something the visitor must read
immediately. Persian and Arabic script scramble badly — the glyph shapes are
contextual — so use a Latin-only charset or skip the effect for those locales.

## TextPlugin

Types or replaces text content. Simpler than scramble, and better for a
typewriter:

```ts
gsap.to(el, { duration: 2, text: "Built in Iran.", ease: "none" });
```

## Counters

Numbers are text that should animate. Tween an object, format on update:

```ts
const n = { value: 0 };
gsap.to(n, {
  value: 1240,
  duration: 1.4,
  ease: "power2.out",
  onUpdate: () => { el.textContent = Math.round(n.value).toLocaleString(locale); },
});
```

Use tabular figures (`font-variant-numeric: tabular-nums`) or the width jitters
on every frame.

## Without SplitText

A line mask needs no plugin when you control the markup — cheaper and no
revert to forget:

```tsx
<span className="block overflow-hidden">
  <span data-line className="block">…</span>
</span>
```

```ts
gsap.from("[data-line]", { yPercent: 110, stagger: 0.08, ease: "power3.out" });
```

For a heading whose lines you know, this is the better answer.

## Rhythm

- Lines: `stagger: 0.06–0.1`, duration `0.6–0.9`, `power3.out`.
- Words: `stagger: 0.03–0.05` — words are small, so the wave should be tight.
- Chars: `stagger: { amount: 0.4 }` — a *total*, so a long word does not crawl.

Text reveals should be over inside a second. Anything slower and the visitor is
waiting on the page rather than reading it.

## Copy, locales and direction

Keep the words out of the animation. The animated component should receive the
**string as a prop**: a client component that imports the project's messages or
content module itself can bundle every locale into the browser payload. The
project's rules say where copy comes from — see
[project-rules.md](project-rules.md).

In a right-to-left language, a stagger in "reading order" is `from: "end"`, and
a line rising from the start edge uses logical properties, not `left`.
