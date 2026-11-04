#!/usr/bin/env node
// Build the judge panels for a round: Woodshed's captured screens per flow next to the
// strongest competitor screens for that flow. Writes .ui-climb/rounds/<n>/panels/<id>.json.
//   node scripts/ui-climb/panels.mjs --round 0 [--shots-round 0]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FLOWS, pickShots } from "./flows.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const WORK = join(ROOT, ".ui-climb");
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const round = opt("round", "0");
const shotsRound = opt("shots-round", round);
const compsPerPanel = Number(opt("comps", "3"));

const STATE_WORDS = {
  ready: "exercise set up, before starting",
  lesson: "the lesson shown before the first try",
  question: "a question waiting for an answer",
  running: "exercise in progress, live feedback",
  "feedback-right": "just after a right answer",
  "feedback-wrong": "just after a wrong answer",
  feedback: "answer feedback",
  check: "test mode in progress, targets hidden",
  results: "results after a good run",
  "results-poor": "results after a weak run",
  silent: "results after a run where nothing was played",
  demo: "the exercise demonstrating itself",
  home: "home screen",
  "home-full": "home screen, whole page",
  celebration: "daily goal celebration",
  empty: "empty state, nothing practised yet",
};

function scan(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const shotFlow of readdirSync(dir)) {
    const d = join(dir, shotFlow);
    let files;
    try {
      files = readdirSync(d);
    } catch {
      continue;
    }
    for (const f of files) {
      const m = f.match(/^(.+)--(desktop|phone)-(light|dark)(-full)?\.png$/);
      if (!m) continue;
      out.push({
        shotFlow,
        state: m[1],
        width: m[2],
        theme: m[3],
        full: !!m[4],
        path: join(".ui-climb/shots", shotsRound, shotFlow, f),
      });
    }
  }
  return out;
}

const shots = scan(join(WORK, "shots", shotsRound));
const comp = existsSync(join(WORK, "competitors/flows.json"))
  ? JSON.parse(readFileSync(join(WORK, "competitors/flows.json"), "utf8"))
  : {};
const outDir = join(WORK, "rounds", round, "panels");
mkdirSync(outDir, { recursive: true });
let n = 0;
for (const flow of FLOWS) {
  const picks = pickShots(shots, flow);
  if (!picks.length) {
    console.warn(`no shots for ${flow.id}`);
    continue;
  }
  const woodshed = {
    key: "woodshed",
    images: picks.map((p) => ({
      path: p.path,
      caption: `${flow.shots.length > 1 ? `${p.shotFlow.replaceAll("-", " ")} exercise, ` : ""}${p.width === "phone" ? "phone, 390 px wide" : "laptop, 1280 px wide"}, ${p.theme} theme, ${
        STATE_WORDS[p.state] ?? p.state.replaceAll("-", " ")
      }`,
    })),
  };
  // Each competitor app brings its images from every competitor flow this panel maps to.
  const comps = [];
  for (const cf of flow.comp)
    for (const b of comp[cf]?.best ?? []) {
      if (comps.length >= compsPerPanel) break;
      if (comps.some((c) => c.key === `comp:${b.app}`)) continue;
      const images = flow.comp
        .flatMap((f) =>
          (comp[f]?.best ?? []).filter((x) => x.app === b.app).flatMap((x) => x.images),
        )
        .filter((i, k, all) => all.findIndex((j) => j.path === i.path) === k)
        .filter((i) => existsSync(resolve(ROOT, i.path)))
        .slice(0, 4);
      if (images.length) comps.push({ key: `comp:${b.app}`, images });
    }
  const panel = { id: flow.id, flow: flow.flow, job: flow.job, candidates: [woodshed, ...comps] };
  writeFileSync(join(outDir, `${flow.id}.json`), JSON.stringify(panel, null, 2));
  n++;
}
console.log(`${n} panels in ${outDir}`);
