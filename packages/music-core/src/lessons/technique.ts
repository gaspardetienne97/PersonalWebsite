import { m } from "@repo/i18n/messages.js";
import { formatList, formatNumber } from "@repo/i18n/format";
import { BREATH_LEVELS, REGISTER_PAIRS } from "../content/aero-skills";
import {
  AEROPHONE_CHART,
  AEROPHONE_MODES,
  LANDING_HOLD_MS,
  LANDING_INTERVALS,
  PALM_FINGERINGS,
  aerophoneKeyLabel,
  fingeringFor,
  landingTarget,
} from "../content/winds-pads";
import { PEDAL_PROGRESSIONS, pedalChords } from "../content/piano";
import { TUNINGS } from "../data";
import { BEND, BEND_PROMPT_MS, BEND_SETTLE_MS } from "../scoring/bends";
import { ARTICULATION_TARGET, ATTACK } from "../scoring/aerophone";
import { PEDAL } from "../scoring/piano";
import { noteName } from "../theory/notes";
import { keys } from "./tier1";
import { showChord, showNote } from "../theory/note-names";
import { IN_C, inKey } from "./card-kit";
import type { Lesson, LessonFigure, LessonSound } from "./types";

/** A note's name as shown (letters, fixed do or movable do). */
const name = (midi: number) => showNote(noteName(midi, "sharp", false));
const pct = (x: number) => Math.round(x * 100);
const secs = (ms: number) => ms / 1000;
/** A note held for `dur` seconds, at `velocity` (0 to 1) when given. */
const held = (midi: number, dur: number, velocity?: number): LessonSound => ({
  notes: [{ midi: [midi], at: 0, dur, ...(velocity ? { velocity } : {}) }],
});

// ---------------------------------------------------------------------------
// Aerophone

export type AeroLessonMode = "long-tone" | "articulation" | "interval-landing" | "register";

/** The register crossings that slide a little finger between keys, and those that reach for the palm keys. */
const pinkyPairs = () => REGISTER_PAIRS.filter((p) => p.detail.includes("pinky"));
const palmPairs = () =>
  REGISTER_PAIRS.filter((p) => p.notes.some((m) => fingeringFor(m)?.keys.includes("C1")));
const registerGroup = (pairId: string) =>
  pinkyPairs().some((p) => p.id === pairId)
    ? "pinky"
    : palmPairs().some((p) => p.id === pairId)
      ? "palm"
      : null;

/** The lowest chart note that needs the +1 octave key, and the lowest that needs a palm key. */
export const firstOctaveNote = () => AEROPHONE_CHART.find((f) => f.octave)!;
export const firstPalmNote = () => AEROPHONE_CHART.find((f) => f.keys.includes("C1"))!;
/** Every key the chart's palm fingerings use, in the order they first appear. */
const palmKeys = () => [...new Set(Object.values(PALM_FINGERINGS).flatMap((f) => f.keys))];

/** The key names of a written note's chart fingering, as the drill's labels have them. */
const fingerKeys = (written: number) => {
  const f = fingeringFor(written)!;
  const ids = [...(f.octave ? ["octave"] : []), ...f.keys];
  return ids.length
    ? ids.map(aerophoneKeyLabel).join(", ")
    : m.music_lessons_technique_all_keys_open();
};

/**
 * The two notes of a crossing as steps, each with the AE-20's fingering drawn and its keys named,
 * then the keys that change. Written notes, as the chart has them; the picture takes concert pitch.
 */
const crossingSteps = (pairId: string | undefined, shift: number) => {
  const pair = REGISTER_PAIRS.find((p) => p.id === pairId) ?? REGISTER_PAIRS[0];
  const [a, b] = pair.notes.map((m) => fingeringFor(m)!);
  const idsOf = (f: typeof a) => new Set([...(f.octave ? ["octave"] : []), ...f.keys]);
  const [ia, ib] = [idsOf(a), idsOf(b)];
  const changes = [...new Set([...ia, ...ib])].filter((id) => ia.has(id) !== ib.has(id));
  const step = (f: typeof a) => ({
    text: (f.verified
      ? m.music_lessons_technique_crossing_step
      : m.music_lessons_technique_crossing_step_unverified)({
      note: showNote(f.name),
      keys: fingerKeys(f.midi),
    }),
    figure: { kind: "aerophone", midi: f.midi - shift } as LessonFigure,
  });
  return [
    step(a),
    step(b),
    {
      text: m.music_lessons_technique_keys_change({
        keys: changes.map(aerophoneKeyLabel).join(", "),
      }),
    },
  ];
};

const longTone = (): Lesson => ({
  id: "aerophone.long-tone",
  title: m.music_lessons_technique_long_tone_title(),
  screens: [
    {
      title: m.music_lessons_technique_long_tone_breath_title(),
      figure: { kind: "aerophone", midi: 67 },
      text: m.music_lessons_technique_long_tone_breath_text(),
    },
    {
      title: m.music_lessons_technique_long_tone_hear_title(),
      text: m.music_lessons_technique_long_tone_hear_text(),
      sound: held(67, 3),
    },
    {
      title: m.music_lessons_technique_what_drill_checks(),
      text: m.music_lessons_technique_long_tone_checks_text({
        seconds: formatList(holdSeconds(), "disjunction"),
      }),
    },
  ],
});

const holdSeconds = () =>
  (AEROPHONE_MODES.find((m) => m.id === "long-tone")!.seconds as readonly number[]).map(String);

/** The drill's level bands as "pp 0.1 to 0.28". */
const bandText = (l: (typeof BREATH_LEVELS)[number]) =>
  m.music_lessons_technique_levels_band({
    level: l.id,
    low: formatNumber(l.band[0]),
    high: formatNumber(l.band[1]),
  });

const breathLevels = (): Lesson => ({
  id: "aerophone.long-tone.levels",
  title: m.music_lessons_technique_levels_title(),
  screens: [
    {
      title: m.music_lessons_technique_levels_hold_title(),
      text: m.music_lessons_technique_levels_hold_text({
        bands: BREATH_LEVELS.map(bandText).join(", "),
        first: BREATH_LEVELS[0].id,
        second: BREATH_LEVELS[1].id,
      }),
    },
    {
      title: m.music_lessons_technique_levels_hear_title(),
      text: m.music_lessons_technique_levels_hear_text(),
      options: BREATH_LEVELS.map((l) => ({
        label: l.id,
        sound: held(67, 2, (l.band[0] + l.band[1]) / 2),
      })),
    },
    {
      title: m.music_lessons_technique_levels_scored_title(),
      text: m.music_lessons_technique_levels_scored_text(),
    },
  ],
});

const STACCATO = ARTICULATION_TARGET.staccato;
const LEGATO = ARTICULATION_TARGET.legato;

const articulation = (): Lesson => {
  const beat = 0.6;
  const run = (fraction: number): LessonSound => ({
    notes: Array.from({ length: 4 }, (_, i) => ({
      midi: [67],
      at: i * beat,
      dur: beat * fraction,
    })),
  });
  return {
    id: "aerophone.articulation",
    title: m.music_lessons_technique_art_title(),
    screens: [
      {
        title: m.music_lessons_technique_art_beat_title(),
        figure: { kind: "aerophone", midi: 67 },
        sound: run((STACCATO + LEGATO) / 2),
        text: m.music_lessons_technique_art_beat_text(),
      },
      {
        title: m.music_lessons_technique_art_styles_title(),
        text: m.music_lessons_technique_art_styles_text({
          staccato: pct(STACCATO),
          legato: pct(LEGATO),
        }),
        options: [
          { label: m.music_lessons_technique_art_staccato(), sound: run(STACCATO) },
          { label: m.music_lessons_technique_art_legato(), sound: run(LEGATO) },
        ],
      },
      {
        title: m.music_lessons_technique_art_sensor_title(),
        text: m.music_lessons_technique_art_sensor_text({ dip: pct(ATTACK.dip) }),
      },
      {
        title: m.music_lessons_technique_what_drill_checks(),
        text: m.music_lessons_technique_art_checks_text({ window: ATTACK.windowMs }),
      },
    ],
  };
};

type LandingSemitones = (typeof LANDING_INTERVALS)[number]["semitones"];
/** Each landing interval's name, and its option label each way, as whole phrases. */
const INTERVAL_NAMES: Record<
  LandingSemitones,
  { name: () => string; up: () => string; down: () => string }
> = {
  5: {
    name: m.music_lessons_technique_interval_5,
    up: m.music_lessons_technique_landing_up_5,
    down: m.music_lessons_technique_landing_down_5,
  },
  7: {
    name: m.music_lessons_technique_interval_7,
    up: m.music_lessons_technique_landing_up_7,
    down: m.music_lessons_technique_landing_down_7,
  },
  12: {
    name: m.music_lessons_technique_interval_12,
    up: m.music_lessons_technique_landing_up_12,
    down: m.music_lessons_technique_landing_down_12,
  },
  4: {
    name: m.music_lessons_technique_interval_4,
    up: m.music_lessons_technique_landing_up_4,
    down: m.music_lessons_technique_landing_down_4,
  },
  3: {
    name: m.music_lessons_technique_interval_3,
    up: m.music_lessons_technique_landing_up_3,
    down: m.music_lessons_technique_landing_down_3,
  },
};
const intervalName = (i: (typeof LANDING_INTERVALS)[number]) => INTERVAL_NAMES[i.semitones].name();

/** The drill's drones are written notes; the example uses the highest, so both directions stay on the chart. */
const WRITTEN_DRONE = 72;
const landing = (shift: number): Lesson => {
  const concert = (written: number) => written - shift;
  const drone = showNote(fingeringFor(WRITTEN_DRONE)!.name);
  return {
    id: "aerophone.interval-landing",
    title: m.music_lessons_technique_landing_title(),
    screens: [
      {
        title: m.music_lessons_technique_landing_land_title(),
        figure: keys({ [concert(WRITTEN_DRONE)]: "drone", [concert(WRITTEN_DRONE - 7)]: "land" }),
        text: m.music_lessons_technique_landing_land_text({
          intervals: LANDING_INTERVALS.map((i) => intervalName(i).toLowerCase()).join(", "),
        }),
      },
      {
        title: m.music_lessons_technique_landing_hear_title({ drone }),
        text: m.music_lessons_technique_landing_hear_text(),
        options: LANDING_INTERVALS.flatMap((i) =>
          (["up", "down"] as const).flatMap((dir) => {
            const target = landingTarget(WRITTEN_DRONE, i.semitones, dir);
            if (target === undefined) return [];
            return [
              {
                label: INTERVAL_NAMES[i.semitones][dir](),
                sound: {
                  notes: [
                    { midi: [concert(WRITTEN_DRONE)], at: 0, dur: 3.5 },
                    { midi: [concert(target)], at: 1, dur: 2.5 },
                  ],
                },
                figure: keys({
                  [concert(WRITTEN_DRONE)]: "drone",
                  [concert(target)]: "land",
                }),
              },
            ];
          }),
        ),
      },
      {
        title: m.music_lessons_technique_landing_against_title(),
        text: m.music_lessons_technique_landing_against_text(),
      },
      {
        title: m.music_lessons_technique_what_drill_checks(),
        text: m.music_lessons_technique_landing_checks_text({
          seconds: formatNumber(secs(LANDING_HOLD_MS)),
        }),
      },
    ],
  };
};

const palmName = () => showNote(firstPalmNote().name);
const octaveName = () => showNote(firstOctaveNote().name);
const pairLabels = (ps: readonly { label: string }[]) => ps.map((p) => p.label).join(", ");

const register = (pairId: string | undefined, shift: number): Lesson => ({
  id: "aerophone.register",
  title: m.music_lessons_technique_register_title(),
  screens: [
    {
      title: m.music_lessons_technique_register_break_title(),
      figure: { kind: "aerophone", midi: firstOctaveNote().midi - shift },
      text: m.music_lessons_technique_register_break_text({ note: octaveName() }),
    },
    {
      title: m.music_lessons_technique_register_together_title(),
      text: m.music_lessons_technique_register_together_text(),
      steps: crossingSteps(pairId, shift),
    },
    {
      title: m.music_lessons_technique_what_drill_checks(),
      text: m.music_lessons_technique_register_checks_text(),
    },
    {
      title: m.music_lessons_technique_register_first_title(),
      text: m.music_lessons_technique_register_first_text(),
    },
  ],
});

const registerPinky = (pairId: string, shift: number): Lesson => ({
  id: "aerophone.register.pinky",
  title: m.music_lessons_technique_pinky_title(),
  screens: [
    {
      title: m.music_lessons_technique_pinky_slide_title(),
      text: m.music_lessons_technique_pinky_slide_text({ pairs: pairLabels(pinkyPairs()) }),
    },
    {
      title: m.music_lessons_technique_change_together(),
      text: m.music_lessons_technique_pinky_together_text(),
      steps: crossingSteps(pairId, shift),
    },
    {
      title: m.music_lessons_technique_what_drill_counts(),
      text: m.music_lessons_technique_pinky_counts_text(),
    },
  ],
});

const registerPalm = (pairId: string, shift: number): Lesson => ({
  id: "aerophone.register.palm",
  title: m.music_lessons_technique_palm_title(),
  screens: [
    {
      title: m.music_lessons_technique_palm_reach_title(),
      text: m.music_lessons_technique_palm_reach_text({
        note: palmName(),
        first: palmKeys()[0],
        rest: formatList(palmKeys().slice(1)),
        pairs: pairLabels(palmPairs()),
      }),
    },
    {
      title: m.music_lessons_technique_change_together(),
      text: m.music_lessons_technique_palm_together_text(),
      steps: crossingSteps(pairId, shift),
    },
    {
      title: m.music_lessons_technique_what_drill_counts(),
      text: m.music_lessons_technique_palm_counts_text(),
    },
  ],
});

/**
 * Lessons for the Aerophone drills, in the order they show. `item` is the setup's own choice that
 * can add one: the long tone's level id, or the register crossing's id.
 */
export function aeroLessons(mode: AeroLessonMode, item?: string, shift = 0): Lesson[] {
  if (mode === "long-tone")
    return [longTone(), ...(BREATH_LEVELS.some((l) => l.id === item) ? [breathLevels()] : [])];
  if (mode === "articulation") return [articulation()];
  if (mode === "interval-landing") return [landing(shift)];
  const group = item ? registerGroup(item) : null;
  return [
    register(item, shift),
    ...(item && group === "pinky"
      ? [registerPinky(item, shift)]
      : item && group === "palm"
        ? [registerPalm(item, shift)]
        : []),
  ];
}

// ---------------------------------------------------------------------------
// Guitar and ukulele bends

/**
 * The bends drill's lesson. The examples sit on the second string at frets 2, 3 and 4, inside the
 * figure's window on any tuning; the drill lets you pick any string and fret.
 */
export function bendLesson(
  instrument: "guitar" | "ukulele" = "guitar",
  openStrings: readonly number[] = TUNINGS.guitar[0].openStrings,
): Lesson {
  const string = 2;
  const open = openStrings[string - 1];
  const FROM = 2;
  const at = (fret: number) => open + fret;
  const mark = (fret: number, label: string) => ({ string, fret, label });
  const fig = (...marks: { string: number; fret: number; label: string }[]): LessonFigure => ({
    kind: "fretboard",
    instrument,
    openStrings: [...openStrings],
    marks,
  });
  const pair = (steps: number): LessonSound => ({
    notes: [
      { midi: [at(FROM)], at: 0, dur: 1 },
      { midi: [at(FROM + steps)], at: 1.2, dur: 1.5 },
    ],
  });
  const to = (steps: number) =>
    fig(mark(FROM, name(at(FROM))), mark(FROM + steps, name(at(FROM + steps))));
  return {
    id: "guitar.bends",
    title: m.music_lessons_technique_bend_title(),
    screens: [
      {
        title: m.music_lessons_technique_bend_frets_title(),
        text: m.music_lessons_technique_bend_frets_text(),
        steps: [
          {
            text: m.music_lessons_technique_bend_start_step({ note: name(at(FROM)), string }),
            figure: fig(mark(FROM, name(at(FROM)))),
          },
          {
            text: m.music_lessons_technique_bend_half_step_text({ note: name(at(FROM + 1)) }),
            figure: to(1),
          },
          {
            text: m.music_lessons_technique_bend_whole_step_text({ note: name(at(FROM + 2)) }),
            figure: to(2),
          },
        ],
      },
      {
        title: m.music_lessons_technique_bend_target_title(),
        text: m.music_lessons_technique_bend_target_text(),
        options: [
          { label: m.music_lessons_technique_bend_half_step(), sound: pair(1), figure: to(1) },
          { label: m.music_lessons_technique_bend_whole_step(), sound: pair(2), figure: to(2) },
        ],
      },
      {
        title: m.music_lessons_technique_bend_ring_title(),
        text: m.music_lessons_technique_bend_ring_text(),
      },
      {
        title: m.music_lessons_technique_bend_measure_title(),
        text: m.music_lessons_technique_bend_measure_text({
          settle: BEND_SETTLE_MS,
          prompt: formatNumber(secs(BEND_PROMPT_MS)),
          hold: BEND.holdMs,
        }),
      },
      {
        title: m.music_lessons_technique_what_drill_checks(),
        text: m.music_lessons_technique_bend_checks_text({
          inTune: BEND.inTune,
          close: BEND.close,
        }),
      },
      {
        title: m.music_lessons_technique_bend_vibrato_title(),
        text:
          instrument === "ukulele"
            ? m.music_lessons_technique_bend_vibrato_text_ukulele()
            : m.music_lessons_technique_bend_vibrato_text_guitar(),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Piano pedal

/** A worked change the pedal drill grades as clean: the chord, a lift just after it, then straight back down. */
export const PEDAL_EXAMPLE = { liftMs: 150, downMs: 250, barMs: 2000 } as const;

const bar = (chord: { leftHand: number; rightHand: number[] }, at: number, dur: number) =>
  [chord.leftHand, ...chord.rightHand].map((m) => ({ midi: [m], at, dur }));

/** The pedal drill's example is in C: movable do names it from C whatever key the drill is in. */
export const pedalLesson = (): Lesson => inKey(IN_C, pedal);

function pedal(): Lesson {
  const prog = PEDAL_PROGRESSIONS[0];
  const [a, b] = pedalChords(0, prog.id).map((c) => ({ ...c, symbol: showChord(c.symbol) }));
  const marksOf = (c: typeof a) =>
    Object.fromEntries([c.leftHand, ...c.rightHand].map((m) => [m, name(m)]));
  const span = [a, b].flatMap((c) => [c.leftHand, ...c.rightHand]);
  const second = PEDAL_EXAMPLE.barMs / 1000;
  // The app cannot press a pedal, so each case is the first chord's ring: how long it lasts.
  const change = (ring: number): LessonSound => ({
    notes: [...bar(a, 0, ring), ...bar(b, second, second)],
  });
  return {
    id: "piano.pedal",
    title: m.music_lessons_technique_pedal_title(),
    screens: [
      {
        title: m.music_lessons_technique_pedal_after_title(),
        text: m.music_lessons_technique_pedal_after_text(),
        figure: keys(marksOf(a), span),
        sound: { notes: bar(a, 0, second) },
        steps: [
          {
            text: m.music_lessons_technique_pedal_no_pedal_step({ chord: a.symbol }),
            figure: keys(marksOf(a), span),
            sound: { notes: bar(a, 0, 0.35) },
          },
          {
            text: m.music_lessons_technique_pedal_with_pedal_step({ chord: a.symbol }),
            figure: keys(marksOf(a), span),
            sound: { notes: bar(a, 0, 2 * second) },
          },
        ],
      },
      {
        title: m.music_lessons_technique_pedal_change_title(),
        text: m.music_lessons_technique_pedal_change_text({ from: a.symbol, to: b.symbol }),
        figure: keys(marksOf(b), span),
        steps: [
          {
            text: m.music_lessons_technique_pedal_press_step({ chord: a.symbol }),
            figure: keys(marksOf(a), span),
          },
          {
            text: m.music_lessons_technique_pedal_lift_step({ chord: b.symbol }),
            figure: keys(marksOf(b), span),
          },
          { text: m.music_lessons_technique_pedal_down_step() },
        ],
      },
      {
        title: m.music_lessons_technique_pedal_order_title(),
        text: m.music_lessons_technique_pedal_order_text(),
        options: [
          { label: m.music_lessons_technique_pedal_early_option(), sound: change(0.9) },
          {
            label: m.music_lessons_technique_pedal_clean_option(),
            sound: change(second + PEDAL_EXAMPLE.liftMs / 1000),
          },
          { label: m.music_lessons_technique_pedal_blur_option(), sound: change(2 * second) },
        ],
      },
      {
        title: m.music_lessons_technique_what_drill_checks(),
        text: m.music_lessons_technique_pedal_checks_text({
          lift: PEDAL.liftWithinMs,
          repress: PEDAL.repressWithinMs,
          early: PEDAL.earlyToleranceMs,
        }),
      },
      {
        title: m.music_lessons_technique_pedal_clean_title(),
        text: m.music_lessons_technique_pedal_clean_text({
          lift: PEDAL_EXAMPLE.liftMs,
          down: PEDAL_EXAMPLE.downMs,
          downAt: pct(PEDAL.downAt),
        }),
      },
    ],
  };
}
