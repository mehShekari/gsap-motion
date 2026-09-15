#!/usr/bin/env node

/**
 * gsap-motion — the gsap-creative-animation skill, from npm.
 *
 *   npx @mehshekari/gsap-motion add [--global | --dir <skills-dir>] [--force]
 *   npx @mehshekari/gsap-motion remove [--global | --dir <skills-dir>]
 *   npx @mehshekari/gsap-motion audit [path...] [--quiet] [--json]
 *   npx @mehshekari/gsap-motion audit-svg <file.svg...> [--morph] [--hues]
 *   npx @mehshekari/gsap-motion inspect <url> [--at ...] [--hover ...] [--reduced]
 *   npx @mehshekari/gsap-motion doctor
 *
 * Installed as a dependency, the same commands run as `gsap-motion <command>`.
 *
 * No dependencies and no install scripts. `npx` runs whatever it downloads, so
 * this file and the skill it carries are the whole of what runs.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_NAME = "gsap-creative-animation";
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
);

/**
 * The skill this package carries. Published, it is bundled beside `bin/`. Run
 * from a clone of the repository it is read straight from the plugin, so the
 * CLI can be developed and tested without bundling first.
 */
const SKILL_DIR = [
  join(PACKAGE_ROOT, "skill"),
  resolve(PACKAGE_ROOT, "..", "..", "plugins", "gsap-motion", "skills", SKILL_NAME),
].find((dir) => existsSync(join(dir, "SKILL.md")));

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) =>
  useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
const bold = paint(1);
const dim = paint(2);
const green = paint(32);
const yellow = paint(33);
const red = paint(31);

const HELP = `${bold("gsap-motion")} ${pkg.version} — the ${SKILL_NAME} skill, from npm

Usage
  npx ${pkg.name} <command> [options]

Commands
  add                   Install or update the skill for this project (.claude/skills)
    --global            ...for your user instead (~/.claude/skills)
    --dir <path>        ...into another agent's skills directory
    --force             Reinstall even when this version is already installed
  remove                Uninstall it (accepts --global and --dir)
  audit [path...]       Find silent GSAP failures. Default path: src
    --quiet             Errors only
    --json              Machine-readable output
  audit-svg <file...>   What an SVG can do before you animate it
    --morph <a> <b>     Compare a morph pair
    --hues              Also report hard-coded hues
  inspect <url>         Watch a page animate and report what it did
    --at 0,300,900      When to capture, in ms after the page settles
    --scroll <px|sel>   Scroll before capturing
    --hover <selector>  Move the pointer onto an element
    --click <selector>  Click an element
    --reduced --dark    Emulate a preference
    --mobile            390x844 with touch input
    --cpu 4             Throttle the CPU by this factor
    --out <dir>         Where frames go. Default .gsap-motion/inspect
    --json              Machine-readable output
  doctor                Check Node, the installed skill and your project's GSAP
  --version             Print the version

Docs: https://github.com/mehShekari/gsap-motion`;

function fail(message, code = 1) {
  console.error(`${red("error")} ${message}`);
  process.exit(code);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} needs a value.`, 2);
  return value;
}

const flag = (args, name) => args.includes(name);

/** The skill's name and version, read from a SKILL.md — or null if there is none. */
function skillInfo(dir) {
  const file = join(dir, "SKILL.md");
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return {
    name: text.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? null,
    version:
      text.match(
        /\nmetadata:\n(?:[ \t]+[\w-]+:.*\n)*?[ \t]+version:\s*"?([\d.]+)"?/,
      )?.[1] ?? "unknown",
  };
}

/** Where `add` and `remove` act: this project, the user, or an explicit directory. */
function skillsDir(args) {
  const dir = option(args, "--dir");
  if (dir && flag(args, "--global")) fail("Use --global or --dir, not both.", 2);
  if (dir) return resolve(dir);
  return join(flag(args, "--global") ? homedir() : process.cwd(), ".claude", "skills");
}

/** Tests belong to the repository, never to a user's install. */
const isTestPath = (path) =>
  path === "scripts/test" || path.startsWith("scripts/test/");

function copyTree(from, to, base = from) {
  let copied = 0;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    if (isTestPath(relative(base, source).split(sep).join("/"))) continue;
    const target = join(to, entry.name);
    if (entry.isDirectory()) copied += copyTree(source, target, base);
    else if (entry.isFile()) {
      copyFileSync(source, target);
      copied += 1;
    }
  }
  return copied;
}

function add(args) {
  const bundled = skillInfo(SKILL_DIR);
  const target = join(skillsDir(args), SKILL_NAME);
  const existing = skillInfo(target);

  if (existsSync(target)) {
    if (existing?.name !== SKILL_NAME) {
      fail(`${target} exists and is not the ${SKILL_NAME} skill. Nothing was changed.`);
    }
    if (existing.version === bundled.version && !flag(args, "--force")) {
      console.log(`${green("✓")} ${SKILL_NAME} ${bundled.version} is already installed at ${target}`);
      return;
    }
    rmSync(target, { recursive: true, force: true });
  }

  const files = copyTree(SKILL_DIR, target);
  const what = existing
    ? `Updated ${SKILL_NAME} ${existing.version} → ${bundled.version}`
    : `Installed ${SKILL_NAME} ${bundled.version}`;
  console.log(`${green("✓")} ${what} (${files} files)`);
  console.log(`  ${target}`);
  console.log(
    dim(
      option(args, "--dir")
        ? "  Point your agent at this directory if it does not read it already."
        : flag(args, "--global")
          ? "  Available in every project. Start a new Claude Code session to load it."
          : "  Commit .claude/skills to share it with your team. Start a new Claude Code session to load it.",
    ),
  );
}

function remove(args) {
  const target = join(skillsDir(args), SKILL_NAME);
  if (!existsSync(target)) {
    console.log(`Nothing to remove at ${target}`);
    return;
  }
  if (skillInfo(target)?.name !== SKILL_NAME) {
    fail(`${target} is not the ${SKILL_NAME} skill. Nothing was removed.`);
  }
  rmSync(target, { recursive: true, force: true });
  console.log(`${green("✓")} Removed ${target}`);
}

function runScript(script, args) {
  const result = spawnSync(
    process.execPath,
    [join(SKILL_DIR, "scripts", script), ...args],
    { stdio: "inherit" },
  );
  if (result.error) fail(result.error.message);
  process.exit(result.status ?? 1);
}

function doctor() {
  const bundled = skillInfo(SKILL_DIR);
  const mark = { ok: green("✓"), warn: yellow("!"), info: dim("·") };
  const report = (state, message, hint) => {
    console.log(`${mark[state]} ${message}`);
    if (hint && state !== "ok") console.log(`  ${dim(hint)}`);
  };

  console.log(`${bold("gsap-motion")} ${pkg.version}, carrying ${SKILL_NAME} ${bundled.version}\n`);

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  report(
    nodeMajor >= 18 ? "ok" : "warn",
    `Node.js ${process.versions.node}`,
    "The audit scripts need Node.js 18 or later.",
  );

  for (const [scope, root, command] of [
    ["this project", process.cwd(), `npx ${pkg.name} add`],
    ["your user", homedir(), `npx ${pkg.name} add --global`],
  ]) {
    const location = join(root, ".claude", "skills", SKILL_NAME);
    const installed = skillInfo(location);
    if (!installed) report("info", `Not installed for ${scope}`, `${command} installs it at ${location}`);
    else if (installed.version === bundled.version) report("ok", `Installed for ${scope}: ${installed.version}`);
    else report("warn", `Installed for ${scope}: ${installed.version}`, `${command} updates it to ${bundled.version}.`);
  }

  const manifest = join(process.cwd(), "package.json");
  if (!existsSync(manifest)) {
    report("info", "No package.json here", "Run doctor from your project root to check its GSAP version.");
    return;
  }

  let project;
  try {
    project = JSON.parse(readFileSync(manifest, "utf8"));
  } catch {
    report("warn", "package.json could not be read as JSON");
    return;
  }
  const deps = { ...project.dependencies, ...project.devDependencies };
  const minor = (range) => {
    const match = String(range).match(/(\d+)\.(\d+)/);
    return match ? [Number(match[1]), Number(match[2])] : null;
  };

  if (!deps.gsap) {
    report("warn", "gsap is not a dependency", "Install it with `npm install gsap`.");
  } else {
    const version = minor(deps.gsap);
    if (!version) report("info", `gsap ${deps.gsap}`, "Could not read a minor version; the skill assumes 3.13 or later.");
    else {
      const [major, min] = version;
      report(
        major > 3 || (major === 3 && min >= 13) ? "ok" : "warn",
        `gsap ${deps.gsap}`,
        "The skill assumes GSAP 3.13 or later, where every plugin is free. Upgrade with `npm install gsap@latest`.",
      );
    }
  }

  if (deps.react) {
    report(
      deps["@gsap/react"] ? "ok" : "warn",
      deps["@gsap/react"] ? `@gsap/react ${deps["@gsap/react"]}` : "@gsap/react is not a dependency",
      "React projects need it for useGSAP: `npm install @gsap/react`.",
    );
  }

  /**
   * Which adapters the skill loads here, read the way SKILL.md's setup step 3
   * describes. Deterministic, so the stack is looked up rather than guessed.
   */
  const picked = new Set();
  if (deps.next) picked.add("react").add("next");
  if (deps["@react-three/fiber"]) picked.add("react").add("r3f");
  else if (deps.three) picked.add("three");
  if (deps.react) picked.add("react");
  if (deps.vue || deps.nuxt) picked.add("vue");
  if (deps.svelte || deps["@sveltejs/kit"]) picked.add("svelte");
  if (deps.astro) picked.add("astro");
  if (picked.size === 0) picked.add("vanilla");

  const ORDER = ["react", "next", "r3f", "three", "vue", "svelte", "astro", "vanilla"];
  report("ok", `Adapters: ${ORDER.filter((name) => picked.has(name)).join(", ")}`);

  const rules = existsSync(join(process.cwd(), "ANIMATION.md"));
  report(
    rules ? "ok" : "info",
    rules ? "ANIMATION.md found — the skill follows it" : "No ANIMATION.md",
    "Optional. Add one so the skill follows your project's rules; see reference/project-rules.md in the skill.",
  );
}

const [command, ...args] = process.argv.slice(2);

if (!SKILL_DIR && !["--version", "-v", "version", "--help", "-h", "help", undefined].includes(command)) {
  fail(`The bundled skill is missing from this installation. Reinstall ${pkg.name}.`);
}

switch (command) {
  case "add":
    add(args);
    break;
  case "remove":
    remove(args);
    break;
  case "audit":
    runScript("audit-gsap.mjs", args);
    break;
  case "audit-svg":
    runScript("audit-svg.mjs", args);
    break;
  case "inspect":
    runScript("capture-motion.mjs", args);
    break;
  case "doctor":
    doctor();
    break;
  case "--version":
  case "-v":
  case "version":
    console.log(pkg.version);
    break;
  case undefined:
  case "--help":
  case "-h":
  case "help":
    console.log(HELP);
    break;
  default:
    console.error(HELP);
    fail(`Unknown command "${command}".`, 2);
}
