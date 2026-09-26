import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { pairs, sendFile, tally } from "../scripts/grade/arena.mjs";
import { basicShare } from "../scripts/grade/run-arm.mjs";

const built = (root, brief, run) => {
  const dist = join(root, "runs", brief, run, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "index.html"), "<p>ok</p>");
};

test("pairs only runs both arms built, n against n", () => {
  const root = mkdtempSync(join(tmpdir(), "arena-"));
  built(root, "hero", "none-1");
  built(root, "hero", "4.2.1-1");
  built(root, "hero", "none-2");
  mkdirSync(join(root, "runs", "hero", "4.2.1-2"), { recursive: true }); // agent ran, build failed
  built(root, "page", "4.2.1-1");
  built(root, "page", "none-1");

  const found = pairs(root, "none", "4.2.1");
  assert.deepEqual(found.map((p) => p.id).sort(), ["hero/1/4.2.1~none", "page/1/4.2.1~none"]);
  assert.deepEqual(pairs(root, "4.2.1", "none").map((p) => p.id).sort(), found.map((p) => p.id).sort());
});

test("tally counts wins by arm and ties, per brief", () => {
  const votes = [
    { brief: "hero", left: "none", right: "4.2.1", pick: "4.2.1" },
    { brief: "hero", left: "4.2.1", right: "none", pick: "tie" },
    { brief: "page", left: "none", right: "4.2.1", pick: "none" },
  ];
  const row = tally(votes)["4.2.1 vs none"];
  assert.deepEqual(row.total, { tie: 1, "4.2.1": 1, none: 1 });
  assert.deepEqual(row.briefs.hero, { tie: 1, "4.2.1": 1 });
});

test("sendFile refuses a path that escapes the build", () => {
  const root = mkdtempSync(join(tmpdir(), "arena-"));
  const res = { code: 0, writeHead(code) { this.code = code; return this; }, end() {} };
  sendFile(join(root, "dist"), "../secret.txt", res);
  assert.equal(res.code, 403);
});

test("basicShare separates the default reveal from a wider vocabulary", () => {
  const source = `
    gsap.from(".a", { opacity: 0, y: 20, stagger: 0.1, duration: 0.6 });
    tl.fromTo(".b", { autoAlpha: 0 }, { autoAlpha: 1, ease: "power2.out" });
    tl.to(".c", { clipPath: "inset(0 0 0 0)", scale: 1, duration: 1 });
    gsap.to(".d", { duration: 1 });
    gsap.set(".e", { opacity: 1 });
  `;
  assert.deepEqual(basicShare([["a.jsx", source]]), {
    tweens: 3,
    basic: 2,
    share: 0.67,
    properties: ["autoAlpha", "clipPath", "opacity", "scale", "y"],
  });
});
