// Translations for the fretted-instrument data: fields of this folder's JSON read through messages.
// Position labels and chord names follow a few fixed English patterns, so they are matched by pattern.

import { m } from "@repo/i18n/messages.js";
import guitarPositionsJson from "../chord-positions-guitar-standard.json";
import ukulelePositionsJson from "../chord-positions-ukulele-high-g.json";
import chordShapesJson from "../chord-shapes.json";
import fretboardPatternsJson from "../fretboard-patterns.json";
import stringSpiderJson from "../string-spider.json";
import tuningsJson from "../tunings.json";
import { localizeFields, localizeWith } from "../localize";

/** "Open position", "Barre at fret 3", "Fret 5". */
function positionLabel(english: string): string {
  if (english === "Open position") return m.music_content_voicing_open_position();
  const barre = /^Barre at fret (\d+)$/.exec(english);
  if (barre) return m.music_content_voicing_barre_at_fret({ fret: barre[1] });
  const fret = /^Fret (\d+)$/.exec(english);
  return fret ? m.music_content_voicing_fret({ fret: fret[1] }) : english;
}

/** "C major", "F♯ minor (barre)", "E5 (power chord)"; symbols such as "G7" stay. */
function chordName(english: string): string {
  const suffix = / \((barre|power chord)\)$/.exec(english);
  const base = suffix ? english.slice(0, suffix.index) : english;
  const mode = /^(\S+) (major|minor)$/.exec(base);
  const name = mode
    ? (mode[2] === "major" ? m.music_content_ear_key_major : m.music_content_ear_key_minor)({
        note: mode[1],
      })
    : base;
  if (!suffix) return name;
  return suffix[1] === "barre"
    ? m.music_content_chord_shape_barre({ name })
    : m.music_content_chord_shape_power({ name });
}

/** "Minor pentatonic box 1", "CAGED E shape". */
function fretboardLabel(english: string): string {
  const box = /^Minor pentatonic box (\d+)$/.exec(english);
  if (box) return m.music_content_fretboard_pattern_box({ n: box[1] });
  const caged = /^CAGED (\S+) shape$/.exec(english);
  return caged ? m.music_content_fretboard_pattern_caged({ shape: caged[1] }) : english;
}

localizeWith(chordShapesJson, "name", chordName);
for (const positions of [
  ...Object.values(guitarPositionsJson),
  ...Object.values(ukulelePositionsJson),
] as { name: string; positionLabel: string }[][]) {
  localizeWith(positions, "name", chordName);
  localizeWith(positions, "positionLabel", positionLabel);
}
localizeWith(fretboardPatternsJson, "label", fretboardLabel);
localizeFields(stringSpiderJson.patterns, "music_content_spider", (p) => p.id, ["label"]);
localizeFields(stringSpiderJson.spans, "music_content_spider_span", (s) => s.id, ["label"]);
localizeFields(
  [...tuningsJson.guitar, ...tuningsJson.ukulele],
  "music_content_tuning",
  (t) => t.id,
  ["name"],
);
