import { describe, expect, it } from "vite-plus/test";
import { parseMidiMessage } from "./midi-message";
import {
  applyProfile,
  isValidPadMap,
  PAD_PRESETS,
  rewritePadNote,
  sanitizeProfile,
} from "./devices";
import { heartbeatFrame, initFrames, padColorFrame } from "./mpc-sysex";
import { createInputRouter } from "./router";
import type { NoteEvent } from "../types";

const on = (midi: number, source: NoteEvent["source"], at: number): NoteEvent => ({
  kind: "noteon",
  midi,
  velocity: 0.8,
  at,
  source,
  confidence: 1,
});
const off = (midi: number, source: NoteEvent["source"], at: number): NoteEvent => ({
  ...on(midi, source, at),
  kind: "noteoff",
  velocity: 0,
});

describe("midi parsing", () => {
  it("treats note-on velocity 0 as note-off and reads channel", () => {
    expect(parseMidiMessage([0x99, 36, 0], 5)).toMatchObject({
      kind: "noteoff",
      midi: 36,
      channel: 10,
    });
    expect(parseMidiMessage([0x90, 60, 127], 5)).toMatchObject({
      kind: "noteon",
      velocity: 1,
      channel: 1,
    });
    expect(parseMidiMessage([0xb0, 2, 127], 5)).toMatchObject({
      kind: "cc",
      controller: 2,
      value: 1,
    });
    expect(parseMidiMessage([0xe0, 0, 64], 5)).toMatchObject({ kind: "pitchbend", value: 0 });
  });
});

describe("mpc frames are the literal captures", () => {
  it("heartbeat, enter controller mode, pad colour", () => {
    expect(heartbeatFrame()).toEqual([
      0xf0, 0x47, 0x00, 0x56, 0x52, 0x00, 0x04, 0x41, 0x67, 0x16, 0x00, 0xf7,
    ]);
    expect(initFrames()[2]).toEqual([0xf0, 0x47, 0x7f, 0x56, 0x62, 0x00, 0x01, 0x61, 0xf7]);
    expect(initFrames()).toHaveLength(10);
    expect(initFrames().at(-1)).toEqual([0xf0, 0x47, 0x7f, 0x56, 0x41, 0x00, 0x00, 0xf7]);
    expect(padColorFrame(0, 127, 0, 0)).toEqual([
      0xf0, 0x47, 0x7f, 0x56, 0x65, 0x00, 0x04, 0, 127, 0, 0, 0xf7,
    ]);
  });
});

describe("device profiles", () => {
  it("rewrites the Akai Classic map to canonical bank A", () => {
    const map = [...PAD_PRESETS["akai-classic"].notes];
    expect(rewritePadNote(37, map)).toBe(36); // A01
    expect(rewritePadNote(38, map)).toBe(41); // A06
    expect(rewritePadNote(70, map)).toBe(70); // not in map passes through
  });
  it("validates pad maps and keeps ignored through sanitize", () => {
    expect(isValidPadMap([1, 2])).toBe(false);
    expect(sanitizeProfile({ id: "x", ignored: true, inputOffsetMs: 900 })).toEqual({
      id: "x",
      ignored: true,
    });
  });
  it("drops ignored ports and swaps instrument", () => {
    const e = parseMidiMessage([0x90, 60, 100], 1, "d")!;
    expect(applyProfile(e, { id: "d", ignored: true })).toBeNull();
    expect(applyProfile(e, { id: "d", instrument: "aerophone" })).toMatchObject({
      instrument: "aerophone",
    });
  });
});

describe("router", () => {
  it("suppresses on-screen taps for 1.5 s after MIDI and never lets a note-off steal the source", () => {
    let t = 0;
    const r = createInputRouter({ now: () => t });
    r.push(on(60, "midi", 0));
    t = 1000;
    expect(r.push(on(62, "onscreen", 1000))).toBeNull();
    expect(r.activeSource).toBe("midi");
    t = 1600;
    r.push(on(64, "onscreen", 1600));
    expect(r.activeSource).toBe("onscreen");
    r.push(off(60, "midi", 1700));
    expect(r.activeSource).toBe("onscreen");
    expect([...r.held]).toEqual([64]);
  });
  it("subtracts offsets once, per-device overriding global, capped at 500", () => {
    const r = createInputRouter({
      now: () => 0,
      offsets: { midiMs: 20, audioMs: 900, deviceMs: { a: 50 } },
    });
    expect(r.push({ ...on(60, "midi", 1000), deviceId: "a" })!.at).toBe(950);
    expect(r.push({ ...on(61, "midi", 1000), deviceId: "b" })!.at).toBe(980);
    expect(r.push(on(62, "audio", 1000))!.at).toBe(500);
  });
  it("releaseAll delivers paired note-offs", () => {
    const r = createInputRouter({ now: () => 0 });
    const seen: string[] = [];
    r.subscribe((e) => seen.push(e.kind));
    r.push(on(60, "onscreen", 0));
    r.releaseAll();
    expect(seen).toEqual(["noteon", "noteoff"]);
    expect(r.held.size).toBe(0);
  });
});
