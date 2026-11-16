import { describe, expect, it } from "vitest";
import { createNoteTracker, type TrackedNote, type TrackedPitch } from "./tracker";

const FRAME_MS = 2048 / 48;
const p = (midi: number, cents = 0, clarity = 0.95): TrackedPitch => ({ midi, cents, clarity });

/** Feed one reading per frame; `onsets` and `rms` are per frame index. */
function track(
  readings: (TrackedPitch | null)[],
  { onsets = {} as Record<number, number>, rms = {} as Record<number, number> } = {},
) {
  const t = createNoteTracker();
  const out: (TrackedNote & { emitted: number })[] = [];
  readings.forEach((r, i) => {
    for (const n of t.push(i * FRAME_MS, r, onsets[i], rms[i] ?? 0.1))
      out.push({ ...n, emitted: (i + 1) * FRAME_MS });
  });
  return out;
}
const ons = (events: TrackedNote[]) => events.filter((e) => e.kind === "noteon").map((e) => e.midi);
const repeat = <T>(x: T, n: number): T[] => Array.from({ length: n }, () => x);

describe("note tracker", () => {
  it("sounds a note on its second frame, timed at its first, and ends it after two unread frames", () => {
    const events = track([null, p(60), p(60), p(60), null, p(60), null, null]);
    expect(events).toMatchObject([
      { kind: "noteon", midi: 60, at: FRAME_MS },
      { kind: "noteoff", midi: 60, at: 7 * FRAME_MS },
    ]);
    // Heard 85 ms after the frame it started in: the latency of a clean attack.
    expect(events[0].emitted - events[0].at).toBeCloseTo(2 * FRAME_MS, 5);
  });

  it("keeps a voice on the line between two semitones on one note", () => {
    // 45 cents sharp of C3, wobbling 10 cents either way: C3+35 to C#3-45.
    const wobble = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? p(49, -45) : p(48, 38)));
    expect(ons(track(wobble))).toEqual([49]);
    // Control: a real move of a semitone and more is a new note.
    expect(ons(track([...repeat(p(48, 30), 6), ...repeat(p(49, 30), 6)]))).toEqual([48, 49]);
  });

  it("reports cents against the note it named", () => {
    // Named C#3 on the first frame; the frame that confirms it reads C3 + 40, 60 cents under C#3.
    const [on] = track([p(49, -45), p(48, 40), p(48, 40)]);
    expect(on).toMatchObject({ kind: "noteon", midi: 49, cents: -60 });
  });

  it("waits three frames for a semitone step with no attack, two with one", () => {
    const slide = [...repeat(p(60), 4), p(61), p(61), ...repeat(p(60), 4)];
    expect(ons(track(slide))).toEqual([60]);
    expect(ons(track([...repeat(p(60), 4), ...repeat(p(61), 3)]))).toEqual([60, 61]);
    expect(ons(track(slide, { onsets: { 4: 4 * FRAME_MS } }))).toEqual([60, 61, 60]);
  });

  it("does not take an overtone slip for a new note", () => {
    // A held G4 reads an octave up for four frames (an overtone takes over), then comes back.
    const slip = [...repeat(p(67), 6), ...repeat(p(79), 4), ...repeat(p(67), 6)];
    expect(ons(track(slip))).toEqual([67]);
    // A twelfth is the same thing.
    expect(ons(track([...repeat(p(50), 6), ...repeat(p(69), 4), ...repeat(p(50), 3)]))).toEqual([
      50,
    ]);
    // A real octave leap without an attack (a slur on a wind instrument) is heard after five frames.
    const slur = track([...repeat(p(60), 6), ...repeat(p(72), 8)]);
    expect(ons(slur)).toEqual([60, 72]);
    expect(slur[2].emitted - slur[2].at).toBeCloseTo(5 * FRAME_MS, 5);
    // With an attack it is a note like any other.
    const struck = track([...repeat(p(60), 6), ...repeat(p(72), 8)], {
      onsets: { 6: 6 * FRAME_MS },
    });
    expect(struck[2].emitted - struck[2].at).toBeCloseTo(2 * FRAME_MS, 5);
  });

  it("leaves out what rings on far under the note just played", () => {
    // C4 at full level, then the open string under it rings 26 dB down.
    const readings = [...repeat(p(60), 6), ...repeat(p(59), 10)];
    const rms = Object.fromEntries(readings.map((_, i) => [i, i < 6 ? 0.1 : 0.005]));
    const events = track(readings, { rms });
    expect(ons(events)).toEqual([60]);
    expect(events.at(-1)).toMatchObject({ kind: "noteoff", midi: 60 });
    // Control: at a healthy level the same readings are a second note.
    expect(ons(track(readings))).toEqual([60, 59]);
    // And a quiet note with an attack counts.
    expect(ons(track(readings, { rms, onsets: { 6: 6 * FRAME_MS } }))).toEqual([60, 59]);
  });

  it("starts the same pitch again on an attack, once the pitch has held", () => {
    const readings = repeat(p(55), 12);
    const events = track(readings, { onsets: { 6: 6 * FRAME_MS + 5 } });
    expect(events.map((e) => e.kind)).toEqual(["noteon", "noteoff", "noteon"]);
    expect(events[2].at).toBeCloseTo(6 * FRAME_MS + 5, 5);
    // An attack that turns out to be another note's does not also restart the old one.
    const moved = track([...repeat(p(55), 6), p(55), ...repeat(p(57), 4)], {
      onsets: { 6: 6 * FRAME_MS },
    });
    expect(ons(moved)).toEqual([55, 57]);
  });

  it("ends the sounding note when the microphone stops", () => {
    const t = createNoteTracker();
    t.push(0, p(60));
    t.push(FRAME_MS, p(60));
    expect(t.stop(500)).toEqual([{ kind: "noteoff", midi: 60, at: 500 }]);
    expect(t.stop(600)).toEqual([]);
  });
});
