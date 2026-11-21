#!/usr/bin/env node
// Final report for the UI hill climb: <work>/report.html, a before and after gallery per
// flow at both widths, the competitor screens judged beside it, and the score history.
// Reads the panels and merged verdicts on disk, so it can be re-run after any round.
//   node scripts/ui-climb/report.mjs
//   node scripts/ui-climb/report.mjs --project site     (writes report-site.html)
// --project woodshed|site|narrator (or UI_CLIMB_PROJECT); with none it is Woodshed in .ui-climb.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flowsOf, projectFrom } from "./projects.mjs";

const project = projectFrom(process.argv.slice(2));
const WORK = project.dir;
const FLOWS = await flowsOf(project);
const NAME = project.name;
const OWN = project.candidate;
const JUDGES = ["astra", "opus", "fable"];
const rounds = readdirSync(join(WORK, "rounds"))
  .filter((r) => /^\d+$/.test(r))
  .sort((a, b) => a - b)
  .filter((r) => existsSync(join(WORK, "rounds", r, "panels")))
  // Site and Narrator share a work dir: keep the rounds that have this project's panels.
  .filter((r) => FLOWS.some((f) => existsSync(join(WORK, "rounds", r, "panels", `${f.id}.json`))));
const first = rounds[0];
const last = rounds.at(-1);

const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const panel = (r, id) => read(join(WORK, "rounds", r, "panels", `${id}.json`));
const merged = (r, id) => read(join(WORK, "rounds", r, id, "merged.json"));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (x) => (Number.isFinite(x) ? (Math.round(x * 100) / 100).toFixed(2) : "-");
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
// Image paths in panels are repo-relative; the report sits in the work dir.
const src = (p) =>
  p.startsWith(`${project.work}/`) ? p.slice(project.work.length + 1) : `../${p}`;

/** Woodshed's overall per judge in a round (Claude judges for the trend, every judge listed). */
function scores(r, id) {
  const m = merged(r, id);
  if (!m) return null;
  const per = Object.fromEntries(
    JUDGES.filter((j) => m.judges[j]?.[OWN]).map((j) => [j, m.judges[j][OWN].overall]),
  );
  const claude = ["opus", "fable"].map((j) => per[j]).filter((x) => x != null);
  return { per, claude: mean(claude) };
}

/** The best competitor in round 0, by mean overall across judges. */
function bar(id) {
  const m = merged(first, id);
  if (!m) return null;
  let best = null;
  for (const k of Object.keys(m.candidates).filter((k) => k.startsWith("comp:"))) {
    const per = JUDGES.map((j) => m.judges[j]?.[k]?.overall).filter((x) => x != null);
    if (per.length && (!best || mean(per) > best.mean)) best = { app: k.slice(5), mean: mean(per) };
  }
  return best;
}

/** One laptop and one phone screen from a round's Woodshed candidate, the same states when possible. */
function pick(r, id, prefer) {
  const imgs = panel(r, id)?.candidates.find((c) => c.key === OWN)?.images ?? [];
  const isPhone = (i) => i.path.includes("--phone-");
  const state = (i) => i.path.split("/").pop().split("--")[0];
  const out = [];
  for (const phone of [false, true]) {
    const pool = imgs.filter((i) => isPhone(i) === phone);
    const want = prefer?.[phone ? 1 : 0];
    out.push((want && pool.find((i) => state(i) === want)) || pool[0] || null);
  }
  return out;
}

const totals = rounds.map((r) => {
  const xs = FLOWS.map((f) => scores(r, f.id)?.claude).filter(Number.isFinite);
  return { r, mean: mean(xs), n: xs.length };
});

const sections = FLOWS.map((f) => {
  const after = pick(last, f.id);
  const state = (i) => i?.path.split("/").pop().split("--")[0];
  const before = pick(first, f.id, after.map(state));
  const comps = (panel(last, f.id)?.candidates ?? [])
    .filter((c) => c.key.startsWith("comp:"))
    .map((c) => ({ app: c.key.slice(5), img: c.images[0] }))
    .filter((c) => c.img)
    .slice(0, 2);
  const b = bar(f.id);
  const hist = rounds.map((r) => ({ r, s: scores(r, f.id) }));
  const s0 = hist[0]?.s?.claude;
  const sN = hist.at(-1)?.s?.claude;
  const fig = (i, label) =>
    i
      ? `<figure><a href="${esc(src(i.path))}"><img loading="lazy" src="${esc(src(i.path))}" alt="${esc(label)}: ${esc(i.caption)}"></a><figcaption>${esc(label)}. ${esc(i.caption)}</figcaption></figure>`
      : "";
  return `<section id="${f.id}">
  <header><h2>${esc(f.flow)}</h2>
  <p class="nums"><strong>${fmt(s0)} → ${fmt(sN)}</strong> (Claude judges' mean)${b ? `. Bar: ${fmt(b.mean)} (${esc(b.app)}, round 0)` : ""}</p></header>
  <table><thead><tr><th>Judge</th>${hist.map((h) => `<th>R${h.r}</th>`).join("")}</tr></thead><tbody>
  ${JUDGES.map((j) => `<tr><th>${j}</th>${hist.map((h) => `<td>${h.s?.per[j] ?? "-"}</td>`).join("")}</tr>`).join("\n  ")}
  </tbody></table>
  <div class="row"><h3>Before (round ${first})</h3><div class="grid">${fig(before[0], "Before, laptop")}${fig(before[1], "Before, phone")}</div></div>
  <div class="row"><h3>After (round ${last})</h3><div class="grid">${fig(after[0], "After, laptop")}${fig(after[1], "After, phone")}</div></div>
  ${comps.length ? `<div class="row"><h3>Competitors judged beside it</h3><div class="grid">${comps.map((c) => fig(c.img, c.app)).join("")}</div></div>` : ""}
</section>`;
});

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(NAME)} UI climb</title>
<style>
:root { --bg: #f6f5f2; --surface: #ffffff; --ink: #1d1b19; --soft: #5f5a54; --line: #dcd8d2; --accent: #9a5b12; }
@media (prefers-color-scheme: dark) { :root { --bg: #151413; --surface: #1f1d1b; --ink: #f1eee9; --soft: #b5aea5; --line: #3a3632; --accent: #e3a35a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 8px; } h2 { font-size: 20px; margin: 0; } h3 { font-size: 14px; color: var(--soft); margin: 16px 0 8px; font-weight: 600; }
p { margin: 4px 0; } .nums { color: var(--soft); }
nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0 24px; }
nav a { font-size: 13px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; text-decoration: none; }
section { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin: 16px 0; }
table { border-collapse: collapse; margin-top: 12px; font-size: 14px; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid var(--line); padding: 4px 10px; text-align: center; } tbody th { text-align: left; color: var(--soft); font-weight: 500; }
.grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; align-items: start; }
figure { margin: 0; } img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; display: block; }
figcaption { font-size: 13px; color: var(--soft); margin-top: 4px; }
.totals td, .totals th { padding: 4px 12px; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } table { display: block; overflow-x: auto; } }
</style></head><body><main>
<h1>${esc(NAME)} UI climb</h1>
<p>Rounds ${first} to ${last}. Each flow shows the scores per judge and round, one laptop and one phone screen before and after, and competitor screens the judges saw beside it. Judges saw screenshots only, unlabelled and shuffled. See summary.md for what changed per round, what was reverted and why scores stopped short of 9.</p>
<table class="totals"><thead><tr><th>Round</th>${totals.map((t) => `<th>R${t.r}</th>`).join("")}</tr></thead>
<tbody><tr><th>Mean over flows (Claude judges)</th>${totals.map((t) => `<td>${fmt(t.mean)}</td>`).join("")}</tr></tbody></table>
<nav>${FLOWS.map((f) => `<a href="#${f.id}">${esc(f.id)}</a>`).join("")}</nav>
${sections.join("\n")}
</main></body></html>`;

writeFileSync(join(WORK, `report${project.suffix}.html`), html);
console.log(`report: ${FLOWS.length} flows, rounds ${first} to ${last}`);
