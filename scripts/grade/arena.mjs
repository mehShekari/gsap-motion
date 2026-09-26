#!/usr/bin/env node
/**
 * arena — blind, pairwise judging of two arms' builds, by a person.
 *
 *   node scripts/grade/arena.mjs <root> <arm> <rival> [<rival>...] [--port 4700]
 *   node scripts/grade/arena.mjs <root> --summary
 *
 * `<root>` holds `runs/<brief>/<arm>-<n>/dist`, as `run-arm.mjs` leaves them. A
 * pair is the n-th run of both arms on one brief, drawn at random and shown side
 * by side with its sides decided at random, then held until it is voted on. Each
 * vote is appended to `<root>/votes.jsonl` with the arms it was between, the last
 * one can be undone, and the page names no arm until every pair is judged. With
 * more than one rival, the matchups are mixed into one session, so the judge
 * cannot tell which one is on screen either.
 *
 * It exists because `grade.mjs` answers only whether an animation is fragile,
 * never whether it is good, and a creative judgement has no script that can make
 * it. An A/B graded by the agent that built both arms favoured the skill in every
 * column of six reports; the only grader left is a person who does not know which
 * is which.
 *
 * The builds are served, not a dev server, so first motion is the page's own
 * and not Vite's dependency optimisation. Node.js 22+, no dependencies.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

/** Writes `path` under `dir` to `res`, refusing anything that escapes `dir`. */
export function sendFile(dir, path, res) {
  const file = normalize(join(dir, decodeURIComponent(path) || "index.html"));
  if (!file.startsWith(normalize(dir) + sep) && file !== normalize(dir)) {
    res.writeHead(403).end();
    return;
  }
  const target = existsSync(file) && statSync(file).isDirectory() ? join(file, "index.html") : file;
  if (!existsSync(target)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
  res.end(readFileSync(target));
}

/** Serves one build on a free port, for `grade.mjs`. */
export function serve(dir) {
  const server = createServer((req, res) => sendFile(dir, new URL(req.url, "http://x").pathname.slice(1), res));
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () =>
      done({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() }),
    ),
  );
}

/** Every pair both arms have a build for, keyed so a vote can be matched to it. */
export function pairs(root, a, b) {
  const runs = join(root, "runs");
  if (!existsSync(runs)) return [];
  const built = (brief, arm, n) => existsSync(join(runs, brief, `${arm}-${n}`, "dist", "index.html"));
  return readdirSync(runs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(({ name: brief }) => {
      const ns = readdirSync(join(runs, brief))
        .map((name) => name.match(new RegExp(`^${a.replace(/\./g, "\\.")}-(\\d+)$`))?.[1])
        .filter(Boolean)
        .map(Number)
        .sort((x, y) => x - y);
      return ns
        .filter((n) => built(brief, a, n) && built(brief, b, n))
        .map((n) => ({ id: `${brief}/${n}/${[a, b].sort().join("~")}`, brief, n, arms: [a, b] }));
    });
}

export const readVotes = (root) => {
  const file = join(root, "votes.jsonl");
  return existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
};

/** Wins per arm and ties, overall and per brief, for every pair of arms voted on. */
export function tally(votes) {
  const out = {};
  for (const vote of votes) {
    const key = [vote.left, vote.right].sort().join(" vs ");
    const row = (out[key] ??= { total: { tie: 0 }, briefs: {} });
    for (const bucket of [row.total, (row.briefs[vote.brief] ??= { tie: 0 })]) {
      bucket[vote.pick] = (bucket[vote.pick] ?? 0) + 1;
    }
  }
  return out;
}

const PAGE = readFileSync(fileURLToPath(new URL("./arena.html", import.meta.url)), "utf8");

function start(root, a, rivals, port) {
  const allPairs = () => rivals.flatMap((rival) => pairs(root, a, rival));
  const tokens = new Map();
  const tokenFor = (dir) => {
    for (const [token, known] of tokens) if (known === dir) return token;
    const token = randomBytes(6).toString("hex");
    tokens.set(token, dir);
    return token;
  };
  /**
   * The pair on screen, with its sides, until it is voted on. A reload shows the
   * same pair the same way round: drawing again on every load let the judge see a
   * different pair, or the same one swapped, by reloading.
   */
  let current = null;
  /** The last vote and the pair it was cast on, so one mistaken key can be undone. */
  let last = null;

  const next = () => {
    const voted = new Set(readVotes(root).map((vote) => vote.id));
    const all = allPairs();
    const open = all.filter((pair) => !voted.has(pair.id));
    if (open.length === 0) return { finished: true, total: all.length, summary: tally(readVotes(root)), canUndo: Boolean(last) };
    if (!current || voted.has(current.id)) {
      const pair = open[Math.floor(Math.random() * open.length)];
      const [left, right] = Math.random() < 0.5 ? pair.arms : [...pair.arms].reverse();
      current = { ...pair, left, right };
    }
    const src = (arm) => `/r/${tokenFor(join(root, "runs", current.brief, `${arm}-${current.n}`, "dist"))}/`;
    return {
      id: current.id,
      brief: current.brief,
      left: src(current.left),
      right: src(current.right),
      done: all.length - open.length,
      total: all.length,
      canUndo: Boolean(last),
    };
  };

  const body = (req) =>
    new Promise((done) => {
      let text = "";
      req.on("data", (chunk) => (text += chunk));
      req.on("end", () => done(text ? JSON.parse(text) : {}));
    });

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://x");
    const json = (value) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value));
    if (pathname === "/") return res.writeHead(200, { "content-type": TYPES[".html"] }).end(PAGE);
    if (pathname === "/api/next") return json(next());
    if (pathname === "/api/vote" && req.method === "POST") {
      const { id, pick, note } = await body(req);
      const pair = current;
      if (!pair || pair.id !== id || !["left", "right", "tie"].includes(pick)) return res.writeHead(400).end();
      const vote = {
        time: new Date().toISOString(),
        id,
        brief: pair.brief,
        n: pair.n,
        left: pair.left,
        right: pair.right,
        pick: pick === "tie" ? "tie" : pair[pick],
        note: String(note ?? "").slice(0, 2000),
      };
      appendFileSync(join(root, "votes.jsonl"), JSON.stringify(vote) + "\n");
      last = { vote, pair };
      current = null;
      return json(next());
    }
    if (pathname === "/api/undo" && req.method === "POST") {
      const file = join(root, "votes.jsonl");
      const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
      /** Only the vote this server just wrote, and only while it is still the file's last line. */
      if (!last || lines.length === 0 || JSON.parse(lines.at(-1)).time !== last.vote.time) {
        return res.writeHead(409).end();
      }
      writeFileSync(file, lines.slice(0, -1).map((line) => line + "\n").join(""));
      current = last.pair;
      last = null;
      return json(next());
    }
    const match = pathname.match(/^\/r\/([0-9a-f]{12})\/(.*)$/);
    if (match && tokens.has(match[1])) return sendFile(tokens.get(match[1]), match[2], res);
    res.writeHead(404).end();
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`arena: ${allPairs().length} pairs of ${a} against ${rivals.join(", ")}, at http://127.0.0.1:${port}/`);
  });
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  const port = Number(args[args.indexOf("--port") + 1]) || 4700;
  const [root, a, ...rivals] = args.filter((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--port");
  if (root && args.includes("--summary")) {
    console.log(JSON.stringify(tally(readVotes(resolve(root))), null, 2));
  } else if (root && a && rivals.length) {
    start(resolve(root), a, rivals, port);
  } else {
    console.error("Usage: node scripts/grade/arena.mjs <root> <arm> <rival> [<rival>...] [--port 4700] | <root> --summary");
    process.exit(2);
  }
}
