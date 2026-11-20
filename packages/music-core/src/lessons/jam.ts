// Lessons for the Jam games: shown the first time the player switches to Check on a game. Every
// game that grades against a rule has one (the open "free" game grades none). The worked examples
// are lines over the default ii-V-I that the game's own grader passes (see jam.test.ts), and every
// threshold comes from the game's aims in scoring/improv.ts.

import { formatList } from "@repo/i18n/format";
import { m } from "@repo/i18n/messages.js";
import { PROGRESSIONS, barBeats, chorusBars, type Progression } from "../content/jam";
import { TUNES, type HeadNote } from "../content/tunes";
import {
  IMPROV_GAMES,
  aSectionBars,
  gameOf,
  guideTones,
  type ImprovNote,
  type MetricId,
} from "../scoring/improv";
import { noteName, pc } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import { chordTones, keys } from "./tier1";
import type { Lesson, LessonFigure, LessonSound, LessonStep } from "./types";

/** Games whose lesson is a full lesson (3 to 6 screens); the rest are short cards (1 to 3). */
export const FULL_JAM_LESSONS = ["guide-tones", "motif", "approach", "displacement", "side-slip"];

export const JAM_EXAMPLE = PROGRESSIONS.find((p) => p.id === "ii-v-i")!;

const join = (a: string[]) => formatList(a);
const spell = (midi: number) => noteName(midi, "flat", false);
/** The game's aim for a measure, as the grader reads it (for a chorus of `bars` bars). */
export const aimOf = (
  id: string,
  metric: MetricId,
  bars = chorusBars(JAM_EXAMPLE),
  headRests = 0,
) => {
  const a = gameOf(id).aims.find((x) => x.metric === metric)!.aim;
  return typeof a === "function" ? a(bars, headRests) : a;
};
const pct = (id: string, metric: MetricId) => Math.round(aimOf(id, metric) * 100);

/** What the band's bars allow. */
const BAND = () => m.music_lessons_jam_band_rule();

/** The window the grader gives a landing on a change. */
const WINDOW = () => m.music_lessons_jam_window();

// ---------------------------------------------------------------------------
// Building blocks

interface Slot {
  symbol: string;
  /** The bar the chord starts in (from 0) and how many bars it lasts. */
  bar: number;
  bars: number;
  tones: ReturnType<typeof chordTones>;
  scale: number[];
}

export function slotsOf(p: Progression): Slot[] {
  let bar = 0;
  return p.chords.map((ch) => {
    const s = {
      symbol: ch.symbol,
      bar,
      bars: ch.bars,
      tones: chordTones(ch.symbol),
      scale: [
        ...new Set((scaleSemitones(ch.scale.name) ?? []).map((x) => pc(ch.scale.rootPc + x))),
      ],
    };
    bar += ch.bars;
    return s;
  });
}

/** The pitch `pcv` that lies within a tritone of `around`. */
const near = (pcv: number, around: number) => around + ((((pcv - around + 6) % 12) + 12) % 12) - 6;
/** The pitch `pcv` at or above `root`, within an octave of it. */
const above = (pcv: number, root: number) => root + ((((pcv - root) % 12) + 12) % 12);
const note = (midi: number, beat: number, len: number): ImprovNote => ({
  midi,
  beat,
  end: beat + len,
});
const bpbOf = (p: Progression) => barBeats(p);

/** A line as a sound: a beat is 0.3 seconds, and the first note comes straight away. */
const SPB = 0.3;
export function soundOf(ns: readonly ImprovNote[], upTo = Infinity): LessonSound {
  const t0 = Math.min(...ns.map((n) => n.beat));
  return {
    notes: ns
      .filter((n) => n.beat < upTo)
      .map((n) => ({
        midi: [n.midi],
        at: (n.beat - t0) * SPB,
        dur: Math.max(0.15, ((n.end ?? n.beat + 1) - n.beat) * SPB),
      })),
  };
}

/** The tones of a chord lit on the keys, labelled with their roles. */
const toneFigure = (
  symbol: string,
  which: (label: string) => boolean = () => true,
): LessonFigure => {
  const tones = chordTones(symbol);
  return keys(
    Object.fromEntries(tones.filter((t) => which(t.label)).map((t) => [t.midi, t.label])),
    tones.map((t) => t.midi),
  );
};
const isGuide = (label: string) => /[37]$/.test(label);

// ---------------------------------------------------------------------------
// Worked examples: lines over the ii-V-I that each game passes

/** A chord tone on every beat 1 and 3: the 3rd, 5th, 7th and root of each chord in turn. */
export function toneLine(p: Progression = JAM_EXAMPLE): ImprovNote[] {
  const bpb = bpbOf(p);
  const order = [1, 2, 3, 0];
  return slotsOf(p).flatMap((s) =>
    Array.from({ length: s.bars * 2 }, (_, i) =>
      note(s.tones[order[i % 4]].midi, (s.bar + Math.floor(i / 2)) * bpb + (i % 2) * 2, 1.5),
    ),
  );
}

/** The 3rd and 7th of each chord, led from the one before by the smaller step (two voices). */
export function guideVoices(p: Progression = JAM_EXAMPLE) {
  let a = 65;
  let b = 72;
  return slotsOf(p).map((s) => {
    const [x, y] = guideTones(s.symbol).guide;
    const dist = (pcv: number, at: number) => Math.abs(near(pcv, at) - at);
    const [lo, hi] = dist(x, a) <= dist(y, a) ? [x, y] : [y, x];
    a = near(lo, a);
    b = near(hi, b);
    const tone = (m: number) => s.tones.find((t) => pc(t.midi) === pc(m))!;
    return {
      slot: s,
      a: { midi: a, tone: tone(a) },
      b: { midi: b, tone: tone(b) },
    };
  });
}

export const guideLine = (p: Progression = JAM_EXAMPLE) =>
  guideVoices(p).flatMap((v) => [
    note(v.a.midi, v.slot.bar * bpbOf(p), 1.5),
    note(v.b.midi, v.slot.bar * bpbOf(p) + 2, 1.5),
  ]);

/** The 3rd of each chord on its first beat. */
export const thirdLine = (p: Progression = JAM_EXAMPLE) =>
  slotsOf(p).map((s) => note(near(guideTones(s.symbol).third!, 66), s.bar * bpbOf(p), 2));

/** `set` (semitones above the key, root first) up from its own root and back down, a beat each. */
const setNotes = (set: number[], keyPc: number) => {
  // From the set's own root (its first note), each note the next one up.
  const asc: number[] = [];
  for (const s of set) {
    const prev = asc.length ? asc[asc.length - 1] : 59;
    asc.push(prev + ((((pc(keyPc + s) - prev - 1) % 12) + 12) % 12) + 1);
  }
  return [...asc, ...asc.slice(0, -1).reverse()];
};
export const setLine = (set: number[], p: Progression = JAM_EXAMPLE) =>
  setNotes(set, p.keyPc).map((m, i) => note(m, i, 1));

/** Two notes a bar from the set and two beats of rest, so every bar has a rest. */
export const restingLine = (set: number[], p: Progression = JAM_EXAMPLE) => {
  const ms = setNotes(set, p.keyPc).slice(0, set.length);
  return Array.from({ length: chorusBars(p) }, (_, b) => [
    note(ms[b % ms.length], b * bpbOf(p), 1),
    note(ms[(b + 1) % ms.length], b * bpbOf(p) + 1, 1),
  ]).flat();
};

/** The Charleston: a note on beat 1 and one on the and of 2, in every bar, on the chord's root then 3rd. */
export const CHARLESTON = [0, 1.5];
export const charlestonLine = (p: Progression = JAM_EXAMPLE) =>
  slotsOf(p).flatMap((s) =>
    Array.from({ length: s.bars }, (_, k) => {
      const at = (s.bar + k) * bpbOf(p);
      return [
        note(s.tones[0].midi, at + CHARLESTON[0], 1),
        note(s.tones[1].midi, at + CHARLESTON[1], 0.5),
      ];
    }).flat(),
  );

/** Each bar's beat 1 is a chord tone with a note a half step from it just before (below, then above). */
export const approachLine = (p: Progression = JAM_EXAMPLE) => {
  const bpb = bpbOf(p);
  let bar = 0;
  return slotsOf(p).flatMap((s) =>
    Array.from({ length: s.bars }, (_, k) => {
      const target = s.tones[k % 2 ? 0 : 1].midi;
      const at = (s.bar + k) * bpb;
      const side = bar++ % 2 ? 1 : -1;
      return [note(target + side, at - 1, 1), note(target, at, 2)];
    }).flat(),
  );
};

/** A phrase of two notes starting on the and of 1 in every bar. */
export const offBeatLine = (p: Progression = JAM_EXAMPLE) =>
  Array.from({ length: chorusBars(p) }, (_, b) => {
    const s = slotsOf(p).find((x) => b >= x.bar && b < x.bar + x.bars)!;
    return [
      note(s.tones[1].midi, b * bpbOf(p) + 0.5, 0.5),
      note(s.tones[2].midi, b * bpbOf(p) + 1, 0.5),
    ];
  }).flat();

/** A note on the first beat of every bar of yours (the band's bars stay silent). */
export const windowLine = (id: string, p: Progression = JAM_EXAMPLE) => {
  const w = gameOf(id).windows!;
  const cycle = w.you + w.band;
  return slotsOf(p).flatMap((s) =>
    Array.from({ length: s.bars }, (_, k) => {
      const bar = s.bar + k;
      const at = ((bar % cycle) + cycle) % cycle;
      const mine = w.bandFirst ? at >= w.band : at < w.you;
      return mine
        ? [note(s.tones[1].midi, bar * bpbOf(p), 1), note(s.tones[3].midi, bar * bpbOf(p) + 1.5, 1)]
        : [];
    }).flat(),
  );
};

/** One motif of three eighth notes a bar and a beat after the last, so each starts a beat later in its bar. */
export const displacementLine = (p: Progression = JAM_EXAMPLE) => {
  const bpb = bpbOf(p);
  const slots = slotsOf(p);
  const total = chorusBars(p) * bpb;
  const out: ImprovNote[] = [];
  for (let at = 0, i = 0; at + 1.5 <= total; at += bpb + 1, i++) {
    const s = slots.find((x) => at / bpb >= x.bar && at / bpb < x.bar + x.bars)!;
    out.push(
      note(s.tones[0].midi, at, 0.5),
      note(s.tones[1].midi, at + 0.5, 0.5),
      note(s.tones[2].midi, at + 1, 0.5),
    );
  }
  return out;
};

/** A chord's first four scale notes from the root, and the same four a half step up (the slip). */
export function slipOf(s: Slot) {
  const plain = s.scale
    .map((x) => above(x, s.tones[0].midi))
    .sort((a, b) => a - b)
    .slice(0, 4);
  const slipped = plain.map((m) => m + 1);
  const outside = slipped.filter(
    (m) => ![...s.scale, ...s.tones.map((t) => t.midi)].some((x) => pc(x) === pc(m)),
  );
  return { plain, slipped, outside };
}

/** In the first bar of each chord: the slip as four eighths, then a chord tone on beat 3. */
export const slipLine = (p: Progression = JAM_EXAMPLE) =>
  slotsOf(p).flatMap((s) => {
    const { slipped } = slipOf(s);
    const last = slipped[3];
    const goal = s.tones
      .map((t) => t.midi)
      .reduce((best, m) => (Math.abs(m - last) < Math.abs(best - last) ? m : best));
    const at = s.bar * bpbOf(p);
    return [...slipped.map((m, i) => note(m, at + i * 0.5, 0.5)), note(goal, at + 2, 1.5)];
  });

/** The bridge's changes of a tune (its sections labelled B), merged where a chord repeats. */
export function bridgeChanges(p: Progression) {
  const bpb = bpbOf(p);
  const out: { symbol: string; beat: number }[] = [];
  const inB = new Set<number>();
  let at = 0;
  for (const sec of p.sections ?? []) {
    if (sec.label.startsWith("B")) for (let b = 0; b < sec.bars; b++) inB.add(at + b);
    at += sec.bars;
  }
  for (const s of slotsOf(p)) {
    if (inB.has(s.bar) && out.at(-1)?.symbol !== s.symbol)
      out.push({ symbol: s.symbol, beat: s.bar * bpb });
  }
  return out;
}
export const bridgeLine = (p: Progression) =>
  bridgeChanges(p).map((c) => {
    const t = guideTones(c.symbol).third!;
    return note(near(t, 66), c.beat, 2);
  });

/** An invented head, one bar's two notes (the chord's 3rd then 5th) on beats 1 and 2, then two beats of rest. */
export const filledHead = (p: Progression = JAM_EXAMPLE): HeadNote[] =>
  slotsOf(p).flatMap((s) =>
    Array.from({ length: s.bars }, (_, k) => {
      const at = (s.bar + k) * bpbOf(p);
      return [
        { midi: s.tones[1].midi, beat: at, end: at + 1 },
        { midi: s.tones[2].midi, beat: at + 1, end: at + 2 },
      ];
    }).flat(),
  );
export const filledLine = (p: Progression = JAM_EXAMPLE) => [
  ...filledHead(p).map((h) => note(h.midi, h.beat, h.end - h.beat)),
  ...slotsOf(p).flatMap((s) =>
    Array.from({ length: s.bars }, (_, k) => {
      const at = (s.bar + k) * bpbOf(p);
      return [note(s.tones[3].midi, at + 2.5, 0.5), note(s.tones[0].midi + 12, at + 3, 0.5)];
    }).flat(),
  ),
];

/** An invented head opening: four notes of the first chord's scale (1, 3, 2, 5 of it). */
export const headOpening = (p: Progression = JAM_EXAMPLE): HeadNote[] => {
  const s = slotsOf(p)[0];
  const up = s.scale.map((x) => above(x, s.tones[0].midi)).sort((a, b) => a - b);
  return [0, 2, 1, 4].map((d, i) => ({ midi: up[d], beat: i, end: i + 1 }));
};
/** Quote the opening an octave down at the top of each A section, then carry on. */
export const quoteLine = (p: Progression = JAM_EXAMPLE) =>
  aSectionBars(p).flatMap((bar) =>
    headOpening(p).map((h) => note(h.midi - 12, bar * bpbOf(p) + h.beat, 1)),
  );

// ---------------------------------------------------------------------------
// Lessons

const named = (id: string): Pick<Lesson, "id" | "title"> => ({
  id: `jam.${id}`,
  title: gameOf(id).label,
});

const exampleChords = () => join(JAM_EXAMPLE.chords.map((c) => c.symbol));
const stepsOver = (f: (s: Slot, i: number) => LessonStep): LessonStep[] =>
  slotsOf(JAM_EXAMPLE).slice(0, 3).map(f);

function guideTonesLesson(): Lesson {
  const v = guideVoices();
  const [dm, g7, cm] = v;
  const role = (t: { label: string }) =>
    t.label.includes("3") ? m.music_lessons_jam_role_third() : m.music_lessons_jam_role_seventh();
  const marks = (x: (typeof v)[number]) => ({
    [x.a.midi]: x.a.tone.label,
    [x.b.midi]: x.b.tone.label,
  });
  const span = v.slice(0, 3).flatMap((x) => [x.a.midi, x.b.midi]);
  const fig = (x: (typeof v)[number]) => keys(marks(x), span);
  const move = (
    from: { midi: number; tone: { name: string } },
    to: { midi: number; tone: { name: string; label: string } },
  ) => {
    if (from.midi === to.midi)
      return m.music_lessons_jam_move_stays({ note: to.tone.name, role: role(to.tone) });
    const half = Math.abs(to.midi - from.midi) === 1;
    const move =
      to.midi < from.midi
        ? half
          ? m.music_lessons_jam_move_down_half
          : m.music_lessons_jam_move_down_whole
        : half
          ? m.music_lessons_jam_move_up_half
          : m.music_lessons_jam_move_up_whole;
    return move({ from: from.tone.name, to: to.tone.name, role: role(to.tone) });
  };
  const step = (from: (typeof v)[number], to: (typeof v)[number]) =>
    m.music_lessons_jam_guide_step({
      chord: to.slot.symbol,
      first: move(from.a, to.a),
      second: move(from.b, to.b),
    });
  return {
    ...named("guide-tones"),
    screens: [
      {
        title: m.music_lessons_jam_guide_name_title(),
        text: m.music_lessons_jam_guide_name_text({
          chord: dm.slot.symbol,
          a: dm.a.tone.name,
          b: dm.b.tone.name,
        }),
        figure: fig(dm),
        sound: { notes: [{ midi: [dm.a.midi, dm.b.midi], at: 0, dur: 1.6 }] },
      },
      {
        title: m.music_lessons_jam_guide_through_title({ name: JAM_EXAMPLE.name }),
        text: m.music_lessons_jam_guide_through_text({
          a: dm.slot.symbol,
          b: g7.slot.symbol,
          c: cm.slot.symbol,
        }),
        steps: [
          {
            text: m.music_lessons_jam_guide_first_step({
              chord: dm.slot.symbol,
              a: dm.a.tone.name,
              roleA: role(dm.a.tone),
              b: dm.b.tone.name,
              roleB: role(dm.b.tone),
            }),
            figure: fig(dm),
          },
          { text: step(dm, g7), figure: fig(g7) },
          { text: step(g7, cm), figure: fig(cm) },
        ],
      },
      {
        title: m.music_lessons_jam_guide_check_title(),
        text: m.music_lessons_jam_guide_check_text({
          set: pct("guide-tones", "set"),
          window: WINDOW(),
          landings: pct("guide-tones", "landings"),
        }),
      },
      {
        title: m.music_lessons_jam_line_passes(),
        text: m.music_lessons_jam_guide_line_text({
          pairs: v
            .map((x) => m.music_lessons_jam_pair({ a: x.a.tone.name, b: x.b.tone.name }))
            .join(", "),
          chords: exampleChords(),
        }),
        sound: soundOf(guideLine()),
      },
    ],
  };
}

const toneCard = (id: "changes" | "chord-tones"): Lesson => {
  const chord = JAM_EXAMPLE.chords[0].symbol;
  const tones = chordTones(chord);
  const both = id === "changes";
  return {
    ...named(id),
    screens: [
      {
        title: both
          ? m.music_lessons_jam_tones_title_changes()
          : m.music_lessons_jam_tones_title_tones(),
        text: both
          ? m.music_lessons_jam_tones_text_changes({
              strong: pct(id, "strong"),
              chord,
              window: WINDOW(),
              landings: pct(id, "landings"),
            })
          : m.music_lessons_jam_tones_text_tones({ chord, strong: pct(id, "strong") }),
        figure: toneFigure(chord, both ? isGuide : () => true),
      },
      {
        title: m.music_lessons_jam_line_passes(),
        text: (both
          ? m.music_lessons_jam_tones_line_changes
          : m.music_lessons_jam_tones_line_tones)({
          chord,
          tones: join(tones.map((t) => t.name)),
        }),
        sound: soundOf(toneLine()),
      },
    ],
  };
};

const thirdsCard = (): Lesson => {
  const slots = slotsOf(JAM_EXAMPLE);
  const third = (s: Slot) => s.tones.find((t) => pc(t.midi) === guideTones(s.symbol).third)!;
  const span = slots.map((s) => third(s).midi);
  return {
    ...named("thirds"),
    screens: [
      {
        title: m.music_lessons_jam_thirds_title(),
        text: m.music_lessons_jam_thirds_text({ window: WINDOW(), aim: pct("thirds", "thirds") }),
        steps: slots.map((s) => ({
          text: m.music_lessons_jam_thirds_step({ chord: s.symbol, note: third(s).name }),
          figure: keys(
            { [near(pc(third(s).midi), 66)]: third(s).label },
            span.map((m) => near(pc(m), 66)),
          ),
        })),
      },
      {
        title: m.music_lessons_jam_line_passes(),
        text: m.music_lessons_jam_thirds_line({ notes: join(slots.map((s) => third(s).name)) }),
        sound: soundOf(thirdLine()),
      },
    ],
  };
};

const setCard = (id: string, intro: string): Lesson => {
  const g = gameOf(id);
  const set = (g.set as { key: number[] }).key;
  const notes = setNotes(set, JAM_EXAMPLE.keyPc).slice(0, set.length);
  const names = notes.map(spell);
  const rests = g.aims.some((a) => a.metric === "rests");
  // A b3 over a major or dominant chord is the blues on purpose, not a wrong note: say so once, over C7.
  const b3 = notes.find((m) => pc(m - JAM_EXAMPLE.keyPc) === 3);
  const check = m.music_lessons_jam_set_check({ pct: pct(id, "set") });
  const C7 = [48, 52, 55, 58];
  return {
    ...named(id),
    screens: [
      {
        title: m.music_lessons_jam_set_title(),
        text: m.music_lessons_jam_set_text({ intro, names: join(names) }),
        figure: keys(Object.fromEntries(notes.map((m, i) => [m, names[i]]))),
        sound: { notes: notes.map((m, i) => ({ midi: [m], at: i * 0.45, dur: 0.4 })) },
      },
      ...(b3 === undefined
        ? []
        : [
            {
              title: m.music_lessons_jam_set_blue_title(),
              text: m.music_lessons_jam_set_blue_text({ note: spell(b3), check }),
              figure: keys(Object.fromEntries(notes.map((m, i) => [m, names[i]]))),
              sound: {
                notes: [
                  { midi: C7, at: 0, dur: 0.45 * notes.length + 0.8 },
                  ...notes.map((m, i) => ({ midi: [m], at: 0.4 + i * 0.45, dur: 0.4 })),
                ],
              },
            },
          ]),
      {
        title: rests ? m.music_lessons_jam_set_rests_title() : m.music_lessons_jam_line_passes(),
        text: `${
          rests
            ? m.music_lessons_jam_set_rests_text({ count: aimOf(id, "rests") })
            : m.music_lessons_jam_set_line_text({ count: set.length })
        }${b3 === undefined ? ` ${check}` : ""}`,
        sound: soundOf(rests ? restingLine(set) : setLine(set)),
      },
    ],
  };
};

const PENTA_INTRO: Record<string, () => string> = {
  "pentatonic-1": m.music_lessons_jam_intro_pentatonic_1,
  "pentatonic-2": m.music_lessons_jam_intro_pentatonic_2,
  "pentatonic-5": m.music_lessons_jam_intro_pentatonic_5,
};

function motifLesson(): Lesson {
  const slots = slotsOf(JAM_EXAMPLE);
  const bars = chorusBars(JAM_EXAMPLE);
  const span = slots.slice(0, 3).flatMap((s) => [s.tones[0].midi, s.tones[1].midi]);
  const rhythm = (n: number): LessonFigure => ({
    kind: "rhythm",
    bars: n,
    perBeat: 2,
    beatsPerBar: 4,
    onsets: Array.from({ length: n }, (_, b) => CHARLESTON.map((x) => b * 4 + x)).flat(),
  });
  return {
    ...named("motif"),
    screens: [
      {
        title: m.music_lessons_jam_motif_title(),
        text: m.music_lessons_jam_motif_text({
          motif: pct("motif", "motif"),
          downbeats: pct("motif", "downbeats"),
        }),
        figure: rhythm(2),
      },
      {
        title: m.music_lessons_jam_charleston_title(),
        text: m.music_lessons_jam_charleston_text({
          a: slotsOf(JAM_EXAMPLE)[0].symbol,
          b: slotsOf(JAM_EXAMPLE)[1].symbol,
        }),
        figure: rhythm(3),
        sound: soundOf(charlestonLine(), 3 * barBeats(JAM_EXAMPLE)),
      },
      {
        title: m.music_lessons_jam_motif_new_title(),
        text: m.music_lessons_jam_motif_new_text(),
        steps: stepsOver((s) => ({
          text: m.music_lessons_jam_motif_step({
            chord: s.symbol,
            a: s.tones[0].name,
            b: s.tones[1].name,
          }),
          figure: keys(
            { [s.tones[0].midi]: "1", [s.tones[1].midi]: m.music_lessons_jam_label_and_of_2() },
            span,
          ),
        })),
      },
      {
        title: m.music_lessons_jam_line_passes(),
        text: m.music_lessons_jam_motif_line({ bars, chords: exampleChords() }),
        sound: soundOf(charlestonLine()),
      },
    ],
  };
}

function approachLesson(): Lesson {
  const s = slotsOf(JAM_EXAMPLE)[0];
  const target = s.tones[0];
  const below = noteName(target.midi - 1, "sharp", false);
  const above = noteName(target.midi + 1, "flat", false);
  const marks = (extra: Record<number, string>) =>
    keys({ [target.midi]: target.name, ...extra }, [target.midi - 1, target.midi + 1]);
  return {
    ...named("approach"),
    screens: [
      {
        title: m.music_lessons_jam_approach_title(),
        text: m.music_lessons_jam_approach_text({ pct: pct("approach", "approach") }),
        figure: marks({
          [target.midi - 1]: m.music_lessons_jam_label_below(),
          [target.midi + 1]: m.music_lessons_jam_label_above(),
        }),
      },
      {
        title: m.music_lessons_jam_approach_ways_title(),
        text: m.music_lessons_jam_approach_ways_text({ note: target.name, chord: s.symbol }),
        steps: [
          {
            text: m.music_lessons_jam_approach_step_aim({ note: target.name }),
            figure: marks({}),
          },
          {
            text: m.music_lessons_jam_approach_step_below({ from: below, note: target.name }),
            figure: marks({ [target.midi - 1]: m.music_lessons_jam_label_from_below() }),
          },
          {
            text: m.music_lessons_jam_approach_step_above({ from: above, note: target.name }),
            figure: marks({ [target.midi + 1]: m.music_lessons_jam_label_from_above() }),
          },
        ],
      },
      {
        title: m.music_lessons_jam_approach_when_title(),
        text: m.music_lessons_jam_approach_when_text(),
      },
      {
        title: m.music_lessons_jam_line_passes(),
        text: m.music_lessons_jam_approach_line({ bars: chorusBars(JAM_EXAMPLE) }),
        sound: soundOf(approachLine()),
      },
    ],
  };
}

const offBeatCard = (): Lesson => ({
  ...named("off-beat"),
  screens: [
    {
      title: m.music_lessons_jam_offbeat_title(),
      text: m.music_lessons_jam_offbeat_text({ pct: pct("off-beat", "offbeat") }),
      // Each phrase starts on the and of 1, after the beat, then stops.
      figure: {
        kind: "rhythm",
        bars: 2,
        perBeat: 2,
        beatsPerBar: 4,
        onsets: [0.5, 1, 1.5, 4.5, 5, 5.5],
      },
    },
    {
      title: m.music_lessons_jam_line_passes(),
      text: m.music_lessons_jam_offbeat_line(),
      sound: soundOf(offBeatLine()),
    },
  ],
});

function windowsCard(id: "space" | "space-1" | "call-response"): Lesson {
  const w = gameOf(id).windows!;
  const rhythm = (mine: number[]): LessonFigure => ({
    kind: "rhythm",
    bars: 4,
    perBeat: 2,
    beatsPerBar: 4,
    onsets: mine.flatMap((b) => [b * 4, b * 4 + 1.5]),
  });
  const n = (k: number) => m.music_lessons_jam_bars({ count: k });
  const call = id === "call-response";
  return {
    ...named(id),
    screens: [
      {
        title: call
          ? m.music_lessons_jam_windows_title_call()
          : m.music_lessons_jam_windows_title_space(),
        text: (call
          ? m.music_lessons_jam_windows_text_call
          : m.music_lessons_jam_windows_text_space)({
          band: n(w.band),
          you: n(w.you),
          rule: BAND(),
          pct: pct(id, "windows"),
        }),
        figure: rhythm(call ? [2, 3] : id === "space" ? [0, 1] : [0, 2]),
      },
      {
        title: m.music_lessons_jam_line_passes(),
        figure: rhythm(call ? [2, 3] : id === "space" ? [0, 1] : [0, 2]),
        text: call
          ? m.music_lessons_jam_windows_line_call()
          : m.music_lessons_jam_windows_line_space(),
        sound: soundOf(windowLine(id)),
      },
    ],
  };
}

function bridgeCard(): Lesson {
  const tune = TUNES.find((p) => p.id === "tune-rhythm-changes")!;
  const changes = bridgeChanges(tune);
  const thirdOf = (symbol: string) => {
    const s = slotsOf(tune).find((x) => x.symbol === symbol)!;
    return s.tones.find((t) => pc(t.midi) === guideTones(symbol).third)!;
  };
  return {
    ...named("bridge"),
    screens: [
      {
        title: m.music_lessons_jam_bridge_title(),
        text: m.music_lessons_jam_bridge_text({ window: WINDOW(), pct: pct("bridge", "landings") }),
        figure: keys(
          Object.fromEntries(changes.map((c) => [near(pc(thirdOf(c.symbol).midi), 66), c.symbol])),
          changes.map((x) => near(pc(thirdOf(x.symbol).midi), 66)),
        ),
      },
      {
        title: m.music_lessons_jam_bridge_steps_title(),
        text: m.music_lessons_jam_bridge_steps_text({
          tune: tune.name,
          chords: join(changes.map((c) => c.symbol)),
        }),
        steps: changes.map((c) => {
          const t = thirdOf(c.symbol);
          const at = near(pc(t.midi), 66);
          return {
            text: m.music_lessons_jam_bridge_step({ chord: c.symbol, note: t.name }),
            figure: keys(
              { [at]: t.label },
              changes.map((x) => near(pc(thirdOf(x.symbol).midi), 66)),
            ),
          };
        }),
      },
      {
        title: m.music_lessons_jam_line_passes(),
        text: m.music_lessons_jam_bridge_line(),
        sound: soundOf(bridgeLine(tune)),
      },
    ],
  };
}

function displacementLesson(): Lesson {
  const bpb = barBeats(JAM_EXAMPLE);
  const bars = chorusBars(JAM_EXAMPLE);
  const aim = aimOf("displacement", "displaced");
  const rhythm: LessonFigure = {
    kind: "rhythm",
    bars: 3,
    perBeat: 2,
    beatsPerBar: 4,
    onsets: [0, 1, 2].flatMap((k) => [0, 0.5, 1].map((x) => k * (bpb + 1) + x)),
  };
  return {
    ...named("displacement"),
    screens: [
      {
        title: m.music_lessons_jam_displace_title(),
        text: m.music_lessons_jam_displace_text(),
        figure: {
          ...rhythm,
          bars: 2,
          onsets: [0, 1].flatMap((k) => [0, 0.5, 1].map((x) => k * (bpb + 1) + x)),
        },
      },
      {
        title: m.music_lessons_jam_displace_beats_title(),
        text: m.music_lessons_jam_displace_beats_text(),
        figure: rhythm,
        sound: soundOf(displacementLine(), 3 * (bpb + 1)),
      },
      {
        title: m.music_lessons_jam_displace_count_title(),
        text: m.music_lessons_jam_displace_count_text({
          aim,
          bars,
          name: JAM_EXAMPLE.name,
          aim12: aimOf("displacement", "displaced", 12),
          repeats: displacementLine().length / 3 - 1,
        }),
        sound: soundOf(displacementLine()),
      },
    ],
  };
}

function sideSlipLesson(): Lesson {
  const s = slotsOf(JAM_EXAMPLE)[0];
  const { plain, slipped, outside } = slipOf(s);
  const lit = (ms: number[], role: (midi: number) => string) =>
    keys(Object.fromEntries(ms.map((x) => [x, role(x)])), [...plain, ...slipped]);
  const inside = (midi: number) =>
    [...s.scale, ...s.tones.map((t) => t.midi)].some((x) => pc(x) === pc(midi));
  const inOut = (midi: number) =>
    inside(midi) ? m.music_lessons_jam_label_in() : m.music_lessons_jam_label_out();
  return {
    ...named("side-slip"),
    screens: [
      {
        title: m.music_lessons_jam_slip_title(),
        text: m.music_lessons_jam_slip_text({
          slips: aimOf("side-slip", "slips"),
          pct: pct("side-slip", "resolved"),
        }),
        figure: lit(slipped, inOut),
      },
      {
        title: m.music_lessons_jam_slip_up_title(),
        text: m.music_lessons_jam_slip_up_text({ chord: s.symbol }),
        steps: [
          {
            text: m.music_lessons_jam_slip_step_plain({
              chord: s.symbol,
              notes: join(plain.map(spell)),
            }),
            figure: lit(plain, (x) => spell(x)),
          },
          {
            text: m.music_lessons_jam_slip_step_slipped({
              notes: join(slipped.map(spell)),
              count: outside.length,
              chord: s.symbol,
            }),
            figure: lit(slipped, inOut),
          },
        ],
      },
      {
        title: m.music_lessons_jam_slip_land_title(),
        text: m.music_lessons_jam_slip_land_text(),
        sound: soundOf(slipLine()),
      },
    ],
  };
}

function quoteCard(): Lesson {
  const head = headOpening();
  return {
    ...named("quote"),
    screens: [
      {
        title: m.music_lessons_jam_quote_title(),
        text: m.music_lessons_jam_quote_text({ pct: pct("quote", "quotes") }),
        figure: {
          kind: "staff",
          clef: "treble",
          notes: head.map((h) => ({ midi: h.midi, beats: 1 })),
        },
      },
      {
        title: m.music_lessons_jam_quote_example_title(),
        text: m.music_lessons_jam_quote_example_text(),
        figure: {
          kind: "staff",
          clef: "treble",
          notes: head.map((h) => ({ midi: h.midi, beats: 1 })),
        },
        sound: {
          notes: [
            ...head.map((h) => ({
              midi: [h.midi],
              at: h.beat * 0.5,
              dur: 0.45,
            })),
            ...head.map((h) => ({
              midi: [h.midi - 12],
              at: 3 + h.beat * 0.5,
              dur: 0.45,
            })),
          ],
        },
      },
    ],
  };
}

function fillsCard(): Lesson {
  const s = slotsOf(JAM_EXAMPLE)[0];
  const [a, b, c] = [s.tones[1], s.tones[2], s.tones[3]];
  const d = { ...s.tones[0], midi: s.tones[0].midi + 12 };
  return {
    ...named("melody-fills"),
    screens: [
      {
        title: m.music_lessons_jam_fills_title(),
        text: m.music_lessons_jam_fills_text({
          pct: pct("melody-fills", "melody"),
          fills: aimOf("melody-fills", "fills", 0, 6),
        }),
        figure: {
          kind: "staff",
          clef: "treble",
          notes: [
            { midi: a.midi, beats: 1 },
            { midi: b.midi, beats: 1 },
            { midi: null, beats: 0.5 },
            { midi: c.midi, beats: 0.5 },
            { midi: d.midi, beats: 0.5 },
            { midi: null, beats: 0.5 },
          ],
        },
      },
      {
        title: m.music_lessons_jam_fills_bar_title(),
        text: m.music_lessons_jam_fills_bar_text(),
        steps: [
          {
            text: m.music_lessons_jam_fills_step_head({ a: a.name, b: b.name }),
            figure: {
              kind: "staff",
              clef: "treble",
              notes: [
                { midi: a.midi, beats: 1 },
                { midi: b.midi, beats: 1 },
                { midi: null, beats: 2 },
              ],
            },
          },
          {
            text: m.music_lessons_jam_fills_step_fill({ a: c.name, b: d.name }),
            figure: {
              kind: "staff",
              clef: "treble",
              notes: [
                { midi: a.midi, beats: 1 },
                { midi: b.midi, beats: 1 },
                { midi: null, beats: 0.5 },
                { midi: c.midi, beats: 0.5 },
                { midi: d.midi, beats: 0.5 },
                { midi: null, beats: 0.5 },
              ],
            },
          },
        ],
      },
      {
        title: m.music_lessons_jam_line_passes(),
        text: m.music_lessons_jam_fills_line({ bars: chorusBars(JAM_EXAMPLE) }),
        sound: soundOf(filledLine()),
      },
    ],
  };
}

/** The lesson for a Jam game, shown in Check. The open game grades no rule, so it has none. */
export function jamGameLesson(gameId: string): Lesson[] {
  switch (gameId) {
    case "changes":
    case "chord-tones":
      return [toneCard(gameId)];
    case "guide-tones":
      return [guideTonesLesson()];
    case "thirds":
      return [thirdsCard()];
    case "three-notes":
      return [setCard("three-notes", m.music_lessons_jam_intro_three_notes())];
    case "blues-scale":
      return [setCard("blues-scale", m.music_lessons_jam_intro_blues_scale())];
    case "pentatonic-1":
    case "pentatonic-2":
    case "pentatonic-5":
      return [setCard(gameId, PENTA_INTRO[gameId]())];
    case "motif":
      return [motifLesson()];
    case "approach":
      return [approachLesson()];
    case "off-beat":
      return [offBeatCard()];
    case "space":
    case "space-1":
    case "call-response":
      return [windowsCard(gameId)];
    case "bridge":
      return [bridgeCard()];
    case "displacement":
      return [displacementLesson()];
    case "side-slip":
      return [sideSlipLesson()];
    case "quote":
      return [quoteCard()];
    case "melody-fills":
      return [fillsCard()];
    default:
      return [];
  }
}

/** Every game id that has a lesson. */
export const jamLessonGames = () =>
  IMPROV_GAMES.map((g) => g.id).filter((id) => jamGameLesson(id).length);
