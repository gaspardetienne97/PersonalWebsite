// Translations for the jazz data: fields of this folder's JSON read through messages.
// CHORD_SCALE_MAP labels and lick scales stay English: they are looked up as scale names.

import compingJson from "../comping-patterns.json";
import jazzJson from "../jazz.json";
import vocabularyJson from "../jazz-vocabulary.json";
import { localizeFields } from "../localize";

const P = "music_content_jazz";
localizeFields(jazzJson.JAZZ_CHORD_TYPES, `${P}_chord_type`, (t) => t.id, ["name", "role"]);
localizeFields(
  jazzJson.CHORD_EXTENSIONS,
  `${P}_extension`,
  (e) => e.symbol.replace("#", "sharp"),
  ["note"],
);
localizeFields(
  jazzJson.CHORD_SCALE_MAP as { family: string; scale: string; hint?: string }[],
  `${P}_chord_scale`,
  (r) => `${r.family}_${r.scale}`,
  ["hint"],
);
localizeFields(jazzJson.DOMINANT_VOICINGS, `${P}_dominant_voicing`, (v) => v.id, [
  "label",
  "hint",
]);
localizeFields(jazzJson.IMPROV_TECHNIQUES, `${P}_technique`, (t) => t.id, ["name", "summary"]);
localizeFields(jazzJson.JAZZ_BACKING_TRACKS, `${P}_backing`, (b) => b.id, ["label"]);
localizeFields(jazzJson.JAZZ_LICKS, `${P}_lick`, (l) => l.number, ["tip"]);
localizeFields(vocabularyJson.categories, `${P}_vocab_category`, (c) => c.id, ["label"]);
localizeFields(vocabularyJson.licks, `${P}_vocab_lick`, (l) => l.number, ["tip"]);
localizeFields([...compingJson.patterns, compingJson.blueThirdC7], `${P}_comping`, (p) => p.id, [
  "label",
]);
