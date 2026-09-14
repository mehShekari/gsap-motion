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

/** The property of an object literal with key `name`, or `undefined`. */
export const propertyOf = (object, name) =>
  object?.properties?.find((property) => keyName(property) === name);

/** The number a literal spells, a negative one included: `-1` for `repeat: -1`. */
export function numberValue(node) {
  const target = unwrap(node);
  if (target?.type === "Literal" && typeof target.value === "number") {
    return target.value;
  }
  if (target?.type === "UnaryExpression" && target.operator === "-") {
    const value = numberValue(target.argument);
    return value === null ? null : -value;
  }
  return null;
}

const ON_GSAP = new Set(["to", "from", "fromTo", "set", "timeline"]);
const ON_ANYTHING = new Set(["to", "from", "fromTo"]);

/**
 * The method of a call that creates a tween or adds one: `gsap.to`, `.from`,
 * `.fromTo`, `.set` or `.timeline`, and `.to`, `.from` or `.fromTo` on any other
 * receiver — a timeline variable, `this.tl`, a chain. `null` for anything else.
 */
export function tweenMethod(node) {
  if (node.type !== "CallExpression") return null;
  const callee = unwrap(node.callee);
  if (
    callee?.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier"
  ) {
    return null;
  }
  const method = callee.property.name;
  const allowed = dottedName(callee.object) === "gsap" ? ON_GSAP : ON_ANYTHING;
  return allowed.has(method) ? method : null;
}

const argumentObject = (call, index) => {
  const node = unwrap(call.arguments[index]);
  return node?.type === "ObjectExpression" ? node : null;
};

/**
 * The vars object that holds a tween's own settings — `repeat`, `ease`,
 * `yoyo`: the second argument, a `fromTo`'s third, a timeline's first. `null`
 * when it is not an object literal.
 */
export const ownVars = (call, method) =>
  argumentObject(call, method === "fromTo" ? 2 : method === "timeline" ? 0 : 1);

/**
 * Every vars object a tween call carries, as object literals: both of a
 * `fromTo`'s, a timeline's own, or the tween's.
 */
export function varsObjects(call, method) {
  const indexes = method === "fromTo" ? [1, 2] : method === "timeline" ? [0] : [1];
  return indexes.map((index) => argumentObject(call, index)).filter(Boolean);
}

const FUNCTIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

/** Whether `node` is a function of any form. */
export const isFunction = (node) => FUNCTIONS.has(node?.type);

/** Whether `inner` lies within `outer`'s source range. */
export const contains = (outer, inner) =>
  outer.start <= inner.start && inner.end <= outer.end;

/**
 * The function `node` stands for: itself when it is one, or, for a plain name,
 * the single function declared under that name anywhere in the file — a
 * `function` declaration or a `const` holding one.
 *
 * Names are not resolved through scopes. A name declared twice, or not at all,
 * returns `null`: an ambiguous handler is left unread rather than guessed at.
 */
export function resolveFunction(root, node) {
  const target = unwrap(node);
  if (isFunction(target)) return target;
  if (target?.type !== "Identifier") return null;

  const declarations = findAll(
    root,
    (n) =>
      (n.type === "FunctionDeclaration" && n.id?.name === target.name) ||
      (n.type === "VariableDeclarator" &&
        n.id.type === "Identifier" &&
        n.id.name === target.name &&
        isFunction(unwrap(n.init))),
  );
  if (declarations.length !== 1) return null;
  const [declaration] = declarations;
  return declaration.type === "FunctionDeclaration"
    ? declaration
    : unwrap(declaration.init);
}

const PARENTS = new WeakMap();

/** The node that directly holds `node` in `root`'s tree, or `null`. Mapped once per tree. */
export function parentOf(root, node) {
  let parents = PARENTS.get(root);
  if (!parents) {
    parents = new WeakMap();
    walk(root, (child, ancestors) => {
      if (ancestors.length) parents.set(child, ancestors[ancestors.length - 1]);
    });
    PARENTS.set(root, parents);
  }
  return parents.get(node) ?? null;
}

/** Every node that holds `node`, nearest first. */
export function ancestorsOf(root, node) {
  const found = [];
  for (let parent = parentOf(root, node); parent; parent = parentOf(root, parent)) {
    found.push(parent);
  }
  return found;
}

/** The method a call makes on a receiver — `to` for `tl.to(…)` — or `null`. */
export function methodName(node) {
  if (node?.type !== "CallExpression") return null;
  const callee = unwrap(node.callee);
  return callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
    ? callee.property.name
    : null;
}

/** The innermost call of a method chain: `tl.addLabel("a")` in `tl.addLabel("a").to(…)`. */
export function chainStart(call) {
  let current = call;
  for (;;) {
    const callee = unwrap(current.callee);
    const object = callee?.type === "MemberExpression" ? unwrap(callee.object) : null;
    if (object?.type !== "CallExpression") return current;
    current = object;
  }
}

/** What a method chain is called on, as a dotted name: `tl` for `tl.addLabel("a").to(…)`. */
export function chainReceiver(call) {
  const callee = unwrap(chainStart(call).callee);
  return callee?.type === "MemberExpression" ? dottedName(callee.object) : null;
}

/** The nearest function holding `node`, or the program: where a name declared at `node` is visible. */
export function scopeOf(root, node) {
  for (let parent = parentOf(root, node); parent; parent = parentOf(root, parent)) {
    if (isFunction(parent) || parent.type === "Program") return parent;
  }
  return root;
}

/**
 * The name the value built at `node` is kept under, through any chain called on
 * it — `tl` for `const tl = gsap.timeline().to(…)`, `split.current` for
 * `split.current = new SplitText(…)` — as `{ name, holder }`, or `null`.
 */
export function keptUnder(root, node) {
  let current = node;
  let parent = parentOf(root, current);
  while (
    parent &&
    (TRANSPARENT.has(parent.type) ||
      (parent.type === "MemberExpression" && parent.object === current) ||
      (parent.type === "CallExpression" && parent.callee === current))
  ) {
    current = parent;
    parent = parentOf(root, current);
  }
  if (parent?.type === "VariableDeclarator" && parent.init === current) {
    return { name: parent.id.type === "Identifier" ? parent.id.name : null, holder: parent };
  }
  if (parent?.type === "AssignmentExpression" && parent.right === current) {
    return { name: dottedName(parent.left), holder: parent };
  }
  return null;
}

/**
 * Every call that adds to or configures the timeline `timeline` creates: the
 * chain on the call itself, and every chain on the name it is kept under —
 * after that declaration, inside the scope that holds it, and not where the
 * same name is declared again. Ordered by where each call ends, so a chain
 * reads from the inside out.
 */
export function timelineLinks(root, timeline) {
  const calls = findAll(root, (node) => node !== timeline && methodName(node) !== null);
  const links = calls.filter((call) => chainStart(call) === timeline);

  const kept = keptUnder(root, timeline);
  if (kept?.name) {
    const scope = scopeOf(root, kept.holder);
    const redeclarations = findAll(
      root,
      (node) =>
        node !== kept.holder &&
        node.type === "VariableDeclarator" &&
        node.id.type === "Identifier" &&
        node.id.name === kept.name,
    );

    for (const call of calls) {
      if (links.includes(call) || call.start < kept.holder.end) continue;
      if (!contains(scope, call) || chainReceiver(call) !== kept.name) continue;
      const shadowed = redeclarations.some((declaration) => {
        const region = scopeOf(root, declaration);
        if (!contains(region, call) || declaration.start > call.start) return false;
        return region === scope
          ? declaration.start > kept.holder.end
          : contains(scope, region);
      });
      if (!shadowed) links.push(call);
    }
  }

  return links.sort((a, b) => a.end - b.end);
}

/** Whether an identifier is a use of a name, rather than a name being declared or a property key. */
function isReference(root, id) {
  const parent = parentOf(root, id);
  if (!parent) return true;
  switch (parent.type) {
    case "VariableDeclarator":
      return parent.id !== id;
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      return parent.id !== id && !parent.params.includes(id);
    case "Property":
    case "PropertyDefinition":
    case "MethodDefinition":
      return !(parent.key === id && !parent.computed && !parent.shorthand);
    case "MemberExpression":
      return !(parent.property === id && !parent.computed);
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "ExportSpecifier":
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
      return false;
    default:
      return true;
  }
}

/**
 * A test for whether a node runs inside a GSAP context: within the arguments
 * of a `useGSAP`, `gsap.context` or `contextSafe` call, under whatever local
 * names the file imports or destructures them as — or within a function the
 * file declares once whose every use is a call from inside a context.
 *
 * A function used any other way — passed as a prop, stored, returned — can run
 * from anywhere, so it is not counted as inside, however it is called here.
 */
export function gsapContexts(root) {
  const hooks = new Set(["useGSAP"]);
  for (const declaration of root.body) {
    if (declaration.type !== "ImportDeclaration") continue;
    if (declaration.source.value !== "@gsap/react") continue;
    for (const specifier of declaration.specifiers) {
      const imported = specifier.imported?.name ?? specifier.imported?.value;
      if (specifier.type === "ImportSpecifier" && imported === "useGSAP") {
        hooks.add(specifier.local.name);
      }
    }
  }

  const bareName = (call) => {
    const callee = unwrap(call.callee);
    return callee?.type === "Identifier" ? callee.name : null;
  };
  const isHook = (node) => node?.type === "CallExpression" && hooks.has(bareName(node));

  const safe = new Set(["contextSafe"]);
  const destructured = findAll(
    root,
    (node) =>
      node.type === "VariableDeclarator" &&
      node.id.type === "ObjectPattern" &&
      isHook(unwrap(node.init)),
  );
  for (const declarator of destructured) {
    for (const property of declarator.id.properties) {
      if (keyName(property) === "contextSafe" && property.value.type === "Identifier") {
        safe.add(property.value.name);
      }
    }
  }

  const scopes = findAll(
    root,
    (node) =>
      node.type === "CallExpression" &&
      (isHook(node) || calleeName(node) === "gsap.context" || safe.has(bareName(node))),
  ).flatMap((call) => call.arguments);

  const counts = new Map();
  const functions = new Map();
  const declared = findAll(
    root,
    (node) =>
      (node.type === "FunctionDeclaration" && node.id) ||
      (node.type === "VariableDeclarator" &&
        node.id.type === "Identifier" &&
        isFunction(unwrap(node.init))),
  );
  for (const node of declared) {
    const { name } = node.id;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    functions.set(name, node.type === "FunctionDeclaration" ? node : unwrap(node.init));
  }

  const contained = new Set();
  const inside = (node) =>
    scopes.some((argument) => contains(argument, node)) ||
    [...contained].some((fn) => contains(fn, node));
  const identifiers = findAll(root, (node) => node.type === "Identifier");

  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, fn] of functions) {
      if (counts.get(name) !== 1 || contained.has(fn)) continue;
      const uses = identifiers.filter((id) => id.name === name && isReference(root, id));
      if (!uses.length) continue;
      const calledFromInside = uses.every((id) => {
        const parent = parentOf(root, id);
        return (
          parent?.type === "CallExpression" &&
          parent.callee === id &&
          !contains(fn, parent) &&
          inside(parent)
        );
      });
      if (calledFromInside) {
        contained.add(fn);
        changed = true;
      }
    }
  }

  return inside;
}
