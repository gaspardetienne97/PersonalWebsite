import { describe, expect, it } from "vitest";
import type { ControlEvent, NoteEvent, Score } from "@repo/music-core";
import {
  buildPass,
  continuity,
  gradeExpression,
  gradeVibrato,
  hideBefore,
  noStopVerdict,
  passMarks,
  playedLevels,
  firstSlip,
  defaultParts,
  fitToRange,
  gradedDrums,
  spotAfter,
  spotRange,
  startSpot,
  tuningRange,
  planPasses,
  retryBpm,
  statesByBeat,
  statesFor,
  toScoreBeat,
  voiceChoices,
  isFirstRun,
  tapScore,
  TAP_MIDI,
  gradeBalance,
  melodyVoice,
  passSequence,
} from "./studio";

// Four bars of quarter notes, one per beat: midi 60 + beat.
const score: Score = {
  id: "s",
  title: "S",
  bpm: 90,
  meter: { beats: 4, beatUnit: 4 },
  voices: [
    {
      id: "p-v1",
      name: "Piano voice 1",
      partId: "p",
      notes: Array.from({ length: 16 }, (_, i) => ({
        midi: 60 + i,
        startBeat: i,
        durationBeats: 1,
      })),
    },
    {
      id: "p-v2",
      name: "Piano voice 2",
      partId: "p",
      notes: [{ midi: 48, startBeat: 0, durationBeats: 4 }],
    },
  ],
  lengthBeats: 16,
  source: { kind: "musicxml" },
};
const sections = [
  { label: "A", startBeat: 0, endBeat: 4 },
  { label: "B", startBeat: 4, endBeat: 8 },
  { label: "C", startBeat: 8, endBeat: 12 },
];

describe("planPasses", () => {
  it("defaults to the whole score", () => {
    expect(
      planPasses(score, sections, {
        mode: "sections",
        picked: [],
        order: "sequence",
        custom: null,
      }),
    ).toEqual([[{ label: "Whole song", startBeat: 0, endBeat: 16 }]]);
  });
  it("joins sections in score order, or splits them per section", () => {
    const seq = planPasses(score, sections, {
      mode: "sections",
      picked: [2, 0],
      order: "sequence",
      custom: null,
    });
    expect(seq.map((p) => p.map((s) => s.label))).toEqual([["A", "C"]]);
    const per = planPasses(score, sections, {
      mode: "sections",
      picked: [2, 0],
      order: "per-section",
      custom: null,
    });
    expect(per.map((p) => p.map((s) => s.label))).toEqual([["A"], ["C"]]);
  });
  it("uses a custom range", () => {
    expect(
      planPasses(score, sections, {
        mode: "custom",
        picked: [],
        order: "sequence",
        custom: { startBeat: 4, endBeat: 6 },
      })[0][0],
    ).toMatchObject({ startBeat: 4, endBeat: 6 });
  });
});

describe("buildPass", () => {
  const segs = planPasses(score, sections, {
    mode: "sections",
    picked: [0, 2],
    order: "sequence",
    custom: null,
  })[0];
  const pass = buildPass(score, ["p-v1"], segs);
  it("rebases joined sections onto one clock", () => {
    expect(pass.lengthBeats).toBe(8);
    expect(pass.groups.map((g) => g.startBeat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(pass.groups.map((g) => g.notes[0].midi)).toEqual([60, 61, 62, 63, 68, 69, 70, 71]);
    expect(pass.scoreBeat).toEqual([0, 1, 2, 3, 8, 9, 10, 11]);
    expect(pass.sections).toEqual([
      { label: "A", startBeat: 0, endBeat: 4 },
      { label: "C", startBeat: 4, endBeat: 8 },
    ]);
  });
  it("tallies the song's sections inside a single range", () => {
    const whole = buildPass(
      score,
      ["p-v1"],
      [{ label: "Whole song", startBeat: 0, endBeat: 16 }],
      sections,
    );
    expect(whole.sections.map((s) => s.label)).toEqual(["A", "B", "C"]);
    const custom = buildPass(
      score,
      ["p-v1"],
      [{ label: "Custom range", startBeat: 2, endBeat: 6 }],
      sections,
    );
    expect(custom.sections).toEqual([
      { label: "A", startBeat: 0, endBeat: 2 },
      { label: "B", startBeat: 2, endBeat: 4 },
    ]);
  });
  it("maps the pass clock back to score beats", () => {
    expect(toScoreBeat(pass, 1.5)).toBe(1.5);
    expect(toScoreBeat(pass, 5)).toBe(9);
    expect(toScoreBeat(pass, 99)).toBe(12);
  });
  it("marks groups by score beat, with a wrong note only on the current group", () => {
    const byBeat = statesByBeat(
      pass,
      ["clean", "with-errors", "current", "pending", "pending", "pending", "pending", "pending"],
      true,
      2,
    );
    const view = [0, 1, 2, 8].map((b, index) => ({ index, startBeat: b }));
    expect(statesFor(view, byBeat)).toEqual({ 0: "correct", 1: "correct", 2: "wrong" });
    const later = statesByBeat(
      pass,
      ["clean", "clean", "current", "pending", "missed", "pending", "pending", "pending"],
      false,
      2,
    );
    expect(statesFor(view, later)).toEqual({
      0: "correct",
      1: "correct",
      2: "active",
      3: "missed",
    });
  });
});

it("retries at +8 / -8 with a 20 BPM floor", () => {
  expect(retryBpm(90, 8)).toBe(98);
  expect(retryBpm(24, -8)).toBe(20);
});

it("groups MusicXML voices by part", () => {
  expect(voiceChoices(score)).toEqual([{ id: "p", label: "Piano", voiceIds: ["p-v1", "p-v2"] }]);
  expect(voiceChoices({ ...score, source: { kind: "midi" } }).map((c) => c.id)).toEqual([
    "p-v1",
    "p-v2",
  ]);
});

describe("fitting a score to an instrument", () => {
  const line = (midis: number[]): Score => ({
    ...score,
    voices: [
      {
        id: "a",
        name: "A",
        notes: midis.map((midi, i) => ({ midi, startBeat: i, durationBeats: 1 })),
      },
    ],
  });
  const uke = tuningRange({ openStrings: [67, 60, 64, 69], fretCount: 15 }); // C4..C6

  it("moves a line by whole octaves when that fits it all, and leaves a fitting one alone", () => {
    const low = line([48, 52, 55, 59]); // C3..B3, below a ukulele
    const r = fitToRange(low, ["a"], uke.low, uke.high);
    expect(r.shift).toBe(12);
    expect(r.folded).toBe(0);
    expect(r.score.voices[0].notes.map((n) => n.midi)).toEqual([60, 64, 67, 71]);
    const ok = line([60, 64, 67]);
    expect(fitToRange(ok, ["a"], uke.low, uke.high).score).toBe(ok);
  });

  it("folds the notes one octave shift cannot reach", () => {
    const wide = line([40, 60, 64, 67, 72]); // an E2 bass note under a melody
    const r = fitToRange(wide, ["a"], uke.low, uke.high);
    expect(r.shift).toBe(0);
    expect(r.folded).toBe(1);
    expect(r.score.voices[0].notes[0].midi).toBe(64);
    expect(r.score.voices[0].notes.every((n) => n.midi >= uke.low && n.midi <= uke.high)).toBe(
      true,
    );
  });
});

describe("fix the trouble spot", () => {
  it("loops the slip's bar and its run-up, slower, then full tempo, then wider, then done", () => {
    const pass = buildPass(score, ["p-v1"], [{ label: "Whole song", startBeat: 0, endBeat: 16 }]);
    // Groups 0..5 clean, group 6 (beat 6, bar 2) slipped.
    expect(firstSlip(pass, (i) => i < 6)).toBe(6);
    expect(firstSlip(pass, () => true)).toBeNull();
    const bounds = { startBeat: 0, endBeat: 16 };
    expect(spotRange(6, 4, bounds)).toEqual({ startBeat: 0, endBeat: 8 });
    expect(spotRange(13, 4, bounds)).toEqual({ startBeat: 8, endBeat: 16 });
    let s = startSpot({ startBeat: 4, endBeat: 12 }, bounds, 100);
    expect(s.bpm).toBe(85);
    // A slip eases the tempo and resets the streak.
    s = spotAfter(s, false, 4);
    expect(s).toMatchObject({ bpm: 81, streak: 0, stage: "slow" });
    for (let i = 0; i < 3; i++) s = spotAfter(s, true, 4);
    expect(s).toMatchObject({ bpm: 100, stage: "tempo", streak: 0 });
    for (let i = 0; i < 3; i++) s = spotAfter(s, true, 4);
    expect(s).toMatchObject({ range: { startBeat: 0, endBeat: 16 }, stage: "wide" });
    for (let i = 0; i < 3; i++) s = spotAfter(s, true, 4);
    expect(s).toMatchObject({ stage: "done", takes: 10 });
    // Never below half the target.
    let slow = startSpot(bounds, bounds, 60);
    for (let i = 0; i < 30; i++) slow = spotAfter(slow, false, 4);
    expect(slow.bpm).toBe(30);
  });
});

describe("gradedDrums", () => {
  it("turns drum notes into drum keys, one per drum per onset, and leaves pitched voices alone", () => {
    const score: Score = {
      id: "d",
      title: "Drums",
      bpm: 100,
      meter: { beats: 4, beatUnit: 4 },
      lengthBeats: 4,
      voices: [
        {
          id: "hands",
          name: "Hands",
          drums: true,
          notes: [
            { midi: 46, startBeat: 0, durationBeats: 1 },
            { midi: 38, startBeat: 1, durationBeats: 1 },
          ],
        },
        {
          id: "feet",
          name: "Feet",
          drums: true,
          notes: [{ midi: 44, startBeat: 0, durationBeats: 1 }],
        },
        { id: "bass", name: "Bass", notes: [{ midi: 40, startBeat: 0, durationBeats: 1 }] },
      ],
    };
    const g = gradedDrums(score);
    expect(g.voices[0].notes.map((n) => n.midi)).toEqual([42, 38]);
    expect(g.voices[1].notes).toEqual([]);
    expect(g.voices[2]).toBe(score.voices[2]);
    const pass = buildPass(g, ["hands", "feet"], [{ label: "Whole", startBeat: 0, endBeat: 4 }]);
    expect(pass.groups.map((x) => x.notes.map((n) => n.midi))).toEqual([[42], [38]]);
  });
});

describe("defaultParts", () => {
  const v = (id: string, drums?: boolean) => ({ id, name: id, drums, notes: [] });
  const song = (...voices: ReturnType<typeof v>[]) =>
    ({
      id: "s",
      title: "S",
      bpm: 90,
      meter: { beats: 4, beatUnit: 4 },
      lengthBeats: 4,
      voices,
    }) as Score;
  it("opens a drums-only song on its drums on any instrument, a mixed one only on the MPC", () => {
    expect(defaultParts(song(v("kit", true)), "guitar")).toBe(true);
    expect(defaultParts(song(v("kit", true), v("bass")), "guitar")).toBe(false);
    expect(defaultParts(song(v("kit", true), v("bass")), "mpc")).toBe(true);
    expect(defaultParts(song(v("bass")), "mpc")).toBe(false);
  });
});

describe("no-stop, memory, dynamics and vibrato", () => {
  const beat = 500;
  const on = (midi: number, at: number, velocity = 0.8, measured = true): NoteEvent => ({
    kind: "noteon",
    midi,
    velocity,
    at,
    source: "midi",
    confidence: 1,
    velocityMeasured: measured,
  });
  const off = (midi: number, at: number): NoteEvent => ({
    kind: "noteoff",
    midi,
    velocity: 0,
    at,
    source: "midi",
    confidence: 1,
  });
  const pass = buildPass(score, ["p-v1"], [{ label: "Whole song", startBeat: 0, endBeat: 16 }]);

  it("measures continuity: bars played and the longest silent stretch", () => {
    const all = Array.from({ length: 16 }, (_, i) => i * beat);
    expect(continuity(pass, all, 0, beat, 4)).toMatchObject({
      share: 1,
      longestGapBeats: 0,
      bars: 4,
    });
    // One wrong-but-played note still counts as going on; one missed beat is a one-beat slip.
    const oneMissed = all.filter((_, i) => i !== 5);
    const c1 = continuity(pass, oneMissed, 0, beat, 4);
    expect(c1).toMatchObject({ share: 1, longestGapBeats: 1, gapAt: 5 });
    expect(noStopVerdict(0.9, c1)).toEqual({ score: 0.9, kept: true });
    // Stopped for bar 3: three quarters of the bars, a four-beat slip.
    const stopped = all.filter((_, i) => i < 8 || i >= 12);
    const c2 = continuity(pass, stopped, 0, beat, 4);
    expect(c2).toMatchObject({ share: 0.75, longestGapBeats: 4, gapAt: 8, barsPlayed: 3 });
    expect(noStopVerdict(0.8, c2)).toEqual({ score: 0.6000000000000001, kept: false });
  });

  it("hides notes before a beat for memory runs", () => {
    const hidden = hideBefore(score, 8);
    expect(hidden.voices[0].notes[0].startBeat).toBe(8);
    expect(hidden.voices[1].notes).toEqual([]);
    expect(hideBefore(score, 0)).toBe(score);
  });

  it("grades dynamics and breaths loosely, from velocity or breath", () => {
    const marked: Score = {
      ...score,
      dynamics: [
        { startBeat: 0, mark: "p" },
        { startBeat: 8, mark: "f" },
      ],
      hairpins: [{ startBeat: 12, endBeat: 16, kind: "diminuendo" }],
      breaths: [4],
    };
    const marks = passMarks(marked, pass);
    expect(marks).toEqual({
      dynamics: [
        { beat: 0, mark: "p" },
        { beat: 8, mark: "f" },
      ],
      hairpins: [{ start: 12, end: 16, kind: "diminuendo" }],
      breaths: [4],
    });
    // Soft, then loud, then dying away; a gap before beat 4.
    const vel = (i: number) => (i < 8 ? 0.3 : i < 12 ? 0.8 : 0.8 - (i - 12) * 0.15);
    const notes = Array.from({ length: 16 }, (_, i) => [
      on(60 + i, i * beat, vel(i)),
      off(60 + i, i * beat + (i === 3 ? 380 : 495)),
    ]).flat();
    const r = gradeExpression({
      marks,
      notes,
      controls: [],
      startAt: 0,
      beatMs: beat,
      lengthBeats: 16,
    });
    expect(r).toMatchObject({
      score: 1,
      dynamics: { right: 2, total: 2 },
      breaths: { right: 1, total: 1 },
    });
    // Flat velocity and legato through the breath: nothing came out.
    const flat = Array.from({ length: 16 }, (_, i) => [
      on(60 + i, i * beat, 0.6),
      off(60 + i, i * beat + 499),
    ]).flat();
    expect(
      gradeExpression({
        marks,
        notes: flat,
        controls: [],
        startAt: 0,
        beatMs: beat,
        lengthBeats: 16,
      }).score,
    ).toBe(0);
    // On-screen keys measure no loudness: only the breath mark is judged.
    const taps = flat.map((n) => ({ ...n, velocityMeasured: undefined }));
    const t = gradeExpression({
      marks,
      notes: taps,
      controls: [],
      startAt: 0,
      beatMs: beat,
      lengthBeats: 16,
    });
    expect(t.unmeasured).not.toBeNull();
    expect(t.dynamics.total).toBe(0);
    // Breath (CC 2) wins over velocity when it arrives.
    const cc = (value: number, at: number): ControlEvent => ({
      kind: "cc",
      controller: 2,
      value,
      at,
    });
    expect(playedLevels([on(60, 0, 0.9)], [cc(0.2, 10), cc(0.3, 100)])).toEqual([
      { at: 0, level: 0.3 },
    ]);
  });

  it("finds vibrato on held notes from the bite", () => {
    const held: Score = {
      ...score,
      voices: [
        {
          id: "a",
          name: "Alto",
          notes: [
            { midi: 67, startBeat: 0, durationBeats: 2 },
            { midi: 69, startBeat: 2, durationBeats: 2 },
          ],
        },
      ],
      lengthBeats: 4,
    };
    const p = buildPass(held, ["a"], [{ label: "Whole", startBeat: 0, endBeat: 4 }]);
    const wobble = (from: number, ms: number, hz: number): ControlEvent[] =>
      Array.from({ length: ms / 20 }, (_, i) => ({
        kind: "pitchbend",
        value: 0.1 * Math.sin((2 * Math.PI * hz * i * 20) / 1000),
        at: from + i * 20,
      }));
    const notes = [on(67, 0), off(67, 990), on(69, 1000), off(69, 1990)];
    const v = gradeVibrato({
      pass: p,
      notes,
      controls: [...wobble(0, 980, 4.5), ...wobble(1000, 980, 9)],
      startAt: 0,
      beatMs: beat,
    });
    expect(v).toEqual({ share: 0.5, held: 2, withVibrato: 1 });
    expect(
      gradeVibrato({ pass: p, notes, controls: [], startAt: 0, beatMs: beat }).share,
    ).toBeNull();
  });
});

describe("sight-read: the first run", () => {
  const run = (song: string, shelf?: string, exerciseId = "song.studio") => ({
    exerciseId,
    params: { song, ...(shelf ? { shelf } : {}) },
  });
  it("is the first run until a run plays the song, by id or by shelf key", () => {
    expect(isFirstRun([], "a")).toBe(true);
    expect(isFirstRun([run("b"), run("a", undefined, "reading.sight-reading")], "a")).toBe(true);
    expect(isFirstRun([run("a")], "a")).toBe(false);
    // The same shelf song imported again under a new id has still been played.
    expect(isFirstRun([run("old", "reading/minuet")], "new", "reading/minuet")).toBe(false);
    expect(isFirstRun([run("old", "reading/other")], "new", "reading/minuet")).toBe(true);
  });
});

describe("tap the rhythm", () => {
  it("keeps one tap per attack of the selected voices, not ties or pitches", () => {
    const two: Score = {
      ...score,
      voices: [
        {
          id: "rh",
          name: "RH",
          notes: [
            { midi: 72, startBeat: 0, durationBeats: 1 },
            { midi: 76, startBeat: 0, durationBeats: 1 },
            { midi: 74, startBeat: 1, durationBeats: 1 },
            { midi: 74, startBeat: 2, durationBeats: 1, tieFrom: true },
          ],
        },
        { id: "lh", name: "LH", notes: [{ midi: 48, startBeat: 0.5, durationBeats: 2 }] },
      ],
    };
    const t = tapScore(two, ["rh", "lh"]);
    expect(t.voices).toHaveLength(1);
    expect(t.voices[0].notes.map((n) => [n.startBeat, n.midi])).toEqual([
      [0, TAP_MIDI],
      [0.5, TAP_MIDI],
      [1, TAP_MIDI],
    ]);
    expect(tapScore(two, ["rh"]).voices[0].notes.map((n) => n.startBeat)).toEqual([0, 1]);
  });
});

describe("the duet partner", () => {
  it("plays the other voices on the pass clock", () => {
    const p = buildPass(score, ["p-v2"], [{ label: "B", startBeat: 4, endBeat: 8 }]);
    expect(passSequence(p, 120, () => false)).toEqual([]);
    const all = buildPass(score, ["p-v2"], [{ label: "Whole", startBeat: 0, endBeat: 16 }]);
    expect(passSequence(all, 120, () => false)).toEqual([
      { midi: 48, time: 0, duration: 1.9, velocity: 0.8 },
    ]);
  });
});

describe("voicing balance", () => {
  const beat = 500;
  const on = (midi: number, at: number, velocity: number, measured = true): NoteEvent => ({
    kind: "noteon",
    midi,
    velocity,
    at,
    source: "midi",
    confidence: 1,
    velocityMeasured: measured,
  });
  // Melody C5 D5 over a C3 and a G3 struck with each.
  const ballad: Score = {
    ...score,
    voices: [
      {
        id: "mel",
        name: "Melody",
        notes: [
          { midi: 72, startBeat: 0, durationBeats: 1 },
          { midi: 74, startBeat: 1, durationBeats: 1 },
        ],
      },
      {
        id: "acc",
        name: "Accompaniment",
        notes: [
          { midi: 48, startBeat: 0, durationBeats: 1 },
          { midi: 55, startBeat: 1, durationBeats: 1 },
        ],
      },
    ],
    lengthBeats: 2,
  };
  const pass = buildPass(ballad, ["mel", "acc"], [{ label: "Whole", startBeat: 0, endBeat: 2 }]);
  it("finds the melody voice", () => expect(melodyVoice(ballad, ["mel", "acc"])).toBe("mel"));
  it("counts the melody notes struck louder than the notes under them", () => {
    const notes = [on(72, 0, 0.9), on(48, 10, 0.5), on(74, 500, 0.6), on(55, 505, 0.6)];
    expect(gradeBalance({ pass, melody: "mel", notes, startAt: 0, beatMs: beat })).toEqual({
      share: 0.5,
      right: 1,
      total: 2,
    });
  });
  it("is not measured without MIDI velocity", () => {
    const notes = [on(72, 0, 0.8, false), on(48, 10, 0.8, false)];
    expect(gradeBalance({ pass, melody: "mel", notes, startAt: 0, beatMs: beat }).share).toBeNull();
  });
});
