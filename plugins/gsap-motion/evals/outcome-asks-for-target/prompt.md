---
description: A whole page with nothing in it named is no target, so the skill asks what should move. Without the skill, Claude tends to invent a hero entrance and scroll reveals. The first version of this case had no page, so Claude asked only because the workspace was empty.
tags: [outcome, judgement]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Add some GSAP animation to this page so it feels more modern. It's a Next.js app and gsap and @gsap/react are already installed.

```tsx
export default function Home() {
  return (
    <main>
      <section className="hero">
        <h1>Build faster with Acme</h1>
        <p>Everything your team needs to ship.</p>
        <a href="/signup">Get started</a>
      </section>
      <section className="features">
        <article>Fast</article>
        <article>Secure</article>
        <article>Scalable</article>
      </section>
      <section className="testimonials">
        <blockquote>"We shipped in half the time."</blockquote>
      </section>
      <footer>© Acme</footer>
    </main>
  );
}
```
