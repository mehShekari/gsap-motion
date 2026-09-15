#!/usr/bin/env node

/**
 * Maps an animation: what it does, in what order, under what conditions, and
 * what cleans it up.
 *
 * It changes nothing and judges nothing. Every line says where it came from,
 * because that is the difference between a map and a guess:
 *
 *   (file)     read from the syntax tree — this is what the code says
 *   (comment)  the reason the author wrote down, quoted
 *   (audit)    a finding, with the rule that made it
 *   (page)     read from the running page, which may differ from the source
 *   (inferred) a reading, not a fact
 *
 * Given files it reads the code. Given a URL it reads the running page, where
 * the timeline is the one GSAP actually built — after every condition, branch
 * and early return the source has.
 *
 * Usage, from the project root:
 *   node <skill-dir>/scripts/explain-motion.mjs <file...> [--json]
 *   node <skill-dir>/scripts/explain-motion.mjs <url> [--json] [--wait 600]
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { connect, findChrome } from "./capture-motion.mjs";
import { check, mentionsGsap } from "./lib/audit.mjs";
import {
  calleeName,
  contains,
  dottedName,
  findAll,
  keptUnder,
  methodName,
  scopeOf,
  propertyOf,
  staticString,
  timelineLinks,
  tweenMethod,
  unwrap,
} from "./lib/ast.mjs";
import { RULES } from "./lib/rules.mjs";
import { collect, lineAt, load } from "./lib/source.mjs";

// --- Reading the code --------------------------------------------------------

/** The source of a node, on one line, short enough to read in a list. */
const textOf = (file, node, limit = 48) => {
  if (!node) return null;
  const text = file.raw.slice(node.start, node.end).replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

/**
 * The comment block immediately above `node`, which is where the reason usually
 * is. Only a block that ends within two lines counts: a comment further up
 * belongs to something else.
 */
function reasonFor(file, node) {
  const line = lineAt(file.raw, node.start);
  const above = file.comments
    .filter((comment) => {
      const ends = lineAt(file.raw, comment.end);
      return ends < line && line - ends <= 2;
    })
    .sort((a, b) => b.end - a.end)[0];
  if (!above) return null;

  const sentence = above.value
    .split("\n")
    .map((row) => row.replace(/^\s*\*?\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return sentence.length > 96 ? `${sentence.slice(0, 95)}…` : sentence;
}

/** The position argument of a timeline call: `"<"`, `"-=0.2"`, a number. */
function positionOf(file, call) {
  const method = methodName(call);
  const index = method === "fromTo" ? 3 : 2;
  return textOf(file, call.arguments[index], 16);
}

/** Where a call keeps its vars: a timeline at 0, a fromTo at 2, everything else at 1. */
const varsOf = (call) => {
  const method = methodName(call) ?? tweenMethod(call);
  const index = method === "timeline" ? 0 : method === "fromTo" ? 2 : 1;
  const node = unwrap(call.arguments[index]);
  return node?.type === "ObjectExpression" ? node : null;
};

/**
 * Where a call reads as starting. In `tl.from(a).from(b)` both calls begin at
 * `tl`, so the method's own name is what tells the beats apart — and what puts
 * each one's comment above the right beat.
 */
const startOf = (call) => unwrap(call.callee)?.property?.start ?? call.start;

const valueOf = (vars, key) => {
  const property = vars && propertyOf(vars, key);
  if (!property) return null;
  const literal = unwrap(property.value);
  if (literal?.type === "Literal") return String(literal.value);
  return null;
};

/** The scroll configuration of a tween's vars, or of a ScrollTrigger.create. */
function triggerOf(file, call) {
  const vars = varsOf(call);
  const own = vars && propertyOf(vars, "scrollTrigger");
  const config = own ? unwrap(own.value) : null;
  const direct =
    calleeName(call) === "ScrollTrigger.create"
      ? unwrap(call.arguments[0])
      : null;
  const object = config?.type === "ObjectExpression" ? config : direct?.type === "ObjectExpression" ? direct : null;
  if (!object) return null;

  const read = (key) => {
    const property = propertyOf(object, key);
    return property ? textOf(file, property.value, 24) : null;
  };

  return {
    line: lineAt(file.raw, (own ?? call).start),
    trigger: read("trigger"),
    start: read("start"),
    end: read("end"),
    scrub: read("scrub"),
    pin: read("pin"),
    toggleActions: read("toggleActions"),
  };
}

function readFile(file) {
  const map = {
    file: file.display,
    scopes: [],
    branches: [],
    scenes: [],
    loose: [],
    triggers: [],
    findings: [],
  };

  // Where animation is created, and what owns its cleanup.
  for (const call of findAll(file.ast, (node) => {
    const name = calleeName(node);
    return name === "useGSAP" || name === "gsap.context";
  })) {
    const vars = unwrap(call.arguments[1]);
    map.scopes.push({
      kind: calleeName(call),
      line: lineAt(file.raw, call.start),
      scope:
        vars?.type === "ObjectExpression"
          ? textOf(file, propertyOf(vars, "scope")?.value, 24)
          : textOf(file, call.arguments[1], 24),
      why: reasonFor(file, call),
    });
  }

  // Device and preference branches.
  for (const call of findAll(file.ast, (node) => methodName(node) === "add")) {
    const conditions = unwrap(call.arguments[0]);
    if (conditions?.type === "ObjectExpression") {
      const named = conditions.properties
        .map((property) => {
          const query = staticString(property.value);
          return query ? `${property.key.name ?? property.key.value}: ${query}` : null;
        })
        .filter(Boolean);
      if (named.length) {
        map.branches.push({ line: lineAt(file.raw, call.start), conditions: named });
      }
    } else {
      const query = staticString(call.arguments[0]);
      if (query && /\(.*:.*\)/.test(query)) {
        map.branches.push({ line: lineAt(file.raw, call.start), conditions: [query] });
      }
    }
  }

  // Scenes: a timeline, and the beats on it in order.
  const timelines = findAll(file.ast, (node) => calleeName(node) === "gsap.timeline");
  const claimed = new Set();
  /** Which function holds each scene, since a file often has two called `tl`. */
  const owners = new Map();

  for (const timeline of timelines) {
    const beats = [];
    for (const link of timelineLinks(file.ast, timeline)) {
      claimed.add(link);
      const method = methodName(link);
      if (method === "addLabel") {
        beats.push({
          label: staticString(link.arguments[0]) ?? textOf(file, link.arguments[0], 24) ?? "(label)",
        });
        continue;
      }
      if (!["to", "from", "fromTo", "set", "call", "add"].includes(method)) continue;

      const vars = varsOf(link);
      beats.push({
        line: lineAt(file.raw, startOf(link)),
        method,
        target: textOf(file, link.arguments[0], 32),
        duration: valueOf(vars, "duration"),
        ease: valueOf(vars, "ease"),
        at: positionOf(file, link),
        why: reasonFor(file, { start: startOf(link) }),
      });
    }

    const scene = {
      line: lineAt(file.raw, timeline.start),
      name: keptUnder(file.ast, timeline)?.name ?? null,
      repeat: valueOf(varsOf(timeline), "repeat"),
      why: reasonFor(file, timeline),
      beats,
    };
    map.scenes.push(scene);
    owners.set(scene, scopeOf(file.ast, timeline));
  }

  /**
   * The scene a beat belongs to. A name alone is not enough: two timelines in
   * one file are often both `tl`, and handing one scene's beats to the other is
   * the kind of wrong a map must not be. The owner is the enclosing function.
   */
  const sceneFor = (name, node) => {
    const holding = map.scenes.filter((scene) => {
      if (scene.name !== name) return false;
      const owner = owners.get(scene);
      /** A timeline at module scope owns the whole file; otherwise its function must hold the beat. */
      return !owner || contains(owner, node);
    });
    return holding.at(-1) ?? null;
  };

  // Beats added to a timeline this file was handed: the helper shape, where the
  // caller owns the timeline and this file only fills it.
  const handed = new Map();
  for (const call of findAll(file.ast, (node) =>
    ["to", "from", "fromTo", "set", "addLabel", "call"].includes(methodName(node)),
  )) {
    if (claimed.has(call) || timelines.includes(call)) continue;
    const owner = dottedName(unwrap(call.callee).object);
    if (!owner || owner === "gsap" || owner.startsWith("gsap.")) continue;
    const own = sceneFor(owner, call);
    if (!own && !handed.has(owner)) handed.set(owner, []);

    const method = methodName(call);
    const vars = varsOf(call);
    (own ? own.beats : handed.get(owner)).push(
      method === "addLabel"
        ? {
            label:
              staticString(call.arguments[0]) ?? textOf(file, call.arguments[0], 24) ?? "(label)",
          }
        : {
            line: lineAt(file.raw, startOf(call)),
            method,
            target: textOf(file, call.arguments[0], 32),
            duration: valueOf(vars, "duration"),
            ease: valueOf(vars, "ease"),
            at: positionOf(file, call),
            why: reasonFor(file, { start: startOf(call) }),
          },
    );
  }
  map.handed = [...handed.entries()].map(([owner, beats]) => ({ owner, beats }));
  for (const scene of map.scenes) {
    scene.beats.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  }

  // Tweens that belong to no timeline.
  for (const call of findAll(file.ast, (node) => tweenMethod(node) !== null)) {
    if (claimed.has(call) || timelines.includes(call)) continue;
    if (calleeName(call)?.startsWith("gsap.") !== true) continue;
    const vars = varsOf(call);
    map.loose.push({
      line: lineAt(file.raw, call.start),
      method: tweenMethod(call),
      target: textOf(file, call.arguments[0], 32),
      duration: valueOf(vars, "duration"),
      ease: valueOf(vars, "ease"),
      repeat: valueOf(vars, "repeat"),
      why: reasonFor(file, call),
    });
  }

  // Scroll configuration, wherever it is written.
  for (const call of findAll(file.ast, (node) => node.type === "CallExpression")) {
    const trigger = triggerOf(file, call);
    if (trigger) map.triggers.push(trigger);
  }

  // What the audit says about this file, so a claim can cite a rule.
  for (const rule of RULES) {
    for (const finding of check(rule, file)) {
      map.findings.push({ line: finding.line, rule: finding.rule, level: finding.level, message: finding.message });
    }
  }

  return map;
}

// --- Reading the page --------------------------------------------------------

const LIVE = `(() => {
  const out = { gsap: typeof gsap !== "undefined", children: [], triggers: [], reduced: null };
  out.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!out.gsap) return out;

  out.children = gsap.globalTimeline.getChildren(true, true, true).map((child) => ({
    targets: (child.targets?.() ?? []).map((target) =>
      target?.id ? "#" + target.id : target?.tagName ? target.tagName.toLowerCase() : String(target)
    ),
    duration: child.duration?.() ?? 0,
    repeat: child.repeat?.() ?? 0,
    paused: child.paused?.() ?? false,
    ease: typeof child.vars?.ease === "string" ? child.vars.ease : null,
  }));

  const ScrollTriggerClass = globalThis.ScrollTrigger ?? gsap.core?.globals?.().ScrollTrigger;
  if (ScrollTriggerClass?.getAll) {
    out.triggers = ScrollTriggerClass.getAll().map((trigger) => ({
      element: trigger.trigger?.id ? "#" + trigger.trigger.id : trigger.trigger?.tagName?.toLowerCase() ?? null,
      start: trigger.start,
      end: trigger.end,
      scrub: Boolean(trigger.vars?.scrub),
      pin: Boolean(trigger.vars?.pin),
      progress: Number((trigger.progress ?? 0).toFixed(3)),
    }));
  }
  return out;
})()`;

async function readPage(url, { wait = 600, chrome = null } = {}) {
  const executable = findChrome(chrome);
  if (!executable) {
    throw new Error("No Chrome found. Install Chrome, pass --chrome <path>, or set CHROME_PATH.");
  }

  const browser = connect(executable);
  try {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params) => browser.send(method, params, sessionId);

    await call("Page.enable");
    await call("Runtime.enable");
    await call("Page.navigate", { url });
    await new Promise((done) => setTimeout(done, wait));

    const { result } = await call("Runtime.evaluate", {
      expression: LIVE,
      returnByValue: true,
      awaitPromise: true,
    });
    return { url, ...result.value };
  } finally {
    await browser.close();
  }
}

// --- Reporting ---------------------------------------------------------------

function reportFile(map) {
  const lines = [`${map.file}`];
  const say = (text) => lines.push(`  ${text}`);

  if (map.scopes.length) {
    say("");
    say("Where it lives");
    for (const scope of map.scopes) {
      say(`  ${scope.line}: ${scope.kind}${scope.scope ? ` scoped to ${scope.scope}` : ""}   (file)`);
      if (scope.why) say(`      "${scope.why}"   (comment)`);
    }
  }

  if (map.branches.length) {
    say("");
    say("Branches");
    for (const branch of map.branches) {
      say(`  ${branch.line}: ${branch.conditions.join(" · ")}   (file)`);
    }
  }

  for (const scene of map.scenes) {
    say("");
    say(`Scene at line ${scene.line}${scene.name ? ` (${scene.name})` : ""}${scene.repeat === "-1" ? ", repeats forever" : ""}   (file)`);
    if (scene.why) say(`    "${scene.why}"   (comment)`);
    for (const beat of scene.beats) {
      if (beat.label) {
        say(`    label "${beat.label}"`);
        continue;
      }
      const parts = [
        `${beat.method} ${beat.target ?? ""}`.trim(),
        beat.duration ? `${beat.duration}s` : null,
        beat.ease ? `ease ${beat.ease}` : null,
        beat.at ? `at ${beat.at}` : null,
      ].filter(Boolean);
      say(`    ${beat.line}: ${parts.join(" · ")}`);
      if (beat.why) say(`        "${beat.why}"   (comment)`);
    }
  }

  for (const scene of map.handed ?? []) {
    say("");
    say(`Beats this file adds to ${scene.owner}, a timeline it was given   (file)`);
    for (const beat of scene.beats) {
      if (beat.label) {
        say(`    label "${beat.label}"`);
        continue;
      }
      const parts = [
        `${beat.method} ${beat.target ?? ""}`.trim(),
        beat.duration ? `${beat.duration}s` : null,
        beat.ease ? `ease ${beat.ease}` : null,
        beat.at ? `at ${beat.at}` : null,
      ].filter(Boolean);
      say(`    ${beat.line}: ${parts.join(" · ")}`);
      if (beat.why) say(`        "${beat.why}"   (comment)`);
    }
  }

  if (map.loose.length) {
    say("");
    say("Tweens on no timeline   (file)");
    for (const tween of map.loose) {
      const parts = [
        `${tween.method} ${tween.target ?? ""}`.trim(),
        tween.duration ? `${tween.duration}s` : null,
        tween.ease ? `ease ${tween.ease}` : null,
        tween.repeat === "-1" ? "repeats forever" : null,
      ].filter(Boolean);
      say(`  ${tween.line}: ${parts.join(" · ")}`);
    }
  }

  if (map.triggers.length) {
    say("");
    say("Scroll   (file)");
    for (const trigger of map.triggers) {
      const parts = [
        trigger.trigger ? `trigger ${trigger.trigger}` : null,
        trigger.start ? `start ${trigger.start}` : null,
        trigger.end ? `end ${trigger.end}` : null,
        trigger.scrub ? `scrub ${trigger.scrub}` : null,
        trigger.pin ? `pin ${trigger.pin}` : null,
        trigger.toggleActions ? `toggleActions ${trigger.toggleActions}` : null,
      ].filter(Boolean);
      say(`  ${trigger.line}: ${parts.join(" · ") || "(no options read)"}`);
    }
  }

  say("");
  if (map.findings.length) {
    say("What the audit says");
    for (const finding of map.findings) {
      say(`  ${finding.line}: ${finding.message} [${finding.rule}]   (audit)`);
    }
  } else {
    say("The audit reports nothing on this file.   (audit)");
  }

  return lines.join("\n");
}

function reportPage(page) {
  const lines = [`${page.url}   (page)`];
  const say = (text) => lines.push(`  ${text}`);

  say("");
  say(`Reduced motion: ${page.reduced ? "the visitor asked for less" : "no preference"}`);

  say("");
  if (!page.gsap) {
    say("No GSAP on the page. Either it never loaded, or nothing here animates with it.");
    return lines.join("\n");
  }

  say(`Running now: ${page.children.length} tween(s) or timeline(s) on the global timeline`);
  for (const child of page.children) {
    const parts = [
      child.targets.join(", ") || "(no target)",
      `${Number(child.duration.toFixed(3))}s`,
      child.repeat === -1 ? "repeats forever" : child.repeat ? `repeats ${child.repeat}` : null,
      child.paused ? "paused" : null,
      child.ease ? `ease ${child.ease}` : null,
    ].filter(Boolean);
    say(`  ${parts.join(" · ")}`);
  }

  say("");
  say(`ScrollTriggers: ${page.triggers.length}`);
  for (const trigger of page.triggers) {
    const parts = [
      trigger.element ?? "(no element)",
      `${Math.round(trigger.start)}→${Math.round(trigger.end)}`,
      trigger.scrub ? "scrub" : null,
      trigger.pin ? "pin" : null,
      `progress ${trigger.progress}`,
    ].filter(Boolean);
    say(`  ${parts.join(" · ")}`);
  }

  say("");
  say("A finished tween leaves the global timeline, so what is here is what is running now.");
  return lines.join("\n");
}

// --- Entry -------------------------------------------------------------------

export function parseArguments(argv) {
  const options = { targets: [], json: false, wait: 600, chrome: null, errors: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--wait") options.wait = Number(argv[(index += 1)]) || options.wait;
    else if (argument === "--chrome") options.chrome = argv[(index += 1)] ?? null;
    else if (argument.startsWith("--")) options.errors.push(`Unknown option: ${argument}`);
    else options.targets.push(argument);
  }

  if (options.targets.length === 0) {
    options.errors.push("Nothing to explain. Pass a file, a directory, or a URL.");
  }

  options.live = options.targets.some((target) => /^https?:|^file:/.test(target));
  if (options.live && options.targets.length > 1) {
    options.errors.push("Explain one URL at a time.");
  }

  return options;
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.errors.length) {
    for (const error of options.errors) console.error(error);
    console.error("\nUsage: node explain-motion.mjs <file...|url> [--json]");
    process.exit(2);
  }

  if (options.live) {
    const page = await readPage(options.targets[0], options);
    console.log(options.json ? JSON.stringify(page, null, 2) : reportPage(page));
    return;
  }

  const root = process.cwd();
  const maps = [];

  for (const target of options.targets) {
    const path = resolve(root, target);
    if (!existsSync(path)) {
      console.error(`No such path: ${path}`);
      process.exit(2);
    }
    for (const found of collect(path)) {
      const file = load(found, root);
      if (!mentionsGsap(file)) continue;
      if (file.parseError) {
        maps.push({ file: file.display, parseError: file.parseError.message });
        continue;
      }
      maps.push(readFile(file));
    }
  }

  if (maps.length === 0) {
    console.log("Nothing here animates with GSAP.");
    return;
  }

  console.log(
    options.json
      ? JSON.stringify(maps, null, 2)
      : maps
          .map((map) =>
            map.parseError ? `${map.file}\n  could not be parsed: ${map.parseError}` : reportFile(map),
          )
          .join("\n\n"),
  );
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main(process.argv.slice(2));
