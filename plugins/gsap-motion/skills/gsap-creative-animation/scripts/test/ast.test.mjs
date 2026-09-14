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
  contains,
  dottedName,
  findAll,
  isFunction,
  isGsapCall,
  parse,
  resolveFunction,
  numberValue,
  ownVars,
  staticString,
  tweenMethod,
  varsObjects,
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

  test("numberValue reads negative literals, and nothing computed", () => {
    assert.equal(numberValue(expr(`-1`)), -1);
    assert.equal(numberValue(expr(`0.5`)), 0.5);
    assert.equal(numberValue(expr(`count`)), null);
  });

  test("tweenMethod takes set and timeline on gsap only, and to/from/fromTo on anything", () => {
    assert.equal(tweenMethod(expr(`gsap.set(a, {})`)), "set");
    assert.equal(tweenMethod(expr(`gsap.timeline()`)), "timeline");
    assert.equal(tweenMethod(expr(`this.tl.fromTo(a, {}, {})`)), "fromTo");
    assert.equal(tweenMethod(expr(`tl.addLabel("a").to(a, {})`)), "to");
    assert.equal(tweenMethod(expr(`tl.set(a, {})`)), null);
    assert.equal(tweenMethod(expr(`gsap.quickTo(a, "x")`)), null);
  });

  test("ownVars and varsObjects pick the right arguments", () => {
    const fromTo = expr(`gsap.fromTo(a, { x: 0 }, { x: 1, repeat: -1 })`);
    assert.equal(ownVars(fromTo, "fromTo"), fromTo.arguments[2]);
    assert.deepEqual(varsObjects(fromTo, "fromTo"), [fromTo.arguments[1], fromTo.arguments[2]]);
    const timeline = expr(`gsap.timeline({ repeat: -1 })`);
    assert.equal(ownVars(timeline, "timeline"), timeline.arguments[0]);
    assert.equal(ownVars(expr(`gsap.to(a, vars)`), "to"), null);
  });

  test("resolveFunction follows a name to its single declaration, and nothing else", () => {
    const { ast } = parse(
      `const onMove = (e) => e;\nfunction onScroll() {}\nconst dup = () => 1;\n{ const dup = () => 2; }\nconst notAFunction = 1;\n`,
      "a.ts",
    );
    const name = (value) => ({ type: "Identifier", name: value });
    assert.equal(resolveFunction(ast, name("onMove"))?.type, "ArrowFunctionExpression");
    assert.equal(resolveFunction(ast, name("onScroll"))?.type, "FunctionDeclaration");
    assert.equal(resolveFunction(ast, name("dup")), null);
    assert.equal(resolveFunction(ast, name("missing")), null);
    assert.equal(resolveFunction(ast, name("notAFunction")), null);

    const arrow = expr(`(x) => x`);
    assert.ok(isFunction(arrow));
    assert.equal(resolveFunction(ast, arrow), arrow);
  });

  test("contains compares source ranges", () => {
    const { ast } = parse(`gsap.to(el, { x: 1 });`, "a.js");
    const [statement] = ast.body;
    assert.ok(contains(ast, statement));
    assert.ok(contains(statement, statement));
    assert.ok(!contains(statement.expression.arguments[1], statement));
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
