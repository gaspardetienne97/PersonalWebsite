import { Midi } from "@tonejs/midi";
import { describe, expect, test } from "vitest";

import { estimateKey, parseMidiFile, pianoRoll } from "./index";

function buildMidi(): ArrayBuffer {
  const midi = new Midi();
  midi.header.setTempo(96);
  const track = midi.addTrack();
  track.name = "Lead";
  [60, 64, 67, 72].forEach((note, index) => {
    track.addNote({ midi: note, time: index * 0.5, duration: 0.4 });
  });
  // Copy into a fresh ArrayBuffer (toArray may share a buffer view).
  return new Uint8Array(midi.toArray()).buffer as ArrayBuffer;
}

describe("parseMidiFile", () => {
  test("parses tempo, notes, and a key estimate", () => {
    const song = parseMidiFile(buildMidi(), "Autumn Leaves.mid");
    expect(Math.round(song.bpm)).toBe(96);
    expect(song.totalNotes).toBe(4);
    expect(song.tracks[0]?.notes).toHaveLength(4);
    expect(song.keyEstimate).toBe("C major");
    expect(song.durationSec).toBeGreaterThan(0);
  });
});

describe("estimateKey", () => {
  test("detects a minor key from its third", () => {
    // A C E (A minor triad) emphasised → A minor
    const notes = [69, 72, 76, 69, 72].map((midi, index) => ({
      midi,
      time: index,
      duration: 1,
      velocity: 0.8,
    }));
    expect(estimateKey(notes)).toBe("A minor");
  });
});

describe("pianoRoll", () => {
  test("flattens and sorts notes by time and caps the count", () => {
    const song = parseMidiFile(buildMidi());
    const roll = pianoRoll(song, 2);
    expect(roll).toHaveLength(2);
    expect(roll[0]!.time).toBeLessThanOrEqual(roll[1]!.time);
  });
});
