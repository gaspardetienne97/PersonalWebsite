import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import type { Score } from "../types";
import { midiToScore, scoreToMidi } from "./midi-file";

const score: Score = {
  id: "s",
  title: "Round trip",
  bpm: 96,
  meter: { beats: 3, beatUnit: 4 },
  keyFifths: -3,
  keyMode: "minor",
  voices: [
    {
      id: "rh",
      name: "Right hand",
      notes: [
        { midi: 72, startBeat: 0, durationBeats: 1, velocity: 0.5 },
        { midi: 74, startBeat: 1, durationBeats: 2 },
        { midi: 74, startBeat: 3, durationBeats: 1, tieFrom: true },
      ],
    },
    { id: "lh", name: "Left hand", notes: [{ midi: 48, startBeat: 0, durationBeats: 3 }] },
  ],
  lengthBeats: 6,
};

describe("MIDI file", () => {
  it("round-trips tempo, meter, key, voices and notes; ties become one held note", () => {
    const back = midiToScore(scoreToMidi(score), "fallback");
    expect(back).toMatchObject({
      title: "Round trip",
      bpm: 96,
      meter: { beats: 3, beatUnit: 4 },
      keyFifths: -3,
      keyMode: "minor",
      lengthBeats: 6,
      source: { kind: "midi" },
    });
    expect(back.voices.map((v) => [v.name, v.clef])).toEqual([
      ["Right hand", "treble"],
      ["Left hand", "bass"],
    ]);
    const rh = back.voices[0].notes;
    expect(rh.map((n) => [n.midi, n.startBeat, n.durationBeats])).toEqual([
      [72, 0, 1],
      [74, 1, 3],
    ]);
    expect(rh[0].velocity).toBeCloseTo(0.5, 1);
    expect(rh[1].velocity).toBeCloseTo(0.8, 1);
    expect(back.voices[1].notes[0]).toMatchObject({ midi: 48, startBeat: 0, durationBeats: 3 });
    expect(new Set(back.voices.map((v) => v.id)).size).toBe(2);
  });

  it("round-trips every key signature (works around the tonejs encode bug)", () => {
    for (let f = -7; f <= 7; f++)
      expect(
        midiToScore(scoreToMidi({ ...score, keyFifths: f, keyMode: "major" }), "k").keyFifths,
      ).toBe(f);
  });

  it("reads channel 10 as a drum voice of General MIDI numbers, and writes it back there", () => {
    const midi = new Midi();
    const bass = midi.addTrack();
    bass.channel = 0;
    bass.addNote({ midi: 40, ticks: 0, durationTicks: 480 });
    const kit = midi.addTrack();
    kit.channel = 9;
    for (const [note, beat] of [
      [36, 0],
      [42, 0],
      [38, 1],
      [46, 1.5],
    ])
      kit.addNote({ midi: note, ticks: beat * 480, durationTicks: 120 });
    const s = midiToScore(midi.toArray(), "Groove");
    expect(s.voices.map((v) => [v.drums, v.clef])).toEqual([
      [undefined, "bass"],
      [true, undefined],
    ]);
    expect(s.voices[1].name).toBe("Drums");
    expect(s.voices[1].notes.map((n) => [n.midi, n.startBeat])).toEqual([
      [36, 0],
      [42, 0],
      [38, 1],
      [46, 1.5],
    ]);
    const back = midiToScore(scoreToMidi(s), "Groove");
    expect(back.voices[1]).toMatchObject({ drums: true });
    expect(back.voices[0].drums).toBeUndefined();
  });

  it("falls back to the given title, 120 BPM and 4/4", () => {
    const bare: Score = {
      ...score,
      title: "",
      keyFifths: undefined,
      voices: [{ id: "v", name: "", notes: [{ midi: 60, startBeat: 4.5, durationBeats: 0.5 }] }],
    };
    const bytes = scoreToMidi(bare);
    const back = midiToScore(bytes, "Imported");
    expect(back.title).toBe("Imported");
    expect(back.keyFifths).toBeUndefined();
    expect(back.lengthBeats).toBe(6);
    expect(back.voices[0].name).toBeTruthy();
  });
});
