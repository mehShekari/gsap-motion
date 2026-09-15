/**
 * What a project's Patterns section must say, and what it may not claim.
 *
 * The point of the maturity model is that nothing becomes guidance by having
 * been written. A status is therefore not a thing an entry asserts about
 * itself: `validated` is counted from recorded uses, `canonical` needs a named
 * reviewer, and an entry that claims either without the evidence is an error,
 * not a warning. That is the whole rule, and these are its cases.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { check, parse, promotable, report, stale } from "../patterns.mjs";

/** The shape the template teaches, written the way a person would write it. */
const ENTRY = `## Patterns

### Ink behind a moving pen

- **Status:** candidate
- **Concept:** a mask shares the pen's duration and ease, so ink appears only
  where the nib has already been.
- **Fixed:** the mask and the path share one duration and one ease.
- **Parameters:** duration, ease, nib radius.
- **Not when:** the stroke crosses itself — the mask reveals the crossing early.
- **Reduced motion:** the finished stroke is set, and no tween runs.
- **Verified against:** gsap 3.15, DrawSVGPlugin
- **Uses:**
  - \`src/components/Signature.tsx\` — \`a1b2c3d\` — audit clean
`;

describe("reading a Patterns section", () => {
  test("finds the entry, its status and its fields", () => {
    const [entry] = parse(ENTRY);
    assert.equal(entry.name, "Ink behind a moving pen");
    assert.equal(entry.status, "candidate");
    assert.match(entry.fields.concept, /a mask shares the pen's duration/);
    assert.match(entry.fields.concept, /where the nib has already been/);
    assert.equal(entry.uses.length, 1);
    assert.equal(entry.uses[0].file, "src/components/Signature.tsx");
    assert.equal(entry.uses[0].commit, "a1b2c3d");
  });

  test("a file with no Patterns section has no patterns, and that is not an error", () => {
    assert.deepEqual(parse("# Animation rules\n\n## Precedents\n\n- a thing\n"), []);
  });

  test("reads several entries, and keeps them in the order written", () => {
    const two = ENTRY + "\n### A curtain with a CSS exit\n\n- **Status:** experimental\n";
    assert.deepEqual(
      parse(two).map((entry) => entry.name),
      ["Ink behind a moving pen", "A curtain with a CSS exit"],
    );
  });
});

describe("what each status has to carry", () => {
  test("accepts a candidate that says everything a candidate must", () => {
    assert.deepEqual(check(parse(ENTRY)), []);
  });

  test("refuses a status that is not one of the five", () => {
    const found = check(parse(ENTRY.replace("candidate", "proven")));
    assert.equal(found.length, 1);
    assert.equal(found[0].level, "error");
    assert.match(found[0].message, /proven is not a status/);
  });

  test("refuses an entry with no status at all", () => {
    const found = check(parse(ENTRY.replace("- **Status:** candidate\n", "")));
    assert.match(found.map((f) => f.message).join(" "), /no status/);
  });

  test("names every field a candidate is missing, not just the first", () => {
    const thin = "## Patterns\n\n### Thin\n\n- **Status:** candidate\n";
    const missing = check(parse(thin)).map((f) => f.message).join(" ");
    for (const field of ["concept", "not when", "reduced motion", "verified against"]) {
      assert.match(missing, new RegExp(field, "i"), field);
    }
  });
});

describe("validated is counted, never claimed", () => {
  const validated = ENTRY.replace("candidate", "validated");

  test("refuses validated with one use, and says how many it has", () => {
    const found = check(parse(validated));
    assert.equal(found.length, 1);
    assert.equal(found[0].level, "error");
    assert.match(found[0].message, /1 recorded use/);
  });

  test("accepts validated once a second use in another file is recorded", () => {
    const twice = validated.replace(
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n",
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n" +
        "  - `src/components/Hero.tsx` — `e4f5a6b` — audit clean\n",
    );
    assert.deepEqual(check(parse(twice)), []);
  });

  test("does not count the same file twice, because one component is one use", () => {
    const same = validated.replace(
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n",
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n" +
        "  - `src/components/Signature.tsx` — `e4f5a6b` — audit clean\n",
    );
    assert.match(check(parse(same))[0].message, /1 recorded use/);
  });

  test("a project may raise the bar but never lower it", () => {
    const twice = validated.replace(
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n",
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n" +
        "  - `src/components/Hero.tsx` — `e4f5a6b` — audit clean\n",
    );
    assert.equal(check(parse(twice), { uses: 3 }).length, 1);
    assert.deepEqual(check(parse(twice), { uses: 1 }), []);
  });
});

describe("canonical needs a person", () => {
  const canonical = ENTRY.replace("candidate", "canonical").replace(
    "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n",
    "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n" +
      "  - `src/components/Hero.tsx` — `e4f5a6b` — audit clean\n",
  );

  test("refuses canonical with no reviewer named", () => {
    assert.match(check(parse(canonical))[0].message, /reviewed by/i);
  });

  test("accepts canonical once someone has put their name to it", () => {
    const reviewed = canonical + "- **Reviewed by:** A. Reviewer\n";
    assert.deepEqual(check(parse(reviewed)), []);
  });
});

describe("retired and experimental", () => {
  test("keeps a retired entry, but requires the reason it was retired", () => {
    const retired = "## Patterns\n\n### Old idea\n\n- **Status:** retired\n";
    assert.match(check(parse(retired)).map((f) => f.message).join(" "), /why/i);
  });

  test("accepts a retired entry that says why, and asks nothing else of it", () => {
    const retired =
      "## Patterns\n\n### Old idea\n\n- **Status:** retired\n" +
      "- **Why:** the mask desynced under scrub, and no ease fixed it.\n";
    assert.deepEqual(check(parse(retired)), []);
  });

  test("an experimental entry is not in the file yet, so finding one is a warning", () => {
    const experimental = "## Patterns\n\n### Half an idea\n\n- **Status:** experimental\n";
    const found = check(parse(experimental));
    assert.equal(found.length, 1);
    assert.equal(found[0].level, "warn");
    assert.match(found[0].message, /offered, not written/);
  });
});

describe("versions that have moved on", () => {
  test("marks an entry verified against a GSAP older than the one installed", () => {
    const [entry] = parse(ENTRY);
    const found = stale([entry], { gsap: "3.16.0" });
    assert.equal(found.length, 1);
    assert.match(found[0].message, /3\.15/);
    assert.equal(found[0].level, "warn");
  });

  test("says nothing when the installed GSAP is the one it was verified against", () => {
    assert.deepEqual(stale(parse(ENTRY), { gsap: "3.15.2" }), []);
  });

  test("says nothing when there is no GSAP to compare against", () => {
    assert.deepEqual(stale(parse(ENTRY), {}), []);
  });
});

describe("what could be promoted", () => {
  test("names a candidate that has earned validated, with its evidence", () => {
    const twice = ENTRY.replace(
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n",
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n" +
        "  - `src/components/Hero.tsx` — `e4f5a6b` — audit clean\n",
    );
    const ready = promotable(parse(twice));
    assert.equal(ready.length, 1);
    assert.equal(ready[0].name, "Ink behind a moving pen");
    assert.equal(ready[0].to, "validated");
    assert.equal(ready[0].uses, 2);
  });

  test("does not propose promoting a candidate that is used once", () => {
    assert.deepEqual(promotable(parse(ENTRY)), []);
  });

  test("never proposes canonical, because only a person can grant it", () => {
    const validated = ENTRY.replace("candidate", "validated").replace(
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n",
      "  - `src/components/Signature.tsx` — `a1b2c3d` — audit clean\n" +
        "  - `src/components/Hero.tsx` — `e4f5a6b` — audit clean\n" +
        "  - `src/components/Panel.tsx` — `c7d8e9f` — audit clean\n",
    );
    assert.deepEqual(promotable(parse(validated)), []);
  });
});

/**
 * In a lint script a clean check should say nothing at all. roboshan runs this
 * next to `audit --quiet`, and a line of output per run is a line people learn
 * to scroll past — including on the run where it finally has something to say.
 */
describe("what it prints", () => {
  const entries = parse(ENTRY);

  test("says nothing when quiet and clean", () => {
    assert.equal(report(entries, [], { file: "ANIMATION.md", quiet: true }), "");
  });

  test("still prints errors when quiet, because they are why the run fails", () => {
    const findings = [{ name: "X", level: "error", message: "X claims validated with 1 use." }];
    const text = report(entries, findings, { file: "ANIMATION.md", quiet: true });
    assert.match(text, /X claims validated/);
  });

  test("swallows warnings when quiet, and shows them when not", () => {
    const findings = [{ name: "X", level: "warn", message: "X is experimental." }];
    assert.equal(report(entries, findings, { file: "ANIMATION.md", quiet: true }), "");
    assert.match(report(entries, findings, { file: "ANIMATION.md" }), /X is experimental/);
  });

  test("tells a project with no section that there is nothing to check", () => {
    const text = report([], [], { file: "ANIMATION.md" });
    assert.match(text, /No Patterns section/);
  });

  test("counts the entries by status, and leaves out the statuses with none", () => {
    const text = report(entries, [], { file: "ANIMATION.md" });
    assert.match(text, /1 pattern in ANIMATION\.md/);
    assert.match(text, /1 candidate/);
    assert.doesNotMatch(text, /0 retired/);
  });
});
