/**
 * The corpus's arithmetic, without the network: a finding keeps its identity,
 * precision counts only what was labelled, and nothing unlabelled or stale goes
 * unnoticed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { findingKey, precision } from "../scripts/corpus.mjs";

const finding = (rule, line, level = "error") => ({
  file: "src/Box.tsx",
  rule,
  level,
  line,
  message: "m",
});

test("a finding's key survives indentation but not a change to the line", () => {
  const a = findingKey("p", finding("orphan-tween", 3), "  gsap.to(el, { x: 1 });");
  const b = findingKey("p", finding("orphan-tween", 3), "gsap.to(el, { x: 1 });");
  const c = findingKey("p", finding("orphan-tween", 3), "gsap.to(el, { x: 2 });");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^p\|src\/Box\.tsx\|orphan-tween\|3\|[0-9a-f]{10}$/);
});

test("precision counts labelled findings only, and lists the rest", () => {
  const findings = [
    { ...finding("orphan-tween", 1), key: "k1" },
    { ...finding("orphan-tween", 2), key: "k2" },
    { ...finding("orphan-tween", 3), key: "k3" },
    { ...finding("layout-property", 4, "warn"), key: "k4" },
  ];
  const labels = {
    k1: { verdict: "true", reason: "r" },
    k2: { verdict: "false", reason: "r" },
    gone: { verdict: "true", reason: "r" },
  };

  const { rules, unlabelled, stale } = precision(findings, labels);
  assert.deepEqual(rules["orphan-tween"], {
    level: "error",
    findings: 3,
    true: 1,
    false: 1,
    precision: 0.5,
  });
  assert.equal(rules["layout-property"].precision, null);
  assert.deepEqual(unlabelled.map((f) => f.key), ["k3", "k4"]);
  assert.deepEqual(stale, ["gone"]);
});
