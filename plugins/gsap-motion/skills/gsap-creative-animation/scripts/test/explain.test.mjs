/**
 * `explain` reads; it never writes and never judges. What is tested here is the
 * map it makes of a file — the live mode needs a browser and is not run in CI,
 * for the same reason `inspect`'s capture is not.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseArguments } from "../explain-motion.mjs";
import { project } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../explain-motion.mjs", import.meta.url));

const run = (args, cwd) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });

const SCENE = `"use client";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

export function useHero() {
  const root = useRef(null);

  /* The hero arrives once, on the page's own beat. */
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        ({ conditions }) => {
          if (conditions.reduced) {
            gsap.set("[data-heading]", { autoAlpha: 1 });
            return;
          }

          const tl = gsap.timeline({
            scrollTrigger: { trigger: root.current, start: "top 75%" },
          });

          /* The heading leads; everything else answers it. */
          tl.addLabel("enter")
            .from("[data-heading]", { yPercent: 110, duration: 0.8, ease: "power3.out" })
            .from("[data-lead]", { autoAlpha: 0, duration: 0.6 }, "-=0.5");
        },
      );
    },
    { scope: root },
  );

  return root;
}
`;

describe("explain arguments", () => {
  test("needs something to explain", () => {
    assert.match(parseArguments([]).errors.join(" "), /Nothing to explain/);
  });

  test("knows a URL from a path", () => {
    assert.equal(parseArguments(["https://example.com"]).live, true);
    assert.equal(parseArguments(["src/hero.ts"]).live, false);
  });

  test("explains one URL at a time", () => {
    const { errors } = parseArguments(["https://a.test", "https://b.test"]);
    assert.match(errors.join(" "), /one URL at a time/);
  });

  test("names an unknown option", () => {
    assert.deepEqual(parseArguments(["x", "--deep"]).errors, ["Unknown option: --deep"]);
  });
});

describe("explain a file", () => {
  const dir = project({ "src/useHero.ts": SCENE });
  const result = run(["src"], dir);
  const output = result.stdout;

  test("runs, and changes nothing", () => {
    assert.equal(result.status, 0, result.stderr);
  });

  test("says where the animation lives, and what scopes it", () => {
    assert.match(output, /Where it lives/);
    assert.match(output, /useGSAP scoped to root/);
  });

  test("lists the preference branches", () => {
    assert.match(output, /prefers-reduced-motion: no-preference/);
    assert.match(output, /prefers-reduced-motion: reduce/);
  });

  test("lists the beats in order, with their positions", () => {
    const beats = output.slice(output.indexOf("Scene at line"));
    assert.match(beats, /label "enter"/);
    const heading = beats.indexOf("[data-heading]");
    const lead = beats.indexOf("[data-lead]");
    assert.ok(heading > -1 && lead > heading, "the heading is listed before the lead");
    assert.match(beats, /0\.8s/);
    assert.match(beats, /ease power3\.out/);
    assert.match(beats, /at "-=0\.5"/);
  });

  test("quotes the reason the author wrote, and says it is a comment", () => {
    assert.match(output, /"The heading leads; everything else answers it\."   \(comment\)/);
  });

  test("reads the scroll configuration", () => {
    assert.match(output, /Scroll {3}\(file\)/);
    assert.match(output, /start "top 75%"/);
  });

  test("cites the audit rather than judging for itself", () => {
    assert.match(output, /\(audit\)/);
  });

  test("gives machine-readable output when asked", () => {
    const json = JSON.parse(run(["src", "--json"], dir).stdout);
    assert.equal(json.length, 1);
    assert.equal(json[0].file, "src/useHero.ts");
    assert.ok(json[0].scenes[0].beats.length >= 2);
  });

  test("says so when nothing in a folder animates", () => {
    const empty = project({ "src/util.ts": "export const add = (a, b) => a + b;\n" });
    assert.match(run(["src"], empty).stdout, /Nothing here animates with GSAP/);
  });
});
