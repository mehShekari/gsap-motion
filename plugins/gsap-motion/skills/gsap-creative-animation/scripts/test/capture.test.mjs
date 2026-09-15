/**
 * What `inspect` decides before Chrome starts.
 *
 * The capture itself needs a browser and is not run here — CI has no display
 * budget for it, and a test that launches Chrome is the kind that fails for
 * reasons nobody can reproduce. What is tested is everything that can be wrong
 * without one: the options, the order of the steps, and the combinations that
 * would measure something no device is.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseOptions } from "../capture-motion.mjs";

describe("inspect options", () => {
  test("needs a URL, and says so rather than starting a browser", () => {
    const { errors } = parseOptions([]);
    assert.deepEqual(errors, ["No URL. Pass the page to watch."]);
  });

  test("captures at three times by default, and settles first", () => {
    const options = parseOptions(["https://example.com"]);
    assert.deepEqual(options.errors, []);
    assert.equal(options.url, "https://example.com");
    assert.deepEqual(options.at, [0, 300, 900]);
    assert.equal(options.wait, 400);
  });

  test("reads --at as milliseconds, in order", () => {
    const options = parseOptions(["u", "--at", "900,0,300"]);
    assert.deepEqual(options.at, [0, 300, 900]);
  });

  test("refuses an --at that is not milliseconds", () => {
    for (const bad of ["soon", "0,later", "-5"]) {
      const { errors } = parseOptions(["u", "--at", bad]);
      assert.match(errors.join(" "), /--at takes milliseconds/, bad);
    }
  });

  test("keeps the steps in the order they were written", () => {
    const options = parseOptions([
      "u",
      "--hover",
      ".card",
      "--scroll",
      "600",
      "--click",
      "button",
    ]);
    assert.deepEqual(options.steps, [
      { type: "hover", value: ".card" },
      { type: "scroll", value: "600" },
      { type: "click", value: "button" },
    ]);
  });

  test("takes a scroll target as pixels or as a selector", () => {
    assert.deepEqual(parseOptions(["u", "--scroll", "800"]).steps, [
      { type: "scroll", value: "800" },
    ]);
    assert.deepEqual(parseOptions(["u", "--scroll", "#pricing"]).steps, [
      { type: "scroll", value: "#pricing" },
    ]);
  });

  test("refuses --mobile with --hover, because a touch device has no hover", () => {
    const { errors } = parseOptions(["u", "--mobile", "--hover", ".card"]);
    assert.match(errors.join(" "), /--mobile and --hover cannot be combined/);
  });

  test("allows --mobile with a scroll or a click, which touch devices do have", () => {
    assert.deepEqual(parseOptions(["u", "--mobile", "--scroll", "400"]).errors, []);
    assert.deepEqual(parseOptions(["u", "--mobile", "--click", "button"]).errors, []);
  });

  test("reads the conditions", () => {
    const options = parseOptions(["u", "--reduced", "--dark", "--cpu", "4", "--json"]);
    assert.deepEqual(options.errors, []);
    assert.equal(options.reduced, true);
    assert.equal(options.dark, true);
    assert.equal(options.cpu, 4);
    assert.equal(options.json, true);
  });

  test("refuses a CPU factor below 1, which would speed the machine up", () => {
    const { errors } = parseOptions(["u", "--cpu", "0.5"]);
    assert.match(errors.join(" "), /--cpu takes a factor of 1 or more/);
  });

  test("names an unknown option rather than ignoring it", () => {
    const { errors } = parseOptions(["u", "--filmstrip"]);
    assert.deepEqual(errors, ["Unknown option: --filmstrip"]);
  });
});
