// Which learning-path strings each language is missing, or still has after the
// English changed. See src/progress/path-text.ts.
//
//   node packages/music-core/scripts/path-text.mjs            counts per language
//   node packages/music-core/scripts/path-text.mjs es --missing   the English strings es lacks, as JSON
//   node packages/music-core/scripts/path-text.mjs es --prune     drops es entries no path uses any more

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "../src/data/paths");
const LOCALES = ["es", "fr", "ht"];

/** Every string the app shows from the path files, in file order. Titles and artists of songs stay as they are. */
export function pathStrings() {
  const out = new Map();
  for (const file of readdirSync(DATA)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const path = JSON.parse(readFileSync(join(DATA, file), "utf8"));
    const add = (text) => {
      if (typeof text === "string" && text.trim() && !out.has(text)) out.set(text, file);
    };
    for (const level of path.levels) {
      for (const key of ["title", "goal", "adds", "test"]) add(level[key]);
      for (const step of level.steps ?? []) {
        for (const key of ["title", "setup", "done", "needs"]) add(step[key]);
        for (const link of step.links ?? []) add(link.label);
      }
      for (const song of level.shelf ?? []) {
        add(song.teaches);
        add(song.detail);
        for (const score of song.scores ?? []) add(score.label);
        add(song.fallback?.label);
      }
    }
  }
  return out;
}

const read = (locale) => JSON.parse(readFileSync(join(DATA, "i18n", `${locale}.json`), "utf8"));

const [locale, flag] = process.argv.slice(2);
const strings = pathStrings();
if (!locale) {
  for (const l of LOCALES) {
    const dict = read(l);
    const missing = [...strings.keys()].filter((s) => !(s in dict)).length;
    const unused = Object.keys(dict).filter((s) => !strings.has(s)).length;
    console.log(`${l}: ${strings.size - missing}/${strings.size} translated, ${unused} unused`);
  }
} else if (flag === "--missing") {
  const dict = read(locale);
  console.log(
    JSON.stringify(
      [...strings.keys()].filter((s) => !(s in dict)),
      null,
      2,
    ),
  );
} else if (flag === "--prune") {
  const dict = read(locale);
  const kept = Object.fromEntries(Object.entries(dict).filter(([s]) => strings.has(s)));
  writeFileSync(join(DATA, "i18n", `${locale}.json`), JSON.stringify(kept, null, 2) + "\n");
}
