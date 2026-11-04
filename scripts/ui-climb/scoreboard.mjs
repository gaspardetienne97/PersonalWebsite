#!/usr/bin/env node
// Score history for the UI hill climb. Reads every .ui-climb/rounds/<n>/<panel>/merged.json,
// writes .ui-climb/scoreboard.md and .ui-climb/scoreboard.json, and per-round flaw digests in
// .ui-climb/rounds/<n>/flaws/<panel>.md for the implementers.
//   node scripts/ui-climb/scoreboard.mjs [--bar-round 0]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FLOWS } from "./flows.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const WORK = join(ROOT, ".ui-climb");
const args = process.argv.slice(2);
const barRound = args.includes("--bar-round") ? args[args.indexOf("--bar-round") + 1] : "0";
const JUDGES = ["astra", "opus", "fable"];
const DIMS = [
  "visual",
  "clarity",
  "engagement",
  "teaching",
  "flow",
  "phone",
  "accessibility",
  "consistency",
];

const roundsDir = join(WORK, "rounds");
const rounds = existsSync(roundsDir)
  ? readdirSync(roundsDir)
      .filter((r) => /^\d+$/.test(r))
      .sort((a, b) => a - b)
  : [];

const data = {}; // data[round][panel] = merged
for (const r of rounds) {
  data[r] = {};
  for (const p of readdirSync(join(roundsDir, r))) {
    const f = join(roundsDir, r, p, "merged.json");
    if (existsSync(f)) data[r][p] = JSON.parse(readFileSync(f, "utf8"));
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : "-");

/** The competitor bar per panel: the best competitor by mean overall across judges. */
function bar(panel) {
  const m = data[barRound]?.[panel];
  if (!m) return null;
  const keys = Object.keys(m.candidates).filter((k) => k.startsWith("comp:"));
  let best = null;
  for (const k of keys) {
    const per = JUDGES.map((j) => m.judges[j]?.[k]?.overall).filter((x) => x != null);
    const avg = mean(per);
    const max = Math.max(...per);
    if (!best || avg > best.mean) best = { app: k.slice(5), mean: avg, max, per };
  }
  return best;
}

function wood(r, panel) {
  const m = data[r]?.[panel];
  if (!m) return null;
  const per = {};
  for (const j of JUDGES) {
    const c = m.judges[j]?.woodshed;
    if (!c) continue;
    const dims = Object.entries(c.scores).filter(([, v]) => v != null);
    per[j] = {
      overall: c.overall,
      minDim: Math.min(...dims.map(([, v]) => v)),
      minDimName: dims.sort((a, b) => a[1] - b[1])[0]?.[0],
      scores: c.scores,
      flaws: c.flaws,
    };
  }
  return per;
}

const json = { barRound, rounds, panels: {} };
const lines = [
  "# UI hill climb scoreboard",
  "",
  `Judges: astra (GPT-6-Astra via Codex), opus (Claude Opus 5.5), fable (Claude Fable 5.1). Bar: best competitor by mean overall in round ${barRound}, re-scored blind beside Woodshed.`,
  "",
  "Done means every judge gives Woodshed at least 9 overall on every flow, and Woodshed's mean is at least the bar.",
  "",
  "Harness notes: from round 1, panels that mix two drills caption each screen with its drill name (round 0 did not), so part of a round 1 gain on those panels may come from the caption, not the app. From round 2, drill panels take their two drills or instruments in turn with balanced widths and themes, and the captures add fretboard Note finder, chord Changes and the Create beat playing (features that existed but were never shown), so part of a round 2 gain on those flows may come from the panel, not the app. From round 4, captures close the session before switching to Check (round 3's chords, Note finder and voicings 'check' shots were really Practice), show Note finder on both fretted instruments, and give played notes a few ms of seeded jitter and timed answers a seeded think time, so round 4 movement on those flows is partly the harness. From round 5, the songs panel no longer includes the Create reference page, settings gets a phone shot, flashcards a phone running shot, phone ear feedback is shot without scrolling, and the good strum run plays the pattern's strokes instead of beats 1 and 3. GPT (astra) is limited by the account's Codex quota and runs at medium effort from round 1; it is missing where shown as '-'.",
  "",
];

const last = rounds.at(-1);
lines.push(`## Round ${last ?? "-"} (latest)`, "");
lines.push(
  "| Flow | astra | opus | fable | Woodshed mean | lowest dimension | Bar (app) | Gap | Done |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
);
let done = 0;
for (const f of FLOWS) {
  const w = wood(last, f.id);
  const b = bar(f.id);
  if (!w) continue;
  const per = JUDGES.map((j) => w[j]?.overall);
  const avg = mean(per.filter((x) => x != null));
  const low = JUDGES.map((j) => w[j] && `${w[j].minDimName} ${w[j].minDim} (${j})`).filter(Boolean);
  const lowest = low.sort((a, b2) => parseFloat(a.split(" ")[1]) - parseFloat(b2.split(" ")[1]))[0];
  const ok = per.every((x) => x != null && x >= 9) && (!b || avg >= b.mean);
  if (ok) done++;
  lines.push(
    `| ${f.id} | ${per.map(fmt).join(" | ")} | ${fmt(avg)} | ${lowest ?? "-"} | ${b ? `${fmt(b.mean)} (${b.app})` : "-"} | ${b ? fmt(avg - b.mean) : "-"} | ${ok ? "yes" : ""} |`,
  );
  json.panels[f.id] = { bar: b, history: {} };
}
lines.push("", `${done} of ${FLOWS.length} flows done.`, "");

lines.push("## History (Woodshed mean overall per round; min judge in brackets)", "");
lines.push(
  `| Flow | ${rounds.map((r) => `R${r}`).join(" | ")} |`,
  `| --- | ${rounds.map(() => "---").join(" | ")} |`,
);
for (const f of FLOWS) {
  const cells = rounds.map((r) => {
    const w = wood(r, f.id);
    if (!w || !Object.keys(w).length) return "";
    const per = Object.values(w).map((x) => x.overall);
    json.panels[f.id] ??= { bar: bar(f.id), history: {} };
    json.panels[f.id].history[r] = Object.fromEntries(
      Object.entries(w).map(([j, x]) => [j, x.overall]),
    );
    return `${fmt(mean(per))} (${fmt(Math.min(...per))})`;
  });
  lines.push(`| ${f.id} | ${cells.join(" | ")} |`);
}

lines.push("", "## Competitor scores per round (calibration drift)", "");
for (const r of rounds) {
  const rows = [];
  for (const f of FLOWS) {
    const m = data[r]?.[f.id];
    if (!m) continue;
    for (const k of Object.keys(m.candidates).filter((k) => k.startsWith("comp:"))) {
      const per = JUDGES.map((j) => m.judges[j]?.[k]?.overall).filter((x) => x != null);
      rows.push(`${f.id}: ${k.slice(5)} ${fmt(mean(per))}`);
    }
  }
  lines.push(`- R${r}: ${rows.join("; ")}`);
}
writeFileSync(join(WORK, "scoreboard.md"), lines.join("\n") + "\n");
writeFileSync(join(WORK, "scoreboard.json"), JSON.stringify(json, null, 2));

// Flaw digests for the latest round.
if (last) {
  const fd = join(roundsDir, last, "flaws");
  mkdirSync(fd, { recursive: true });
  for (const f of FLOWS) {
    const w = wood(last, f.id);
    const m = data[last]?.[f.id];
    if (!w || !m) continue;
    const panelFile = join(roundsDir, last, "panels", `${f.id}.json`);
    const panel = existsSync(panelFile) ? JSON.parse(readFileSync(panelFile, "utf8")) : null;
    const imgs = panel?.candidates.find((c) => c.key === "woodshed")?.images ?? [];
    const out = [
      `# ${f.id}: ${f.flow}`,
      "",
      "Woodshed screens shown (numbered as the judges saw them):",
      "",
    ];
    imgs.forEach((im, i) => out.push(`${i + 1}. ${im.path} (${im.caption})`));
    const b = bar(f.id);
    out.push("", `Bar: ${b ? `${fmt(b.mean)} by ${b.app}` : "none"}`, "");
    for (const j of JUDGES) {
      if (!w[j]) continue;
      out.push(
        `## ${j}: overall ${w[j].overall}`,
        "",
        DIMS.map((d) => `${d} ${w[j].scores[d] ?? "-"}`).join(", "),
        "",
      );
      for (const fl of w[j].flaws)
        out.push(`- [screen ${fl.screen}] ${fl.problem} **Fix:** ${fl.fix}`);
      out.push("");
    }
    const comps = panel?.candidates.filter((c) => c.key.startsWith("comp:")) ?? [];
    if (comps.length) {
      out.push("## Competitor reference screens in this panel", "");
      for (const c of comps) {
        const per = JUDGES.map((j) => m.judges[j]?.[c.key]?.overall).filter((x) => x != null);
        out.push(
          `- ${c.key.slice(5)} (mean ${fmt(mean(per))}): ${c.images.map((i) => i.path).join(", ")}`,
        );
      }
    }
    writeFileSync(join(fd, `${f.id}.md`), out.join("\n") + "\n");
  }
}
console.log(`scoreboard: ${done}/${FLOWS.length} done in round ${last}`);
