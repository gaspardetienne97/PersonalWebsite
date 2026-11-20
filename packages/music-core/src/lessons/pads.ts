// Pads lessons (Task 8): rudiments, grooves from level 3, and the skills (fills, play it back, ostinato,
// rudiments on the kit, chop, note repeat, song form). Every example comes from the drill's own content
// and every number from its constants, so the lesson and the grader cannot disagree. An intro lesson per
// mode, then one card per item the drill's setup adds (a rudiment, a fill, a repeat rate...), as ear.ts does.

import { formatList, formatNumber } from "@repo/i18n/format";
import { m } from "@repo/i18n/messages.js";
import type { GrooveDef } from "../data";
import { MPC_RUDIMENTS } from "../data";
import { rng } from "../content/random";
import {
  DEFAULT_RANGE,
  DYNAMICS,
  DYNAMICS_EXERCISES,
  ECHO_LEVELS,
  ECHO_PASS,
  FILL,
  INTERPRETATIONS,
  OSTINATO,
  ORCHESTRATIONS,
  PARADIDDLE,
  PAD_FILLS,
  READING_LINES,
  echoGroove,
  fillGroove,
  ladderBand,
  orchestrationGroove,
  ostinatoGroove,
  readingLines,
  type DynamicsId,
} from "../content/pad-skills";
import { swungBeat } from "../content/pads-grid";
import { PAD_REPERTOIRE, repertoireFor, type RepertoireGroove } from "../content/pads-repertoire";
import {
  BUILD,
  CHOP_EDITS,
  CHOP_EXERCISES,
  CHOP_SLICES,
  CHOP_SOURCES,
  DYN_BANDS,
  FREE_CHOP,
  REPEAT_RATES,
  SECTION_PASS,
  SONG_FORMS,
  chopSourceNotes,
  noteRepeatPiece,
  repeatPerBeat,
  slicePad,
} from "../content/pads-studio";
import {
  GROOVE_VOICES,
  RUDIMENTS,
  RUDIMENT_DEFAULTS,
  SUBDIVISION_NAMES,
  rudimentHits,
  rudimentPerBeat,
} from "../content/winds-pads";
import { RUDIMENT_BANDS, inAccentBand, type Accent } from "../scoring/pads";
import { countName } from "./count";
import type { Lesson, LessonFigure, LessonScreen, LessonSound, LessonStep } from "./types";

// ---------------------------------------------------------------------------
// Shared pieces

export const BPM = 100;
const card = (id: string, title: string, ...screens: LessonScreen[]): Lesson => ({
  id,
  title,
  screens,
});

/** The edges of an accent band on the 0 to 127 scale, found from the grader's own `inAccentBand`. */
export function bandEdges(accent: Accent): [number, number] {
  const inside = Array.from({ length: 128 }, (_, v) => v).filter((v) =>
    inAccentBand(accent, v / 127),
  );
  return [inside[0], inside[inside.length - 1]];
}
const BANDS = {
  accent: bandEdges("accent"),
  normal: bandEdges("normal"),
  ghost: bandEdges("ghost"),
};
const mid = (b: readonly number[]) => (b[0] + b[1]) / 2;
/** A velocity (0 to 1) well inside each groove band. */
export const GROOVE_VEL: Record<Accent, number> = {
  accent: Math.round(mid(BANDS.accent)) / 127,
  normal: Math.round(mid(BANDS.normal)) / 127,
  ghost: Math.round(mid(BANDS.ghost)) / 127,
};
/** A velocity inside each rudiment band: the accent and the tap. */
export const RUDIMENT_VEL = { accent: mid(RUDIMENT_BANDS.accent), tap: mid(RUDIMENT_BANDS.tap) };

const voice = (id: string) => GROOVE_VOICES.find((v) => v.id === id)!;
const voiceName = (id: string) => voice(id).name.toLowerCase();
const padName = (midi: number) => `A${String(midi - 35).padStart(2, "0")}`;

interface Hit {
  voice: string;
  beat: number;
  accent?: Accent;
}
/** Drum hits as a sound: `beat` is in beats, `from` the beat that plays first, `shift` moves chosen hits (seconds). */
function soundOf(
  hits: readonly Hit[],
  opts: { bpm?: number; from?: number; shift?: (h: Hit) => number } = {},
): LessonSound {
  const bpm = opts.bpm ?? BPM;
  return {
    notes: hits.map((h) => ({
      midi: [voice(h.voice).midi],
      at: Math.max(0, ((h.beat - (opts.from ?? 0)) * 60) / bpm + (opts.shift?.(h) ?? 0)),
      dur: 0.12,
      drum: true,
      velocity: GROOVE_VEL[h.accent ?? "normal"],
    })),
  };
}

const LANE: Record<string, "hat" | "snare" | "kick"> = {
  hats: "hat",
  snare: "snare",
  kick: "kick",
};
/** The lesson grid for hits from a beat on: kick, snare and hats only (the grid has no other rows). */
function gridOf(
  hits: readonly Hit[],
  from: number,
  bars: number,
  only?: string[],
  barNumbers?: number[],
): LessonFigure {
  const lanes: Partial<Record<"hat" | "snare" | "kick", number[]>> = {};
  for (const h of hits) {
    const lane = LANE[h.voice];
    if (!lane || (only && !only.includes(lane))) continue;
    const b = h.beat - from;
    if (b < -1e-9 || b >= bars * 4 - 1e-9) continue;
    (lanes[lane] ??= []).push(b);
  }
  for (const k of Object.keys(lanes) as (keyof typeof lanes)[]) lanes[k]!.sort((a, b) => a - b);
  return { kind: "groove", bars, perBeat: 4, lanes, ...(barNumbers ? { barNumbers } : {}) };
}
const barHits = (g: GrooveDef, bar: number): Hit[] =>
  g.targets.filter((t) => Math.floor(t.beat / 4 + 1e-9) === bar);
const countsOf = (beats: number[], perBeat: 2 | 3 | 4 = 4) =>
  beats.map((b) => countName(b % 4, perBeat, 4));
const list = (xs: string[]) => formatList(xs);
const beatsOf = (hits: readonly Hit[], v: string, only?: Accent) =>
  hits
    .filter((h) => h.voice === v && (!only || (h.accent ?? "normal") === only))
    .map((h) => h.beat);

/** A figure of pads, each with its drum's name. */
const padsFigure = (marks: Record<number, string>): LessonFigure => ({
  kind: "pads",
  marks,
  names: Object.fromEntries(
    Object.keys(marks).map((m) => [
      Number(m),
      GROOVE_VOICES.find((v) => v.midi === Number(m))?.name ?? "",
    ]),
  ),
});

// ---------------------------------------------------------------------------
// Rudiments

/** SUBDIVISION_NAMES in the visitor's language, and capitalised as option labels. */
const SUB_NAMES: Record<number, () => string> = {
  2: m.music_lessons_pads_sub_2,
  3: m.music_lessons_pads_sub_3,
  4: m.music_lessons_pads_sub_4,
  6: m.music_lessons_pads_sub_6,
  8: m.music_lessons_pads_sub_8,
};
const subName = (n: number) => SUB_NAMES[n]?.() ?? SUBDIVISION_NAMES[n];
const SUB_LABELS: Record<number, () => string> = {
  2: m.music_lessons_pads_sub_label_2,
  3: m.music_lessons_pads_sub_label_3,
  4: m.music_lessons_pads_sub_label_4,
};

const hand = (h: string) => (h === "left" ? "L" : "R");
const sticking = (unit: readonly string[]) => unit.map(hand).join(" ");
export const mirror = (s: string) => s.replace(/[LR]/g, (c) => (c === "L" ? "R" : "L"));
const [LEFT_PAD, RIGHT_PAD] = RUDIMENT_DEFAULTS.pads;
const RUDIMENT_BPM = RUDIMENT_DEFAULTS.bpm;
const rudiment = (id: string) => RUDIMENTS.find((r) => r.id === id)!;

/** What a rudiment sounds like: its first four beats at the drill's default tempo and pads. */
function rudimentSound(id: string): LessonSound {
  const beatMs = 60000 / RUDIMENT_BPM;
  const hits = rudimentHits({
    patternId: id,
    subdivision: RUDIMENT_DEFAULTS.subdivision,
    hits: 64,
    bpm: RUDIMENT_BPM,
    pads: [LEFT_PAD, RIGHT_PAD],
  }).filter((h) => (h.grace ? h.atMs + MPC_RUDIMENTS.flamGraceMs : h.atMs) < 4 * beatMs - 1e-6);
  return {
    notes: hits.map((h) => ({
      midi: [h.pad],
      at: 0.05 + h.atMs / 1000,
      dur: 0.1,
      drum: true,
      velocity: h.grace
        ? 0.4
        : h.velocityBand
          ? h.accent
            ? RUDIMENT_VEL.accent
            : RUDIMENT_VEL.tap
          : 0.8,
    })),
  };
}
/** Which pads the two hands play, labelled L and R (one pad for a roll). */
const handPads = (id: string): LessonFigure => ({
  kind: "pads",
  marks: rudiment(id).onePad ? { [RIGHT_PAD]: "R L" } : { [LEFT_PAD]: "L", [RIGHT_PAD]: "R" },
});
/** Four beats of single strokes on a grid of 2, 3 or 4 a beat. */
const gridBeats = (perBeat: 2 | 3 | 4): LessonFigure => ({
  kind: "rhythm",
  bars: 1,
  perBeat,
  beatsPerBar: 4,
  onsets: Array.from({ length: 4 * perBeat }, (_, i) => i / perBeat),
});
const gridSound = (perBeat: number): LessonSound => ({
  notes: Array.from({ length: 4 * perBeat }, (_, i) => ({
    midi: [i % 2 ? RIGHT_PAD : LEFT_PAD],
    at: 0.05 + (i * 60) / RUDIMENT_BPM / perBeat,
    dur: 0.1,
    drum: true,
    velocity: 0.8,
  })),
});

/** The item a rudiment is taught under: Stick Control's sixteen share one card. */
export const rudimentItem = (id: string) => (rudiment(id)?.hits ? "stick-control" : id);
export const RUDIMENT_ITEMS = [...new Set(RUDIMENTS.map((r) => rudimentItem(r.id)))];

/** A band's edges as whole percentages. */
const percent = (b: readonly number[]) => [Math.round(b[0] * 100), Math.round(b[1] * 100)];

function rudimentsIntro(): Lesson {
  const single = sticking(rudiment("single-strokes").unit);
  const doubles = sticking(rudiment("double-strokes").unit);
  const drillPara = sticking(rudiment("paradiddle").unit);
  const accents = rudimentHits({
    patternId: "accents-ghosts",
    subdivision: 4,
    hits: 4,
    bpm: RUDIMENT_BPM,
    pads: [LEFT_PAD, RIGHT_PAD],
  });
  const bandSound = (even: boolean): LessonSound => ({
    notes: accents.map((h) => ({
      midi: [h.pad],
      at: 0.05 + h.atMs / 1000,
      dur: 0.1,
      drum: true,
      velocity: even || h.accent ? RUDIMENT_VEL.accent : RUDIMENT_VEL.tap,
    })),
  });
  const step = (text: string, id: string): LessonStep => ({
    text,
    sound: rudimentSound(id),
    figure: handPads(id),
  });
  return card(
    "pads.rudiments",
    m.music_lessons_pads_rud_title(),
    {
      title: m.music_lessons_pads_rud_two_hands_title(),
      text: m.music_lessons_pads_rud_two_hands_text({
        left: padName(LEFT_PAD),
        right: padName(RIGHT_PAD),
        sticking: drillPara,
      }),
      figure: handPads("single-strokes"),
      sound: rudimentSound("paradiddle"),
      // The sticking drawn on the pads: each Next lights the pad that plays the stroke.
      steps: rudiment("paradiddle").unit.map((h, i, unit) => ({
        text: m.music_lessons_pads_rud_stroke_step({ n: i + 1, hand: hand(h) }),
        figure: { kind: "pads", marks: { [h === "left" ? LEFT_PAD : RIGHT_PAD]: hand(h) } },
        sound: {
          notes: unit.slice(0, i + 1).map((x, j) => ({
            midi: [x === "left" ? LEFT_PAD : RIGHT_PAD],
            at: 0.05 + j * 0.22,
            dur: 0.1,
            drum: true,
            velocity: 0.8,
          })),
        },
      })),
    },
    {
      title: m.music_lessons_pads_rud_kinds_title(),
      text: m.music_lessons_pads_rud_kinds_text(),
      figure: handPads("single-strokes"),
      steps: [
        step(m.music_lessons_pads_rud_singles_step({ sticking: single }), "single-strokes"),
        step(m.music_lessons_pads_rud_doubles_step({ sticking: doubles }), "double-strokes"),
        step(
          m.music_lessons_pads_rud_para_step({
            paradiddle: PARADIDDLE.join(" "),
            sticking: drillPara,
          }),
          "paradiddle",
        ),
      ],
    },
    {
      title: m.music_lessons_pads_rud_accents_title(),
      text: m.music_lessons_pads_rud_accents_text({
        accentLow: percent(RUDIMENT_BANDS.accent)[0],
        accentHigh: percent(RUDIMENT_BANDS.accent)[1],
        tapLow: percent(RUDIMENT_BANDS.tap)[0],
        tapHigh: percent(RUDIMENT_BANDS.tap)[1],
      }),
      figure: handPads("accents-ghosts"),
      options: [
        { label: m.music_lessons_pads_rud_even(), sound: bandSound(true) },
        { label: m.music_lessons_pads_rud_accent_taps(), sound: bandSound(false) },
      ],
    },
    {
      title: m.music_lessons_pads_rud_sub_title(),
      text: m.music_lessons_pads_rud_sub_text(),
      figure: gridBeats(2),
      options: ([2, 3, 4] as const).map((n) => ({
        label: SUB_LABELS[n](),
        sound: gridSound(n),
        figure: gridBeats(n),
      })),
    },
  );
}

function rudimentCard(key: string): Lesson | null {
  const d =
    key === "stick-control" ? RUDIMENTS.find((r) => r.hits) : RUDIMENTS.find((r) => r.id === key);
  if (!d) return null;
  if (key === "stick-control") {
    return card("pads.rudiments:stick-control", "Stick Control", {
      title: "Stick Control",
      text: m.music_lessons_pads_stick_text({
        count: RUDIMENTS.filter((r) => r.hits).length,
        times: d.hits! / d.unit.length,
        sticking: sticking(d.unit),
      }),
      figure: handPads(d.id),
      sound: rudimentSound(d.id),
    });
  }
  const grid = d.subdivision
    ? m.music_lessons_pads_rud_timed({ sub: subName(d.subdivision) })
    : d.perBeat
      ? m.music_lessons_pads_rud_per_beat({
          counts: d.perBeat.join(", "),
          sub: subName(rudimentPerBeat(d, 2)),
        })
      : m.music_lessons_pads_rud_any_sub();
  const parts = [
    d.onePad
      ? m.music_lessons_pads_rud_one_pad({ sticking: sticking(d.unit) })
      : m.music_lessons_pads_rud_sticking({ sticking: sticking(d.unit) }),
    grid,
  ];
  if (d.flam) parts.push(m.music_lessons_pads_rud_flam({ ms: MPC_RUDIMENTS.flamGraceMs }));
  else if (d.accentMode === "moving") parts.push(m.music_lessons_pads_rud_moving());
  else if (d.accents)
    parts.push(
      d.accents.length === 1
        ? m.music_lessons_pads_rud_accent_one({ stroke: d.accents[0] + 1, count: d.unit.length })
        : m.music_lessons_pads_rud_accent_many({
            strokes: list(d.accents.map((i) => String(i + 1))),
            count: d.unit.length,
          }),
    );
  return card(`pads.rudiments:${key}`, d.label, {
    title: d.label,
    text: parts.join(" "),
    figure: handPads(d.id),
    sound: rudimentSound(d.id),
  });
}

// ---------------------------------------------------------------------------
// Grooves from level 3

/** The groove the sixteenths lesson counts: sixteenth hats with ghost snares. */
const SIXTEENTH_GROOVE = () => repertoireFor("funk-sixteenths")!;
const SWUNG = () => repertoireFor("swing-62")!.swing!;
const hatsOnSixteenths = (swing = 50): Hit[] =>
  Array.from({ length: 16 }, (_, i) => ({
    voice: "hats",
    beat: Math.floor(i / 4) + swungBeat(i % 4, swing, 4),
  }));

/** Whether a groove has rolls: notes finer than sixteenths on a plain (unswung) four-step grid. */
export const hasRolls = (r: RepertoireGroove) =>
  !r.swing &&
  (r.groove.stepsPerBeat ?? 4) === 4 &&
  r.groove.targets.some((t) => Math.abs(t.beat * 4 - Math.round(t.beat * 4)) > 1e-6);

/** Topics with an idea of their own (the sixteenths lesson covers ghosts; Latin grooves start at level 2). */
export const CARD_TOPICS = [
  "independence",
  "fills",
  "breaks",
  "shuffle",
  "meter",
  "latin",
  "dance",
  "swing",
];
/**
 * The cards a groove adds on top of the sixteenths lesson: its topic's idea, the Dilla push, and rolls.
 * Below level 3 only the Latin card, and the swing card when the player picked a swing.
 */
export function grooveLessonItems(r: RepertoireGroove, swing = r.swing ?? 50): string[] {
  if (r.level < 3)
    return [...(r.topic === "latin" ? ["latin"] : []), ...(swing !== 50 ? ["swing"] : [])];
  const topic =
    r.topic === "independence"
      ? isLinear(r.groove)
        ? "linear"
        : "independence"
      : r.topic === "breaks" && r.groove.bars < 2
        ? null
        : CARD_TOPICS.includes(r.topic)
          ? r.topic
          : null;
  return [
    ...(topic ? [topic] : []),
    ...(r.groove.value === "dilla" ? ["dilla"] : []),
    ...(hasRolls(r) ? ["rolls"] : []),
  ];
}
/** A linear groove never has two drums on the same onset. */
export const isLinear = (g: GrooveDef) =>
  new Set(g.targets.map((t) => Math.round(t.beat * 1000))).size === g.targets.length;

function sixteenthsLesson(): Lesson {
  const r = SIXTEENTH_GROOVE();
  const bar = barHits(r.groove, 0);
  const part = (keep: (h: Hit) => boolean) => bar.filter(keep);
  const hatEvery = beatsOf(bar, "hats").length === 16;
  const swung = SWUNG();
  const ghostBar = (loud: boolean): LessonSound =>
    soundOf(
      bar.map((h) => (loud && h.accent === "ghost" ? { ...h, accent: "normal" as const } : h)),
    );
  const stepAt = (text: string, keep: (h: Hit) => boolean): LessonStep => ({
    text,
    sound: soundOf(part(keep)),
    figure: gridOf(part(keep), 0, 1),
  });
  return card(
    "pads.grooves.sixteenths",
    m.music_lessons_pads_six_title(),
    {
      title: m.music_lessons_pads_six_count_title(),
      text: m.music_lessons_pads_six_count_text(),
      figure: gridOf(hatsOnSixteenths(), 0, 1),
      sound: soundOf(hatsOnSixteenths()),
    },
    {
      title: m.music_lessons_pads_six_bar_title(),
      text: m.music_lessons_pads_six_bar_text({ groove: r.groove.label }),
      figure: gridOf([], 0, 1),
      steps: [
        stepAt(
          hatEvery
            ? m.music_lessons_pads_six_hat_every()
            : m.music_lessons_pads_six_hat_on({ counts: list(countsOf(beatsOf(bar, "hats"))) }),
          (h) => h.voice === "hats",
        ),
        stepAt(
          m.music_lessons_pads_six_kick({ counts: list(countsOf(beatsOf(bar, "kick"))) }),
          (h) => h.voice === "hats" || h.voice === "kick",
        ),
        stepAt(
          m.music_lessons_pads_six_backbeat({
            counts: list(countsOf(beatsOf(bar, "snare", "accent"))),
          }),
          (h) => h.accent !== "ghost",
        ),
        stepAt(
          m.music_lessons_pads_six_ghosts({
            counts: list(countsOf(beatsOf(bar, "snare", "ghost"))),
          }),
          () => true,
        ),
      ],
    },
    {
      title: m.music_lessons_pads_six_ghost_title(),
      text: m.music_lessons_pads_six_ghost_text({
        ghostLow: BANDS.ghost[0],
        ghostHigh: BANDS.ghost[1],
        normalLow: BANDS.normal[0],
        normalHigh: BANDS.normal[1],
        accentLow: BANDS.accent[0],
      }),
      options: [
        { label: m.music_lessons_pads_ghosts(), sound: ghostBar(false) },
        { label: m.music_lessons_pads_too_loud(), sound: ghostBar(true) },
      ],
    },
    {
      title: m.music_lessons_pads_swing_title(),
      text: m.music_lessons_pads_six_swing_text({ swung }),
      options: [
        { label: m.music_lessons_pads_straight(), sound: soundOf(hatsOnSixteenths(50)) },
        { label: m.music_lessons_pads_swung(), sound: soundOf(hatsOnSixteenths(swung)) },
      ],
    },
  );
}

const GROOVE_OF = (id: string) => repertoireFor(id)!.groove;
/** The tresillo, in beats: 3 + 3 + 2 sixteenths. */
export const TRESILLO = [0, 0.75, 1.5];
/** The groove the Latin card shows, and the ones it names as playing the tresillo on the snare. */
export const TRESILLO_GROOVE = "dancehall";
export const TRESILLO_ALSO = ["reggaeton", "soca"];
/** The pads page's Swing choice (MPC swing, 50 straight to 75). */
export const SWING_CHOICES = [50, 54, 56, 58, 60, 62, 66, 70, 75];
const firstBar = (g: GrooveDef): Hit[] => g.targets.filter((t) => t.beat < (g.beatsPerBar ?? 4));

function grooveCard(item: string): Lesson | null {
  const id = `pads.grooves:${item}`;
  if (item === "independence") {
    const g = GROOVE_OF("independence");
    const hits: Hit[] = g.targets.filter((t) => t.beat < 8);
    return card(id, m.music_lessons_pads_independence_title(), {
      title: m.music_lessons_pads_independence_title(),
      text: m.music_lessons_pads_independence_text({ groove: g.label }),
      figure: gridOf(hits, 0, 2),
      sound: soundOf(hits),
    });
  }
  if (item === "linear") {
    const g = GROOVE_OF("linear-singles");
    const hits: Hit[] = firstBar(g);
    return card(id, m.music_lessons_pads_linear_title(), {
      title: m.music_lessons_pads_linear_title(),
      text: m.music_lessons_pads_linear_text({ groove: g.label }),
      figure: gridOf(hits, 0, 1),
      sound: soundOf(hits),
    });
  }
  if (item === "fills") {
    const g = GROOVE_OF("fill-one-beat");
    const hits: Hit[] = g.targets.filter((t) => t.beat >= 8 && t.beat < 16);
    return card(id, m.music_lessons_pads_fills_title(), {
      title: m.music_lessons_pads_fills_title(),
      text: m.music_lessons_pads_fills_groove_text({ groove: g.label }),
      figure: gridOf(hits, 8, 2),
      sound: soundOf(hits, { from: 8 }),
    });
  }
  if (item === "rolls") {
    const g = GROOVE_OF("trap-32");
    const hats = barHits(g, 0).filter((t) => t.voice === "hats");
    return card(id, m.music_lessons_pads_rolls_title(), {
      title: m.music_lessons_pads_rolls_title(),
      text: m.music_lessons_pads_rolls_text({
        per32: repeatPerBeat("1/32"),
        per16t: repeatPerBeat("1/16T"),
        groove: g.label,
      }),
      sound: soundOf(hats),
    });
  }
  if (item === "breaks") {
    const g = GROOVE_OF("amen");
    const hits: Hit[] = g.targets
      .filter((t) => t.beat < 4 || (t.beat >= 12 && t.beat < 16))
      .map((t) => (t.beat >= 12 ? { ...t, beat: t.beat - 8 } : t));
    return card(id, m.music_lessons_pads_breaks_title(), {
      title: m.music_lessons_pads_breaks_title(),
      text: m.music_lessons_pads_breaks_text({ groove: g.label, bars: g.bars }),
      figure: gridOf(hits, 0, 2, ["kick", "snare"], [1, 4]),
      sound: soundOf(hits),
    });
  }
  if (item === "shuffle") {
    const g = GROOVE_OF("blues-shuffle");
    const hats = firstBar(g).filter((t) => t.voice === "hats");
    return card(id, m.music_lessons_pads_shuffle_title(), {
      title: m.music_lessons_pads_shuffle_title(),
      text: m.music_lessons_pads_shuffle_text({ groove: g.label }),
      figure: {
        kind: "rhythm",
        bars: 1,
        perBeat: 3,
        beatsPerBar: 4,
        onsets: hats.map((t) => t.beat),
      },
      sound: soundOf(firstBar(g)),
    });
  }
  if (item === "meter") {
    const g = GROOVE_OF("five-four");
    return card(id, m.music_lessons_pads_meter_title(), {
      title: m.music_lessons_pads_meter_title(),
      text: m.music_lessons_pads_meter_text(),
      sound: soundOf(firstBar(g)),
    });
  }
  if (item === "latin") {
    const g = GROOVE_OF(TRESILLO_GROOVE);
    const bar = firstBar(g);
    const twice = [...TRESILLO, ...TRESILLO.map((b) => b + 2)];
    return card(
      id,
      m.music_lessons_pads_latin_title(),
      {
        title: m.music_lessons_pads_latin_332_title(),
        text: m.music_lessons_pads_latin_332_text({
          first: list(countsOf(TRESILLO)),
          again: list(countsOf(TRESILLO.map((b) => b + 2))),
        }),
        figure: { kind: "rhythm", bars: 1, perBeat: 4, beatsPerBar: 4, onsets: twice },
        sound: soundOf(twice.map((beat) => ({ voice: "rim", beat }))),
      },
      {
        title: m.music_lessons_pads_latin_groove_title(),
        text: m.music_lessons_pads_latin_groove_text({
          groove: g.label,
          styles: list(TRESILLO_ALSO.map((v) => repertoireFor(v)!.style)),
          grooveLower: g.label.toLowerCase(),
        }),
        figure: gridOf(bar, 0, 1),
        sound: soundOf(bar),
      },
    );
  }
  if (item === "dance") {
    const house = GROOVE_OF("house");
    const trap = repertoireFor("trap-32")!;
    const dnb = repertoireFor("dnb")!;
    const clap = beatsOf(firstBar(trap.groove), "perc");
    const dnbKick = beatsOf(firstBar(dnb.groove), "kick");
    const houseBar = firstBar(house);
    return card(
      id,
      m.music_lessons_pads_dance_title(),
      {
        title: m.music_lessons_pads_dance_floor_title(),
        text: m.music_lessons_pads_dance_floor_text({ groove: house.label }),
        figure: padsFigure(
          Object.fromEntries(
            [...new Set(houseBar.map((h) => voice(h.voice).midi))].map((m) => [m, ""]),
          ),
        ),
        sound: soundOf(houseBar),
      },
      {
        title: m.music_lessons_pads_dance_half_title(),
        text: m.music_lessons_pads_dance_half_text({
          clap: list(countsOf(clap)),
          kick: list(countsOf(dnbKick)),
          bpm: dnb.bpm.target,
        }),
        options: [
          { label: "Trap", sound: soundOf(firstBar(trap.groove), { bpm: trap.bpm.start }) },
          { label: "Drum and bass", sound: soundOf(firstBar(dnb.groove), { bpm: dnb.bpm.start }) },
        ],
      },
    );
  }
  if (item === "swing") {
    const swings = PAD_REPERTOIRE.filter((r) => r.topic === "swing" && r.groove.value !== "dilla")
      .map((r) => r.swing!)
      .sort((a, b) => a - b);
    return card(
      id,
      m.music_lessons_pads_swing_title(),
      {
        title: m.music_lessons_pads_swing_late_title(),
        text: m.music_lessons_pads_swing_late_text({
          min: SWING_CHOICES[0],
          max: SWING_CHOICES[SWING_CHOICES.length - 1],
        }),
        options: [50, ...swings].map((w) => ({
          label:
            w === 50
              ? m.music_lessons_pads_straight()
              : m.music_lessons_pads_swing_option({ amount: w }),
          sound: soundOf(hatsOnSixteenths(w)),
        })),
      },
      {
        title: m.music_lessons_pads_swing_feel_title(),
        text: m.music_lessons_pads_swing_feel_text(),
      },
    );
  }
  if (item === "dilla") {
    const r = repertoireFor("dilla")!;
    const bar = firstBar(r.groove);
    const early = Math.min(...beatsOf(bar, "snare").map((b) => Math.ceil(b) - b));
    const ms = Math.round((early * 60000) / r.bpm.target);
    const onBeat = bar.map((h) => (h.voice === "snare" ? { ...h, beat: Math.round(h.beat) } : h));
    return card(id, r.groove.label, {
      title: r.groove.label,
      text: m.music_lessons_pads_dilla_text({ swing: r.swing!, ms, bpm: r.bpm.target }),
      options: [
        { label: m.music_lessons_pads_pushed(), sound: soundOf(bar, { bpm: r.bpm.target }) },
        {
          label: m.music_lessons_pads_on_the_beat(),
          sound: soundOf(onBeat, { bpm: r.bpm.target }),
        },
      ],
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fills

const FILL_EXAMPLE = "snare-eighths";
/** How far the late landing and the rushed fill are moved, in ms: past the drill's limits, inside its matching window at 100 BPM. */
export const FILL_DEMO_MS = 60;

function fillsIntro(): Lesson {
  const g = fillGroove(FILL_EXAMPLE);
  const hits: Hit[] = g.targets;
  const third = hits.filter((h) => h.beat >= 8);
  const grid = [
    ...hits.filter((h) => h.beat < 4),
    ...hits.filter((h) => h.beat >= 12 && h.beat < 16).map((h) => ({ ...h, beat: h.beat - 8 })),
  ];
  const ms = FILL_DEMO_MS / 1000;
  const play = (shift?: (h: Hit) => number) => soundOf(third, { from: 8, shift });
  return card(
    "pads.fills",
    m.music_lessons_pads_fills_title(),
    {
      title: m.music_lessons_pads_fills_run_title(),
      text: m.music_lessons_pads_fills_run_text(),
      figure: gridOf(grid, 0, 2),
      sound: play(),
    },
    {
      title: m.music_lessons_pads_fills_land_title(),
      text: m.music_lessons_pads_fills_land_text({ ms: FILL.landMs, demo: FILL_DEMO_MS }),
      figure: gridOf(grid, 0, 2),
      options: [
        { label: m.music_lessons_pads_landed(), sound: play() },
        {
          label: m.music_lessons_pads_late(),
          sound: play((h) => (g.landing.includes(hits.indexOf(h)) ? ms : 0)),
        },
      ],
    },
    {
      title: m.music_lessons_pads_fills_rush_title(),
      text: m.music_lessons_pads_fills_rush_text({ ms: FILL.rushMs, demo: FILL_DEMO_MS }),
      figure: gridOf(grid, 0, 2),
      options: [
        { label: m.music_lessons_pads_on_time(), sound: play() },
        {
          label: m.music_lessons_pads_rushed(),
          sound: play((h) => (g.fill.includes(hits.indexOf(h)) ? -ms : 0)),
        },
      ],
    },
  );
}

function fillCard(id: string): Lesson | null {
  const fill = PAD_FILLS.find((f) => f.id === id);
  if (!fill) return null;
  const g = fillGroove(id);
  const hits: Hit[] = g.targets;
  const voices = [...new Set([...Object.keys(fill.bar), "crash"])];
  const marks = Object.fromEntries(voices.map((v) => [voice(v).midi, ""]));
  return card(`pads.fills:${id}`, fill.label, {
    title: fill.label,
    text: (fill.groove
      ? m.music_lessons_pads_fill_card_shuffle
      : m.music_lessons_pads_fill_card_rock)({
      count: g.fill.length,
    }),
    figure: padsFigure(marks),
    sound: soundOf(
      hits.filter((h) => h.beat >= 8),
      { from: 8 },
    ),
  });
}

// ---------------------------------------------------------------------------
// Play it back

/** One round of a level: the call, and the answer it asks for in the bar after. */
export const echoRound = (levelId: string, round = 0) => {
  const g = echoGroove(levelId);
  const inRound = (t: { beat: number }) => Math.floor(t.beat / 8) === round;
  return { call: g.calls.filter(inRound) as Hit[], answer: g.targets.filter(inRound) as Hit[] };
};

function echoIntro(): Lesson {
  const { call, answer } = echoRound(ECHO_LEVELS[0].id);
  const kick = list(countsOf(beatsOf(call, "kick")));
  const snare = list(countsOf(beatsOf(call, "snare")));
  return card(
    "pads.echo",
    m.music_lessons_pads_echo_title(),
    {
      title: m.music_lessons_pads_echo_listen_title(),
      text: m.music_lessons_pads_echo_listen_text(),
      figure: gridOf([...call, ...answer], 0, 2),
    },
    {
      title: m.music_lessons_pads_echo_round_title(),
      text: m.music_lessons_pads_echo_round_text(),
      figure: gridOf([], 0, 1),
      steps: [
        {
          text: m.music_lessons_pads_echo_call({ kick, snare }),
          figure: gridOf(call, 0, 1),
          sound: soundOf(call),
        },
        {
          text: m.music_lessons_pads_echo_answer(),
          figure: gridOf(answer, 4, 1),
          sound: soundOf(answer, { from: 4 }),
        },
        {
          text: m.music_lessons_pads_echo_together(),
          figure: gridOf(answer, 4, 1),
          sound: soundOf([...call, ...answer]),
        },
      ],
    },
    {
      title: m.music_lessons_pads_echo_pass_title(),
      text: m.music_lessons_pads_echo_pass_text({ pass: Math.round(ECHO_PASS * 100) }),
    },
  );
}

/** The drums a level plays, and whether any call has a ghost note. */
export function echoVoices(levelId: string) {
  const lvl = ECHO_LEVELS.find((l) => l.id === levelId)!;
  const names = new Set<string>();
  let ghosts = false;
  for (const c of lvl.calls)
    for (const [v, line] of Object.entries(c)) {
      names.add(v);
      if (line.includes("g")) ghosts = true;
    }
  return { voices: [...names], ghosts };
}
function echoCard(levelId: string): Lesson | null {
  const lvl = ECHO_LEVELS.find((l) => l.id === levelId);
  if (!lvl) return null;
  const { voices, ghosts } = echoVoices(levelId);
  const { call } = echoRound(levelId);
  const parts = [m.music_lessons_pads_echo_level_plays({ drums: list(voices.map(voiceName)) })];
  if (ghosts) parts.push(m.music_lessons_pads_echo_level_ghosts());
  parts.push(m.music_lessons_pads_echo_level_grid());
  return card(`pads.echo:${levelId}`, lvl.label, {
    title: lvl.label,
    text: parts.join(" "),
    figure: gridOf(call, 0, 1),
    sound: soundOf(call),
  });
}

// ---------------------------------------------------------------------------
// Ostinato and a line

/** Bar 3 of a reading line, the first with the line over the ostinato, as one bar from beat 0. */
export const lineBar = (id: string, line?: string): Hit[] =>
  barHits(ostinatoGroove(id, { lines: line ? [line, line, line, line] : undefined }), 2).map(
    (h) => ({
      ...h,
      beat: h.beat - 8,
    }),
  );

function ostinatoIntro(): Lesson {
  const id = "backbeat-push";
  const withLine = lineBar(id);
  const alone = withLine.filter((h) => h.voice === "hats");
  const hatsName = voiceName(ostinatoGroove("quarters").ostinato);
  const claveName = voiceName(ostinatoGroove("clave").ostinato);
  return card(
    "pads.ostinato",
    m.music_lessons_pads_ost_title(),
    {
      title: m.music_lessons_pads_ost_keep_title(),
      text: m.music_lessons_pads_ost_keep_text({ hats: hatsName, clave: claveName }),
      figure: gridOf(withLine, 0, 1),
    },
    {
      title: m.music_lessons_pads_ost_hats_title(),
      text: m.music_lessons_pads_ost_hats_text(),
      figure: gridOf([], 0, 1),
      steps: [
        {
          text: m.music_lessons_pads_ost_hats_step({
            counts: list(countsOf(beatsOf(alone, "hats"), 2)),
          }),
          figure: gridOf(alone, 0, 1),
          sound: soundOf(alone),
        },
        {
          text: m.music_lessons_pads_ost_line_step({
            counts: list(countsOf(beatsOf(withLine, "snare"))),
          }),
          figure: gridOf(withLine, 0, 1),
          sound: soundOf(withLine),
        },
      ],
    },
    {
      title: m.music_lessons_pads_ost_scored_title(),
      text: m.music_lessons_pads_ost_scored_text({ drop: Math.round(OSTINATO.maxDrop * 100) }),
    },
  );
}

/** Who reads the line, by INTERPRETATIONS id. */
const READERS: Record<(typeof INTERPRETATIONS)[number]["id"], () => string> = {
  snare: m.music_lessons_pads_reader_snare,
  kick: m.music_lessons_pads_reader_kick,
};

function ostinatoCard(id: string): Lesson | null {
  const line = READING_LINES.find((l) => l.id === id);
  if (!line) return null;
  const cid = `pads.ostinato:${id}`;
  if (id === "clave") {
    const bar = lineBar("clave");
    const rim = beatsOf(bar, "rim");
    return card(cid, line.label, {
      title: line.label,
      text: m.music_lessons_pads_ost_clave_text({ counts: list(countsOf(rim)) }),
      figure: {
        kind: "rhythm",
        bars: 1,
        perBeat: 4,
        beatsPerBar: 4,
        onsets: rim.map((b) => b % 4),
      },
      sound: soundOf(bar),
    });
  }
  if (id === "read") {
    const hits = lineBar("read", readingLines(rng(7), 1)[0]);
    return card(cid, line.label, {
      title: line.label,
      text: m.music_lessons_pads_ost_read_text({
        readers: formatList(
          INTERPRETATIONS.map((x) => READERS[x.id]()),
          "disjunction",
        ),
      }),
      figure: gridOf(hits, 0, 1),
      sound: soundOf(hits),
    });
  }
  const hits = lineBar(id);
  return card(cid, line.label, {
    title: line.label,
    text: m.music_lessons_pads_ost_line_text({ counts: list(countsOf(beatsOf(hits, "snare"))) }),
    figure: gridOf(hits, 0, 1),
    sound: soundOf(hits),
  });
}

// ---------------------------------------------------------------------------
// Rudiments on the kit

/** Each pad a paradiddle orchestration uses, with the hands that play it (K for the kick under the accents). */
export function orchestraPads(id: string): Record<number, string> {
  const g = orchestrationGroove(id);
  const marks: Record<number, Set<string>> = {};
  g.targets
    .filter((t) => t.voice !== "kick")
    .forEach((t, i) => (marks[voice(t.voice).midi] ??= new Set()).add(PARADIDDLE[i % 8]));
  if (g.targets.some((t) => t.voice === "kick")) (marks[voice("kick").midi] ??= new Set()).add("K");
  return Object.fromEntries(Object.entries(marks).map(([m, hs]) => [m, [...hs].join(" ")]));
}
const orchestraBar = (id: string): Hit[] => barHits(orchestrationGroove(id), 0);

function orchestrateIntro(): Lesson {
  const o = ORCHESTRATIONS[0];
  const bar = orchestraBar(o.id);
  const group = (n: number) => bar.filter((h) => h.beat >= n && h.beat < n + 1);
  return card(
    "pads.orchestrate",
    m.music_lessons_pads_orch_title(),
    {
      title: m.music_lessons_pads_orch_sticking_title(),
      figure: padsFigure(orchestraPads(o.id)),
      text: m.music_lessons_pads_orch_sticking_text({ paradiddle: PARADIDDLE.join(" ") }),
    },
    {
      title: m.music_lessons_pads_orch_which_title(),
      text: m.music_lessons_pads_orch_which_text({ detail: o.detail, choice: o.label }),
      figure: padsFigure(orchestraPads(o.id)),
    },
    {
      title: m.music_lessons_pads_orch_hear_title(),
      text: m.music_lessons_pads_orch_hear_text(),
      figure: padsFigure(orchestraPads(o.id)),
      steps: [
        {
          text: m.music_lessons_pads_orch_first({ sticking: PARADIDDLE.slice(0, 4).join(" ") }),
          sound: soundOf(group(0), { bpm: 90 }),
        },
        {
          text: m.music_lessons_pads_orch_second({ sticking: PARADIDDLE.slice(4).join(" ") }),
          sound: soundOf(group(1), { bpm: 90, from: 1 }),
        },
        {
          text: m.music_lessons_pads_orch_whole(),
          sound: soundOf(bar, { bpm: 90 }),
        },
      ],
    },
  );
}

function orchestrateCard(id: string): Lesson | null {
  const o = ORCHESTRATIONS.find((x) => x.id === id);
  if (!o) return null;
  const kick = orchestrationGroove(id).targets.some((t) => t.voice === "kick");
  return card(`pads.orchestrate:${id}`, o.label, {
    title: o.label,
    text: (kick
      ? m.music_lessons_pads_orch_card_text
      : m.music_lessons_pads_orch_card_text_no_kick)({
      detail: o.detail,
    }),
    figure: padsFigure(orchestraPads(id)),
    sound: soundOf(orchestraBar(id), { bpm: 90 }),
  });
}

// ---------------------------------------------------------------------------
// Note repeat

/** The rates a note repeat exercise sets, in the order it first uses them. */
export function repeatRates(exercise: string): string[] {
  const piece = noteRepeatPiece(exercise);
  const rates: string[] = [];
  for (let b = 0; b < piece.bars * 4; b++) {
    const r = piece.rateAt(b);
    if (!rates.includes(r)) rates.push(r);
  }
  return rates;
}

function repeatIntro(): Lesson {
  const build = noteRepeatPiece("build");
  const bars: Record<string, number> = {};
  for (const l of build.sectionLabels) if (l !== "drop") bars[l] = (bars[l] ?? 0) + 1;
  const runs = Object.entries(bars).map(([rate, n]) =>
    m.music_lessons_pads_repeat_run({
      count: n,
      n: n === 2 ? m.music_lessons_pads_two() : n,
      rate,
    }),
  );
  return card(
    "pads.repeat",
    m.music_lessons_pads_repeat_title(),
    {
      title: m.music_lessons_pads_hold_title(),
      text: m.music_lessons_pads_hold_text(),
      // One held pad: eighths for two beats, then sixteenths when the rate changes.
      figure: gridOf(
        [0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75].map((beat) => ({
          voice: "snare",
          beat,
          accent: "normal" as const,
        })),
        0,
        1,
      ),
    },
    {
      title: m.music_lessons_pads_pressure_title(),
      text: m.music_lessons_pads_pressure_text(),
    },
    {
      title: m.music_lessons_pads_builds_title(),
      text: m.music_lessons_pads_builds_text({
        runs: list(runs),
        span: Math.round(BUILD.span * 100),
      }),
    },
  );
}

function repeatCard(rate: string): Lesson | null {
  const r = REPEAT_RATES.find((x) => x.id === rate);
  if (!r) return null;
  const hits: Hit[] = Array.from({ length: r.perBeat * 2 }, (_, i) => ({
    voice: "snare",
    beat: i / r.perBeat,
    accent: "normal",
  }));
  return card(`pads.repeat:${rate}`, m.music_lessons_pads_rate_title({ rate }), {
    title: m.music_lessons_pads_rate_title({ rate }),
    text: m.music_lessons_pads_rate_text({ rate, count: r.perBeat, sub: subName(r.perBeat) }),
    sound: soundOf(hits),
  });
}

// ---------------------------------------------------------------------------
// Song form

const SONG_LEVELS = ["soft", "medium", "loud"] as const;
/** Eight snare hits at a level in the player's range (the drill's default range until they set one). */
export function dynamicsSound(id: (typeof SONG_LEVELS)[number] | "rising"): LessonSound {
  const at = (i: number) => (id === "rising" ? 0.1 + (0.8 * i) / 7 : mid(DYN_BANDS[id]));
  return {
    notes: Array.from({ length: 8 }, (_, i) => ({
      midi: [voice("snare").midi],
      at: (i * 0.5 * 60) / BPM,
      dur: 0.12,
      drum: true,
      velocity: DEFAULT_RANGE.soft + at(i) * (DEFAULT_RANGE.loud - DEFAULT_RANGE.soft),
    })),
  };
}

/** A section's level as a button label, and as a word in a sentence. */
const LEVEL_LABELS = {
  soft: m.music_lessons_pads_level_soft,
  medium: m.music_lessons_pads_level_medium,
  loud: m.music_lessons_pads_level_loud,
  rising: m.music_lessons_pads_level_rising,
};
const LEVEL_WORDS: Record<string, () => string> = {
  soft: m.music_lessons_pads_dyn_soft,
  medium: m.music_lessons_pads_dyn_medium,
  loud: m.music_lessons_pads_dyn_loud,
  rising: m.music_lessons_pads_dyn_rising,
};

function songIntro(): Lesson {
  return card(
    "pads.song",
    m.music_lessons_pads_song_title(),
    {
      title: m.music_lessons_pads_take_title(),
      text: m.music_lessons_pads_take_text(),
      // Four bars as four sections: an intro on the hats, a groove, a snare build, a drop on the one.
      figure: gridOf(
        [
          ...[0, 1, 2, 3].map((beat) => ({ voice: "hats", beat })),
          ...[4, 5, 6, 7].map((beat) => ({ voice: "hats", beat })),
          { voice: "kick", beat: 4 },
          { voice: "kick", beat: 6 },
          { voice: "snare", beat: 5 },
          { voice: "snare", beat: 7 },
          ...[8, 8.5, 9, 9.5, 10, 10.5, 11, 11.25, 11.5, 11.75].map((beat) => ({
            voice: "snare",
            beat,
          })),
          { voice: "kick", beat: 12 },
        ].map((h) => ({ ...h, accent: "normal" as const })),
        0,
        4,
      ),
    },
    {
      title: m.music_lessons_pads_levels_title(),
      text: m.music_lessons_pads_levels_text({
        softLow: percent(DYN_BANDS.soft)[0],
        softHigh: percent(DYN_BANDS.soft)[1],
        mediumLow: percent(DYN_BANDS.medium)[0],
        mediumHigh: percent(DYN_BANDS.medium)[1],
        loudLow: percent(DYN_BANDS.loud)[0],
        loudHigh: percent(DYN_BANDS.loud)[1],
      }),
      options: [
        ...SONG_LEVELS.map((l) => ({ label: LEVEL_LABELS[l](), sound: dynamicsSound(l) })),
        { label: LEVEL_LABELS.rising(), sound: dynamicsSound("rising") },
      ],
    },
    {
      title: m.music_lessons_pads_section_pass_title(),
      text: m.music_lessons_pads_section_pass_text({
        matched: Math.round(SECTION_PASS.matched * 100),
        extra: Math.round(SECTION_PASS.extraShare * 100),
      }),
    },
  );
}

function songCard(id: string): Lesson | null {
  const f = SONG_FORMS.find((x) => x.id === id);
  if (!f) return null;
  return card(`pads.song:${id}`, f.label, {
    title: f.label,
    text: m.music_lessons_pads_song_card_text({
      sections: f.sections
        .map((x) =>
          m.music_lessons_pads_song_section({
            label: x.label,
            bars: x.bars,
            dyn: LEVEL_WORDS[x.dyn]?.() ?? x.dyn,
          }),
        )
        .join(", "),
      start: f.bpm.start,
      target: f.bpm.target,
    }),
  });
}

// ---------------------------------------------------------------------------
// Chop

const slices = (steps: readonly number[]) =>
  steps.map((s) => (s ? String(s) : m.music_lessons_pads_gap())).join(", ");
/** How long a slice of an `n`-bar loop is. */
export const sliceWord = (bars: number) => {
  const beats = (bars * 4) / CHOP_SLICES;
  return beats === 0.25
    ? m.music_lessons_pads_slice_sixteenths()
    : beats === 0.5
      ? m.music_lessons_pads_slice_eighths()
      : beats === 1
        ? m.music_lessons_pads_slice_beats()
        : m.music_lessons_pads_slice_n_beats({ n: beats });
};

function chopIntro(): Lesson {
  const src = CHOP_SOURCES[0];
  const flip = CHOP_EDITS.find((e) => e.id === "flip")!;
  const played = new Set(flip.steps);
  const never = Array.from({ length: CHOP_SLICES }, (_, i) => i + 1).filter((n) => !played.has(n));
  const srcNotes = chopSourceNotes(src.id);
  const sliceBeats = (src.bars * 4) / CHOP_SLICES;
  /** Slices 1 to `n` lit on their pads, by number. */
  const lit = (n: number): LessonFigure => ({
    kind: "pads",
    marks: Object.fromEntries(Array.from({ length: n }, (_, i) => [slicePad(i), String(i + 1)])),
  });
  return card(
    "pads.chop",
    m.music_lessons_pads_chop_title(),
    {
      title: m.music_lessons_pads_chop_loop_title(),
      text: m.music_lessons_pads_chop_loop_text({
        count: CHOP_SLICES,
        first: padName(slicePad(0)),
        last: padName(slicePad(CHOP_SLICES - 1)),
        loop: src.label.toLowerCase(),
      }),
      figure: lit(1),
      sound: {
        notes: srcNotes.map((n) => ({
          midi: [n.midi],
          at: (n.beat * 60) / src.bpm,
          dur: 0.12,
          drum: true,
          velocity: n.velocity,
        })),
      },
      // Each Next lights the next slice's pad and plays that slice alone.
      steps: [1, 2, 3, 4].map((k) => ({
        text: m.music_lessons_pads_chop_slice_step({ n: k, pad: padName(slicePad(k - 1)) }),
        figure: lit(k),
        sound: {
          notes: srcNotes
            .filter((n) => n.beat >= (k - 1) * sliceBeats - 1e-6 && n.beat < k * sliceBeats - 1e-6)
            .map((n) => ({
              midi: [n.midi],
              at: ((n.beat - (k - 1) * sliceBeats) * 60) / src.bpm,
              dur: 0.12,
              drum: true,
              velocity: n.velocity,
            })),
        },
      })),
    },
    {
      title: m.music_lessons_pads_chop_len_title(),
      text: m.music_lessons_pads_chop_len_text({
        one: sliceWord(1),
        two: sliceWord(2),
        four: sliceWord(4),
        count: CHOP_SLICES,
      }),
    },
    {
      title: m.music_lessons_pads_chop_up_title(),
      text: m.music_lessons_pads_chop_up_text({
        edit: flip.label.split(":")[0],
        slices: slices(flip.steps),
        never: list(never.map(String)),
      }),
    },
  );
}

function chopCard(item: string): Lesson | null {
  if (item.startsWith("edit:")) {
    const e = CHOP_EDITS.find((x) => x.id === item.slice(5));
    if (!e) return null;
    const src = e.source ? CHOP_SOURCES.find((s) => s.id === e.source) : null;
    const step =
      e.every === 0.25
        ? m.music_lessons_pads_chop_step_sixteenth()
        : e.every === 0.5
          ? m.music_lessons_pads_chop_step_eighth()
          : m.music_lessons_pads_chop_step_beat();
    const [name, ...rest] = e.label.split(":");
    const desc = rest.join(":").trim();
    const plays = e.steps.includes(0)
      ? m.music_lessons_pads_chop_edit_plays_gap
      : m.music_lessons_pads_chop_edit_plays;
    return card(`pads.chop:${item}`, name, {
      title: name,
      text: [
        ...(desc ? [`${desc[0].toUpperCase()}${desc.slice(1)}.`] : []),
        plays({ step, slices: slices(e.steps) }),
        ...(src ? [m.music_lessons_pads_chop_edit_source({ loop: src.label.toLowerCase() })] : []),
      ].join(" "),
    });
  }
  const x = CHOP_EXERCISES.find((y) => y.id === item);
  if (!x) return null;
  const extra =
    x.id === "free"
      ? m.music_lessons_pads_chop_free_extra({
          hits: FREE_CHOP.minHits,
          repeat: Math.round(FREE_CHOP.repeatPass * 100),
          time: Math.round(FREE_CHOP.timePass * 100),
        })
      : x.id === "reorder"
        ? m.music_lessons_pads_chop_reorder_extra()
        : "";
  return card(`pads.chop:${item}`, x.label, {
    title: x.label,
    text: extra ? `${x.detail}. ${extra}` : `${x.detail}.`,
  });
}

// ---------------------------------------------------------------------------
// Dynamics

/** Where hit `i` of an exercise sits in the player's range (0 softest, 1 loudest): inside what the grader wants. */
export function dynamicsLevel(id: DynamicsId, i: number): number {
  if (id === "ladder") return mid(ladderBand(i));
  const n = DYNAMICS_EXERCISES.find((x) => x.id === id)!.notes;
  return id === "crescendo" ? 0.05 + (0.9 * i) / (n - 1) : 0.5;
}
const inDefaultRange = (x: number) =>
  DEFAULT_RANGE.soft + x * (DEFAULT_RANGE.loud - DEFAULT_RANGE.soft);
/** An exercise's hits on the snare, on the drill's default range. */
export function dynamicsExerciseSound(id: DynamicsId): LessonSound {
  const x = DYNAMICS_EXERCISES.find((d) => d.id === id)!;
  return {
    notes: Array.from({ length: x.notes }, (_, i) => ({
      midi: [voice("snare").midi],
      at: (i * 60) / BPM / x.perBeat,
      dur: 0.12,
      drum: true,
      velocity: inDefaultRange(dynamicsLevel(id, i)),
    })),
  };
}
const snareAt = (level: number): LessonSound => ({
  notes: Array.from({ length: 4 }, (_, i) => ({
    midi: [voice("snare").midi],
    at: (i * 60) / BPM,
    dur: 0.12,
    drum: true,
    velocity: inDefaultRange(level),
  })),
});
const hitCounts = [...new Set(DYNAMICS_EXERCISES.map((x) => x.notes))];

function dynamicsIntro(): Lesson {
  return card(
    "pads.dynamics",
    m.music_lessons_pads_dynamics_title(),
    {
      title: m.music_lessons_pads_velocity_title(),
      text: m.music_lessons_pads_velocity_text(),
      options: [
        { label: m.music_lessons_pads_level_soft(), sound: snareAt(0.1) },
        { label: m.music_lessons_pads_level_loud(), sound: snareAt(0.9) },
      ],
    },
    {
      title: m.music_lessons_pads_range_title(),
      text: m.music_lessons_pads_range_text(),
    },
    {
      title: m.music_lessons_pads_three_title(),
      text: m.music_lessons_pads_three_text({ counts: list(hitCounts.map(String)) }),
    },
  );
}

const DYN_TEXT: Record<DynamicsId, () => string> = {
  ladder: () =>
    m.music_lessons_pads_dyn_ladder_text({ pass: Math.round(DYNAMICS.inBandPass * 100) }),
  crescendo: () =>
    m.music_lessons_pads_dyn_crescendo_text({
      rho: formatNumber(DYNAMICS.crescendoRho),
      span: Math.round(DYNAMICS.crescendoSpan * 100),
    }),
  even: () => m.music_lessons_pads_dyn_even_text({ spread: Math.round(DYNAMICS.evenSpread * 100) }),
};

function dynamicsCard(id: string): Lesson | null {
  const x = DYNAMICS_EXERCISES.find((d) => d.id === id);
  if (!x) return null;
  const title = x.label.split(":")[0];
  return card(`pads.dynamics:${id}`, title, {
    title,
    text: DYN_TEXT[x.id](),
    sound: dynamicsExerciseSound(x.id),
  });
}

// ---------------------------------------------------------------------------
// Phrases

/** The short drum phrases, easiest first, as the Phrases drill lists them. */
export const PAD_PHRASES = PAD_REPERTOIRE.filter((r) => r.topic === "phrases").sort(
  (a, b) => a.level - b.level,
);
const PHRASE_EXAMPLE = "son-clave";

function phrasesIntro(): Lesson {
  const clave = repertoireFor(PHRASE_EXAMPLE)!;
  const rim = beatsOf(clave.groove.targets, "rim");
  const bars = PAD_PHRASES.map((r) => r.groove.bars);
  return card(
    "pads.phrases",
    m.music_lessons_pads_phrases_title(),
    {
      title: m.music_lessons_pads_names_title(),
      figure: { kind: "rhythm", bars: 1, perBeat: 4, beatsPerBar: 4, onsets: rim },
      text: m.music_lessons_pads_names_text({ min: Math.min(...bars), max: Math.max(...bars) }),
    },
    {
      title: m.music_lessons_pads_count16_title(),
      text: m.music_lessons_pads_count16_text({
        phrase: clave.groove.label.toLowerCase(),
        counts: list(countsOf(rim)),
      }),
      figure: { kind: "rhythm", bars: 1, perBeat: 4, beatsPerBar: 4, onsets: rim },
      sound: soundOf(clave.groove.targets),
    },
    {
      title: m.music_lessons_pads_hear_play_title(),
      text: m.music_lessons_pads_hear_play_text(),
    },
  );
}

function phraseCard(id: string): Lesson | null {
  const r = PAD_PHRASES.find((x) => x.groove.value === id);
  if (!r) return null;
  const g = r.groove;
  const all: Hit[] = g.targets;
  const voices = [...new Set(all.map((h) => h.voice))];
  const counts = (v: string) => list(countsOf(beatsOf(all, v)));
  const onGrid = voices.every((v) => LANE[v]);
  const figure = (hits: Hit[]): LessonFigure | undefined =>
    onGrid
      ? gridOf(hits, 0, 1)
      : voices.length === 1
        ? { kind: "rhythm", bars: 1, perBeat: 4, beatsPerBar: 4, onsets: hits.map((h) => h.beat) }
        : undefined;
  const sound = soundOf(all, { bpm: r.bpm.start });
  if (g.bars > 1)
    return card(`pads.phrases:${id}`, g.label, {
      title: g.label,
      text: m.music_lessons_pads_phrase_bars({ feel: r.feel, bars: g.bars, bpm: r.bpm.start }),
      sound,
    });
  if (voices.length === 1)
    return card(`pads.phrases:${id}`, g.label, {
      title: g.label,
      text: m.music_lessons_pads_phrase_one_pad({
        feel: r.feel,
        name: voice(voices[0]).name,
        counts: counts(voices[0]),
      }),
      figure: figure(all),
      sound,
    });
  return card(`pads.phrases:${id}`, g.label, {
    title: g.label,
    text: m.music_lessons_pads_phrase_steps({ feel: r.feel }),
    figure: figure([]),
    steps: voices.map((v, i) => {
      const hits = all.filter((h) => voices.indexOf(h.voice) <= i);
      const f = figure(hits);
      return {
        text: m.music_lessons_pads_phrase_pad_plays({ name: voice(v).name, counts: counts(v) }),
        sound: soundOf(hits, { bpm: r.bpm.start }),
        ...(f ? { figure: f } : {}),
      };
    }),
  });
}

// ---------------------------------------------------------------------------

/**
 * What a Pads drill teaches before its quiz: the mode's intro, then one card per item its setup adds
 * (a rudiment, a groove's topic, a fill, a repeat rate...). Grooves below level 3 have no lesson.
 */
export function padLessons(mode: string, level?: number, items: readonly string[] = []): Lesson[] {
  const cards = (make: (i: string) => Lesson | null) => items.flatMap((i) => make(i) ?? []);
  switch (mode) {
    case "rudiment":
    case "rudiments":
      return [rudimentsIntro(), ...cards(rudimentCard)];
    case "groove":
    case "grooves":
      // Below level 3 a groove adds only its own cards (grooveLessonItems keeps them to Latin and swing).
      return level === undefined
        ? []
        : [...(level >= 3 ? [sixteenthsLesson()] : []), ...cards(grooveCard)];
    case "fills":
      return [fillsIntro(), ...cards(fillCard)];
    case "echo":
      return [echoIntro(), ...cards(echoCard)];
    case "ostinato":
      return [ostinatoIntro(), ...cards(ostinatoCard)];
    case "orchestrate":
      return [orchestrateIntro(), ...cards(orchestrateCard)];
    case "repeat":
      return [repeatIntro(), ...cards(repeatCard)];
    case "song":
      return [songIntro(), ...cards(songCard)];
    case "dynamics":
      return [dynamicsIntro(), ...cards(dynamicsCard)];
    case "phrases":
      return [phrasesIntro(), ...cards(phraseCard)];
    case "chop":
      return [chopIntro(), ...cards(chopCard)];
    default:
      return [];
  }
}
