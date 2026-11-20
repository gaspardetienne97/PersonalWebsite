import {
  CIRCLE,
  FLAT_ORDER,
  SHARP_ORDER,
  diatonicChords,
  keyAt,
  neighbour,
  noteAtFifths,
  opposite,
  wheelIndex,
} from "../theory/circle";
import { parseChordSymbol } from "../theory/chords";
import { analysisSheet } from "../content/analysis";
import { TUNES } from "../content/tunes";
import type { CircleMode } from "../content/circle";
import { m } from "@repo/i18n/messages.js";
import { formatList } from "@repo/i18n/format";
import type { Lesson, LessonFigure, LessonSound, LessonStep } from "./types";

const sig = (
  fifths: number,
  reveal?: number,
  clef: "treble" | "bass" = "treble",
): LessonFigure => ({
  kind: "signature",
  clef,
  fifths,
  reveal,
});

/** The wheel with a key picked and some keys lit (marks are by wheel slot). */
const wheel = (selected: number | null, lit: number[] = []): LessonFigure => ({
  kind: "wheel",
  selected,
  marks: Object.fromEntries(lit.map((f) => [wheelIndex(f), "lit"])),
});

/** A chord symbol as midi notes in a middle register. */
const chordMidis = (symbol: string): number[] => {
  const c = parseChordSymbol(symbol.replace("°", "dim"))!;
  const root = 55 + ((((c.rootPc - 55) % 12) + 12) % 12);
  return c.intervals.map((i) => root + i);
};
/** Chords one after the other. */
const play = (...symbols: string[]): LessonSound => ({
  notes: symbols.map((s, i) => ({ midi: chordMidis(s), at: i * 1.3, dur: 1.2 })),
});
const list = (a: readonly string[]) => a.join(" ");
/** "2 sharps", "1 flat": a key's accidentals, never zero (callers word the none case themselves). */
const acc = (fifths: number) =>
  fifths > 0
    ? m.music_cards_circle_sharps({ count: fifths })
    : m.music_cards_circle_flats({ count: -fifths });

/** One step per accidental added, the staff growing with it. */
const growing = (order: readonly string[], sign: 1 | -1, mark: "#" | "b"): LessonStep[] =>
  order.map((l, i) => ({
    text:
      i === 0
        ? m.music_cards_circle_order_first({ note: `${l}${mark}` })
        : m.music_cards_circle_order_next({ note: `${l}${mark}`, count: i + 1 }),
    figure: sig(sign * (i + 1), i + 1),
  }));

const worked = (fifths: number): LessonStep => {
  const k = keyAt(fifths);
  const n = Math.abs(fifths);
  const first = k.accidentals.slice(0, n);
  const names = n === 2 ? formatList(first) : first.join(", ");
  const text = (
    fifths > 0 ? m.music_cards_circle_worked_sharps : m.music_cards_circle_worked_flats
  )({ key: k.major, count: n, names });
  return { text, figure: sig(fifths, n) };
};

const ORDER = (): Lesson => ({
  id: "circle.order",
  title: m.music_cards_circle_order_title(),
  screens: [
    {
      title: m.music_cards_circle_order_sharps_title(),
      text: m.music_cards_circle_order_sharps_text({ order: list(SHARP_ORDER) }),
      figure: sig(0, 0),
      steps: growing(SHARP_ORDER, 1, "#"),
    },
    {
      title: m.music_cards_circle_order_flats_title(),
      text: m.music_cards_circle_order_flats_text({ order: list(FLAT_ORDER) }),
      figure: sig(0, 0),
      steps: growing(FLAT_ORDER, -1, "b"),
    },
    {
      title: m.music_cards_circle_order_counting_title(),
      text: m.music_cards_circle_order_counting_text(),
      steps: [worked(2), worked(3), worked(-2)],
    },
    {
      title: m.music_cards_circle_ready_title(),
      text: m.music_cards_circle_order_ready_text({
        sharps: list(SHARP_ORDER),
        flats: list(FLAT_ORDER),
      }),
    },
  ],
});

const last = (a: readonly string[]) => a[a.length - 1];

const COUNT = (): Lesson => ({
  id: "circle.count",
  title: m.music_cards_circle_count_title(),
  screens: [
    {
      title: m.music_cards_circle_count_round_title(),
      text: m.music_cards_circle_count_round_text(),
      figure: wheel(0),
      steps: [1, 2, 3, 4].map((f) => ({
        text: m.music_cards_circle_key_has({ key: keyAt(f).major, accidentals: acc(f) }),
        figure: wheel(
          f,
          Array.from({ length: f + 1 }, (_, i) => i),
        ),
      })),
    },
    {
      title: m.music_cards_circle_count_sharp_title(),
      text: m.music_cards_circle_count_sharp_text(),
      steps: [2, 3, 5].map((f) => {
        const k = keyAt(f);
        return {
          text: m.music_cards_circle_count_sharp_step({
            accidentals: acc(f),
            last: last(k.accidentals),
            key: k.major,
          }),
          figure: sig(f, f),
        };
      }),
    },
    {
      title: m.music_cards_circle_count_flat_title(),
      text: m.music_cards_circle_count_flat_text(),
      steps: [-2, -3, -4, -1].map((f) => {
        const k = keyAt(f);
        return {
          text:
            f === -1
              ? m.music_cards_circle_count_flat_one({ key: k.major, flat: k.accidentals[0] })
              : m.music_cards_circle_count_flat_step({
                  accidentals: acc(f),
                  flat: k.accidentals[-f - 2],
                  key: k.major,
                }),
          figure: sig(f, -f),
        };
      }),
    },
    {
      title: m.music_cards_circle_relative_title(),
      text: m.music_cards_circle_relative_text(),
      steps: [0, 1, -1].map((f) => {
        const k = { major: keyAt(f).major, minor: keyAt(f).minor };
        return {
          text: f
            ? m.music_cards_circle_relative_share({ ...k, accidentals: acc(f) })
            : m.music_cards_circle_relative_share_none(k),
          figure: sig(f, Math.abs(f)),
        };
      }),
    },
  ],
});

const SIGNATURE = (): Lesson => ({
  id: "circle.signature",
  title: m.music_cards_circle_signature_title(),
  screens: [
    {
      title: m.music_cards_circle_signature_staff_title(),
      text: m.music_cards_circle_signature_staff_text(),
      figure: sig(0, 0),
      steps: [2, 4, -2, -3].map((f) => ({
        text: m.music_cards_circle_signature_step({ accidentals: acc(f), key: keyAt(f).major }),
        figure: sig(f, Math.abs(f)),
      })),
    },
    {
      title: m.music_cards_circle_signature_bass_title(),
      text: m.music_cards_circle_signature_bass_text(),
      steps: [3, -3].map((f) => ({
        text: m.music_cards_circle_signature_bass_step({
          key: keyAt(f).major,
          accidentals: acc(f),
        }),
        figure: sig(f, Math.abs(f), "bass"),
      })),
    },
    {
      title: m.music_cards_circle_signature_rule_title(),
      text: m.music_cards_circle_signature_rule_text(),
      steps: [4, -4].map((f) => {
        const k = keyAt(f);
        return {
          text:
            f > 0
              ? m.music_cards_circle_signature_rule_sharp({
                  accidentals: acc(f),
                  last: last(k.accidentals),
                  key: k.major,
                })
              : m.music_cards_circle_signature_rule_flat({
                  accidentals: acc(f),
                  flat: k.accidentals[-f - 2],
                  key: k.major,
                }),
          figure: sig(f, Math.abs(f)),
        };
      }),
    },
    {
      title: m.music_cards_circle_ready_title(),
      text: m.music_cards_circle_signature_ready_text(),
    },
  ],
});

const NEIGHBOURS = (): Lesson => ({
  id: "circle.neighbours",
  title: m.music_cards_circle_neighbours_title(),
  screens: [
    {
      title: m.music_cards_circle_neighbours_cw_title(),
      text: m.music_cards_circle_neighbours_cw_text(),
      figure: wheel(0),
      steps: [0, 1, 2].map((f) => {
        const n = neighbour(f, 1);
        return {
          text: m.music_cards_circle_neighbours_cw_step({
            from: keyAt(f).major,
            to: n.major,
            accidentals: acc(n.fifths),
          }),
          figure: wheel(n.fifths, [f]),
        };
      }),
    },
    {
      title: m.music_cards_circle_neighbours_ccw_title(),
      text: m.music_cards_circle_neighbours_ccw_text(),
      steps: [0, -1, 2].map((f) => {
        const n = neighbour(f, -1);
        return {
          text: m.music_cards_circle_neighbours_ccw_step({
            from: keyAt(f).major,
            to: n.major,
            accidentals: acc(n.fifths),
          }),
          figure: wheel(n.fifths, [f]),
        };
      }),
    },
    {
      title: m.music_cards_circle_neighbours_rel_title(),
      text: m.music_cards_circle_neighbours_rel_text(),
      steps: [
        {
          text: m.music_cards_circle_neighbours_rel_step({
            major: keyAt(0).major,
            minor: keyAt(0).minor,
          }),
          figure: wheel(0),
        },
        {
          text: m.music_cards_circle_neighbours_rel_step({
            major: keyAt(1).major,
            minor: keyAt(1).minor,
          }),
          figure: wheel(1),
        },
        {
          text: m.music_cards_circle_neighbours_opposite({
            key: keyAt(0).major,
            opposite: opposite(0).major,
          }),
          figure: wheel(0, [opposite(0).fifths]),
        },
        {
          text: m.music_cards_circle_neighbours_opposite_short({
            key: keyAt(1).major,
            opposite: opposite(1).major,
          }),
          figure: wheel(1, [opposite(1).fifths]),
        },
      ],
    },
  ],
});

const CHORDS = (): Lesson => ({
  id: "circle.chords",
  title: m.music_cards_circle_chords_title(),
  screens: [
    {
      title: m.music_cards_circle_chords_pattern_title(),
      text: m.music_cards_circle_chords_pattern_text({
        numerals: diatonicChords(0)
          .map((c) => c.numeral)
          .join(" "),
        names: diatonicChords(0)
          .map((c) => c.name)
          .join(", "),
      }),
      figure: wheel(0, [-1, 0, 1]),
      steps: diatonicChords(0).map((c) => ({
        text: m.music_cards_circle_chords_step({ numeral: c.numeral, name: c.name }),
        sound: play(c.name),
      })),
    },
    {
      title: m.music_cards_circle_chords_wedge_title(),
      text: m.music_cards_circle_chords_wedge_text(),
      figure: wheel(0, [-1, 0, 1]),
    },
    {
      title: m.music_cards_circle_chords_any_title(),
      text: m.music_cards_circle_chords_any_text(),
      steps: [1, -1, 2].map((f) => ({
        text: m.music_cards_circle_chords_any_step({
          key: keyAt(f).major,
          chords: diatonicChords(f)
            .map((c) => c.name)
            .join(" "),
        }),
        figure: wheel(f, [f - 1, f, f + 1]),
      })),
    },
  ],
});

const WHEEL = (): Lesson => ({
  id: "circle.wheel",
  title: m.music_cards_circle_wheel_title(),
  screens: [
    {
      title: m.music_cards_circle_wheel_cw_title(),
      text: m.music_cards_circle_wheel_cw_text({
        keys: CIRCLE.slice(1, 7)
          .map((k) => k.major)
          .join(" "),
      }),
      figure: wheel(0),
      steps: CIRCLE.slice(1, 7).map((k, i) => ({
        text: m.music_cards_circle_wheel_cw_step({ key: k.major, count: i + 1 }),
        figure: wheel(
          k.fifths,
          Array.from({ length: i + 2 }, (_, j) => j),
        ),
      })),
    },
    {
      title: m.music_cards_circle_wheel_flat_title(),
      text: m.music_cards_circle_wheel_flat_text({
        keys: CIRCLE.slice(7)
          .map((k) => k.major)
          .join(" "),
      }),
      figure: wheel(0),
      steps: CIRCLE.slice(7)
        .reverse()
        .map((k, i) => ({
          text: m.music_cards_circle_wheel_ccw_step({ key: k.major, count: i + 1 }),
          figure: wheel(k.fifths),
        })),
    },
    {
      title: m.music_cards_circle_wheel_meet_title(),
      text: m.music_cards_circle_wheel_meet_text(),
      figure: wheel(6),
    },
  ],
});

const BORROWED = (): Lesson => ({
  id: "circle.borrowed",
  title: m.music_cards_circle_borrowed_title(),
  screens: [
    {
      title: m.music_cards_circle_borrowed_parallel_title(),
      text: m.music_cards_circle_borrowed_parallel_text(),
      steps: [
        { text: m.music_cards_circle_key_has_none({ key: "C" }), figure: sig(0, 0) },
        {
          text: m.music_cards_circle_borrowed_minor_has({
            accidentals: acc(-3),
            names: keyAt(-3).accidentals.join(", "),
          }),
          figure: sig(-3, 3),
        },
      ],
    },
    {
      title: m.music_cards_circle_borrowed_four_title(),
      text: m.music_cards_circle_borrowed_four_text(),
      options: [
        { label: `iv ${noteAtFifths(-1)}m`, chord: `${noteAtFifths(-1)}m` },
        { label: `bVI ${noteAtFifths(-4)}`, chord: noteAtFifths(-4) },
        { label: `bVII ${noteAtFifths(-2)}`, chord: noteAtFifths(-2) },
        { label: `bIII ${noteAtFifths(-3)}`, chord: noteAtFifths(-3) },
      ].map((o) => ({ label: o.label, sound: play(o.chord, "C") })),
    },
    {
      title: m.music_cards_circle_borrowed_spot_title(),
      text: m.music_cards_circle_borrowed_spot_text(),
    },
  ],
});

/** The four secondary dominants in C: the dominant, its target. */
const SECONDARY_IN_C = [
  { name: "V/V", dom: `${noteAtFifths(2)}7`, target: noteAtFifths(1) },
  { name: "V/vi", dom: `${noteAtFifths(4)}7`, target: `${noteAtFifths(3)}m` },
  { name: "V/ii", dom: `${noteAtFifths(3)}7`, target: `${noteAtFifths(2)}m` },
  { name: "V/IV", dom: `${noteAtFifths(0)}7`, target: noteAtFifths(-1) },
];

const SECONDARY = (): Lesson => ({
  id: "circle.secondary",
  title: m.music_cards_circle_secondary_title(),
  screens: [
    {
      title: m.music_cards_circle_secondary_any_title(),
      text: m.music_cards_circle_secondary_any_text(),
      steps: [
        {
          text: m.music_cards_circle_secondary_v_of_c(),
          figure: wheel(0, [1]),
          sound: play("G7", "C"),
        },
        {
          text: m.music_cards_circle_secondary_v_of_v({ dom: SECONDARY_IN_C[0].dom }),
          figure: wheel(1, [2]),
          sound: play(SECONDARY_IN_C[0].dom, SECONDARY_IN_C[0].target),
        },
      ],
    },
    {
      title: m.music_cards_circle_secondary_four_title(),
      text: m.music_cards_circle_secondary_four_text(),
      options: SECONDARY_IN_C.map((s) => ({
        label: m.music_cards_circle_secondary_option({
          name: s.name,
          dom: s.dom,
          target: s.target,
        }),
        sound: play(s.dom, s.target),
      })),
    },
    {
      title: m.music_cards_circle_secondary_find_title(),
      text: m.music_cards_circle_secondary_find_text(),
      steps: SECONDARY_IN_C.slice(1).map((s) => ({
        text: m.music_cards_circle_secondary_find_step({
          name: s.name,
          target: s.target,
          root: s.dom.slice(0, -1),
          dom: s.dom,
        }),
      })),
    },
  ],
});

const ANALYSIS_TUNE = "tune-fly-me-to-the-moon";

/** Built on demand, so a change to the tune data cannot break the other circle lessons. */
function analysisLesson(): Lesson {
  const sheet = analysisSheet(TUNES.find((t) => t.id === ANALYSIS_TUNE)!);
  const chordStep = (i: number): LessonStep => {
    const c = sheet[i];
    const next = sheet[i + 1]?.symbol;
    return {
      text:
        c.fn === "V of"
          ? m.music_cards_circle_analysis_v_of({ symbol: c.symbol, next })
          : c.fn === "Related ii"
            ? m.music_cards_circle_analysis_related_ii({ symbol: c.symbol, next })
            : m.music_cards_circle_analysis_fn({ symbol: c.symbol, fn: c.fn, key: c.key }),
      sound: play(c.symbol),
    };
  };
  return {
    id: "circle.analysis",
    title: m.music_cards_circle_analysis_title(),
    screens: [
      {
        title: m.music_cards_circle_analysis_key_title(),
        text: m.music_cards_circle_analysis_key_text(),
        figure: wheel(0),
        steps: [0, 3, 4].map(chordStep),
      },
      {
        title: "ii, V, I",
        text: m.music_cards_circle_analysis_iivi_text(),
        steps: [1, 2, 3].map(chordStep),
      },
      {
        title: m.music_cards_circle_analysis_v_of_title(),
        text: m.music_cards_circle_analysis_v_of_text(),
        steps: [5, 6, 7].map(chordStep),
      },
      {
        title: m.music_cards_circle_analysis_subs_title(),
        text: m.music_cards_circle_analysis_subs_text(),
      },
    ],
  };
}

export function circleLessons(mode: CircleMode): Lesson[] {
  switch (mode) {
    case "order":
      return [ORDER()];
    case "count":
      return [COUNT()];
    case "signature":
      return [COUNT(), SIGNATURE()];
    case "neighbours":
      return [NEIGHBOURS()];
    case "chords":
      return [CHORDS()];
    case "wheel":
      return [WHEEL()];
    case "borrowed":
      return [BORROWED()];
    case "secondary":
      return [SECONDARY()];
    case "analysis":
      return [analysisLesson()];
  }
}
