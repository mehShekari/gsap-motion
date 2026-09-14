/**
 * The syntax-tree layer the rules stand on: which grammar a file is read with,
 * that offsets survive so lines stay right, and the name helpers every rule
 * leans on.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  calleeName,
  dottedName,
  findAll,
  isGsapCall,
  parse,
  staticString,
  walk,
} from "../lib/ast.mjs";
import { lineAt, load } from "../lib/source.mjs";
import { project } from "./helpers.mjs";

describe("parse", () => {
  test("reads .tsx with JSX and TypeScript together", () => {
    const { ast } = parse(`const a = <div>{1 as number}</div>;`, "a.tsx");
    assert.equal(findAll(ast, (n) => n.type === "JSXElement").length, 1);
  });

  test("reads .ts without JSX, so a generic arrow stays a generic", () => {
    const { ast } = parse(`const id = <T>(x: T) => x;`, "a.ts");
    assert.equal(findAll(ast, (n) => n.type === "ArrowFunctionExpression").length, 1);
  });

  test("keeps offsets into the source, so a node's line is its real line", () => {
    const source = `import gsap from "gsap";\n\ngsap.to("[data-a]", { x: 1 });\n`;
    const [call] = findAll(parse(source, "a.ts").ast, (n) => isGsapCall(n));
    assert.equal(lineAt(source, call.start), 3);
  });

  test("throws with the line of a syntax error", () => {
    assert.throws(
      () => parse(`const ok = 1;\nconst broken = ;\n`, "a.ts"),
      (error) => error.loc?.line === 2,
    );
  });

  test("collects comments apart from the tree", () => {
    const { comments } = parse(`// one\n/* two */ const a = 1;`, "a.js");
    assert.equal(comments.length, 2);
  });
});

describe("load", () => {
  test("parses on first use, and keeps a file that does not parse as unchecked", () => {
    const dir = project({ "ok.ts": "export const a = 1;\n", "bad.ts": "export const = ;\n" });
    const ok = load(join(dir, "ok.ts"), dir);
    const bad = load(join(dir, "bad.ts"), dir);
    assert.equal(ok.ast.type, "Program");
    assert.equal(ok.parseError, null);
    assert.equal(bad.ast, null);
    assert.equal(bad.parseError.line, 1);
  });
});

describe("names", () => {
  const expr = (code) => parse(code, "a.ts").ast.body[0].expression;

  test("dottedName reads plain chains, through non-null marks and casts", () => {
    assert.equal(dottedName(expr(`this.tl!.to`)), "this.tl.to");
    assert.equal(dottedName(expr(`(gsap as typeof gsap).to`)), "gsap.to");
    assert.equal(dottedName(expr(`gsap[method]`)), null);
  });

  test("calleeName and isGsapCall recognise GSAP's tween calls only", () => {
    const call = expr(`gsap.fromTo(a, {}, {})`);
    assert.equal(calleeName(call), "gsap.fromTo");
    assert.ok(isGsapCall(call));
    assert.ok(!isGsapCall(expr(`gsap.set(a, {})`)));
    assert.ok(!isGsapCall(expr(`tl.to(a, {})`)));
    assert.ok(!isGsapCall(expr(`gsap.utils.to(a)`)));
  });

  test("staticString reads literals and plain templates, nothing computed", () => {
    assert.equal(staticString(expr("`#track`")), "#track");
    assert.equal(staticString(expr(`"#star"`)), "#star");
    assert.equal(staticString(expr("`#${id}`")), null);
    assert.equal(staticString(expr(`1`)), null);
  });
});

test("walk visits parents before children, with ancestors nearest last", () => {
  const { ast } = parse(`gsap.to(el, { x: 1 });`, "a.js");
  let path;
  walk(ast, (node, ancestors) => {
    if (node.type === "Property") path = ancestors.map((a) => a.type);
  });
  assert.deepEqual(path, [
    "Program",
    "ExpressionStatement",
    "CallExpression",
    "ObjectExpression",
  ]);
});
