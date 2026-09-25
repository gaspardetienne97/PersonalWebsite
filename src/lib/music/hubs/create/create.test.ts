import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@repo/music-core";
import { buildKitFiles } from "@repo/music-core/io/mpc-kit";
import {
  autoGainDb,
  clipWarning,
  envelope,
  peakDbOf,
  signedDb,
  suggestedBoost,
} from "./audioTakes";
import {
  newKit,
  padLabel,
  placeSamples,
  removeSample,
  samplePath,
  setPad,
  toExportKit,
  toRuntimeKit,
} from "./kits";
import { isOn, patternToSequence, toggleStep, type BeatPattern } from "./pattern";
import {
  docToScore,
  emptyDoc,
  noteAt,
  resizeNote,
  rollRange,
  scoreToDoc,
  toggleNote,
  trackColour,
} from "./roll";
import { clock, pairNotes, takeToScore, type MidiTake } from "$lib/music/takes";

const on = (midi: number, at: number, velocity = 0.8): NoteEvent => ({
  kind: "noteon",
  midi,
  at,
  velocity,
  source: "midi",
  confidence: 1,
});
const off = (midi: number, at: number): NoteEvent => ({
  kind: "noteoff",
  midi,
  at,
  velocity: 0,
  source: "midi",
  confidence: 1,
});

describe("sample kits", () => {
  const kit = () => newKit("Boom Bap", "k1", 0);

  it("labels pads by bank", () => {
    expect([36, 51, 52, 84, 99].map(padLabel)).toEqual(["A01", "A16", "B01", "D01", "D16"]);
  });

  it("stores samples under the kit folder with a safe file name", () => {
    expect(samplePath("k1", "s1", "Kick Drüm 01.WAV")).toBe(
      "music.sample-kits/k1/s1-Kick-Drum-01.wav",
    );
  });

  it("maps recognised names to their pad and the rest to the next free pad of the bank on screen", () => {
    let k = setPad(kit(), 36, { soft: "old" });
    k = { ...k, samples: [{ id: "old", fileName: "a.wav", name: "a", path: "p", size: 1 }] };
    // Kick is taken, so the new kick goes to the next free pad from bank B.
    expect(placeSamples(k, ["Snare_02.wav", "Kick.wav", "weird.wav"], 52)).toEqual([38, 52, 53]);
  });

  it("removing a sample clears the pad layers that used it", () => {
    let k = setPad(kit(), 36, { soft: "a", hard: "b", chokeGroup: 2 });
    k = removeSample(k, "a");
    expect(k.pads).toEqual([{ note: 36, hard: "b", chokeGroup: 2 }]);
    k = setPad(removeSample(k, "b"), 36, { chokeGroup: undefined });
    expect(k.pads).toEqual([]);
  });

  it("exports soft/hard splits and choke groups the MPC reads", () => {
    let k = setPad(kit(), 38, { soft: "s", hard: "h", chokeGroup: 3 });
    k = {
      ...k,
      samples: [
        { id: "s", fileName: "snare soft.wav", name: "Snare soft", path: "p/s", size: 4 },
        { id: "h", fileName: "snare hard.wav", name: "Snare hard", path: "p/h", size: 4 },
      ],
    };
    const exp = toExportKit(k);
    expect(exp.pads[0].layers).toEqual([
      { sampleId: "s", velStart: 0, velEnd: 0.63 },
      { sampleId: "h", velStart: 0.64, velEnd: 1 },
    ]);
    const files = buildKitFiles(exp, [
      { id: "s", fileName: "snare soft.wav", data: new Uint8Array(4) },
      { id: "h", fileName: "snare hard.wav", data: new Uint8Array(4) },
    ]);
    expect(files.map((f) => f.path)).toEqual([
      "Boom-Bap/Boom-Bap.xpm",
      "Boom-Bap/Samples/038-snare-soft.wav",
      "Boom-Bap/Samples/038-snare-hard.wav",
    ]);
    expect(String(files[0].data)).toContain("<MuteGroup>3</MuteGroup>");
    expect(toRuntimeKit(k).pads).toEqual([{ midi: 38, soft: "p/s", hard: "p/h", chokeGroup: 3 }]);
  });
});

describe("beat pattern", () => {
  const p: BeatPattern = { id: "p", name: "p", bpm: 120, steps: {}, updatedAt: 0 };
  it("toggles steps and schedules sixteenths on the kit voice", () => {
    let q = toggleStep(toggleStep(p, 36, 0), 38, 4);
    expect(isOn(q, 36, 0)).toBe(true);
    q = toggleStep(q, 38, 4);
    expect(q.steps).toEqual({ 36: [0] });
    const seq = patternToSequence(toggleStep(q, 42, 2), 2);
    const hits = seq.filter((n) => n.midi !== 0);
    expect(hits.map((n) => [n.midi, n.time, n.voice])).toEqual([
      [36, 0, "kit"],
      [42, 0.25, "kit"],
      [36, 2, "kit"],
      [42, 2.25, "kit"],
    ]);
    // The loop marker keeps the sequence a whole number of bars long.
    expect(Math.max(...seq.map((n) => n.time + n.duration))).toBeCloseTo(4);
  });
});

describe("piano roll", () => {
  it("toggles notes, stops a new note at the next same-pitch note, and resizes on the grid", () => {
    let d = emptyDoc("v1");
    d = toggleNote(d, "v1", 60, 1, 1);
    d = toggleNote(d, "v1", 60, 0.1, 4);
    expect(d.voices[0].notes.map((n) => [n.startBeat, n.durationBeats])).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(noteAt(d.voices[0].notes, 60, 1.75)).toBe(0);
    d = resizeNote(d, "v1", 0, 2.1);
    expect(d.voices[0].notes[0].durationBeats).toBe(2);
    d = resizeNote(d, "v1", 0, 99);
    expect(d.voices[0].notes[0].durationBeats).toBe(d.lengthBeats - 1);
    d = toggleNote(d, "v1", 60, 1.5, 1);
    expect(d.voices[0].notes).toHaveLength(1);
  });

  it("round-trips through the score and wraps track colours", () => {
    let d = emptyDoc("v1");
    d = toggleNote(d, "v1", 40, 0, 1);
    const back = scoreToDoc(docToScore(d, "s"));
    expect(back.voices[0].notes).toEqual(d.voices[0].notes);
    expect(docToScore(d, "s").voices[0].clef).toBe("bass");
    expect(trackColour(6)).toBe(trackColour(0));
    expect(rollRange(d)).toEqual({ low: 36, high: 83 });
  });
});

describe("MIDI takes", () => {
  it("pairs note-offs, closes held notes at the end and handles re-strikes", () => {
    const notes = pairNotes(
      [on(60, 1000), on(64, 1100), off(60, 1500), on(64, 1300), off(64, 1400), on(67, 1600)],
      1000,
      2000,
    );
    expect(notes).toEqual([
      { midi: 60, startMs: 0, durationMs: 500, velocity: 0.8 },
      { midi: 64, startMs: 100, durationMs: 200, velocity: 0.8 },
      { midi: 64, startMs: 300, durationMs: 100, velocity: 0.8 },
      { midi: 67, startMs: 600, durationMs: 400, velocity: 0.8 },
    ]);
  });

  it("turns a take into a score, exact or snapped to the roll grid", () => {
    const take: MidiTake = {
      id: "t",
      createdAt: 0,
      name: "Take 1",
      durationMs: 2100,
      notes: [{ midi: 60, startMs: 260, durationMs: 480, velocity: 0.5 }],
    };
    const exact = takeToScore(take);
    expect(exact.voices[0].notes[0]).toMatchObject({
      startBeat: 0.52,
      durationBeats: 0.96,
      velocity: 0.5,
    });
    const snapped = takeToScore(take, { snap: true });
    expect(snapped.voices[0].notes[0]).toMatchObject({ startBeat: 0.5, durationBeats: 1 });
    expect(snapped.lengthBeats).toBe(8);
    expect(clock(65_000)).toBe("1:05");
    expect(clock(3_725_000)).toBe("1:02:05");
  });
});

describe("audio takes", () => {
  it("draws an envelope and warns before playback gain clips", () => {
    const s = new Float32Array(100).map((_, i) => (i === 50 ? -0.5 : 0.1));
    const env = envelope(s, 10);
    expect(env).toHaveLength(10);
    expect(env[5]).toBe(0.5);
    const peak = peakDbOf(env); // about -6 dB
    expect(clipWarning(peak, 3)).toBeNull();
    expect(clipWarning(peak, 6)).toMatch(
      /^At \+6 dB the loudest moment would clip \(the take peaks at -6 dB\)\. \+5 dB or less stays clean\.$/,
    );
    expect(clipWarning(-Infinity, 18)).toBeNull();
    expect([signedDb(6), signedDb(-12), signedDb(0)]).toEqual(["+6 dB", "−12 dB", "0 dB"]);
  });

  it("lifts a quiet take to a -3 dB peak on playback, and suggests a recording boost", () => {
    expect(autoGainDb(-30)).toBe(18); // capped at the top of the range
    expect(autoGainDb(-15)).toBe(12);
    expect(autoGainDb(-1)).toBe(0); // never cut a loud take
    expect(autoGainDb(-Infinity)).toBe(0);
    // Meter reads -30 dB with +6 dB boost already on: the raw input is -36, so +24 lands near -12.
    expect(suggestedBoost(-30, 6)).toBe(24);
    expect(suggestedBoost(-20, 0)).toBe(8);
    expect(suggestedBoost(-6, 0)).toBe(0);
  });
});
