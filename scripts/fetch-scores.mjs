#!/usr/bin/env node
// Download the path shelves' MusicXML from MuseScore through the Orca browser, signed in to your
// MuseScore account, into .music-scores/<path>/<song>.<ext> (git ignores it; the app serves it from
// /api/music/scores). One tab of its own, one score at a time, a pause between pages.
//
//   node scripts/fetch-scores.mjs --path guitar --levels 1,2 [--dry] [--downloads ~/Downloads]
//
// Paths: guitar ukulele piano jazz aerophone pads ear-theory reading. Songs already downloaded
// are skipped; a song whose first MuseScore link fails tries its next one. Official scores are
// skipped: MuseScore sells them one by one (or with PRO+), and plain Pro does not open them.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const file = arg("path");
if (!file)
  throw new Error(
    "Give --path (guitar, ukulele, piano, jazz, aerophone, pads, ear-theory, reading).",
  );
const levels = arg("levels")?.split(",");
const dry = process.argv.includes("--dry");
const downloads = resolve(arg("downloads", join(homedir(), "Downloads")).replace(/^~/, homedir()));
const root = resolve(process.env.MUSIC_SCORES_DIR || ".music-scores");

const data = JSON.parse(readFileSync(`packages/music-core/src/data/paths/${file}.json`, "utf8"));
const dir = join(root, data.id);
const manifestFile = join(root, "manifest.json");
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
// "Download and print options are not available due to established limitations" shows on a
// score whose download is off, and on every score once MuseScore limits the account (seen after
// about 45 downloads in a day), so several in a row stop the run rather than push on.
let blockedInARow = 0;
let stop = false;
const EXT = /\.(mxl|musicxml|xml|mid)$/;
const have = (song) =>
  existsSync(dir) && readdirSync(dir).some((f) => f.startsWith(`${song}.`) && EXT.test(f));

const wanted = data.levels
  .filter((l) => !levels || levels.includes(l.id))
  .flatMap((l) => l.shelf.map((s) => ({ level: l.id, ...s })))
  // Official scores need a purchase or PRO+ (not in plain Pro), so only community scores download.
  .map((s) => ({ ...s, scores: s.scores.filter((sc) => !sc.official) }))
  .filter((s) => s.scores.length && !have(s.id));
console.log(
  `${wanted.length} songs to fetch for ${data.id}${levels ? ` (levels ${levels})` : ""}.`,
);
if (dry) {
  for (const s of wanted) console.log(`  ${s.level} ${s.id}: ${s.scores[0].url}`);
  process.exit(0);
}

const orca = (...args) => execFileSync("orca", args, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = JSON.parse(orca("tab", "create", "--url", "about:blank", "--json")).result
  .browserPageId;
const run = (js) => orca("eval", "--page", page, "--expression", `(() => { ${js} })()`);
const click = (label) =>
  run(
    `const b = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)}); b?.click(); return !!b;`,
  ) === "true";

async function newDownload(since, ms = 30_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(1000)) {
    const hit = readdirSync(downloads).find(
      (f) => EXT.test(f) && statSync(join(downloads, f)).mtimeMs >= since,
    );
    if (hit) return hit;
  }
  return null;
}

mkdirSync(dir, { recursive: true });
let ok = 0;
const failed = [];
try {
  for (const song of wanted) {
    let saved = false;
    for (const score of song.scores) {
      orca("goto", "--page", page, "--url", score.url);
      await sleep(5000);
      const off = run(
        `return /established limitations/.test(document.body.innerText) || !![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Download" && b.disabled);`,
      );
      if (off === "true") {
        console.log(`  download off ${song.id} ${score.url}`);
        if (++blockedInARow >= 3) {
          console.log(
            "Three scores in a row will not download: MuseScore is likely limiting the account. Stopping; try again tomorrow.",
          );
          stop = true;
          break;
        }
        continue;
      }
      blockedInARow = 0;
      if (!click("Download")) continue;
      await sleep(2500);
      const since = Date.now() - 1000;
      if (!click("MusicXML") && !click("MIDI")) continue;
      const got = await newDownload(since);
      if (!got) continue;
      const ext = got.match(EXT)[1];
      renameSync(join(downloads, got), join(dir, `${song.id}.${ext}`));
      manifest[`${data.id}/${song.id}`] = {
        url: score.url,
        label: score.label,
        file: `${song.id}.${ext}`,
        at: new Date().toISOString(),
      };
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
      console.log(`  ok ${song.level} ${song.id} <- ${score.url}`);
      saved = true;
      ok++;
      break;
    }
    if (stop) break;
    if (!saved) {
      failed.push(song.id);
      console.log(`  failed ${song.level} ${song.id}`);
    }
    await sleep(4000);
  }
} finally {
  const tabs = JSON.parse(orca("tab", "list", "--json")).result.tabs;
  const mine = tabs.find((t) => t.browserPageId === page);
  if (mine) orca("tab", "close", "--index", String(mine.index));
}
console.log(
  `Fetched ${ok}; failed ${failed.length}${failed.length ? `: ${failed.join(", ")}` : ""}.`,
);
