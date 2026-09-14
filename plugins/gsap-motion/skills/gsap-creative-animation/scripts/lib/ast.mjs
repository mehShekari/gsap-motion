/**
 * The audit's syntax tree: parsing, walking, and the small questions rules ask
 * of a tree.
 *
 * The text-matching engine answered "is this call inside that handler?" by
 * counting braces, and every wrong answer it gave came from not knowing what a
 * brace, a quote or a name actually was. A tree knows. The parser is vendored
 * (see `vendor/parser.mjs` and `scripts/vendor-parser.mjs` in the repository),
 * so this still installs nothing.
 */
import { Parser, tsPlugin } from "./vendor/parser.mjs";

const OPTIONS = {
  ecmaVersion: "latest",
  sourceType: "module",
  locations: true,
  allowHashBang: true,
};

/**
 * `.ts` is read without JSX, because there `<T>(x) => x` is a generic and
 * `<Type>value` a cast; every other extension is read with it. A `.js` file
 * with JSX is common enough, and JSX never changes how plain JavaScript parses.
 */
const TYPESCRIPT = Parser.extend(tsPlugin());
const TYPESCRIPT_JSX = Parser.extend(tsPlugin({ jsx: true }));

/**
 * Parses `source` as the grammar its `path` implies.
 *
 * Returns `{ ast, comments }`, or throws the parser's error, which carries
 * `loc.line`. Offsets on every node index into `source` itself, so a node's
 * `start` works with `lineAt` exactly as a text-match index did.
 */
export function parse(source, path) {
  const comments = [];
  const parser = /\.[mc]?ts$/.test(path) ? TYPESCRIPT : TYPESCRIPT_JSX;
  const ast = parser.parse(source, { ...OPTIONS, onComment: comments });
  return { ast, comments };
}

const isNode = (value) =>
  value !== null && typeof value === "object" && typeof value.type === "string";

/**
 * Calls `visit(node, ancestors)` for every node, parents before children, in
 * source order. `ancestors` is nearest-last and is the live stack: copy it
 * before keeping it.
 */
export function walk(root, visit) {
  const ancestors = [];

  const step = (node) => {
    visit(node, ancestors);
    ancestors.push(node);
    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) step(child);
      } else if (isNode(value)) {
        step(value);
      }
    }
    ancestors.pop();
  };

  step(root);
}

/** Every node for which `test(node, ancestors)` holds, in source order. */
export function findAll(root, test) {
  const found = [];
  walk(root, (node, ancestors) => {
    if (test(node, ancestors)) found.push(node);
  });
  return found;
}

/** Wrappers that change a value's type or grouping but not what it is. */
const TRANSPARENT = new Set([
  "ParenthesizedExpression",
  "TSNonNullExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "ChainExpression",
]);

/** `node` with type assertions, non-null marks and parentheses taken off. */
export function unwrap(node) {
  let current = node;
  while (current && TRANSPARENT.has(current.type)) current = current.expression;
  return current;
}

/**
 * The dotted name a plain reference spells — `gsap`, `gsap.to`,
 * `this.tl.to` — or `null` when any part is computed or not a name.
 */
export function dottedName(node) {
  const target = unwrap(node);
  if (!target) return null;
  if (target.type === "Identifier") return target.name;
  if (target.type === "ThisExpression") return "this";
  if (
    target.type === "MemberExpression" &&
    !target.computed &&
    target.property.type === "Identifier"
  ) {
    const object = dottedName(target.object);
    return object === null ? null : `${object}.${target.property.name}`;
  }
  return null;
}

/** The dotted name of a call's callee: `gsap.to` for `gsap.to(el, {})`. */
export const calleeName = (call) =>
  call.type === "CallExpression" ? dottedName(call.callee) : null;

/**
 * The string a node spells with nothing computed: a string literal, or a
 * template literal with no `${}` in it. `null` for anything else.
 */
export function staticString(node) {
  const target = unwrap(node);
  if (!target) return null;
  if (target.type === "Literal" && typeof target.value === "string") {
    return target.value;
  }
  if (target.type === "TemplateLiteral" && target.expressions.length === 0) {
    return target.quasis[0].value.cooked ?? null;
  }
  return null;
}

/** The name of a non-computed property key: `ease` in `{ ease: "none" }`. */
export function keyName(property) {
  if (property.type !== "Property" || property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal") return String(property.key.value);
  return null;
}

/** The module specifier of an import or re-export, or `null`. */
export function moduleSource(node) {
  if (
    node.type === "ImportDeclaration" ||
    node.type === "ExportAllDeclaration" ||
    (node.type === "ExportNamedDeclaration" && node.source)
  ) {
    return node.source;
  }
  return null;
}

/** GSAP's own tween-creating calls: `gsap.to`, `.from`, `.fromTo`, `.timeline`. */
export const TWEEN_METHODS = new Set(["to", "from", "fromTo", "timeline"]);

/** Whether `node` is `gsap.<method>(…)` for one of `methods`. */
export function isGsapCall(node, methods = TWEEN_METHODS) {
  const name = calleeName(node);
  return (
    name !== null &&
    name.startsWith("gsap.") &&
    name.split(".").length === 2 &&
    methods.has(name.slice(5))
  );
}
