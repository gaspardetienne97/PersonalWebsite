// Concept cards for the piano drills that cards.ts does not hold: the minor and altered voicings,
// guide tones, the gospel progressions, the thumb passing under, and the chord-scale tabs.

import {
  DOMINANT_VOICING as DOM,
  GOSPEL_PROGRESSIONS,
  UPPER_STRUCTURE_II as US_II,
  chordPattern,
  chordPatternLine,
  chordScaleTargets,
  gospelChords,
  stripJt as strip,
  voiceLeadingTargets,
  type ChordPattern,
} from "../content/piano";
import { SCALE_FINGERINGS } from "../content/piano-fingering";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import {
  chord,
  degreeOf,
  flat,
  join,
  keyName,
  nameLead,
  run,
  sharp,
  tones,
  voicingInC,
} from "./card-kit";
import { showNote } from "../theory/note-names";
import { keys } from "./tier1";
import type { Lesson, LessonFigure, LessonSound, LessonStep } from "./types";
import { m } from "@repo/i18n/messages.js";

// ---------------------------------------------------------------------------
// Voicings: minor, altered

/** A tone's name against the chord: the drill's own words for the half-diminished ii and the altered V. */
const HALF_DIM: Record<number, string> = { 0: "1", 3: "b3", 6: "b5", 10: "b7" };
const DOMINANT: Record<number, string> = {
  1: "b9",
  2: "9",
  3: "#9",
  4: "3",
  6: "#11",
  7: "5",
  8: "b13",
  9: "13",
  10: "7",
};
export function tag(symbol: string, midi: number): string {
  const root = parseChordSymbol(symbol)!.rootPc;
  const i = pc(midi - root);
  if (/m7b5/.test(symbol)) return HALF_DIM[i] ?? String(i);
  if (/alt|b9|13/.test(symbol)) return DOMINANT[i] ?? String(i);
  return degreeOf(symbol, midi);
}
/** The right hand of a voicing target from the bottom, as tags: "b3 b5 b7 1". */
export const tagsOf = (symbol: string, displayMidi: number[]) =>
  displayMidi
    .slice(1)
    .sort((a, b) => a - b)
    .map((m) => tag(symbol, m))
    .join(" ");

function voicingSteps(ts: ReturnType<typeof voicingInC>): LessonStep[] {
  const span = ts.flatMap((t) => t.displayMidi);
  return ts.map((t) => {
    const name = /#11/.test(t.symbol) ? sharp : flat;
    const rh = t.displayMidi.slice(1).sort((a, b) => a - b);
    return {
      text: m.music_cards_voicing_step({
        symbol: chord(t.symbol),
        tags: tagsOf(t.symbol, t.displayMidi),
        notes: rh.map(name).join(" "),
        root: name(t.displayMidi[0]),
      }),
      figure: keys(
        Object.fromEntries([
          [t.displayMidi[0], m.music_cards_root_label()],
          ...rh.map((x) => [x, tag(t.symbol, x)]),
        ]),
        span,
      ),
      sound: tones(t.displayMidi),
    };
  });
}

export function minorVoicings(): Lesson {
  const ts = voicingInC("minor");
  const top = pc(Math.max(...ts[0].displayMidi)) === pc(ts[0].displayMidi[0]);
  const altered = ts[1].displayMidi
    .slice(1)
    .sort((a, b) => a - b)
    .map((midi) => ({ midi, tag: tag(ts[1].symbol, midi) }))
    .filter((x) => /[b#]/.test(x.tag) && x.tag !== "b3");
  return {
    id: "voicings.minor",
    title: m.music_cards_minor_v_title(),
    screens: [
      {
        title: m.music_cards_minor_v_kinds_title(),
        text: (top ? m.music_cards_minor_v_kinds_text_top : m.music_cards_minor_v_kinds_text)({
          chords: join(ts.map((t) => chord(t.symbol))),
          key: keyName("C"),
        }),
        steps: voicingSteps(ts),
      },
      {
        title: m.music_cards_minor_v_altered_title(),
        text: m.music_cards_minor_v_altered_text({
          symbol: chord(ts[1].symbol),
          voicing: DOM.altered.label,
          tones: join(altered.map((a) => `${a.tag} (${flat(a.midi)})`)),
          hint: String(strip(DOM.altered.hint)),
        }),
      },
    ],
  };
}

export function alteredVoicings(): Lesson {
  const ts = voicingInC("altered");
  return {
    id: "voicings.altered",
    title: m.music_cards_altered_title(),
    screens: [
      {
        title: m.music_cards_altered_three_title(),
        text: m.music_cards_altered_three_text({ dominant: showNote("G"), key: keyName("C") }),
        steps: voicingSteps(ts),
      },
      {
        title: m.music_cards_altered_what_title(),
        text: m.music_cards_altered_what_text({
          first: chord(ts[0].symbol),
          firstLabel: DOM.rootlessB9.label,
          firstHint: String(strip(DOM.rootlessB9.hint)),
          second: chord(ts[1].symbol),
          secondLabel: DOM.altered.label,
          secondHint: String(strip(DOM.altered.hint)),
          triad: US_II.triad,
          adds: US_II.adds,
        }),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Voicings: guide tones, gospel

export function guideTones(): Lesson {
  // The drill's own pairs: Dm7 is given, then each chord's pair nearest the one before.
  const vt = voiceLeadingTargets();
  const seq = [
    { s: "Dm7", midi: vt[0].fromMidi },
    { s: vt[0].symbol, midi: vt[0].targetMidi },
    { s: vt[1].symbol, midi: vt[1].targetMidi },
  ];
  const info = seq.map(({ s, midi }) => {
    const c = parseChordSymbol(s)!;
    const at = (...is: number[]) => midi.find((m) => is.some((i) => pc(m) === pc(c.rootPc + i)))!;
    return { s, third: at(3, 4), seventh: at(10, 11) };
  });
  const span = info.flatMap((x) => [x.third, x.seventh]);
  return {
    id: "voicings.guide-tones",
    title: m.music_cards_guide_title(),
    screens: [
      {
        title: m.music_cards_guide_pair_title(),
        text: m.music_cards_guide_pair_text(),
        steps: info.map((x) => ({
          text: m.music_cards_guide_step({
            symbol: chord(x.s),
            third: flat(x.third),
            seventh: flat(x.seventh),
          }),
          figure: keys(
            { [x.third]: `3 ${flat(x.third)}`, [x.seventh]: `7 ${flat(x.seventh)}` },
            span,
          ),
          sound: tones([x.third, x.seventh]),
        })),
      },
      {
        title: m.music_cards_guide_falls_title(),
        text: m.music_cards_guide_falls_text({
          key: keyName("C"),
          low: showNote("F3"),
          high: showNote("C5"),
          a: flat(info[0].seventh),
          b: flat(info[1].third),
          c: flat(info[1].seventh),
          d: flat(info[2].third),
        }),
      },
    ],
  };
}

/** The bass as the symbol writes it: the note after the slash, else the root. */
const bassName = (symbol: string) =>
  symbol.includes("/") ? symbol.split("/")[1] : /^[A-G][b#]?/.exec(symbol)![0];

export function gospel(id: string): Lesson {
  const prog = GOSPEL_PROGRESSIONS.find((p) => p.id === id) ?? GOSPEL_PROGRESSIONS[0];
  const bars = gospelChords(0, prog.id, [55, 76]);
  const span = bars.flatMap((b) => [b.leftHand, ...b.rightHand]);
  const inv = [
    m.music_cards_inv_root,
    m.music_cards_inv_first,
    m.music_cards_inv_second,
    m.music_cards_inv_third,
  ];
  return {
    id: `voicings.gospel.${prog.id}`,
    title: prog.label,
    screens: [
      {
        title: m.music_cards_gospel_moving_title(),
        text: m.music_cards_gospel_moving_text({ about: prog.about, key: keyName("C") }),
        steps: bars.map((b) => ({
          text: m.music_cards_gospel_step({
            symbol: chord(b.symbol),
            bass: showNote(bassName(b.symbol)),
            inversion: (inv[b.inversion] ?? m.music_cards_inv_any)(),
          }),
          figure: keys(
            Object.fromEntries([
              [b.leftHand, m.music_cards_bass_label()],
              ...b.rightHand.map((x) => [x, m.music_cards_hand_right_short()]),
            ]),
            span,
          ),
          sound: tones([b.leftHand, ...b.rightHand]),
        })),
      },
      {
        title: m.music_cards_gospel_line_title(),
        text: m.music_cards_gospel_line_text({
          bass: bars.map((b) => showNote(bassName(b.symbol))).join(" "),
          key: keyName("C"),
        }),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scales: the thumb passing under

export function thumbUnder(): Lesson {
  const f = SCALE_FINGERINGS.major[0].rh;
  const low = 60;
  const notes = scaleSemitones("major")!.map((s) => low + s);
  const cross = f.findIndex((x, i) => i > 0 && x === 1);
  const fig = (n: number): LessonFigure =>
    keys(Object.fromEntries(notes.slice(0, n).map((x, i) => [x, String(f[i])])), notes);
  return {
    id: "scales.thumb-under",
    title: m.music_cards_thumb_title(),
    screens: [
      {
        title: m.music_cards_thumb_under_title(),
        text: m.music_cards_thumb_under_text(),
        steps: [
          {
            text: m.music_cards_thumb_step_1({
              fingers: f.slice(0, cross).join(" "),
              key: keyName("C"),
            }),
            figure: fig(cross),
            sound: run(notes.slice(0, cross)),
          },
          {
            text: m.music_cards_thumb_step_2({
              finger: f[cross - 1],
              note: flat(notes[cross]),
            }),
            figure: fig(cross + 1),
            sound: run(notes.slice(cross - 1, cross + 1)),
          },
          {
            text: m.music_cards_thumb_step_3({ fingers: f.slice(cross + 1).join(" ") }),
            figure: fig(notes.length),
            sound: run(notes.slice(cross)),
          },
        ],
      },
      {
        title: m.music_cards_thumb_left_title(),
        text: m.music_cards_thumb_left_text(),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Chord scales: minor tab, patterns

const MINOR_KEY = new Set(scaleSemitones("natural-minor")!.map((s) => pc(60 + s)));

export function chordScalesMinor(): Lesson {
  const ts = chordScaleTargets("minor", 0);
  const names = (t: (typeof ts)[number]) => t.midi.slice(0, 7).map(flat);
  const outside = (t: (typeof ts)[number]) =>
    [...new Set(t.midi.map(pc))].filter((p) => !MINOR_KEY.has(p)).map((p) => flat(60 + p));
  const fig = (t: (typeof ts)[number]): LessonFigure =>
    keys(
      Object.fromEntries(t.midi.map((x) => [x, flat(x)])),
      ts.flatMap((x) => x.midi),
    );
  return {
    id: "chord-scales.minor",
    title: m.music_cards_cs_minor_title(),
    screens: [
      {
        title: m.music_cards_dorian_scale_title(),
        text: m.music_cards_cs_minor_scale_text({
          key: keyName("C"),
          s1: chord(ts[0].symbol),
          l1: nameLead(ts[0].scaleLabel),
          s2: chord(ts[1].symbol),
          l2: nameLead(ts[1].scaleLabel),
          s3: chord(ts[2].symbol),
          l3: nameLead(ts[2].scaleLabel),
        }),
        steps: ts.map((t) => ({
          text: `${m.music_cards_scale_step({ symbol: chord(t.symbol), scale: nameLead(t.scaleLabel), notes: names(t).join(" ") })} ${
            outside(t).length
              ? m.music_cards_cs_minor_outside({
                  count: outside(t).length,
                  notes: join(outside(t)),
                  key: keyName("C"),
                })
              : m.music_cards_cs_minor_inside({ key: keyName("C") })
          }`,
          figure: fig(t),
          sound: run(t.midi, 0.3),
        })),
      },
      {
        title: m.music_cards_cs_minor_outside_title(),
        text: m.music_cards_cs_minor_outside_text({ leading: showNote("B"), tonic: showNote("C") }),
      },
    ],
  };
}

/** Both patterns as the drill plays them (up and back, the top note twice), 1-2-3-5 then 3-5-7-9. */
const lineSound = (symbol: string): LessonSound => {
  const notes = (["1235", "3579"] as ChordPattern[]).flatMap((p, k) =>
    chordPatternLine([symbol], p).map((n) => ({
      midi: [n.midi],
      at: k * 2.8 + n.startBeat * 0.6,
      dur: 0.5,
    })),
  );
  return { notes };
};

export function chordPatterns(): Lesson {
  const make = (changes: "major" | "minor") => chordScaleTargets(changes, 0);
  const line = (symbol: string, p: ChordPattern) => {
    const root = 60 + parseChordSymbol(symbol)!.rootPc;
    return chordPattern(symbol, p).map((s) => root + s);
  };
  /** The pattern's notes on the keys, each labelled with its place in the pattern (1 2 3 5, or 3 5 7 9). */
  const degreeKeys = (symbol: string, ps: ChordPattern[], span = ps) =>
    keys(
      Object.fromEntries(ps.flatMap((p) => line(symbol, p).map((m, i) => [m, p[i]]))),
      span.flatMap((p) => line(symbol, p)),
    );
  const step = (symbol: string): LessonStep => {
    const a = line(symbol, "1235");
    const b = line(symbol, "3579");
    return {
      text: m.music_cards_patterns_step({
        symbol: chord(symbol),
        a: a.map(flat).join(" "),
        b: b.map(flat).join(" "),
      }),
      figure: degreeKeys(symbol, ["1235", "3579"]),
      sound: lineSound(symbol),
    };
  };
  const first = make("major")[0].symbol;
  return {
    id: "chord-scales.patterns",
    title: m.music_cards_patterns_title(),
    screens: [
      {
        title: m.music_cards_patterns_two_title(),
        text: m.music_cards_patterns_two_text({ symbol: chord(first) }),
        figure: degreeKeys(first, ["1235"], ["1235", "3579"]),
        sound: lineSound(first),
        options: (["1235", "3579"] as const).map((p) => ({
          label: p.split("").join("-"),
          sound: run(line(first, p)),
          figure: degreeKeys(first, [p], ["1235", "3579"]),
        })),
        steps: make("major").map((t) => step(t.symbol)),
      },
      {
        title: m.music_cards_patterns_minor_title(),
        text: m.music_cards_patterns_minor_text(),
        figure: degreeKeys(make("minor")[0].symbol, ["1235", "3579"]),
        sound: lineSound(make("minor")[0].symbol),
        steps: make("minor").map((t) => step(t.symbol)),
      },
    ],
  };
}
