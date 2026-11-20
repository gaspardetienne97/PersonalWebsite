import { describe, expect, it } from "vite-plus/test";
import comping from "../data/comping-patterns.json";
import twoHand from "../data/two-hand-patterns.json";
import type { NoteEvent } from "../types";
import {
  gradeChordScales,
  gradeComping,
  gradeLick,
  gradePedal,
  pedalTransitions,
  gradeTwoHand,
  gradeVoiceLeading,
  gradeVoicing,
  minimumMovement,
} from "./piano";

const on = (midi: number, at: number, extra: Partial<NoteEvent> = {}): NoteEvent => ({
  kind: "noteon",
  midi,
  velocity: 0.8,
  at,
  source: "midi",
  confidence: 1,
  velocityMeasured: true,
  ...extra,
});

describe("gradeTwoHand", () => {
  const ex = (id: keyof typeof twoHand.examplesTonicC4Bpm80Bars2) => {
    const e = twoHand.examplesTonicC4Bpm80Bars2[id];
    return {
      ...e,
      targets: e.targetEvents.map((t) => ({
        hand: t.hand as "left" | "right",
        midi: t.midiNote,
        beat: t.beat,
      })),
      melodyHand: e.melodyHand as "left" | "right",
    };
  };
  const beatMs = 750;
  const play = (
    targets: { midi: number; beat: number; hand: string }[],
    f: (t: { hand: string }) => Partial<NoteEvent> = () => ({}),
  ) => targets.map((t) => on(t.midi, 1000 + t.beat * beatMs, f(t)));

  it("mirror hands played clean scores 1 and counts together beats", () => {
    const p = ex("contrary-five");
    const r = gradeTwoHand({ ...p, dynamics: false, beatMs, notes: play(p.targets) });
    expect(r).toMatchObject({ score: 1, correct: true, pitch: 1, evenness: 1 });
    const shared = new Set(p.targets.map((t) => t.beat)).size;
    expect(r.together).toEqual({ count: shared, beats: shared });
  });

  it("mirror hands with every note right but the hands apart is not correct", () => {
    const p = ex("contrary-five");
    const notes = play(p.targets).map((n) => (n.midi < p.splitMidi ? { ...n, at: n.at + 80 } : n));
    const r = gradeTwoHand({ ...p, dynamics: false, beatMs, notes });
    expect(r.pitch).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(0.9);
    expect(r.together?.count).toBe(0);
    expect(r.correct).toBe(false);
  });

  it("patterns that do not strike together do not measure it", () => {
    const p = ex("lh-pulse-rh-line");
    const r = gradeTwoHand({ ...p, dynamics: false, beatMs, notes: play(p.targets) });
    expect(r.together).toBeNull();
    expect(r.notMeasured).toEqual([]);
  });

  it("each hand is graded on its own; a missed note does not shift the hand", () => {
    const p = ex("lh-pulse-rh-line");
    const notes = play(p.targets).filter((_, i) => i !== 1);
    const r = gradeTwoHand({ ...p, dynamics: false, beatMs, notes });
    const right = r.hands.find((h) => h.hand === "right")!;
    const left = r.hands.find((h) => h.hand === "left")!;
    expect(left.pitch).toBe(1);
    expect(right.matched).toBe(right.total - 1);
    expect(right.evenness).toBe(1);
    expect(r.score).toBeCloseTo(r.pitch * 0.8 + 0.2, 10);
  });

  it("dynamics: full credit at 0.2 mean-velocity separation, 0.7/0.15/0.15", () => {
    const p = ex("lh-pulse-rh-line");
    const vel = (sep: number) => (t: { hand: string }) => ({
      velocity: t.hand === "right" ? 0.6 + sep : 0.6,
    });
    expect(
      gradeTwoHand({ ...p, dynamics: true, beatMs, notes: play(p.targets, vel(0.3)) }),
    ).toMatchObject({ dynamics: 1, score: 1 });
    const half = gradeTwoHand({ ...p, dynamics: true, beatMs, notes: play(p.targets, vel(0.1)) });
    expect(half.dynamics).toBeCloseTo(0.5, 10);
    expect(half.score).toBeCloseTo(0.7 + 0.15 + 0.075, 10);
  });

  it("on-screen: dynamics and together are not measured and re-weighted, never zero", () => {
    const p = ex("contrary-five");
    const r = gradeTwoHand({
      ...p,
      dynamics: true,
      beatMs,
      notes: play(p.targets, () => ({ source: "onscreen", velocityMeasured: undefined })),
    });
    expect(r.notMeasured).toEqual(["dynamics", "together"]);
    expect(r).toMatchObject({ dynamics: null, together: null, score: 1 });
  });

  it("an empty run scores 0", () => {
    const p = ex("contrary-five");
    expect(gradeTwoHand({ ...p, dynamics: false, beatMs, notes: [] }).score).toBe(0);
  });
});

describe("voicings", () => {
  const dm7 = { expectedPcs: [2, 5, 9, 0, 4], expectedBassPc: 2 };
  it("full credit when every pitch class is there and the bass gate passes", () => {
    expect(gradeVoicing({ ...dm7, played: [62, 65, 69, 72, 76], strict: true })).toMatchObject({
      score: 1,
      correct: true,
      bassOk: true,
    });
  });
  it("half credit for right membership with the wrong root", () => {
    expect(gradeVoicing({ ...dm7, played: [65, 69, 72, 74, 76], strict: true })).toMatchObject({
      score: 0.5,
      bassOk: false,
    });
  });
  it("strict refuses extras; notes-collected mode tolerates them", () => {
    const played = [62, 65, 66, 69, 72, 76];
    expect(gradeVoicing({ ...dm7, played, strict: true })).toMatchObject({
      membership: false,
      score: 0.5,
    });
    expect(gradeVoicing({ ...dm7, played, strict: false }).score).toBe(1);
    expect(gradeVoicing({ ...dm7, played: [62, 65, 69], strict: false }).score).toBeCloseTo(
      0.5 * 0.6,
      10,
    );
  });
  it("arpeggio mode takes the first note as the bass", () => {
    expect(
      gradeVoicing({ ...dm7, played: [62, 76, 72, 69, 65], strict: false, arpeggio: true }).score,
    ).toBe(1);
    expect(
      gradeVoicing({ ...dm7, played: [65, 62, 69, 72, 76], strict: false, arpeggio: true }).score,
    ).toBe(0.5);
  });

  it("voice leading: 1 within 2 semitones of the closest, 0.5 membership only, else 0", () => {
    const base = { fromMidi: [59, 65], targetPcs: [4, 11], register: [55, 72] as [number, number] };
    expect(minimumMovement(base.fromMidi, base.targetPcs, base.register)).toBe(1);
    expect(gradeVoiceLeading({ ...base, played: [59, 64] })).toMatchObject({
      score: 1,
      actualSemitones: 1,
      maxVoiceMove: 1,
    });
    expect(gradeVoiceLeading({ ...base, played: [64, 71] })).toMatchObject({
      score: 0.5,
      actualSemitones: 11,
    });
    expect(gradeVoiceLeading({ ...base, played: [60, 64] })).toMatchObject({
      score: 0,
      membership: false,
    });
    expect(gradeVoiceLeading({ ...base, played: [76, 71] }).membership).toBe(false); // outside the register
  });
});

describe("comping", () => {
  const p = comping.patterns[0];
  const bpm = p.bpm;
  const beatMs = 60000 / bpm;
  const input = {
    lick: p.lick.map((n) => ({ midi: n.midiNote, startBeat: n.startBeat })),
    compRhythm: p.compRhythm,
    bars: p.bars,
    beatsPerBar: 4,
    swing: p.swing,
    beatMs,
    startAt: 0,
    strictness: "normal" as const,
  };
  const perform = (offbeatAt: number) => {
    const t = (beat: number) => (Math.floor(beat) + (beat % 1 ? offbeatAt : 0)) * beatMs;
    const rh = p.lick.map((n) => on(n.midiNote, t(n.startBeat)));
    const lh = [0, 1].flatMap((bar) =>
      p.compRhythm.flatMap((c) => p.shellMidi.map((m, k) => on(m, t(bar * 4 + c.beat) + k * 8))),
    );
    return [...rh, ...lh];
  };

  it("uses matchWindowMs with a half-beat duration", () => {
    expect(gradeComping({ ...input, notes: [] }).windowMs).toBe(81);
  });

  it("straight and swung eighths both land with zero error", () => {
    expect(gradeComping({ ...input, notes: perform(0.5) })).toMatchObject({
      score: 1,
      correct: true,
      lick: { matched: 10, total: 10 },
      comp: { matched: 4, total: 4, extra: 0 },
    });
    expect(gradeComping({ ...input, notes: perform(2 / 3) }).score).toBeCloseTo(1, 10);
    const late = gradeComping({ ...input, notes: perform(0.75) });
    expect(late.correct).toBe(true);
    expect(late.score).toBeLessThan(1);
  });

  it("a missing left-hand hit is not correct", () => {
    const notes = perform(0.5).filter((n) => !(n.midi < 60 && n.at >= 4 * beatMs));
    expect(gradeComping({ ...input, notes })).toMatchObject({
      correct: false,
      comp: { matched: 2 },
    });
  });

  it("an empty run scores 0", () => {
    expect(gradeComping({ ...input, notes: [] }).score).toBe(0);
  });

  it("with shellMidi, a hit missing a shell note does not count", () => {
    const notes = perform(0.5).filter((n) => !(n.midi === 58 && n.at < beatMs));
    const r = gradeComping({ ...input, shellMidi: p.shellMidi, notes });
    expect(r).toMatchObject({ correct: false, comp: { matched: 3, incomplete: 1 } });
    expect(gradeComping({ ...input, shellMidi: p.shellMidi, notes: perform(0.5) }).correct).toBe(
      true,
    );
  });

  it("an extra left-hand onset on beat 3 breaks the Charleston", () => {
    const notes = [...perform(0.5), on(48, 2 * beatMs), on(58, 2 * beatMs + 5)];
    const r = gradeComping({ ...input, shellMidi: p.shellMidi, notes });
    expect(r).toMatchObject({ correct: false, comp: { matched: 4, extra: 1 } });
  });
});

describe("chord-scales input", () => {
  it("accepts the scale as MIDI notes as well as pitch classes", () => {
    const dorian = [62, 64, 65, 67, 69, 71, 72];
    const r = gradeChordScales([
      { symbol: "Dm7", chordPcs: [2, 5, 9, 0], scalePcs: dorian, played: [62, 64, 65, 67] },
    ]);
    expect(r.chords[0]).toMatchObject({ chord: 2, scale: 2, avoid: 0, score: 1 });
  });
});

describe("licks", () => {
  const expected = [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({ midi, startBeat: i }));
  it("positional pitch class, octave-lenient, extras past the phrase ignored", () => {
    const notes = [...expected.map((e, i) => on(e.midi + 12, i * 500)), on(40, 5000)];
    expect(gradeLick({ expected, notes, beatMs: 500 })).toMatchObject({
      score: 1,
      correct: true,
      onTime: 8,
      firstWrong: null,
    });
  });
  it("on time within min(180, beat/4)", () => {
    const notes = expected.map((e, i) => on(e.midi, i * 500 + (i === 3 ? 130 : 0)));
    expect(gradeLick({ expected, notes, beatMs: 500 }).onTime).toBe(7);
  });
  it("first wrong note and its four-note practice window", () => {
    const notes = expected.map((e, i) => on(i === 5 ? 70 : e.midi, i * 500));
    expect(gradeLick({ expected, notes, beatMs: 500 })).toMatchObject({
      matched: 7,
      correct: false,
      firstWrong: 5,
      practiceWindow: [4, 8],
    });
    const early = expected.map((e, i) => on(i === 0 ? 61 : e.midi, i * 500));
    expect(gradeLick({ expected, notes: early, beatMs: 500 }).practiceWindow).toEqual([0, 4]);
  });
  it("fretted position counts only for on-screen taps", () => {
    const fretted = expected.slice(0, 2).map((e, i) => ({ ...e, string: 2, fret: 1 + i * 2 }));
    const tap = (m: number, at: number, fret: number) =>
      on(m, at, { source: "onscreen", string: 2, fret });
    expect(
      gradeLick({ expected: fretted, notes: [tap(60, 0, 1), tap(62, 500, 8)], beatMs: 500 })
        .positions,
    ).toBe(1);
    const midi = gradeLick({ expected: fretted, notes: [on(60, 0), on(62, 500)], beatMs: 500 });
    expect(midi).toMatchObject({ positions: null, notMeasured: ["position"] });
  });
});

describe("chord-scales", () => {
  it("counts chord, scale and avoid tones per chord", () => {
    const r = gradeChordScales([
      {
        symbol: "Dm7",
        chordPcs: [2, 5, 9, 0],
        scalePcs: [2, 4, 5, 7, 9, 11, 0],
        played: [62, 64, 65, 66],
      },
      { symbol: "G7", chordPcs: [7, 11, 2, 5], scalePcs: [7, 9, 11, 0, 2, 4, 5], played: [] },
    ]);
    expect(r.chords).toEqual([
      { symbol: "Dm7", chord: 2, scale: 1, avoid: 1, score: 0.75 },
      { symbol: "G7", chord: 0, scale: 0, avoid: 0, score: 0 },
    ]);
    expect(r).toMatchObject({ graded: 1, score: 0.375, correct: false });
  });
});

describe("pedal", () => {
  // Chords a second apart; the pedal as CC 64 values (1 down, 0 up).
  const cc = (pairs: [number, number][]) => pairs.map(([at, value]) => ({ at, value }));
  it("judges each change: clean, early, blurred, late, no chord", () => {
    const r = gradePedal({
      chordOnsets: [0, 1000, 2000, 3000, 4000, undefined],
      pedal: cc([
        [100, 1], // down after the first chord
        [1080, 0], // lifted 80 ms after chord 2
        [1200, 1], // and back: clean
        [1900, 0], // lifted 100 ms before chord 3: early (a gap)
        [2150, 1],
        // held straight through chord 4: blurred
        [4100, 0], // lifted after chord 5 ...
        [4900, 1], // ... but back 900 ms later: late
      ]),
    });
    expect(r.verdicts).toEqual(["clean", "clean", "early", "blurred", "late", "no-chord"]);
    expect(r.liftMs).toEqual([null, 80, -100, null, 100, null]);
    expect(r.clean).toBe(2);
    expect(r.score).toBeCloseTo(2 / 6);
    expect(r.notMeasured).toEqual([]);
  });

  it("says when no pedal arrived, and reads half-pedal as down", () => {
    expect(gradePedal({ chordOnsets: [0, 1000], pedal: [] }).notMeasured).toEqual(["pedal"]);
    expect(
      pedalTransitions(
        cc([
          [0, 0.6],
          [10, 0.7],
          [20, 0.2],
        ]),
      ),
    ).toEqual([
      { at: 0, down: true },
      { at: 20, down: false },
    ]);
  });
});
