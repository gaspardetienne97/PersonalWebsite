// Concept cards for the Positions drill: the CAGED shapes, the pentatonic boxes, the connected run,
// the ukulele's positions, the triads and the B.B. box. Every fret and string is worked out with
// the drill's own `positionTargets` on the strip's tuning, so a retuned guitar gets true numbers.

import {
  POSITION_PATTERNS,
  positionRootFretMax,
  positionRootFretMin,
  positionTargets,
  type PositionPattern,
} from "../content/technique";
import { midiAt, tuningById, type Tuning } from "../theory/fretboard";
import { noteName, pc } from "../theory/notes";
import { join, run, sharp, tones, type CardOpts } from "./card-kit";
import { showChord, showNote } from "../theory/note-names";
import type { Lesson, LessonFigure, LessonStep } from "./types";
import { m } from "@repo/i18n/messages.js";

const STANDARD = tuningById("guitar.standard")!;
const HIGH_G = tuningById("ukulele.high-g")!;

const pattern = (id: string) => POSITION_PATTERNS.find((p) => p.id === id)!;

/** A shape placed as low on the neck as it fits, on a tuning. */
export function placed(id: string, tuning: Tuning) {
  const p = pattern(id);
  const lo = positionRootFretMin(p, tuning);
  const rootFret = Math.min(lo, positionRootFretMax(p, tuning));
  const targets = positionTargets({ patternId: id, tuning, rootFret });
  const rootString = p.rootString ?? (p.instrument === "ukulele" ? 1 : 6);
  const frets = targets.map((t) => t.fret);
  const used = targets.map((t) => t.string);
  return {
    p,
    rootFret,
    rootPc: pc(midiAt(tuning, rootString, rootFret)),
    targets: targets.map((t) => ({ ...t, midi: midiAt(tuning, t.string, t.fret) })),
    /** Lowest fret, from the root fret. */
    low: Math.min(...frets) - rootFret,
    firstString: Math.max(...used),
    lastString: Math.min(...used),
    /** Notes on each string, or null when the strings differ. */
    perString: (() => {
      const counts = [...new Set(used)].map((s) => used.filter((u) => u === s).length);
      return counts.every((c) => c === counts[0]) ? counts[0] : null;
    })(),
    stringCount: new Set(used).size,
  };
}
type Placed = ReturnType<typeof placed>;

const place = (off: number) =>
  off === 0
    ? m.music_cards_pos_at_root()
    : off > 0
      ? m.music_cards_pos_above_root({ count: off })
      : m.music_cards_pos_below_root({ count: -off });
/** A fret against the root fret, short: "on it", "2 above it", "2 below it". */
const against = (off: number) =>
  off === 0
    ? m.music_cards_pos_on_it()
    : off > 0
      ? m.music_cards_pos_above_it({ count: off })
      : m.music_cards_pos_below_it({ count: -off });

const figure = (
  x: Placed,
  tuning: Tuning,
  label = (m: number) => sharp(m),
): LessonFigure | undefined => {
  const f = x.targets.map((t) => t.fret);
  const from = Math.min(...f);
  const to = Math.max(Math.max(...f), from + 4);
  if (to - from > 6) return undefined;
  return {
    kind: "fretboard",
    instrument: x.p.instrument ?? "guitar",
    openStrings: [...tuning.openStrings],
    from,
    to,
    marks: x.targets.map((t) => ({ string: t.string, fret: t.fret, label: label(t.midi) })),
  };
};
/** The notes low string to high, in the order the drill plays them. */
const lowToHigh = (x: Placed) =>
  [...x.targets].sort((a, b) => b.string - a.string || a.fret - b.fret).map((t) => t.midi);

const tuningText = (t: Tuning) =>
  t.id === STANDARD.id || t.id === HIGH_G.id
    ? ""
    : ` ${m.music_cards_pos_tuning({ name: t.name })}`;
/** " with two notes on each of the 6 strings", or nothing when the strings differ. */
const notesEach = (perString: number | null, strings: number) =>
  perString
    ? m.music_cards_boxes_notes({
        perString: perString === 2 ? m.music_cards_two() : String(perString),
        count: strings,
      })
    : "";

/** The CAGED forms, lowest on the neck first, with the letter from the data's id. */
export const cagedForms = (tuning: Tuning = STANDARD) =>
  POSITION_PATTERNS.filter((p) => p.family === "caged-major")
    .map((p) => ({ id: p.id, letter: p.id.split("-")[2].toUpperCase(), ...placed(p.id, tuning) }))
    .sort((a, b) => a.low - b.low);
/** The guitar's pentatonic boxes, lowest first. */
export const boxes = (tuning: Tuning = STANDARD) =>
  POSITION_PATTERNS.filter((p) => p.family === "minor-pentatonic" && !p.instrument)
    .map((p) => placed(p.id, tuning))
    .sort((a, b) => a.low - b.low);
export const ukulelePositions = (tuning: Tuning = HIGH_G) =>
  POSITION_PATTERNS.filter((p) => p.instrument === "ukulele")
    .map((p) => placed(p.id, tuning))
    .sort((a, b) => a.low - b.low);

/** The card a Positions setup gets, by the shape it is on; null for a shape with none. */
export function positionsCard(
  p: Pick<PositionPattern, "id" | "family" | "instrument">,
): string | null {
  if (p.instrument === "ukulele") return "positions.boxes-ukulele";
  switch (p.family) {
    case "caged-major":
      return "positions.caged";
    case "minor-pentatonic":
      return "positions.boxes";
    case "connected":
      return "positions.connected";
    case "triads":
      return `positions.${p.id}`;
    case "blues-box":
      return "positions.bb-box";
    default:
      return null;
  }
}

export function caged(o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const forms = cagedForms(t);
  const steps: LessonStep[] = forms.map((f) => ({
    text: m.music_cards_caged_step({
      // The shapes are named after the open chords, so the name follows the note names.
      letter: showChord(f.letter),
      first: f.firstString,
      last: f.lastString,
      place: place(f.low),
    }),
    figure: figure(f, t),
    sound: run(lowToHigh(f), 0.25),
  }));
  return {
    id: "positions.caged",
    title: m.music_cards_caged_title(),
    screens: [
      {
        title: m.music_cards_caged_five_title(),
        text: m.music_cards_caged_five_text({
          tuning: tuningText(t),
          c: showChord("C"),
          a: showChord("A"),
          g: showChord("G"),
          e: showChord("E"),
          d: showChord("D"),
        }),
        steps,
      },
      {
        title: m.music_cards_find_in_check_title(),
        text: m.music_cards_caged_check_text(),
      },
    ],
  };
}

export function pentatonicBoxes(o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const bx = boxes(t);
  const b1 = bx[0];
  const perString = bx.every((b) => b.perString === bx[0].perString) ? bx[0].perString : null;
  return {
    id: "positions.boxes",
    title: m.music_cards_boxes_title(),
    screens: [
      {
        title: m.music_cards_boxes_one_title(),
        text: m.music_cards_boxes_one_text({
          notes: notesEach(perString, b1.stringCount),
          tuning: tuningText(t),
        }),
        figure: figure(b1, t),
        sound: run(lowToHigh(b1), 0.25),
      },
      {
        title: m.music_cards_boxes_up_title(),
        text: m.music_cards_boxes_up_text({
          tuning: tuningText(t),
          list: join(
            bx.map((b, i) => m.music_cards_boxes_item({ n: i + 1, where: against(b.low) })),
          ),
        }),
      },
    ],
  };
}

export function connectedBoxes(o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const bx = boxes(t);
  return {
    id: "positions.connected",
    title: m.music_cards_connected_title(),
    screens: [
      {
        title: m.music_cards_connected_run_title(),
        text: m.music_cards_connected_run_text(),
        steps: bx.map((b, i) => ({
          text: m.music_cards_connected_step({
            n: i + 1,
            direction:
              i % 2 ? m.music_cards_connected_high_low() : m.music_cards_connected_low_high(),
            place: place(b.low),
          }),
        })),
      },
      {
        title: m.music_cards_find_in_check_title(),
        text: m.music_cards_connected_check_text(),
      },
    ],
  };
}

export function ukuleBoxes(o: CardOpts): Lesson {
  const t = o.tuning ?? HIGH_G;
  const ps = ukulelePositions(t);
  const perString = ps.every((b) => b.perString === ps[0].perString) ? ps[0].perString : null;
  return {
    id: "positions.boxes-ukulele",
    title: m.music_cards_uke_title(),
    screens: [
      {
        title: m.music_cards_uke_one_title(),
        text: m.music_cards_uke_one_text({
          notes: notesEach(perString, ps[0].stringCount),
          tuning: tuningText(t),
          first: ps[0].firstString,
          last: ps[0].lastString,
        }),
        figure: figure(ps[0], t),
        sound: run(lowToHigh(ps[0]), 0.25),
      },
      {
        title: m.music_cards_uke_up_title(),
        text: m.music_cards_uke_up_text({
          tuning: tuningText(t),
          list: join(ps.map((b, i) => m.music_cards_uke_item({ n: i + 1, where: against(b.low) }))),
        }),
      },
    ],
  };
}

/** A note's role against the root, for the B.B. box. */
const DEGREE: Record<number, () => string> = {
  0: m.music_cards_role_root,
  2: m.music_cards_role_2nd,
  3: m.music_cards_role_flat_3rd,
  4: m.music_cards_role_3rd,
  5: m.music_cards_role_4th,
  6: m.music_cards_role_flat_5th,
  7: m.music_cards_role_5th,
  9: m.music_cards_role_6th,
  10: m.music_cards_role_flat_7th,
};
const role = (rootPc: number, midi: number) => DEGREE[pc(midi - rootPc)]?.() ?? sharp(midi);

export function bbBox(o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const x = placed("bb-box", t);
  const own = x.targets.find((n) => pc(n.midi - x.rootPc) === 0)!;
  const roles = [...x.targets].sort((a, b) => a.midi - b.midi).map((n) => role(x.rootPc, n.midi));
  return {
    id: "positions.bb-box",
    title: m.music_cards_bb_title(),
    screens: [
      {
        title: m.music_cards_bb_six_title(),
        text: m.music_cards_bb_six_text({
          roles: join(roles),
          string: own.string,
          place: place(own.fret - x.rootFret),
          tuning: tuningText(t),
        }),
        figure: figure(x, t, (m) => role(x.rootPc, m)),
        sound: run(lowToHigh(x), 0.25),
      },
      {
        title: m.music_cards_find_in_check_title(),
        text: m.music_cards_bb_check_text(),
      },
    ],
  };
}

export const triadIds = () =>
  POSITION_PATTERNS.filter((p) => p.family === "triads").map((p) => p.id);

export function triads(id: string, o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const x = placed(id, t);
  const minor = /minor/.test(id);
  const root = showNote(noteName(x.rootPc, "sharp", false));
  const parts = [0, 1, 2].map((k) => x.targets.slice(k * 3, k * 3 + 3));
  const lowest = (ns: (typeof parts)[number]) => [...ns].sort((a, b) => a.midi - b.midi);
  const inversion = (ns: (typeof parts)[number]) =>
    (
      {
        0: m.music_cards_inv_root,
        3: m.music_cards_inv_first,
        4: m.music_cards_inv_first,
        7: m.music_cards_inv_second,
      } as Record<number, () => string>
    )[pc(lowest(ns)[0].midi - x.rootPc)]?.() ?? m.music_cards_inv_any();
  const stringsOf = x.targets.map((n) => n.string);
  return {
    id: `positions.${id}`,
    title: minor ? m.music_cards_triads_title_minor() : m.music_cards_triads_title_major(),
    screens: [
      {
        title: m.music_cards_triads_three_title(),
        text: (minor
          ? m.music_cards_triads_three_text_minor
          : m.music_cards_triads_three_text_major)({
          first: Math.max(...stringsOf),
          last: Math.min(...stringsOf),
          root,
          tuning: tuningText(t),
        }),
        steps: parts.map((ns) => {
          const ord = lowest(ns);
          return {
            text: m.music_cards_triads_step({
              inversion: inversion(ns),
              notes: ord.map((n) => sharp(n.midi)).join(" "),
              frets: ns.map((n) => n.fret).join(" "),
            }),
            figure: figure({ ...x, targets: ns }, t),
            sound: tones(ord.map((n) => n.midi)),
          };
        }),
      },
      {
        title: m.music_cards_find_in_check_title(),
        text: m.music_cards_triads_check_text(),
      },
    ],
  };
}
