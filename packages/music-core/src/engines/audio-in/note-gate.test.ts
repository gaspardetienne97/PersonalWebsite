import { describe, expect, test } from "vitest";

import { frame, SILENCE } from "./__fixtures__/synthetic-frames";
import { NoteGate } from "./note-gate";

/** Arm via silence, then feed `count` identical frames; return the last result. */
function settle(gate: NoteGate, energies: Record<number, number>, count = 3) {
  gate.process(SILENCE);
  let result = gate.process(frame(energies));
  for (let i = 1; i < count; i++) result = gate.process(frame(energies));
  return result;
}

describe("NoteGate", () => {
  test("matches the exact target once stable and armed, then disarms", () => {
    const gate = new NoteGate();
    gate.setTarget([60]);
    gate.process(SILENCE);
    expect(gate.process(frame({ 60: 1 })).matched).toBe(false);
    expect(gate.process(frame({ 60: 1 })).matched).toBe(false);
    const third = gate.process(frame({ 60: 1 }));
    expect(third).toMatchObject({ matched: true, stable: true, reason: "matched", observed: [60] });
    expect(third.confidence).toBeGreaterThan(0.5);
    // The chord is still sounding: no second match from the same attack.
    expect(gate.process(frame({ 60: 1 }))).toMatchObject({ matched: false, reason: "listening" });
  });

  test("a repeated identical chord cannot advance from sustained carry-over", () => {
    const gate = new NoteGate();
    gate.setTarget([60, 64, 67]);
    expect(settle(gate, { 60: 1, 64: 0.9, 67: 0.8 }).matched).toBe(true);

    // Next group is the same chord; the player keeps holding it.
    gate.setTarget([60, 64, 67]);
    for (let i = 0; i < 10; i++) {
      expect(gate.process(frame({ 60: 1, 64: 0.9, 67: 0.8 })).matched).toBe(false);
    }
    // Only a real release re-arms it.
    expect(settle(gate, { 60: 1, 64: 0.9, 67: 0.8 }).matched).toBe(true);
  });

  test("retargeting lands unarmed even when the new target is already sounding", () => {
    const gate = new NoteGate();
    gate.setTarget([60]);
    settle(gate, { 60: 1 });
    gate.setTarget([60]);
    expect(gate.armed).toBe(false);
    expect(gate.process(frame({ 60: 1 })).matched).toBe(false);
  });

  test("an arbitrary extra anywhere in the band blocks the match", () => {
    const gate = new NoteGate();
    gate.setTarget([60]);
    const result = settle(gate, { 60: 1, 83: 0.6 });
    expect(result).toMatchObject({ matched: false, reason: "extra", observed: [60, 83] });
  });

  test("a partial chord is reported, not matched", () => {
    const gate = new NoteGate();
    gate.setTarget([60, 64, 67]);
    expect(settle(gate, { 60: 1, 64: 1 })).toMatchObject({ matched: false, reason: "partial" });
  });

  test("energy at the target frequency from a lower octave's harmonic is not the target", () => {
    const gate = new NoteGate();
    gate.setTarget([60]);
    // C3 played: fundamental at 48, second partial lands on 60.
    const result = settle(gate, { 48: 1, 60: 0.6 });
    expect(result.observed).toEqual([48]);
    expect(result.matched).toBe(false);
  });

  test("a target's own natural harmonics do not count as extras", () => {
    const gate = new NoteGate();
    gate.setTarget([60]);
    expect(settle(gate, { 60: 1, 72: 0.25, 79: 0.06, 84: 0.05 })).toMatchObject({
      matched: true,
      observed: [60],
    });
  });

  test("a target must beat an adjacent semitone by the match margin", () => {
    const gate = new NoteGate();
    gate.setTarget([60]);
    expect(settle(gate, { 60: 1, 61: 0.9 })).toMatchObject({ matched: false, reason: "partial" });
    const loose = new NoteGate({ matchMargin: 1 });
    loose.setTarget([60]);
    expect(settle(loose, { 60: 1, 61: 0.9 }).matched).toBe(true);
  });

  test("a wrong octave of the target is an extra, not a match", () => {
    const gate = new NoteGate();
    gate.setTarget([60]);
    expect(settle(gate, { 72: 1 })).toMatchObject({ matched: false, observed: [72] });
  });

  test("frames under the signal floor are low-signal and re-arm the gate", () => {
    const gate = new NoteGate({ signalFloor: 0.05 });
    gate.setTarget([60]);
    expect(gate.process(frame({ 60: 1 }, { rms: 0.01 }))).toMatchObject({
      reason: "low-signal",
      observed: [],
      matched: false,
    });
    expect(gate.armed).toBe(true);
  });

  test("stable-frame count is an option", () => {
    const gate = new NoteGate({ stableFrames: 1 });
    gate.setTarget([60]);
    gate.process(SILENCE);
    expect(gate.process(frame({ 60: 1 })).matched).toBe(true);
  });

  test("targets outside MIDI 40–88 are out of range and never match", () => {
    const gate = new NoteGate();
    gate.setTarget([39]);
    expect(gate.inRange).toBe(false);
    gate.setTarget([40, 88]);
    expect(gate.inRange).toBe(true);
    gate.setTarget([]);
    expect(gate.inRange).toBe(false);
  });

  test("rearm lets a rejected snapshot retry without a release", () => {
    const gate = new NoteGate();
    gate.setTarget([60]);
    settle(gate, { 60: 1 });
    expect(gate.process(frame({ 60: 1 })).matched).toBe(false);
    gate.rearm();
    let result = gate.process(frame({ 60: 1 }));
    result = gate.process(frame({ 60: 1 }));
    result = gate.process(frame({ 60: 1 }));
    expect(result.matched).toBe(true);
  });
});
