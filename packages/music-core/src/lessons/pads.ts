// Pads lessons (Task 8): rudiments, grooves from level 3, and the skills (fills, play it back, ostinato,
// rudiments on the kit, chop, note repeat, song form). Every example comes from the drill's own content
// and every number from its constants, so the lesson and the grader cannot disagree. An intro lesson per
// mode, then one card per item the drill's setup adds (a rudiment, a fill, a repeat rate...), as ear.ts does.

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
const list = (xs: string[]) =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
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

const percent = (b: readonly number[]) => `${Math.round(b[0] * 100)} to ${Math.round(b[1] * 100)}`;

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
    "Rudiments on the pads",
    {
      title: "Two hands, two pads",
      text: `A rudiment is a sticking pattern, played with the left hand on one pad and the right on another. The drill checks which pad you hit as well as when. By default the left hand plays ${padName(LEFT_PAD)} and the right ${padName(RIGHT_PAD)}, and you can tap other pads to change them.`,
      figure: handPads("single-strokes"),
      sound: rudimentSound("single-strokes"),
    },
    {
      title: "Singles, doubles, paradiddle",
      text: "Tap Next to reveal each one, then Hear this step. L is the left hand and R the right.",
      figure: handPads("single-strokes"),
      steps: [
        step(`Single strokes alternate: ${single}.`, "single-strokes"),
        step(`Double strokes play each hand twice: ${doubles}.`, "double-strokes"),
        step(
          `The paradiddle is ${PARADIDDLE.join(" ")}, the sticking the Rudiments on the kit drill uses. This drill starts it on the left hand, ${drillPara}, the same pattern with the other hand first.`,
          "paradiddle",
        ),
      ],
    },
    {
      title: "Accents and taps",
      text: `In a rudiment with accents, the drill checks that each accent is hit at ${percent(RUDIMENT_BANDS.accent)} percent of full level and each tap at ${percent(RUDIMENT_BANDS.tap)} percent. It can only check this when your pads send changing velocity. Tap Even, then Accent and taps, to hear four sixteenths each way.`,
      figure: handPads("accents-ghosts"),
      options: [
        { label: "Even", sound: bandSound(true) },
        { label: "Accent and taps", sound: bandSound(false) },
      ],
    },
    {
      title: "Eighths, triplets, sixteenths",
      text: "The subdivision is how many strokes fit in a beat: two for eighths, three for triplets, four for sixteenths. Some rudiments set their own grid and the drill says so. Tap each to hear four beats of single strokes, and watch the grid.",
      figure: gridBeats(2),
      options: ([2, 3, 4] as const).map((n) => ({
        label: SUBDIVISION_NAMES[n][0].toUpperCase() + SUBDIVISION_NAMES[n].slice(1),
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
      text: `Page one of Stick Control is every four-note sticking of R and L, ${RUDIMENTS.filter((r) => r.hits).length} in all, in eighths. Each is played ${d.hits! / d.unit.length} times on one pad a hand, so the app can check the sticking. The label gives the sticking, such as ${sticking(d.unit)}.`,
      figure: handPads(d.id),
      sound: rudimentSound(d.id),
    });
  }
  const grid = d.subdivision
    ? `It is timed in ${SUBDIVISION_NAMES[d.subdivision]}.`
    : d.perBeat
      ? `It plays ${d.perBeat.join(", ")} notes in successive beats, timed on its closest spacing, ${SUBDIVISION_NAMES[rudimentPerBeat(d, 2)]}.`
      : "It uses the subdivision you pick.";
  const parts = [
    d.onePad
      ? `Two fingers on one pad, ${sticking(d.unit)}, repeated.`
      : `The sticking is ${sticking(d.unit)}, repeated.`,
    grid,
  ];
  if (d.flam)
    parts.push(
      `Each stroke has a grace note on the other pad ${MPC_RUDIMENTS.flamGraceMs} ms before it, and only the main strokes are graded.`,
    );
  else if (d.accentMode === "moving") parts.push("The accent moves one note later each beat.");
  else if (d.accents)
    parts.push(
      d.accents.length === 1
        ? `The accent is stroke ${d.accents[0] + 1} of each ${d.unit.length}.`
        : `The accents are strokes ${list(d.accents.map((i) => String(i + 1)))} of each ${d.unit.length}.`,
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
    "Sixteenths, ghosts and swing",
    {
      title: "Counting sixteenths",
      text: "From level 3 many grooves put notes between the eighths. Count each beat 1 e & a, four sixteenths to a beat. The grid marks hi-hat hits on every sixteenth of one bar.",
      figure: gridOf(hatsOnSixteenths(), 0, 1),
      sound: soundOf(hatsOnSixteenths()),
    },
    {
      title: "A bar of it",
      text: `Here is "${r.groove.label}", one bar at a time. Tap Next to add a part.`,
      figure: gridOf([], 0, 1),
      steps: [
        stepAt(
          hatEvery
            ? "The hi-hat plays every sixteenth."
            : `The hi-hat plays on ${list(countsOf(beatsOf(bar, "hats")))}.`,
          (h) => h.voice === "hats",
        ),
        stepAt(
          `The kick lands on ${list(countsOf(beatsOf(bar, "kick")))}.`,
          (h) => h.voice === "hats" || h.voice === "kick",
        ),
        stepAt(
          `The snare backbeat lands on ${list(countsOf(beatsOf(bar, "snare", "accent")))}.`,
          (h) => h.accent !== "ghost",
        ),
        stepAt(
          `The soft ghost snares sit on ${list(countsOf(beatsOf(bar, "snare", "ghost")))}.`,
          () => true,
        ),
      ],
    },
    {
      title: "Ghost notes",
      text: `A ghost note is a very quiet hit, here on the snare between the backbeats. On the 0 to 127 scale the drill's bands are ${BANDS.ghost[0]} to ${BANDS.ghost[1]} for a ghost, ${BANDS.normal[0]} to ${BANDS.normal[1]} for a normal hit and ${BANDS.accent[0]} and up for an accent. It checks them only when your pads send changing velocity.`,
      options: [
        { label: "Ghosts", sound: ghostBar(false) },
        { label: "Too loud", sound: ghostBar(true) },
      ],
    },
    {
      title: "Swing",
      text: `Swing delays every second sixteenth. The drill gives it as a percentage of the eighth, from 50 for straight up to 75, where 66 sits on the triplet, and offers it on grooves that can swing. Tap Straight or Swung to hear sixteenth hats at 50 and at ${swung}.`,
      options: [
        { label: "Straight", sound: soundOf(hatsOnSixteenths(50)) },
        { label: "Swung", sound: soundOf(hatsOnSixteenths(swung)) },
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
    return card(id, "Independence", {
      title: "Independence",
      text: `In an independence groove each hand or foot plays a part of its own and holds it whatever the others do. In "${g.label}" the hats play the same in every bar while the kick takes a new pattern each bar. The grid shows its first two bars.`,
      figure: gridOf(hits, 0, 2),
      sound: soundOf(hits),
    });
  }
  if (item === "linear") {
    const g = GROOVE_OF("linear-singles");
    const hits: Hit[] = firstBar(g);
    return card(id, "Linear grooves", {
      title: "Linear grooves",
      text: `In a linear groove no two drums play at the same time, so the hands and the foot take turns. In "${g.label}" the hats, snare and kick pass the bar round without overlapping. The grid shows its bar.`,
      figure: gridOf(hits, 0, 1),
      sound: soundOf(hits),
    });
  }
  if (item === "fills") {
    const g = GROOVE_OF("fill-one-beat");
    const hits: Hit[] = g.targets.filter((t) => t.beat >= 8 && t.beat < 16);
    return card(id, "Fills", {
      title: "Fills",
      text: `A fill is a short burst of drum hits that marks the end of a phrase. In these grooves it is the last bar of four, and the next phrase starts back on the one. The grid shows the last two bars of "${g.label}".`,
      figure: gridOf(hits, 8, 2),
      sound: soundOf(hits, { from: 8 }),
    });
  }
  if (item === "rolls") {
    const g = GROOVE_OF("trap-32");
    const hats = barHits(g, 0).filter((t) => t.voice === "hats");
    const per = (rate: string) => `${repeatPerBeat(rate)} to a beat`;
    return card(id, "Rolls", {
      title: "Rolls",
      text: `A roll plays notes faster than sixteenths: thirty-seconds, ${per("1/32")}, or sixteenth triplets, ${per("1/16T")}. Alternate two fingers on one pad, or hold Note Repeat at 1/32 or 1/16T. Hear the hats of "${g.label}".`,
      sound: soundOf(hats),
    });
  }
  if (item === "breaks") {
    const g = GROOVE_OF("amen");
    const hits: Hit[] = g.targets
      .filter((t) => t.beat < 4 || (t.beat >= 12 && t.beat < 16))
      .map((t) => (t.beat >= 12 ? { ...t, beat: t.beat - 8 } : t));
    return card(id, "Breaks", {
      title: "Breaks",
      text: `A break is a short drum part lifted from a record, written out for you to play. The ${g.label} runs for ${g.bars} bars and the bars differ, so keep count of where you are. The grid shows its kick and snare in bars 1 and 4.`,
      figure: gridOf(hits, 0, 2, ["kick", "snare"], [1, 4]),
      sound: soundOf(hits),
    });
  }
  if (item === "shuffle") {
    const g = GROOVE_OF("blues-shuffle");
    const hats = firstBar(g).filter((t) => t.voice === "hats");
    return card(id, "Shuffle", {
      title: "Shuffle",
      text: `In a shuffle each beat splits into three, counted 1 trip let, and many shuffles skip the middle note. The grid for these grooves has three steps a beat, or six in the grooves that go finer. The picture shows the hi-hat of "${g.label}".`,
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
    return card(id, "Odd meters", {
      title: "Odd meters",
      text: "Odd-meter grooves have 5 or 7 counts in a bar instead of 4. Count them in groups of two and three, for example 5 as 3 + 2. In 7/8 each count is an eighth note.",
      sound: soundOf(firstBar(g)),
    });
  }
  if (item === "latin") {
    const g = GROOVE_OF(TRESILLO_GROOVE);
    const bar = firstBar(g);
    const twice = [...TRESILLO, ...TRESILLO.map((b) => b + 2)];
    return card(
      id,
      "The tresillo",
      {
        title: "Three, three, two",
        text: `Count each beat in four sixteenths: 1 e & a. The tresillo puts three notes in eight sixteenths, spaced 3 + 3 + 2, on ${list(countsOf(TRESILLO))}. Then it starts again on ${list(countsOf(TRESILLO.map((b) => b + 2)))}.`,
        figure: { kind: "rhythm", bars: 1, perBeat: 4, beatsPerBar: 4, onsets: twice },
        sound: soundOf(twice.map((beat) => ({ voice: "rim", beat }))),
      },
      {
        title: "In a groove",
        text: `Many Caribbean and Latin grooves are built on it. In "${g.label}" the kick plays the first two notes and the snare the third, while ${list(TRESILLO_ALSO.map((v) => repertoireFor(v)!.style))} play the last two on the snare over a kick on every beat. Hear one bar of ${g.label.toLowerCase()}.`,
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
      "Dance grooves",
      {
        title: "Four on the floor",
        text: `House and disco put the kick on every beat, called four on the floor. The open hat plays on every &, between the kicks. The lit pads are the ones "${house.label}" uses.`,
        figure: padsFigure(
          Object.fromEntries(
            [...new Set(houseBar.map((h) => voice(h.voice).midi))].map((m) => [m, ""]),
          ),
        ),
        sound: soundOf(houseBar),
      },
      {
        title: "Half time and two-step",
        text: `Trap feels half as fast as its tempo, with the clap only on ${list(countsOf(clap))}. Drum and bass plays its kick on ${list(countsOf(dnbKick))}, at up to ${dnb.bpm.target} BPM. Tap each to hear a bar at its starting tempo.`,
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
      "Swing",
      {
        title: "Late every other sixteenth",
        text: `Swing delays every second sixteenth, the e and the a, while notes on the beat and the & stay put. The Swing choice runs from ${SWING_CHOICES[0]}, straight, to ${SWING_CHOICES[SWING_CHOICES.length - 1]}, and 66 sits on the triplet. Tap each to hear sixteenth hats.`,
        options: [50, ...swings].map((w) => ({
          label: w === 50 ? "Straight" : `Swing ${w}`,
          sound: soundOf(hatsOnSixteenths(w)),
        })),
      },
      {
        title: "Feel it",
        text: "Count the beats, not the late notes: the swung one should feel lazy, not placed. On a swung groove the results show Swing played, where your notes on the e and the a landed against the groove's swing. It does not change the pass.",
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
      text: `Two feels at once: the hats swing at ${r.swing} while the snare comes about ${ms} ms early at ${r.bpm.target} BPM, a little more at slower tempos. The drill times your snare against that early spot. Tap Pushed, then On the beat, to hear the difference.`,
      options: [
        { label: "Pushed", sound: soundOf(bar, { bpm: r.bpm.target }) },
        { label: "On the beat", sound: soundOf(onBeat, { bpm: r.bpm.target }) },
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
    "Fills",
    {
      title: "Three bars, then a fill",
      text: "A run is three bars of groove, then a fill in bar 4, then a crash and kick together on the next bar's one. The grid shows one bar of groove and then the fill bar. Tap Hear it to hear the third bar, the fill and the landing.",
      figure: gridOf(grid, 0, 2),
      sound: play(),
    },
    {
      title: "Landing on the one",
      text: `The landing counts when the crash and kick are both within ${FILL.landMs} ms of the click on the one. Tap Landed to hear them there, or Late to hear both ${FILL_DEMO_MS} ms behind.`,
      figure: gridOf(grid, 0, 2),
      options: [
        { label: "Landed", sound: play() },
        { label: "Late", sound: play((h) => (g.landing.includes(hits.indexOf(h)) ? ms : 0)) },
      ],
    },
    {
      title: "Do not rush",
      text: `Students rush fills. The drill averages the timing of the fill's own notes, and if they come more than ${FILL.rushMs} ms early on average the fill counts as rushed and the run is not correct. Tap On time, or Rushed to hear the fill ${FILL_DEMO_MS} ms early.`,
      figure: gridOf(grid, 0, 2),
      options: [
        { label: "On time", sound: play() },
        { label: "Rushed", sound: play((h) => (g.fill.includes(hits.indexOf(h)) ? -ms : 0)) },
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
    text: `It comes after three bars of ${fill.groove ? "shuffle" : "rock"}. The lit pads are the ones the fill bar and the landing use. The drill times the ${g.fill.length} notes it adds to the groove for rushing.`,
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
    "Play it back",
    {
      title: "Listen, then play it back",
      text: "The app plays a bar, then the next bar is yours: play back what you heard. There are four rounds, each a call and an answer, and only your answers are scored. The grid stays hidden until the run is over.",
      figure: gridOf([...call, ...answer], 0, 2),
    },
    {
      title: "One round",
      text: "Tap Next to hear a call and then the answer that matches it.",
      figure: gridOf([], 0, 1),
      steps: [
        {
          text: `The call is one bar: kick on ${kick}, snare on ${snare}.`,
          figure: gridOf(call, 0, 1),
          sound: soundOf(call),
        },
        {
          text: "Your answer is the same bar, played in the bar after the call.",
          figure: gridOf(answer, 4, 1),
          sound: soundOf(answer, { from: 4 }),
        },
        {
          text: "Together: the call, then your answer.",
          figure: gridOf(answer, 4, 1),
          sound: soundOf([...call, ...answer]),
        },
      ],
    },
    {
      title: "How a round passes",
      text: `A round counts as played back when at least ${Math.round(ECHO_PASS * 100)} percent of its notes are matched. The run is correct when all four rounds are played back and you play no extra hits. Playing along with a call costs nothing, because only the answer bars are scored.`,
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
  const parts = [`This level plays ${list(voices.map(voiceName))}.`];
  if (ghosts) parts.push("Some calls have ghost notes, played at the ghost level.");
  parts.push("The grid shows the first call.");
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
    "Ostinato and a line",
    {
      title: "Keep one part going",
      text: `An ostinato is a part that repeats without changing while another part moves. The ${hatsName} keep eighths while the snare reads a line, or the kick when you choose that for new lines, and for the clave line the ${claveName} keeps the son clave. You play two bars of the ostinato alone, then four bars with the line.`,
      figure: gridOf(withLine, 0, 1),
    },
    {
      title: "Hats, then the line",
      text: "Tap Next to hear the hi-hat alone and then with a snare line on top.",
      figure: gridOf([], 0, 1),
      steps: [
        {
          text: `The hi-hat plays eighths: ${list(countsOf(beatsOf(alone, "hats"), 2))}.`,
          figure: gridOf(alone, 0, 1),
          sound: soundOf(alone),
        },
        {
          text: `Then the snare reads a line on ${list(countsOf(beatsOf(withLine, "snare")))} while the hats carry on.`,
          figure: gridOf(withLine, 0, 1),
          sound: soundOf(withLine),
        },
      ],
    },
    {
      title: "How it is graded",
      text: `The drill counts how many ostinato notes you hit alone, then under the line. The ostinato holds when the rate under the line is no more than ${Math.round(OSTINATO.maxDrop * 100)} percentage points below the rate alone. The run also needs the groove itself to be correct.`,
    },
  );
}

function ostinatoCard(id: string): Lesson | null {
  const line = READING_LINES.find((l) => l.id === id);
  if (!line) return null;
  const cid = `pads.ostinato:${id}`;
  if (id === "clave") {
    const bar = lineBar("clave");
    const rim = beatsOf(bar, "rim");
    return card(cid, line.label, {
      title: line.label,
      text: `The rim plays the son clave on ${list(countsOf(rim))}. The kick plays a different pattern in each of the four bars under it. The grid shows the clave.`,
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
      text: `Four new bars to read come up on every run, built from short patterns, with at least three notes a bar and never plain quarters. You choose who reads, ${INTERPRETATIONS.map((x) => `the ${x.id}`).join(" or ")}. The grid shows one example bar read on the snare.`,
      figure: gridOf(hits, 0, 1),
      sound: soundOf(hits),
    });
  }
  const hits = lineBar(id);
  return card(cid, line.label, {
    title: line.label,
    text: `The snare plays on ${list(countsOf(beatsOf(hits, "snare")))}. The hats play eighths under it.`,
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
    "Rudiments on the kit",
    {
      title: "Sticking on the kit",
      figure: padsFigure(orchestraPads(o.id)),
      text: `The paradiddle is ${PARADIDDLE.join(" ")}, two groups of four. In this drill each hand gets its own drum, so the sticking becomes a groove: two bars of sixteenths with the first stroke of each group accented.`,
    },
    {
      title: "Which pad",
      text: `${o.detail}, as the ${o.label} choice plays it. The lit pads show each hand, and K is the kick.`,
      figure: padsFigure(orchestraPads(o.id)),
    },
    {
      title: "Hear it",
      text: "Tap Next to hear each group of four, then the whole bar.",
      figure: padsFigure(orchestraPads(o.id)),
      steps: [
        {
          text: `The first group is ${PARADIDDLE.slice(0, 4).join(" ")}.`,
          sound: soundOf(group(0), { bpm: 90 }),
        },
        {
          text: `The second group is ${PARADIDDLE.slice(4).join(" ")}.`,
          sound: soundOf(group(1), { bpm: 90, from: 1 }),
        },
        {
          text: "Four groups make one bar of sixteenths, the paradiddle twice through.",
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
    text: `${o.detail}. The drill plays two bars of sixteenth paradiddles with the first stroke of each group of four accented, and the example plays one.${kick ? "" : " This one has no kick."}`,
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
  const runs = Object.entries(bars).map(([rate, n]) => `${n === 2 ? "two" : n} bars at ${rate}`);
  return card(
    "pads.repeat",
    "Note repeat",
    {
      title: "Hold the pad",
      text: "Note Repeat plays a pad again for as long as you hold it, on a grid set by the rate. The app changes the rate as the chart goes, so you hold the pad and follow the chart. The drill names the pad to hold.",
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
      title: "Pressure",
      text: "If your pads send aftertouch, pressure sets the level of the repeats. If they do not, every repeat keeps the level of your first hit.",
    },
    {
      title: "Builds",
      text: `The build goes ${list(runs)}, louder all the way. It is judged on how steadily the level climbs and on covering at least ${Math.round(BUILD.span * 100)} percent of your soft to loud range, and only when your pads send velocity.`,
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
  return card(`pads.repeat:${rate}`, `Rate ${rate}`, {
    title: `Rate ${rate}`,
    text: `At ${rate} a held pad repeats ${r.perBeat} times a beat, which is ${SUBDIVISION_NAMES[r.perBeat]}. Hear two beats of it. Each repeat keeps your hit's level unless your pads send aftertouch.`,
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

function songIntro(): Lesson {
  return card(
    "pads.song",
    "Song form",
    {
      title: "One take",
      text: "A piece is a list of sections, such as an intro, a groove, a build and a drop. You play it from start to end in one take, and each section is graded on its own.",
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
      title: "Soft, medium, loud, rising",
      text: `Each section has a level against your own soft to loud range: soft is ${percent(DYN_BANDS.soft)} percent of it, medium ${percent(DYN_BANDS.medium)} and loud ${percent(DYN_BANDS.loud)}. In written music these are p, mf and f, and a rising section is a crescendo. Tap each to hear eight snare hits on a typical range.`,
      options: [
        ...SONG_LEVELS.map((l) => ({
          label: l[0].toUpperCase() + l.slice(1),
          sound: dynamicsSound(l),
        })),
        { label: "Rising", sound: dynamicsSound("rising") },
      ],
    },
    {
      title: "How a section passes",
      text: `A section passes with at least ${Math.round(SECTION_PASS.matched * 100)} percent of its notes matched, no more than ${Math.round(SECTION_PASS.extraShare * 100)} percent of them as extra hits (one is always allowed), and its level in band when your pads send velocity. The run is correct when every section passes.`,
    },
  );
}

function songCard(id: string): Lesson | null {
  const f = SONG_FORMS.find((x) => x.id === id);
  if (!f) return null;
  return card(`pads.song:${id}`, f.label, {
    title: f.label,
    text: `The sections are ${f.sections.map((x) => `${x.label} (${x.bars} bars, ${x.dyn})`).join(", ")}. It starts at ${f.bpm.start} BPM and aims for ${f.bpm.target}.`,
  });
}

// ---------------------------------------------------------------------------
// Chop

const slices = (steps: readonly number[]) => steps.map((s) => (s ? String(s) : "a gap")).join(", ");
/** How long a slice of an `n`-bar loop is. */
export const sliceWord = (bars: number) => {
  const beats = (bars * 4) / CHOP_SLICES;
  return beats === 0.25
    ? "sixteenths"
    : beats === 0.5
      ? "eighths"
      : beats === 1
        ? "beats"
        : `${beats} beats`;
};

function chopIntro(): Lesson {
  const src = CHOP_SOURCES[0];
  const flip = CHOP_EDITS.find((e) => e.id === "flip")!;
  const played = new Set(flip.steps);
  const never = Array.from({ length: CHOP_SLICES }, (_, i) => i + 1).filter((n) => !played.has(n));
  return card(
    "pads.chop",
    "Chop",
    {
      title: "A loop in sixteen slices",
      text: `A chop cuts a loop into ${CHOP_SLICES} equal slices and puts one on each pad, slice 1 on ${padName(slicePad(0))} up to slice ${CHOP_SLICES} on ${padName(slicePad(CHOP_SLICES - 1))}. Tap Hear it for the ${src.label.toLowerCase()} loop whole. The lit pads show where the slices are.`,
      figure: {
        kind: "pads",
        marks: Object.fromEntries(
          Array.from({ length: CHOP_SLICES }, (_, i) => [slicePad(i), String(i + 1)]),
        ),
      },
      sound: {
        notes: chopSourceNotes(src.id).map((n) => ({
          midi: [n.midi],
          at: (n.beat * 60) / src.bpm,
          dur: 0.12,
          drum: true,
          velocity: n.velocity,
        })),
      },
    },
    {
      title: "How long a slice is",
      text: `A slice is the loop divided by ${CHOP_SLICES}. A one-bar loop gives ${sliceWord(1)}, a two-bar loop ${sliceWord(2)} and a four-bar loop ${sliceWord(4)}. Played in order, slices 1 to ${CHOP_SLICES} bring the loop back.`,
    },
    {
      title: "Chopping it up",
      text: `Chopping is playing the slices in a new order. The ${flip.label.split(":")[0]} edit plays slices ${slices(flip.steps)}. Slices ${list(never.map(String))} never play.`,
    },
  );
}

function chopCard(item: string): Lesson | null {
  if (item.startsWith("edit:")) {
    const e = CHOP_EDITS.find((x) => x.id === item.slice(5));
    if (!e) return null;
    const src = e.source ? CHOP_SOURCES.find((s) => s.id === e.source) : null;
    const step = e.every === 0.25 ? "a sixteenth" : e.every === 0.5 ? "an eighth" : "a beat";
    const [name, ...rest] = e.label.split(":");
    const desc = rest.join(":").trim();
    return card(`pads.chop:${item}`, name, {
      title: name,
      text: `${desc ? `${desc[0].toUpperCase()}${desc.slice(1)}. ` : ""}It plays ${step} a step: slices ${slices(e.steps)}${e.steps.includes(0) ? " (a gap lets the slice before it ring)" : ""}.${src ? ` It is written for the ${src.label.toLowerCase()} loop.` : ""}`,
    });
  }
  const x = CHOP_EXERCISES.find((y) => y.id === item);
  if (!x) return null;
  const extra =
    x.id === "free"
      ? ` It needs at least ${FREE_CHOP.minHits} hits, and passes at ${Math.round(FREE_CHOP.repeatPass * 100)} percent of them played again and ${Math.round(FREE_CHOP.timePass * 100)} percent on time.`
      : x.id === "reorder"
        ? " The Order choice picks the edit."
        : "";
  return card(`pads.chop:${item}`, x.label, { title: x.label, text: `${x.detail}.${extra}` });
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
    "Dynamics",
    {
      title: "Velocity",
      text: "How hard you strike a pad is its velocity, a MIDI number from 1 to 127. The drill reads it from the MPC with Full Level off; the pads on screen send none. Tap Soft and Loud to hear the two ends.",
      options: [
        { label: "Soft", sound: snareAt(0.1) },
        { label: "Loud", sound: snareAt(0.9) },
      ],
    },
    {
      title: "Your range",
      text: "Every controller and every hand differ, so the drill first asks for your own range. Calibrate takes four of your softest hits, then four of your loudest, and keeps the average of each. Every level is then read as a share of the space between them.",
    },
    {
      title: "Three exercises",
      text: `The setup offers four levels, a crescendo, and even hits, each ${list(hitCounts.map(String))} hits long. After a run the results draw each hit's level in your range against where it should be.`,
    },
  );
}

const DYN_TEXT: Record<DynamicsId, string> = {
  ladder: `Sixteen hits in four groups of four, each group in the next quarter of your range, softest first. The run is correct with at least ${Math.round(DYNAMICS.inBandPass * 100)} percent of hits in their quarter. Hear it on a typical range.`,
  crescendo: `A bar of sixteenths from as soft as you can to your loudest. It passes when the levels climb steadily (a rank correlation of ${DYNAMICS.crescendoRho} or more), cover at least ${Math.round(DYNAMICS.crescendoSpan * 100)} percent of your range, and no hit is missed. Hear it on a typical range.`,
  even: `Sixteen hits at the same level. It passes when they vary by less than ${Math.round(DYNAMICS.evenSpread * 100)} percent of your range, measured as the spread, and no hit is missed. Hear it on a typical range.`,
};

function dynamicsCard(id: string): Lesson | null {
  const x = DYNAMICS_EXERCISES.find((d) => d.id === id);
  if (!x) return null;
  const title = x.label.split(":")[0];
  return card(`pads.dynamics:${id}`, title, {
    title,
    text: DYN_TEXT[x.id],
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
    "Phrases",
    {
      title: "Rhythms with names",
      figure: { kind: "rhythm", bars: 1, perBeat: 4, beatsPerBar: 4, onsets: rim },
      text: `A phrase is a short rhythm drummers know by name: clave cells, a tag ending, a fill and its landing, a build. They run ${Math.min(...bars)} to ${Math.max(...bars)} bars, and the setup lists them easiest first.`,
    },
    {
      title: "Count the sixteenths",
      text: `Count each beat in four: 1 e & a. The ${clave.groove.label.toLowerCase()} plays on ${list(countsOf(rim))}. Tap Hear it and count along.`,
      figure: { kind: "rhythm", bars: 1, perBeat: 4, beatsPerBar: 4, onsets: rim },
      sound: soundOf(clave.groove.targets),
    },
    {
      title: "Hear it, then play it",
      text: "Hear it first plays the phrase before you try it. Each phrase starts slow, and clean runs raise the tempo toward its goal. At the goal, Move on offers the next phrase.",
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
  const drum = (v: string) => `the ${voice(v).name} pad`;
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
      text: `${r.feel} It runs ${g.bars} bars. Hear it at ${r.bpm.start} BPM, its starting tempo.`,
      sound,
    });
  if (voices.length === 1)
    return card(`pads.phrases:${id}`, g.label, {
      title: g.label,
      text: `${r.feel} It is all on ${drum(voices[0])}, on ${counts(voices[0])}.`,
      figure: figure(all),
      sound,
    });
  return card(`pads.phrases:${id}`, g.label, {
    title: g.label,
    text: `${r.feel} Tap Next to add a pad.`,
    figure: figure([]),
    steps: voices.map((v, i) => {
      const hits = all.filter((h) => voices.indexOf(h.voice) <= i);
      const f = figure(hits);
      return {
        text: `${drum(v)[0].toUpperCase()}${drum(v).slice(1)} plays on ${counts(v)}.`,
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
