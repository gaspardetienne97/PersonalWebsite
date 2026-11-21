#!/usr/bin/env node
// Build the judge panels for a round: our captured screens per flow next to the strongest
// competitor screens for that flow. Writes <work>/rounds/<n>/panels/<id>.json.
//   node scripts/ui-climb/panels.mjs --round 0 [--shots-round 0]
//   node scripts/ui-climb/panels.mjs --project site --round 0
// --project woodshed|site|narrator (or UI_CLIMB_PROJECT); with none it is Woodshed and the
// work dir is .ui-climb. The competitor library is read from <work>/competitors/flows.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pickPanel, pickShots } from "./flows.mjs";
import { ROOT, flowsOf, projectFrom } from "./projects.mjs";

const args = process.argv.slice(2);
const project = projectFrom(args);
const WORK = project.dir;
const FLOWS = await flowsOf(project);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const round = opt("round", "0");
const shotsRound = opt("shots-round", round);
const compsPerPanel = Number(opt("comps", "3"));

const WIDTH_WORDS = {
  desktop: "laptop, 1280 px wide",
  tablet: "tablet landscape, 1180 px wide, touch",
  phone: "phone, 390 px wide",
};

// Hub pages follow the app theme; every other shot is a drill page, which is dark in both
// themes by the owner's choice, so its caption says so instead of claiming a light screen.
const HUB_SHOTS = new Set([
  "today-fresh",
  "today-history",
  "drills-tab",
  "paths",
  "progress",
  "journal",
  "connect",
  "tuner",
  "settings",
  "guide",
  "create",
  "library",
  "palette",
  "record",
]);
const themeWords = (p) =>
  HUB_SHOTS.has(p.shotFlow)
    ? `${p.theme} theme`
    : `app theme set to ${p.theme} (drill screens are dark in both themes by design)`;
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
  "finder-ready": "note finder, set up before starting",
  "finder-running": "note finder in progress, just after a wrong answer",
  "finder-results": "note finder results after a good run",
  "finder-check": "note finder in test mode, targets hidden",
  "changes-ready": "chord changes, set up before starting",
  "changes-running": "chord changes in progress",
  "changes-results": "chord changes results",
  playing: "the beat playing",
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
      const m = f.match(/^(.+)--(desktop|tablet|phone)-(light|dark)(-full)?\.png$/);
      if (!m) continue;
      // Site and Narrator captures write the caption next to each image.
      const txt = join(d, f.replace(/\.png$/, ".txt"));
      out.push({
        shotFlow,
        state: m[1],
        width: m[2],
        theme: m[3],
        full: !!m[4],
        path: join(project.work, "shots", shotsRound, shotFlow, f),
        caption: existsSync(txt) ? readFileSync(txt, "utf8").trim() : null,
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
/** A sidecar-captioned shot: width, theme, then what the capture said the screen shows. An app
 *  with one theme (no shot of this state in the other theme) says so instead of naming a theme. */
const sidecarCaption = (p) => {
  const other = shots.some(
    (a) =>
      a.shotFlow === p.shotFlow &&
      a.state === p.state &&
      a.width === p.width &&
      a.theme !== p.theme,
  );
  const theme = other ? `${p.theme} theme` : `${p.theme} (this screen has one theme)`;
  return `${WIDTH_WORDS[p.width]}, ${theme}, ${p.caption ?? p.state.replaceAll("-", " ")}`;
};
let n = 0;
const ownOnly = [];
for (const flow of FLOWS) {
  const picks = project.sidecarCaptions ? pickPanel(shots, flow) : pickShots(shots, flow);
  if (!picks.length) {
    console.warn(`no shots for ${flow.id}`);
    continue;
  }
  const woodshed = {
    key: project.candidate,
    images: picks.map((p) => ({
      path: p.path,
      caption: project.sidecarCaptions
        ? sidecarCaption(p)
        : `${flow.shots.length > 1 ? `${p.shotFlow.replaceAll("-", " ")}${flow.alternate ? " exercise" : ""}, ` : ""}${WIDTH_WORDS[p.width]}, ${themeWords(p)}, ${
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
  if (!comps.length) ownOnly.push(flow.id);
  const panel = { id: flow.id, flow: flow.flow, job: flow.job, candidates: [woodshed, ...comps] };
  writeFileSync(join(outDir, `${flow.id}.json`), JSON.stringify(panel, null, 2));
  n++;
}
console.log(`${n} panels in ${outDir}`);
if (ownOnly.length)
  console.warn(
    `no competitor screens yet for: ${ownOnly.join(", ")} (own shots only; rebuild when the library has them)`,
  );
