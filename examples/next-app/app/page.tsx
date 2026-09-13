import { Features } from "./Features";
import { ScrollSceneDemo } from "./ScrollSceneDemo";
import { TimelineDemo } from "./TimelineDemo";

/**
 * A Server Component. Each demo is a client leaf, which is the boundary the
 * skill's React reference recommends.
 */
export default function Page() {
  return (
    <main>
      <h1>gsap-motion example</h1>
      <p>
        Everything on this page is built in CI: the skill&apos;s two templates,
        imported from the plugin folder, and the component from the
        README&apos;s before-and-after.
      </p>

      <section>
        <h2>template/useTimeline.ts</h2>
        <TimelineDemo />
      </section>

      <section>
        <h2>README: Features</h2>
        <Features
          items={["Scoped to its component", "Cleaned up on unmount", "Reduced motion designed, not disabled"]}
        />
      </section>

      <ScrollSceneDemo />
    </main>
  );
}
