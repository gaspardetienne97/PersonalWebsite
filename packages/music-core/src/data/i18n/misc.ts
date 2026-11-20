// Translations for the drums, rhythm and Aerophone data: fields of this folder's JSON read through messages.
// Skill names are translated where data/index.ts builds the skill graph.

import { m } from "@repo/i18n/messages.js";
import aerophoneJson from "../aerophone-fingerings.json";
import drumKitsJson from "../drum-kits.json";
import mpcGroovesJson from "../mpc-grooves.json";
import mpcRudimentsJson from "../mpc-rudiments.json";
import rhythmPatternsJson from "../rhythm-patterns.json";
import { localizeFields } from "../localize";

const P = "music_content";
for (const voices of [mpcGroovesJson.voices, drumKitsJson.BOOM_BAP_KIT])
  localizeFields(voices, `${P}_drum_voice`, (v) => v.id, ["name"]);
localizeFields(mpcGroovesJson.catalog, `${P}_groove`, (g) => g.value, ["label"]);
localizeFields(mpcRudimentsJson.patterns, `${P}_rudiment`, (r) => r.id, ["label"]);
const SUBDIVISIONS: Record<string, () => string> = {
  "2": m.music_content_rudiment_subdivision_2,
  "3": m.music_content_rudiment_subdivision_3,
  "4": m.music_content_rudiment_subdivision_4,
};
for (const [n, label] of Object.entries(SUBDIVISIONS))
  if (n in mpcRudimentsJson.subdivisionLabels)
    Object.defineProperty(mpcRudimentsJson.subdivisionLabels, n, {
      get: label,
      enumerable: true,
      configurable: true,
    });
localizeFields(rhythmPatternsJson, `${P}_rhythm_pattern`, (r) => r.id, ["label"]);
// "oct+1" and "oct-1" would share a key part, so the sign is spelled out.
localizeFields(
  aerophoneJson.keys,
  `${P}_aerophone_key`,
  (k) => k.id.replace("+", "_plus_").replace("-", "_minus_"),
  ["label"],
);
