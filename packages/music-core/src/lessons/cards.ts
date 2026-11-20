// Tier 3 concept cards: 1 to 3 screens for drills that already show what to play in Practice, shown
// the first time the player switches to Check on that setup. Facts come from the theory and content
// code (scale formulas, CAGED forms, voicings), so a card cannot drift from what the drill plays.
// A drill passes the card that matches its current setup (see cards.test.ts for what each holds).

import {
  COMPING_PATTERNS,
  GOSPEL_PROGRESSIONS,
  chordScaleTargets,
  cadenceChords,
  closestChords,
} from "../content/piano";
import { pc } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import { SCALE_FINGERINGS } from "../content/piano-fingering";
import {
  bbBox,
  caged,
  connectedBoxes,
  pentatonicBoxes,
  triadIds,
  triads,
  ukuleBoxes,
} from "./cards-guitar";
import {
  alteredVoicings,
  chordPatterns,
  chordScalesMinor,
  gospel,
  guideTones,
  minorVoicings,
  thumbUnder,
} from "./cards-piano";
import { chordTones, keys } from "./tier1";
import {
  degreeOf,
  voicingInC,
  flat,
  join,
  run,
  sharp,
  tones,
  type CardOpts,
} from "./card-kit";
import { positionLine } from "../theory/fretboard";
import type { Lesson, LessonFigure, LessonScreen, LessonStep } from "./types";
import { m } from "@repo/i18n/messages.js";

// ---------------------------------------------------------------------------
// Scales

/** A scale's steps as the formula writes them: W, H, or the step and a half of the harmonic minor. */
export function scaleFormula(kind: string): string[] {
  const s = scaleSemitones(kind)!;
  return s.slice(1).map((x, i) => ({ 1: "H", 2: "W", 3: "1.5" })[x - s[i]] ?? String(x - s[i]));
}

/** A formula step as the player's language writes it (W and H in English, T and S in Spanish). */
export const stepName = (f: string) =>
  f === "W"
    ? m.music_cards_step_w()
    : f === "H"
      ? m.music_cards_step_h()
      : f === "1.5"
        ? m.music_cards_step_15()
        : f;
/** A scale's formula as shown: "W W H W W W H". */
const formulaText = (kind: string) => scaleFormula(kind).map(stepName).join(" ");

/**
 * The major formula drawn one step at a time: C4 to C5 on the keys (or, on a fretted
 * instrument, in the one position the scales drill plays it, across the strings). Each
 * Next adds the step's W or H on the note it reaches, so the last step reads the formula.
 */
function majorFormula(o: CardOpts = {}): Lesson {
  const semis = scaleSemitones("major")!;
  const formula = scaleFormula("major");
  const names = semis.map((s) => flat(60 + s));
  const t = o.tuning;
  const notes = semis.map((x) => 60 + x);
  // On frets: the drill's own position for the line (positionLine, as InstrumentStage places it).
  const at = t ? positionLine(t, notes) : [];
  const placed = t && at.every(Boolean);
  const frets = at.flatMap((p) => (p ? [p.fret] : []));
  /** The octave with a label on each scale note (null leaves it unmarked). */
  const draw = (labels: (string | null)[]): LessonFigure =>
    t && placed
      ? {
          kind: "fretboard",
          instrument: t.instrument,
          openStrings: [...t.openStrings],
          from: Math.max(0, Math.min(...frets) - 1),
          to: Math.max(...frets) + 1,
          marks: at.flatMap((p, i) =>
            labels[i] === null ? [] : [{ string: p!.string, fret: p!.fret, label: labels[i]! }],
          ),
        }
      : keys(
          Object.fromEntries(
            notes.flatMap((m, i) => (labels[i] === null ? [] : [[m, labels[i]!]])),
          ),
          notes,
        );
  /** After `n` steps: the root named, the steps taken as W or H on the note they reach, the rest by name. */
  const fig = (n: number) =>
    draw(names.map((nm, i) => (i > 0 && i <= n ? stepName(formula[i - 1]) : nm)));
  const halves = formula.flatMap((f, i) => (f === "H" ? [i] : []));
  const gap = (f: string) =>
    placed
      ? f === "W"
        ? m.music_cards_formula_gap_w_fret()
        : m.music_cards_formula_gap_h_fret()
      : f === "W"
        ? m.music_cards_formula_gap_w_key()
        : m.music_cards_formula_gap_h_key();
  return {
    id: t ? `scales.major-formula.${t.instrument}` : "scales.major-formula",
    title: m.music_cards_formula_title(),
    screens: [
      {
        title: m.music_cards_formula_steps_title(),
        text: m.music_cards_formula_steps_text({ formula: formula.map(stepName).join(" ") }),
        figure: fig(0),
        sound: run(notes),
        steps: formula.map((f, i) => ({
          text: m.music_cards_formula_step({
            from: names[i],
            to: names[i + 1],
            step: stepName(f),
            gap: gap(f),
          }),
          figure: fig(i + 1),
          sound: run([notes[i], notes[i + 1]], 0.5),
        })),
      },
      {
        title: m.music_cards_find_in_check_title(),
        text: m.music_cards_formula_check_text({
          pairs: halves
            .map((i) => m.music_cards_formula_notes_pair({ a: i + 1, b: i + 2 }))
            .join(m.music_cards_formula_and_between()),
          names: join(halves.map((i) => m.music_cards_from_to({ from: names[i], to: names[i + 1] }))),
        }),
        figure: draw(
          names.map((nm, i) => (halves.some((h) => i === h || i === h + 1) ? nm : null)),
        ),
      },
    ],
  };
}

function minorForms(): Lesson {
  const base = 57; // A3: the natural minor has no sharps or flats
  const at = (kind: string) => scaleSemitones(kind)!.map((s) => base + s);
  const natural = at("natural-minor");
  const fig = (ms: number[]): LessonFigure =>
    keys(Object.fromEntries(ms.map((m) => [m, sharp(m)])), natural);
  const changed = (kind: string) =>
    at(kind)
      .slice(0, 7)
      .filter((m) => !natural.includes(m))
      .map(sharp);
  const form = formulaText;
  return {
    id: "scales.minor-forms",
    title: m.music_cards_minor_title(),
    screens: [
      {
        title: m.music_cards_minor_natural_title(),
        text: m.music_cards_minor_natural_text({ form: form("natural-minor") }),
        figure: fig(natural),
        sound: run(natural),
      },
      {
        title: m.music_cards_minor_three_title(),
        text: m.music_cards_minor_three_text({
          harmonic: form("harmonic-minor"),
          harmonicNotes: join(changed("harmonic-minor")),
          melodic: form("melodic-minor"),
          melodicNotes: join(changed("melodic-minor")),
        }),
        options: ["natural-minor", "harmonic-minor", "melodic-minor"].map((k) => ({
          label: {
            "natural-minor": m.music_cards_minor_natural,
            "harmonic-minor": m.music_cards_minor_harmonic,
            "melodic-minor": m.music_cards_minor_melodic,
          }[k]!(),
          sound: run(at(k)),
          figure: fig(at(k)),
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Comping

/** A beat as a player counts it: 0 is "1", 1.5 is "2 and". */
const at = (b: number) =>
  b % 1
    ? m.music_cards_beat_on_and({ beat: Math.floor(b) + 1 })
    : m.music_cards_beat_on({ beat: b + 1 });
const count = (b: number) =>
  b % 1 ? m.music_cards_count_and({ beat: Math.floor(b) + 1 }) : String(Math.floor(b) + 1);

function charleston(): Lesson {
  const p = COMPING_PATTERNS[0];
  const hits = p.compRhythm;
  const names = p.shellMidi.map(flat);
  return {
    id: "comping.charleston",
    title: m.music_cards_charleston_title(),
    screens: [
      {
        title: m.music_cards_charleston_hits_title(),
        text: m.music_cards_charleston_hits_text({
          hits: join(
            hits.map((h) =>
              m.music_cards_hit_item({
                at: at(h.beat),
                length:
                  h.durationBeats === 1
                    ? m.music_cards_hit_one_beat()
                    : h.durationBeats < 1
                      ? m.music_cards_hit_short()
                      : m.music_cards_hit_beats({ count: h.durationBeats }),
              }),
            ),
          ),
          a: names[0],
          b: names[1],
          chord: p.chord,
        }),
        figure: {
          kind: "rhythm",
          bars: 1,
          perBeat: 2,
          beatsPerBar: 4,
          onsets: hits.map((h) => h.beat),
        },
        sound: {
          notes: hits.map((h) => ({
            midi: [...p.shellMidi],
            at: h.beat * 0.5,
            dur: h.durationBeats * 0.5,
          })),
        },
      },
      {
        title: m.music_cards_charleston_count_title(),
        text: m.music_cards_charleston_count_text({
          counts: hits.map((h) => count(h.beat)).join(", "),
        }),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Voicings

/** "3 5 7 9" or "7 9 3 5": the right hand from the bottom. */
export const degreesOf = (symbol: string, right: number[]) =>
  [...right]
    .sort((a, b) => a - b)
    .map((m) => degreeOf(symbol, m))
    .join(" ");

function rootless(o: CardOpts): Lesson {
  const arp = !!o.arpeggio;
  const ts = voicingInC("major");
  const shape = (t: (typeof ts)[number]) => {
    const rh = t.displayMidi.slice(1);
    const d = degreesOf(t.symbol, rh);
    return { t, rh, d, pos: d === "3 5 7 9" ? "A" : d === "7 9 3 5" ? "B" : "?" };
  };
  const ex = ts.map(shape);
  const b0 = shape(voicingInC("major", "B")[0]);
  const hear = (ms: number[]) => (arp ? run(ms) : tones(ms));
  const fig = (x: (typeof ex)[number]): LessonFigure =>
    keys(
      Object.fromEntries([
        [x.t.displayMidi[0], m.music_cards_root_label()],
        ...[...x.rh].sort((a, b) => a - b).map((n) => [n, degreeOf(x.t.symbol, n)]),
      ]),
      ex.flatMap((y) => y.t.displayMidi),
    );
  return {
    id: "voicings.rootless",
    title: m.music_cards_rootless_title(),
    screens: [
      {
        title: m.music_cards_rootless_leave_title(),
        figure: fig(ex[0]),
        sound: hear(ex[0].t.displayMidi),
        text: (arp ? m.music_cards_rootless_leave_text_arp : m.music_cards_rootless_leave_text)({
          symbol: ex[0].t.symbol,
        }),
        // The same chord in both positions, one keyboard each.
        options: [ex[0], b0].map((x) => ({
          label: m.music_cards_rootless_position({ pos: x.pos, degrees: x.d }),
          sound: hear(x.t.displayMidi),
          figure: keys(
            Object.fromEntries([
              [x.t.displayMidi[0], m.music_cards_root_label()],
              ...[...x.rh].sort((a, c) => a - c).map((n) => [n, degreeOf(x.t.symbol, n)]),
            ]),
            [ex[0], b0].flatMap((y) => y.t.displayMidi),
          ),
        })),
      },
      {
        title: m.music_cards_rootless_251_title(),
        text: m.music_cards_rootless_251_text(),
        steps: ex.map((x) => ({
          text: (arp ? m.music_cards_rootless_step_arp : m.music_cards_rootless_step)({
            symbol: x.t.symbol,
            pos: x.pos,
            degrees: x.d,
            notes: [...x.rh]
              .sort((a, b) => a - b)
              .map(flat)
              .join(" "),
            root: flat(x.t.displayMidi[0]),
          }),
          figure: fig(x),
          sound: tones(x.t.displayMidi),
        })),
      },
      {
        title: m.music_cards_rootless_move_title(),
        text: m.music_cards_rootless_move_text(),
      },
    ],
  };
}

const INVERSION = [
  m.music_cards_inv_root,
  m.music_cards_inv_first,
  m.music_cards_inv_second,
  m.music_cards_inv_third,
];
const bars = (key = 0) => closestChords(key, [55, 76]);

function inversions(o: CardOpts): Lesson {
  const arp = !!o.arpeggio;
  const bs = bars();
  const stay = (i: number) => bs[i].rightHand.filter((m) => bs[i - 1].rightHand.includes(m));
  const fig = (i: number): LessonFigure =>
    keys(
      Object.fromEntries([
        [bs[i].leftHand, m.music_cards_root_label()],
        ...bs[i].rightHand.map((n) => [n, flat(n)]),
      ]),
      bs.flatMap((b) => [b.leftHand, ...b.rightHand]),
    );
  const steps: LessonStep[] = bs.map((b, i) => {
    const kept = i ? stay(i) : [];
    const chord = {
      symbol: b.symbol,
      inversion: INVERSION[b.inversion](),
      notes: b.rightHand.map(flat).join(" "),
    };
    return {
      text: i
        ? `${m.music_cards_inversions_move_step({ ...chord, steps: m.music_cards_half_steps({ count: b.movement }) })} ${
            kept.length
              ? m.music_cards_inversions_kept({ count: kept.length, notes: join(kept.map(flat)) })
              : m.music_cards_inversions_none_kept()
          }`
        : (arp ? m.music_cards_inversions_first_step_arp : m.music_cards_inversions_first_step)(
            chord,
          ),
      figure: fig(i),
      sound: tones([b.leftHand, ...b.rightHand]),
    };
  });
  return {
    id: "voicings.inversions",
    title: m.music_cards_inversions_title(),
    screens: [
      {
        title: m.music_cards_inversions_move_title(),
        figure: fig(1),
        text: (arp ? m.music_cards_inversions_move_text_arp : m.music_cards_inversions_move_text)(),
      },
      {
        title: m.music_cards_inversions_c_title(),
        text: m.music_cards_inversions_c_text(),
        steps,
      },
      {
        title: m.music_cards_find_in_check_title(),
        text: m.music_cards_inversions_check_text(),
      },
    ],
  };
}

function cadence(minor: boolean): Lesson {
  const bs = cadenceChords(0, minor, [55, 76]);
  const tonic = minor ? m.music_cards_key_c_minor() : m.music_cards_key_c_major();
  const fig = (i: number): LessonFigure =>
    keys(
      Object.fromEntries([
        [bs[i].leftHand, m.music_cards_root_label()],
        ...bs[i].rightHand.map((n) => [n, flat(n)]),
      ]),
      bs.flatMap((b) => [b.leftHand, ...b.rightHand]),
    );
  const steps: LessonStep[] = bs.map((b, i) => ({
    text:
      m.music_cards_cadence_step({
        roman: b.roman,
        symbol: b.symbol,
        inversion: (INVERSION[b.inversion] ?? m.music_cards_inv_third)(),
        notes: b.rightHand.map(flat).join(" "),
      }) + (b.roman === "V7" ? ` ${m.music_cards_cadence_v7_note()}` : ""),
    figure: fig(i),
    sound: tones([b.leftHand, ...b.rightHand]),
  }));
  const raised = (scaleSemitones("harmonic-minor")![6] + 60) % 12;
  const natural = (scaleSemitones("natural-minor")![6] + 60) % 12;
  return {
    id: minor ? "voicings.cadence-minor" : "voicings.cadence",
    title: minor ? m.music_cards_cadence_title_minor() : m.music_cards_cadence_title(),
    screens: [
      {
        title: m.music_cards_cadence_roman_title(),
        text: (minor ? m.music_cards_cadence_roman_text_minor : m.music_cards_cadence_roman_text)({
          tonic,
        }),
        steps,
      },
      minor
        ? {
            title: m.music_cards_cadence_raised_title(),
            text: m.music_cards_cadence_raised_text({
              raised: flat(60 + raised),
              natural: flat(60 + natural),
              tonic,
            }),
            options: [
              {
                label: m.music_cards_cadence_natural_7th({ note: flat(60 + natural) }),
                sound: run([60 + natural - 12, 60], 0.5),
              },
              {
                label: m.music_cards_cadence_raised_7th({ note: flat(60 + raised) }),
                sound: run([60 + raised - 12, 60], 0.5),
              },
            ],
          }
        : {
            title: m.music_cards_cadence_pull_title(),
            text: m.music_cards_cadence_pull_text(),
          },
    ],
  };
}

// ---------------------------------------------------------------------------
// Accompany

/** The chord kinds the lead-sheet charts use, each with what its suffix adds (cards.test.ts checks the charts use no other). */
export const SYMBOL_KINDS: { suffix: string; gloss: (names: Record<string, string>) => string }[] =
  [
    { suffix: "", gloss: () => m.music_cards_gloss_major() },
    { suffix: "m", gloss: () => m.music_cards_gloss_m() },
    { suffix: "7", gloss: () => m.music_cards_gloss_7() },
    { suffix: "m7", gloss: () => m.music_cards_gloss_m7() },
    { suffix: "maj7", gloss: () => m.music_cards_gloss_maj7() },
    { suffix: "m7b5", gloss: () => m.music_cards_gloss_m7b5() },
    {
      suffix: "7alt",
      gloss: (n) =>
        m.music_cards_gloss_7alt({ b9: n.b9, s9: n["#9"], s11: n["#11"], b13: n.b13 }),
    },
    { suffix: "add9", gloss: (n) => m.music_cards_gloss_add9({ note: n["9"] }) },
    { suffix: "sus2", gloss: (n) => m.music_cards_gloss_sus2({ note: n["2"] }) },
    { suffix: "sus4", gloss: (n) => m.music_cards_gloss_sus4({ note: n["4"] }) },
  ];

function chordSymbols(): Lesson {
  const all = SYMBOL_KINDS.map((k) => chordTones(`C${k.suffix}`));
  const span = all.flat().map((x) => x.midi);
  const steps = SYMBOL_KINDS.map((k, i): LessonStep => {
    const t = all[i];
    const names = Object.fromEntries(t.map((x) => [x.label, x.name]));
    return {
      text: `${m.music_cards_symbols_step({ symbol: `C${k.suffix}`, notes: join(t.map((x) => x.name)) })} ${k.gloss(names)}`,
      figure: keys(Object.fromEntries(t.map((x) => [x.midi, x.name])), span),
      sound: tones(t.map((x) => x.midi)),
    };
  });
  return {
    id: "accompany.chord-symbols",
    title: m.music_cards_symbols_title(),
    screens: [
      {
        title: m.music_cards_symbols_root_title(),
        text: m.music_cards_symbols_root_text(),
        steps,
      },
      {
        title: m.music_cards_symbols_slash_title(),
        text: m.music_cards_symbols_slash_text(),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Chord scales

function whyDorian(): Lesson {
  const ts = chordScaleTargets("major", 0);
  const key = new Set(scaleSemitones("major")!.map((s) => pc(60 + s)));
  const names = (t: (typeof ts)[number]) => t.midi.slice(0, 7).map(sharp);
  const outside = (t: (typeof ts)[number]) =>
    [...new Set(t.midi.map(pc))].filter((p) => !key.has(p)).map((p) => sharp(60 + p));
  const fig = (t: (typeof ts)[number]): LessonFigure =>
    keys(
      Object.fromEntries(t.midi.map((m) => [m, sharp(m)])),
      ts.flatMap((x) => x.midi),
    );
  return {
    id: "chord-scales.why",
    title: m.music_cards_dorian_title(),
    screens: [
      {
        title: m.music_cards_dorian_scale_title(),
        text: m.music_cards_dorian_scale_text({
          symbol: ts[0].symbol,
          scale: ts[0].scaleLabel,
          notes: names(ts[0]).join(" "),
        }),
        figure: fig(ts[0]),
        sound: run(ts[0].midi, 0.3),
      },
      {
        title: m.music_cards_dorian_all_title(),
        text: m.music_cards_dorian_all_text(),
        steps: ts.map((t) => ({
          text: `${m.music_cards_scale_step({ symbol: t.symbol, scale: t.scaleLabel, notes: names(t).join(" ") })} ${
            outside(t).length
              ? m.music_cards_dorian_outside({ count: outside(t).length, notes: join(outside(t)) })
              : m.music_cards_dorian_inside()
          }`,
          figure: fig(t),
          sound: run(t.midi, 0.3),
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Technique tips (true for guitar and ukulele alike where both apply)

const tip = (id: string, title: string, screens: LessonScreen[]): Lesson => ({
  id,
  title,
  screens,
});

/** The strip's instrument, from its tuning (guitar when the drill passes none). */
const fretted = (o: CardOpts): "guitar" | "ukulele" => o.tuning?.instrument ?? "guitar";
/**
 * Open C, fingertips just behind the frets: the shape the chord tips draw. Guitar: x32010.
 * Ukulele: the ring finger on string 1, fret 3. Drawn on the standard tuning: it is a hand shape.
 */
const cShape = (o: CardOpts): LessonFigure =>
  fretted(o) === "ukulele"
    ? { kind: "fretboard", instrument: "ukulele", marks: [{ string: 1, fret: 3, label: "3" }] }
    : {
        kind: "fretboard",
        instrument: "guitar",
        marks: [
          { string: 5, fret: 3, label: "3" },
          { string: 4, fret: 2, label: "2" },
          { string: 2, fret: 1, label: "1" },
        ],
      };
/** Open C as it sounds, low string first (ukulele high G: G C E C). */
const cChord = (o: CardOpts) =>
  fretted(o) === "ukulele" ? [67, 60, 64, 72] : [48, 52, 55, 60, 64];
/** One finger a fret: index to little finger on frets 1 to 4 of the top string as you hold it (guitar 6, ukulele 4). */
const spiderString = (o: CardOpts) => (fretted(o) === "ukulele" ? 4 : 6);
const spider = (o: CardOpts): LessonFigure => ({
  kind: "fretboard",
  instrument: fretted(o),
  marks: [1, 2, 3, 4].map((f) => ({ string: spiderString(o), fret: f, label: String(f) })),
});
/** The spider's four notes: frets 1 to 4 above the open string (guitar E2, ukulele high G4). */
const spiderRun = (o: CardOpts) =>
  [1, 2, 3, 4].map((f) => (fretted(o) === "ukulele" ? 67 : 40) + f);

const TIPS: Record<string, (o: CardOpts) => Lesson> = {
  "tips.strum": (o) =>
    tip("tips.strum", m.music_cards_tip_strum_title(), [
      {
        title: m.music_cards_tip_strum_fret_title(),
        figure: cShape(o),
        sound: tones(cChord(o), 0, 1.6),
        text: m.music_cards_tip_strum_fret_text(),
      },
      {
        title: m.music_cards_tip_strum_missing_title(),
        text: m.music_cards_tip_strum_missing_text(),
      },
    ]),
  "tips.chords": (o) =>
    tip("tips.chords", m.music_cards_tip_chords_title(), [
      {
        title: m.music_cards_tip_chords_shape_title(),
        figure: cShape(o),
        sound: tones(cChord(o), 0, 1.6),
        text: m.music_cards_tip_chords_shape_text(),
      },
      {
        title: m.music_cards_tip_chords_listen_title(),
        text: m.music_cards_tip_chords_listen_text(),
      },
    ]),
  "tips.changes": (o) =>
    tip("tips.changes", m.music_cards_tip_changes_title(), [
      {
        title: m.music_cards_tip_changes_shape_title(),
        figure: cShape(o),
        text: m.music_cards_tip_changes_shape_text(),
      },
      {
        title: m.music_cards_tip_changes_guide_title(),
        text: m.music_cards_tip_changes_guide_text(),
      },
    ]),
  "tips.spider": (o) =>
    tip("tips.spider", m.music_cards_tip_spider_title(), [
      {
        title: m.music_cards_tip_spider_finger_title(),
        figure: spider(o),
        sound: run(spiderRun(o)),
        text: m.music_cards_tip_spider_finger_text(),
      },
      {
        title: m.music_cards_tip_spider_even_title(),
        text: m.music_cards_tip_spider_even_text(),
      },
    ]),
  "tips.two-hand": () =>
    tip("tips.two-hand", m.music_cards_tip_two_hand_title(), [
      {
        title: m.music_cards_tip_two_hand_one_title(),
        figure: keys({
          48: m.music_cards_hand_left_short(),
          50: m.music_cards_hand_left_short(),
          52: m.music_cards_hand_left_short(),
          60: m.music_cards_hand_right_short(),
          62: m.music_cards_hand_right_short(),
          64: m.music_cards_hand_right_short(),
        }),
        sound: run([48, 50, 52, 60, 62, 64]),
        text: m.music_cards_tip_two_hand_one_text(),
      },
      {
        title: m.music_cards_tip_two_hand_count_title(),
        text: m.music_cards_tip_two_hand_count_text(),
      },
    ]),
};

const CARDS: Record<string, (o: CardOpts) => Lesson> = {
  "scales.major-formula": (o) => majorFormula(o),
  "scales.minor-forms": minorForms,
  "scales.thumb-under": thumbUnder,
  "positions.caged": caged,
  "positions.boxes": pentatonicBoxes,
  "positions.connected": connectedBoxes,
  "positions.boxes-ukulele": ukuleBoxes,
  "positions.bb-box": bbBox,
  "comping.charleston": charleston,
  "voicings.rootless": rootless,
  "voicings.minor": minorVoicings,
  "voicings.altered": alteredVoicings,
  "voicings.inversions": inversions,
  "voicings.guide-tones": guideTones,
  "voicings.cadence": () => cadence(false),
  "voicings.cadence-minor": () => cadence(true),
  "accompany.chord-symbols": chordSymbols,
  "chord-scales.why": whyDorian,
  "chord-scales.minor": chordScalesMinor,
  "chord-scales.patterns": chordPatterns,
  ...Object.fromEntries(
    triadIds().map((id) => [`positions.${id}`, (o: CardOpts) => triads(id, o)]),
  ),
  ...Object.fromEntries(
    GOSPEL_PROGRESSIONS.map((g) => [`voicings.gospel.${g.id}`, () => gospel(g.id)]),
  ),
  ...TIPS,
};

export const CARD_IDS = Object.keys(CARDS);
/** The scale kinds that have a standard piano fingering (so the thumb card applies). */
export const hasThumbUnder = (kind: string) => !!SCALE_FINGERINGS[kind];
export { positionsCard } from "./cards-guitar";
/** Cards whose wording changes when the instrument plays one note at a time; the arpeggio version has `.arp` added to its id. */
export const ARPEGGIO_IDS = ["voicings.rootless", "voicings.inversions"];

/**
 * A tier 3 concept card by id, as the lessons a drill passes with `trigger: "check"`; none for an
 * unknown id. `opts` carries what the setup chooses (the tuning for position cards, one note at a
 * time for voicings); a card that changes with it has a different id (`.arp`, or `@tuning-id` when the tuning is not standard), so each is seen once.
 */
export function conceptCard(id: string, opts: CardOpts = {}): Lesson[] {
  const make = CARDS[id];
  if (!make) return [];
  const arp = !!opts.arpeggio && ARPEGGIO_IDS.includes(id);
  const l = make({ ...opts, arpeggio: arp });
  // A position card placed on another tuning has other frets, so it is its own card.
  const t = opts.tuning;
  const retuned =
    id.startsWith("positions.") && t && !["guitar.standard", "ukulele.high-g"].includes(t.id);
  return [arp ? { ...l, id: `${id}.arp` } : retuned ? { ...l, id: `${id}@${t.id}` } : l];
}
