// Lessons for the Jam games: shown the first time the player switches to Check on a game. Every
// game that grades against a rule has one (the open "free" game grades none). The worked examples
// are lines over the default ii-V-I that the game's own grader passes (see jam.test.ts), and every
// threshold comes from the game's aims in scoring/improv.ts.

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

const join = (a: string[]) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
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
const BAND =
  "no note may start in the band's bars, apart from a landing in their first half beat and a pickup in their last half beat";

/** The window the grader gives a landing on a change. */
const WINDOW = "from half a beat before a change to a beat after it";

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

/** `set` (semitones above the key) up and back down from the key's tonic, a beat each. */
const setNotes = (set: number[], keyPc: number) => {
  const up = set.map((s) => 60 + pc(keyPc + s - 60));
  const asc = up.map((m, i) => (i && m <= up[i - 1] ? m + 12 : m)).sort((x, y) => x - y);
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
  const role = (t: { label: string }) => (t.label.includes("3") ? "3rd" : "7th");
  const marks = (x: (typeof v)[number]) => ({
    [x.a.midi]: x.a.tone.label,
    [x.b.midi]: x.b.tone.label,
  });
  const span = v.slice(0, 3).flatMap((x) => [x.a.midi, x.b.midi]);
  const fig = (x: (typeof v)[number]) => keys(marks(x), span);
  const move = (
    from: { midi: number; tone: { name: string } },
    to: { midi: number; tone: { name: string; label: string } },
  ) =>
    from.midi === to.midi
      ? `${to.tone.name} stays, now the ${role(to.tone)}`
      : `${from.tone.name} moves ${to.midi < from.midi ? "down" : "up"} a ${Math.abs(to.midi - from.midi) === 1 ? "half" : "whole"} step to ${to.tone.name}, now the ${role(to.tone)}`;
  const step = (from: (typeof v)[number], to: (typeof v)[number]) =>
    `${to.slot.symbol}: ${move(from.a, to.a)}. ${move(from.b, to.b)}.`;
  return {
    ...named("guide-tones"),
    screens: [
      {
        title: "The notes that name a chord",
        text: `The 3rd says whether a chord is major or minor, and the 7th says what kind of seventh it is. Together they are the guide tones. In ${dm.slot.symbol} they are ${dm.a.tone.name} and ${dm.b.tone.name}.`,
        figure: fig(dm),
        sound: { notes: [{ midi: [dm.a.midi, dm.b.midi], at: 0, dur: 1.6 }] },
      },
      {
        title: `Through the ${JAM_EXAMPLE.name}`,
        text: `Tap Next to follow the guide tones through ${dm.slot.symbol}, ${g7.slot.symbol} and ${cm.slot.symbol}. Each one moves by no more than a half step.`,
        steps: [
          {
            text: `${dm.slot.symbol}: ${dm.a.tone.name} is the ${role(dm.a.tone)} and ${dm.b.tone.name} is the ${role(dm.b.tone)}.`,
            figure: fig(dm),
          },
          { text: step(dm, g7), figure: fig(g7) },
          { text: step(g7, cm), figure: fig(cm) },
        ],
      },
      {
        title: "What Check counts",
        text: `At least ${pct("guide-tones", "set")}% of your notes must be a guide tone of the chord sounding, or of the one arriving within half a beat. A guide tone must also land ${WINDOW} for ${pct("guide-tones", "landings")}% of the changes. On a 6th chord the 6th stands in for the 7th.`,
      },
      {
        title: "A line that passes",
        text: `Each chord's first bar has its two guide tones, one on beat 1 and one on beat 3, then the second bar rests. The pairs are ${v.map((x) => `${x.a.tone.name} and ${x.b.tone.name}`).join(", ")}, for ${exampleChords()}.`,
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
        title: both ? "Two things to hit" : "A chord tone on 1 and 3",
        text: both
          ? `A note that starts on beat 1 or 3 (within a quarter of a beat) should be a tone of the chord sounding, for ${pct(id, "strong")}% of them. A 3rd or 7th should land ${WINDOW} for ${pct(id, "landings")}% of the changes. Your weakest of the two sets the score, and in a waltz only beat 1 counts.`
          : `Every note that starts on beat 1 or 3 (within a quarter of a beat) must be a tone of the chord sounding. The score is the share that are, and the aim is ${pct(id, "strong")}%. Notes on the other beats are free, and in a waltz only beat 1 counts.`,
        figure: toneFigure(chord, both ? isGuide : () => true),
      },
      {
        title: "A line that passes",
        text: `${chord} has ${join(tones.map((t) => t.name))}. ${both ? "The line puts the 3rd on each change, then the 5th, 7th and root in turn," : "The line plays the 3rd, 5th, 7th and root of each chord in turn,"} all on beats 1 and 3.`,
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
        title: "The 3rd of each new chord",
        text: `Land on the 3rd of every chord that differs from the one before, ${WINDOW}. The score is the share of changes landed, and the aim is ${pct("thirds", "thirds")}%. A 7th does not count here, and on a sus chord the 4th stands in for the 3rd.`,
        steps: slots.map((s) => ({
          text: `${s.symbol}: land on ${third(s).name}.`,
          figure: keys(
            { [near(pc(third(s).midi), 66)]: third(s).label },
            span.map((m) => near(pc(m), 66)),
          ),
        })),
      },
      {
        title: "A line that passes",
        text: `The line lands on ${join(slots.map((s) => third(s).name))} as the changes arrive, holding each for two beats. When the form comes back round to a different chord, that counts as a change too.`,
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
  return {
    ...named(id),
    screens: [
      {
        title: "The notes you may use",
        text: `${intro} In the key of C that is ${join(names)}. Check scores the share of your notes in the set, and the aim is ${pct(id, "set")}%, in any octave.`,
        figure: keys(Object.fromEntries(notes.map((m, i) => [m, names[i]]))),
      },
      {
        title: rests ? "Notes and rests" : "A line that passes",
        text: rests
          ? `Rests count too: the aim is ${aimOf(id, "rests")} silences of two beats or more in a chorus, measured from when you let go of a note. This line plays two notes, then rests for two beats, in every bar.`
          : `This plays the ${set.length} notes up and back down. Time and rests are not graded in this game, only the notes.`,
        sound: soundOf(rests ? restingLine(set) : setLine(set)),
      },
    ],
  };
};

const PENTA_WHERE: Record<string, string> = {
  "pentatonic-1": "on the key's tonic",
  "pentatonic-2": "a step above the key's tonic",
  "pentatonic-5": "a fifth above the key's tonic",
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
        title: "Keep one rhythm",
        text: `Pick the rhythm of one bar and repeat it as the chords change. Check compares where your notes start, to the nearest eighth note, so only the start times matter. Use the same rhythm in at least two thirds of your bars, with a chord tone on beat 1 in ${pct("motif", "downbeats")}% of them.`,
      },
      {
        title: "The Charleston",
        text: `The Charleston is one of the best-known rhythms: a note on beat 1 and a note on the and of 2. Here it is in three bars, two over ${slotsOf(JAM_EXAMPLE)[0].symbol} and one over ${slotsOf(JAM_EXAMPLE)[1].symbol}.`,
        figure: rhythm(3),
        sound: soundOf(charlestonLine(), 3 * barBeats(JAM_EXAMPLE)),
      },
      {
        title: "New notes for each chord",
        text: "Tap Next to see the same rhythm take a chord tone from each chord. Beat 1 gets the root and the and of 2 gets the 3rd.",
        steps: stepsOver((s) => ({
          text: `${s.symbol}: ${s.tones[0].name} on beat 1, ${s.tones[1].name} on the and of 2.`,
          figure: keys({ [s.tones[0].midi]: "1", [s.tones[1].midi]: "and of 2" }, span),
        })),
      },
      {
        title: "A line that passes",
        text: `That plays the Charleston in all ${bars} bars of ${exampleChords()}, so every bar has the same rhythm and a chord tone on beat 1.`,
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
        title: "Lean in from a half step",
        text: `An approach note is a half step above or below the note you are heading for. Check wants a chord tone on beat 1 of every bar, with the note played just before it a half step away. The score is the share of your bars that do, so an empty bar of yours counts as a miss.`,
      },
      {
        title: "One target, two ways in",
        text: `The target is ${target.name}, a tone of ${s.symbol}. Tap Next to see each approach.`,
        steps: [
          {
            text: `Aim: ${target.name}, a chord tone on beat 1.`,
            figure: marks({}),
          },
          {
            text: `From below: ${below}, then ${target.name}.`,
            figure: marks({ [target.midi - 1]: "from below" }),
          },
          {
            text: `From above: ${above}, then ${target.name}.`,
            figure: marks({ [target.midi + 1]: "from above" }),
          },
        ],
      },
      {
        title: "When to play it",
        text: "The approach note should start in the beat before beat 1, such as on beat 4 or the and of 4, and it is the last note you play before the target. Either side works, so mix them up.",
      },
      {
        title: "A line that passes",
        text: `This line aims at a chord tone on beat 1 of all ${chorusBars(JAM_EXAMPLE)} bars, coming from below in one bar and above in the next.`,
        sound: soundOf(approachLine()),
      },
    ],
  };
}

const offBeatCard = (): Lesson => ({
  ...named("off-beat"),
  screens: [
    {
      title: "Where a phrase begins",
      text: `A phrase is a run of notes with less than a beat of silence between them, so a pause of a beat or more starts a new one. Each new phrase should begin clearly between beats, such as on the and of 1 or the and of 4. The score is the share that do, and the aim is ${pct("off-beat", "offbeat")}%.`,
    },
    {
      title: "A line that passes",
      text: "This line starts a short phrase on the and of 1 in every bar, then stops for the rest of the bar.",
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
  const n = (k: number) => (k === 1 ? "one bar" : `${k} bars`);
  const call = id === "call-response";
  return {
    ...named(id),
    screens: [
      {
        title: call ? "Listen, then answer" : "Play, then leave space",
        text: call
          ? `The band plays a call for ${n(w.band)}, then you answer for ${n(w.you)}. Your answer needs a note in it, but ${BAND}. The score is the share of stretches kept, yours and the band's, and the aim is ${pct(id, "windows")}%.`
          : `You play for ${n(w.you)}, then the band has ${n(w.band)} to itself, all chorus. Your bars need a note in them, but ${BAND}. The score is the share of stretches kept, yours and the band's, and the aim is ${pct(id, "windows")}%.`,
        figure: rhythm(call ? [2, 3] : id === "space" ? [0, 1] : [0, 2]),
      },
      {
        title: "A line that passes",
        text: call
          ? "The picture shows only your answers: nothing in the band's bars, then two notes in each of yours. The sound plays your answers too, and the band plays the calls in the drill."
          : "The picture and the sound show your part: two notes in each of your bars and nothing in the band's.",
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
        title: "Only the bridge counts",
        text: `The A sections are not graded: rest in them or play the head. In the bridge, land a 3rd or 7th ${WINDOW} for ${pct("bridge", "landings")}% of the changes. A tune with no section marked B is graded on every bar.`,
      },
      {
        title: "A bridge, change by change",
        text: `${tune.name} has a bridge of ${join(changes.map((c) => c.symbol))}. Tap Next to see a 3rd to land on for each.`,
        steps: changes.map((c) => {
          const t = thirdOf(c.symbol);
          const m = near(pc(t.midi), 66);
          return {
            text: `${c.symbol}: ${t.name}, the 3rd.`,
            figure: keys(
              { [m]: t.label },
              changes.map((x) => near(pc(thirdOf(x.symbol).midi), 66)),
            ),
          };
        }),
      },
      {
        title: "A line that passes",
        text: "This line lands on the 3rd of each bridge change as it arrives, and says nothing in the A sections.",
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
        title: "The same idea, a beat later",
        text: "Play a short motif of 2 to 6 notes, then play it again with the same rhythm, starting one beat later in its bar. A repeat counts when it comes no more than two bars after the last one. The pitches are free to change.",
      },
      {
        title: "Beat 1, beat 2, beat 3",
        text: "Here a three-note motif starts on beat 1 of the first bar, on beat 2 of the next and on beat 3 of the one after. So the motif slides later through each bar.",
        figure: rhythm,
        sound: soundOf(displacementLine(), 3 * (bpb + 1)),
      },
      {
        title: "How many",
        text: `The aim is a displaced motif in two bars of every three. In the ${bars} bars of ${JAM_EXAMPLE.name} that is ${aim} displaced repeats, and it counts repeats, not bars. The sound runs a three-note motif through all ${bars} bars, ${displacementLine().length / 3 - 1} displaced repeats on the root, 3rd and 5th of the chord sounding.`,
        sound: soundOf(displacementLine()),
      },
    ],
  };
}

function sideSlipLesson(): Lesson {
  const s = slotsOf(JAM_EXAMPLE)[0];
  const { plain, slipped, outside } = slipOf(s);
  const lit = (ms: number[], role: (m: number) => string) =>
    keys(Object.fromEntries(ms.map((m) => [m, role(m)])), [...plain, ...slipped]);
  const inside = (m: number) =>
    [...s.scale, ...s.tones.map((t) => t.midi)].some((x) => pc(x) === pc(m));
  return {
    ...named("side-slip"),
    screens: [
      {
        title: "Step outside, then come back",
        text: `A side-slip is a phrase of three or more notes that are neither chord tones nor in the chord's scale, played within a beat of each other with no two inside notes in a row. It ends by resolving to a chord tone on the next beat, no more than a beat and a half after the last slip note. The aim is ${aimOf("side-slip", "slips")} slips a chorus, every one resolved.`,
      },
      {
        title: "Slide a phrase up",
        text: `The easy way: take a phrase from the scale and play it all a half step higher. Tap Next to try it on ${s.symbol}.`,
        steps: [
          {
            text: `The first four notes of the ${s.symbol} scale: ${join(plain.map(spell))}.`,
            figure: lit(plain, (m) => spell(m)),
          },
          {
            text: `A half step higher: ${join(slipped.map(spell))}. ${outside.length} of the 4 are outside ${s.symbol} and its scale.`,
            figure: lit(slipped, (m) => (inside(m) ? "in" : "out")),
          },
        ],
      },
      {
        title: "Land it",
        text: "This line slips the first four notes of each chord's scale up a half step, then plays a chord tone on the next beat. The slip is the tension and the chord tone is the release.",
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
        title: "Start from the tune",
        text: `Open each A section with a run of at least four notes from the head: the same pitch names and the same steps between them, in any octave. A repeated note counts once. The run must start from half a beat before the section up to two bars into it, and the aim is every A section.`,
      },
      {
        title: "An example",
        text: "Say the head opens with these four notes. Hear them, then the same four an octave lower, which is a quote. After that, develop it in your own way.",
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
        title: "Head, then fills",
        text: `Play the head, and fill its rests of two beats or more. Check wants ${pct("melody-fills", "melody")}% of the head's notes played, in any octave and within half a beat of where the head puts them. A fill is 2 to 4 notes that start inside the rest but not in its last half beat, and the aim is ${aimOf("melody-fills", "fills", 0, 6)} filled rests a chorus, or all of them if the head has fewer.`,
      },
      {
        title: "A bar",
        text: "The head here plays two notes, then rests for two beats. Tap Next to fill the rest.",
        steps: [
          {
            text: `The head: ${a.name} and ${b.name}, then two beats of rest.`,
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
            text: `A fill of two notes, ${c.name} and ${d.name}, inside the rest.`,
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
        title: "A line that passes",
        text: `This plays the head's notes in all ${chorusBars(JAM_EXAMPLE)} bars with a two-note fill in each rest.`,
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
      return [
        setCard("three-notes", "Use only the key's 1, b3 and 5, the notes of a minor triad."),
      ];
    case "blues-scale":
      return [
        setCard("blues-scale", "Use only the key's blues scale: the 1, b3, 4, b5, 5 and b7."),
      ];
    case "pentatonic-1":
    case "pentatonic-2":
    case "pentatonic-5":
      return [
        setCard(
          gameId,
          `Use only the minor pentatonic ${PENTA_WHERE[gameId]}: its 1, b3, 4, 5 and b7.`,
        ),
      ];
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
