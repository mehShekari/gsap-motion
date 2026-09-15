/**
 * The gsap-motion audit, as ESLint rules.
 *
 * Every rule here is the audit's own rule, run on the audit's own parse of the
 * file — not on the tree the project's ESLint parser built. So the editor and
 * `gsap-motion audit` report the same findings on the same lines, the precision
 * measured for the command line holds here too, and a waiver means the same in
 * both. The project's parser only has to accept the file; nothing reads its
 * tree.
 *
 * `lib/` is the audit's own `scripts/lib`, copied in by scripts/bundle-audit.mjs
 * before the package is packed or tested.
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { check, mentionsGsap, NOT_PARSED, notParsed } from "./lib/audit.mjs";
import { RULES } from "./lib/rules.mjs";
import { fromText, hasSourceExtension } from "./lib/source.mjs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

const NAMESPACE = "gsap-motion";
const DOCS = "https://github.com/mehShekari/gsap-motion#the-audit";

/** ESLint has no info level. The one info finding, `not-parsed`, warns. */
const severity = (level) => (level === "info" ? "warn" : level);

/**
 * Parsed once per file, however many of the rules run on it: ESLint hands every
 * rule the same SourceCode for a file. `null` marks a file the audit does not
 * read.
 */
const sources = new WeakMap();

function sourceFor(context) {
  const { sourceCode, filename } = context;
  if (!sources.has(sourceCode)) {
    /**
     * The files the command line reads and no others, so the two report the
     * same findings. A name with no extension — code piped in as `<text>` — is
     * read as JavaScript with JSX.
     */
    const readable = !extname(filename) || hasSourceExtension(filename);
    const source = readable ? fromText(sourceCode.text, filename) : null;
    sources.set(sourceCode, source && mentionsGsap(source) ? source : null);
  }
  return sources.get(sourceCode);
}

const MESSAGES = { finding: "{{ message }} {{ hint }}" };

function report(context, finding) {
  context.report({
    loc: { line: finding.line, column: finding.column },
    messageId: "finding",
    data: { message: finding.message, hint: finding.hint },
  });
}

/**
 * ESLint lints one file at a time, so a plugin registered in another file —
 * once, in the app's entry — cannot be seen from this one. The command line
 * collects registrations across the files it audits; here the project names
 * them.
 */
const REGISTERED = [
  {
    type: "object",
    properties: {
      registered: {
        type: "array",
        items: { type: "string" },
        uniqueItems: true,
      },
    },
    additionalProperties: false,
  },
];

function toEslintRule(rule) {
  return {
    meta: {
      type: "problem",
      docs: { description: rule.description, recommended: true, url: DOCS },
      messages: MESSAGES,
      schema: rule.id === "unregistered-plugin" ? REGISTERED : [],
    },
    create(context) {
      const source = sourceFor(context);
      if (!source || source.parseError) return {};
      return {
        Program() {
          const file = Object.create(source, {
            registeredElsewhere: {
              value: new Set(context.options[0]?.registered),
            },
          });
          for (const finding of check(rule, file)) report(context, finding);
        },
      };
    },
  };
}

const notParsedRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A file that uses GSAP and that the audit's parser could not read, so no other rule checked it",
      recommended: true,
      url: DOCS,
    },
    messages: MESSAGES,
    schema: [],
  },
  create(context) {
    const source = sourceFor(context);
    if (!source?.parseError) return {};
    return {
      Program() {
        const finding = notParsed(source);
        if (finding) report(context, finding);
      },
    };
  },
};

const plugin = {
  meta: { name: pkg.name, version: pkg.version, namespace: NAMESPACE },
  rules: Object.fromEntries([
    ...RULES.map((rule) => [rule.id, toEslintRule(rule)]),
    [NOT_PARSED, notParsedRule],
  ]),
  configs: {},
};

/**
 * Every rule at the level the command line gives it.
 *
 * No `files`: the config applies to whatever the project already lints, and
 * never widens that to files the project's parser cannot read.
 */
plugin.configs.recommended = {
  name: `${NAMESPACE}/recommended`,
  plugins: { [NAMESPACE]: plugin },
  rules: Object.fromEntries([
    ...RULES.map((rule) => [`${NAMESPACE}/${rule.id}`, severity(rule.level)]),
    [`${NAMESPACE}/${NOT_PARSED}`, severity("info")],
  ]),
};

export default plugin;
