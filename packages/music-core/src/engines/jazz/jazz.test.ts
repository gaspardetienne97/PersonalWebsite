import { describe, expect, it } from "vitest";

import { monotonicMs, Capability, unixMs, type NoteOnEvent } from "@repo/music-core/domain";

import {
  buildJazzSequenceCapture,
  buildAlteredDominantVoicings,
  buildIIVIDrill,
  CHORD_SCALE_MAP,
  gradeLickPositions,
  gradeLickSequence,
  gradeLickTiming,
  lickBarBeats,
  lickMidiNotes,
  transposeLickPhrase,
  GUITAR_BOX_ONE_LICK,
  GUITAR_BOX_ONE_LICK_A_MINOR,
  normalizeLickRange,
  missedLickChunk,
  JAZZ_LICKS,
  JAZZ_REPERTOIRE,
  LICK_PHRASES,
  lickDurationBeats,
  lickTimeline,
  normalizeChordScaleDrillConfig,
  normalizeJazzLickDrillConfig,
  realizeDominantVoicing,
  realizeUpperStructure,
  realizeVoicing,
  scalesForFamily,
} from "./index";

describe("realizeVoicing", () => {
  const dMidi = 62; // D4

  it("builds a rooted Dm7 as 1 b3 5 b7", () => {
    expect(realizeVoicing(dMidi, "m7", "rooted").midi).toEqual([62, 65, 69, 72]); // D F A C
  });

  it("builds a Dm7 shell as 1 b3 b7", () => {
    expect(realizeVoicing(dMidi, "m7", "shell").midi).toEqual([62, 65, 72]); // D F C
  });

  it("builds the rootless A voicing as 3 5 7 9 with the root in the bass", () => {
    const v = realizeVoicing(dMidi, "m7", "rootlessA");
    expect(v.midi).toEqual([65, 69, 72, 76]); // F A C E
    expect(v.bassMidi).toBe(62);
  });

  it("builds the rootless B voicing as 7 9 3 5 (ascending) for G7", () => {
    const gMidi = 67; // G4
    const v = realizeVoicing(gMidi, "dom7", "rootlessB");
    expect(v.midi).toEqual([77, 81, 83, 86]); // F A B D
  });
});

describe("buildIIVIDrill", () => {
  it("covers all 12 keys with ii-V-I chords and alternating positions", () => {
    const drill = buildIIVIDrill("A");
    expect(drill).toHaveLength(12);

    const c = drill.find((step) => step.key === "C")!;
    expect(c.chords.map((chord) => chord.symbol)).toEqual(["Dm7", "G7", "Cmaj7"]);
    expect(c.chords.map((chord) => chord.position)).toEqual(["A", "B", "A"]);

    const bb = drill.find((step) => step.key === "Bb")!;
    expect(bb.chords.map((chord) => chord.symbol)).toEqual(["Cm7", "F7", "Bbmaj7"]);
  });

  it("flips the pattern when starting on B", () => {
    expect(buildIIVIDrill("B")[0]!.chords.map((c) => c.position)).toEqual(["B", "A", "B"]);
  });
});

describe("chord-scale map", () => {
  it("recommends lydian over maj7 and dorian over m7", () => {
    expect(scalesForFamily("maj7")[0]).toMatchObject({ scale: "lydian", recommended: true });
    expect(scalesForFamily("m7")[0]).toMatchObject({ scale: "dorian", recommended: true });
  });

  it("gives every family at least one scale", () => {
    for (const family of new Set(CHORD_SCALE_MAP.map((e) => e.family))) {
      expect(scalesForFamily(family).length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeChordScaleDrillConfig", () => {
  it("restores shareable chord-scale drill config values", () => {
    expect(normalizeChordScaleDrillConfig(new URLSearchParams("changes=minor"))).toEqual({
      changesId: "minor",
    });
  });

  it("falls back to major changes for unknown values", () => {
    expect(normalizeChordScaleDrillConfig({ variant: "outside" })).toEqual({
      changesId: "major",
    });
  });
});

describe("normalizeJazzLickDrillConfig", () => {
  it("restores a shareable lick category and lick number", () => {
    expect(
      normalizeJazzLickDrillConfig(new URLSearchParams("category=minor-chord&lick=26")),
    ).toEqual({
      category: "minor-chord",
      lickNumber: 26,
    });
  });

  it("derives category from a valid lick when category is omitted", () => {
    expect(normalizeJazzLickDrillConfig({ lickNumber: 18 })).toEqual({
      category: "minor-ii-V-i",
      lickNumber: 18,
    });
  });

  it("falls back to the first lick in a valid category when the lick does not belong", () => {
    expect(normalizeJazzLickDrillConfig({ category: "minor-chord", lick: "3" })).toEqual({
      category: "minor-chord",
      lickNumber: 25,
    });
  });
});

describe("upper structures & altered voicings", () => {
  it("realizes the D-major upper structure over C7 as a shell + triad (JT12)", () => {
    const c = 60; // C4
    const us = realizeUpperStructure(c, "us-II"); // C7 + D major (Julian's most-used)
    expect(us.lh).toEqual([60, 64, 70]); // C E Bb (1 3 b7)
    // D major triad (D F# A) an octave up over C7 → adds 9 #11 13.
    expect(us.rh.map((m) => ((m % 12) + 12) % 12)).toEqual([2, 6, 9]); // D F# A
    expect(us.adds).toContain("#11");
  });

  it("realizes the altered dominant voicing in ascending order", () => {
    const v = realizeDominantVoicing(67, "altered"); // G7alt
    expect(v.bassMidi).toBe(67);
    expect([...v.midi].sort((a, b) => a - b)).toEqual(v.midi); // ascending
  });

  it("builds a 12-key altered dominant drill from b9, altered, and upper-structure voicings", () => {
    const drill = buildAlteredDominantVoicings();
    expect(drill).toHaveLength(12);
    expect(drill[0]!.chords.map((chord) => chord.symbol)).toEqual([
      "G7b9",
      "G7alt",
      "G7 · II maj upper",
    ]);
    expect(drill[0]!.chords[2]!.midi).toEqual([71, 77, 81, 85, 88]);
    expect(drill[0]!.chords[2]!.bassMidi).toBe(67);
  });
});

describe("lick phrases", () => {
  it("has a playable phrase for every lick", () => {
    for (const lick of JAZZ_LICKS) {
      expect(LICK_PHRASES[lick.number], `lick ${lick.number}`).toBeDefined();
      expect(LICK_PHRASES[lick.number]!.length).toBeGreaterThan(4);
    }
  });

  it("accumulates a timeline whose final offset matches the total duration", () => {
    const phrase = LICK_PHRASES[1]!;
    const timeline = lickTimeline(phrase);
    const last = timeline.at(-1)!;
    expect(last.offsetBeats + last.beats).toBe(lickDurationBeats(phrase));
  });
});

describe("jazz lesson path", () => {
  it("keeps unrelated milestones unassessed after a major-only check", async () => {
    const { buildJazzPath } = await import("./index");
    const events = Array.from({ length: 36 }, (_, i) => ({
      id: `major-${i}`,
      sessionId: "major",
      exerciseId: "jazz.voicing-drill",
      skillIds: ["harmony.ii-v-i", "harmony.ii-v-i.voicings.major"],
      capabilities: [],
      at: unixMs(i),
      correct: true,
      partialCredit: 1,
      difficulty: 0.5,
      metrics: [],
      assistance: "independent" as const,
      modality: "played" as const,
      instrument: "piano" as const,
    }));
    const major = buildJazzPath({ events, instrument: "piano" });
    expect(major.steps.find((step) => step.id === "rootless-voicings")?.status).toBe("in-progress");
    for (const id of ["altered-voicings", "chord-scales", "licks"])
      expect(major.steps.find((step) => step.id === id)?.status).toBe("not-assessed");
    const both = buildJazzPath({
      events: [
        ...events,
        ...events.map((event) => ({
          ...event,
          id: event.id.replace("major", "minor"),
          sessionId: "minor",
          skillIds: ["harmony.ii-v-i", "harmony.ii-v-i.voicings.minor"],
        })),
      ],
      instrument: "piano",
    });
    expect(both.steps.find((step) => step.id === "rootless-voicings")?.status).toBe("done");
    expect(both.steps.find((step) => step.id === "altered-voicings")?.status).toBe("not-assessed");
  });
  it("is ordered and does not treat old parent mastery as an assessment", async () => {
    const { buildJazzLessonPath } = await import("./index");
    const path = buildJazzLessonPath({
      mastery: (id) => (id === "harmony.ii-v-i" ? 0.8 : id === "harmony.sevenths" ? 0.2 : 0),
    });

    expect(path.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(path.find((s) => s.id === "rootless-voicings")?.status).toBe("not-assessed");
    expect(path.find((s) => s.id === "chord-symbols")?.status).toBe("todo");
    expect(path.find((s) => s.id === "intervals")?.status).toBe("not-assessed");
    expect(path.find((s) => s.id === "chord-symbols")?.kind).toBe("reference");
  });

  it("links every drill step to the drill that practises it, with its setup", async () => {
    const { buildJazzPath } = await import("./index");
    const path = buildJazzPath({
      events: [
        {
          id: "interval",
          sessionId: "s",
          exerciseId: "ear.interval",
          skillIds: ["pitch.intervals"],
          capabilities: [],
          at: unixMs(1),
          correct: true,
          partialCredit: 1,
          difficulty: 0.5,
          metrics: [],
          assistance: "independent",
          modality: "heard",
        },
      ],
    });
    const href = (id: string) => path.steps.find((s) => s.id === id)?.href;
    expect(href("intervals")).toBe("/music/learn/ear/intervals");
    expect(href("chord-scales")).toBe("/music/play/chord-scales?changes=major");
    expect(href("licks")).toBe("/music/play/licks?category=major-ii-V-I");
    expect(href("altered-voicings")).toBe("/music/play/voicings?variant=altered");
    expect(path.steps.find((s) => s.id === "chord-symbols")?.links?.[0]?.href).toBe(
      "/music/learn/ear/chord-qualities",
    );
    // Continue skips the finished intervals step and the skill-less reference steps.
    expect(path.next?.id).toBe("chord-scales");
    expect(path.done).toBe(1);
  });

  it("annotates polyphonic lessons on a monophonic instrument", async () => {
    const { buildJazzLessonPath } = await import("./index");
    const path = buildJazzLessonPath({ instrument: "aerophone" });
    expect(path.find((s) => s.id === "rootless-voicings")?.instrumentNote).toMatch(/arpeggio/i);
    expect(path.find((s) => s.id === "intervals")?.instrumentNote).toBeUndefined();
  });
});

describe("content catalogues", () => {
  it("has the 29 jazz licks plus the two guitar licks, numbered 1-31", () => {
    expect(JAZZ_LICKS).toHaveLength(31);
    expect(JAZZ_LICKS.map((l) => l.number)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(
      JAZZ_LICKS.filter((l) => l.category === "guitar-pentatonic").map((l) => l.number),
    ).toEqual([30, 31]);
  });

  it("has the 33-song repertoire", () => {
    expect(JAZZ_REPERTOIRE).toHaveLength(33);
    expect(JAZZ_REPERTOIRE.filter((s) => s.feel === "latin")).toHaveLength(7);
  });
});

describe("gradeLickSequence", () => {
  it("scores a perfect play-back as 100%", () => {
    const expected = [62, 65, 69, 72];
    expect(gradeLickSequence(expected, [62, 65, 69, 72])).toEqual({
      matched: 4,
      total: 4,
      accuracy: 1,
    });
  });

  it("is octave-lenient (pitch-class match)", () => {
    // Same pitch classes an octave up still count.
    expect(gradeLickSequence([62, 65], [74, 77]).accuracy).toBe(1);
  });

  it("counts wrong and missing notes against accuracy, ignores extras", () => {
    // 2nd note wrong, 4th missing → 2/4 matched. Extra trailing note ignored.
    expect(gradeLickSequence([62, 65, 69, 72], [62, 66, 69])).toEqual({
      matched: 2,
      total: 4,
      accuracy: 0.5,
    });
    expect(gradeLickSequence([62, 65], [62, 65, 99]).accuracy).toBe(1);
  });

  it("grades a real lick phrase played back correctly", () => {
    const phrase = LICK_PHRASES[1]!;
    const played = lickMidiNotes(phrase);
    expect(gradeLickSequence(played, played).accuracy).toBe(1);
  });

  it("projects a graded jazz sequence into scoring event and run records", () => {
    const expectedMidi = [62, 65, 69, 72];
    const playedMidi = [62, 66, 69, 72];
    const grade = gradeLickSequence(expectedMidi, playedMidi);

    const capture = buildJazzSequenceCapture({
      exerciseId: "jazz.lick.playback",
      label: "Lick #1",
      sessionId: "session-1",
      runId: "run-1",
      eventId: "event-1",
      promptId: "lick-1",
      skillIds: ["harmony.ii-v-i"],
      capabilities: [Capability.Harmony, Capability.Improvisation, Capability.Pitch],
      expectedMidi,
      playedMidi,
      grade,
      startedAt: unixMs(100),
      endedAt: unixMs(250),
      difficulty: 0.6,
      instrument: "piano",
      assistance: "guided",
      input: [
        {
          type: "noteOn",
          source: "midi",
          instrument: "piano",
          midiNote: 62,
          velocity: 1,
          timestamp: monotonicMs(0),
          clock: "performance",
        },
      ],
      params: { lickNumber: 1 },
    });

    expect(capture.run).toMatchObject({
      id: "run-1",
      exerciseId: "jazz.lick.playback",
      promptIds: ["lick-1"],
      targetSkillIds: ["harmony.ii-v-i"],
      instrument: "piano",
      difficulty: 0.6,
      params: { lickNumber: 1 },
    });
    expect(capture.event).toMatchObject({
      id: "event-1",
      sessionId: "session-1",
      runId: "run-1",
      exerciseId: "jazz.lick.playback",
      skillIds: ["harmony.ii-v-i"],
      capabilities: ["harmony", "improv", "pitch"],
      modality: "played",
      instrument: "piano",
      source: "midi",
      assistance: "guided",
      partialCredit: 0.75,
      correct: false,
      target: { label: "Lick #1", midiNotes: expectedMidi },
      response: { midiNotes: playedMidi },
    });
    expect(capture.event.metrics).toEqual([
      { kind: "pitch", expectedMidi: 62, actualMidi: 62 },
      { kind: "pitch", expectedMidi: 65, actualMidi: 66 },
      { kind: "pitch", expectedMidi: 69, actualMidi: 69 },
      { kind: "pitch", expectedMidi: 72, actualMidi: 72 },
    ]);
  });
});

it("normalizes contiguous lick ranges and suggests the first error-bearing chunk", () => {
  expect(normalizeLickRange(23, -4, 99)).toEqual({ start: 1, end: 23 });
  expect(normalizeLickRange(23, 8, 2)).toEqual({ start: 8, end: 8 });
  expect(missedLickChunk([60, 62, 64, 65, 67, 69], [72, 74, 76, 77, 66, 69])).toEqual({
    start: 5,
    end: 6,
  });
  expect(missedLickChunk([60, 62], [72, 74])).toBeUndefined();
});

describe("G3 · box one, twelfth fret", () => {
  const phrase = LICK_PHRASES[GUITAR_BOX_ONE_LICK]!;

  it("is fourteen events, thirteen of them pitched, with one rest", () => {
    expect(phrase).toHaveLength(14);
    expect(phrase.filter(([midi]) => midi !== null)).toHaveLength(13);
    expect(phrase.filter(([midi]) => midi === null)).toHaveLength(1);
    expect(lickMidiNotes(phrase)).toEqual([64, 67, 69, 71, 74, 71, 69, 67, 69, 67, 64, 62, 64]);
  });

  it("fills each bar to exactly 4.0 beats", () => {
    expect(lickBarBeats(phrase, 4)).toEqual([4, 4]);
    expect(lickDurationBeats(phrase)).toBe(8);
  });

  it("sits in box 1 at the twelfth fret, on strings 2 to 4", () => {
    const positions = phrase.flatMap(([, , position]) => (position ? [position] : []));
    expect(positions).toHaveLength(13);
    expect(new Set(positions.map((position) => position.string))).toEqual(new Set([2, 3, 4]));
    expect(Math.min(...positions.map((position) => position.fret))).toBe(12);
    expect(Math.max(...positions.map((position) => position.fret))).toBe(15);
    expect(new Set(positions.map((position) => position.finger))).toEqual(new Set([1, 3, 4]));
  });

  it("every position sounds its own pitch in standard tuning", () => {
    const openStrings = [64, 59, 55, 50, 45, 40];
    for (const [midi, , position] of phrase) {
      if (!position) continue;
      expect(openStrings[position.string - 1]! + position.fret, `string ${position.string}`).toBe(
        midi,
      );
    }
  });

  it("transposes to A minor at fret 5 keeping the strings and fingers", () => {
    const transposed = LICK_PHRASES[GUITAR_BOX_ONE_LICK_A_MINOR]!;
    expect(transposed).toEqual(transposeLickPhrase(phrase, -7));
    expect(lickMidiNotes(transposed)).toEqual(lickMidiNotes(phrase).map((midi) => midi - 7));
    expect(transposed[0]![2]).toEqual({ string: 4, fret: 7, finger: 3 });
    expect(Math.min(...transposed.flatMap(([, , p]) => (p ? [p.fret] : [])))).toBe(5);
  });
});

describe("gradeLickPositions", () => {
  const phrase = LICK_PHRASES[GUITAR_BOX_ONE_LICK]!;
  const note = (
    midiNote: number,
    atMs: number,
    fretPosition?: { stringNumber: number; fretNumber: number },
  ): NoteOnEvent => ({
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: fretPosition ? "onscreen" : "audio",
    instrument: "guitar",
    timestamp: monotonicMs(atMs),
    clock: "performance",
    ...(fretPosition === undefined ? {} : { fretPosition }),
  });

  it("verifies the string and fret of an on-screen tap", () => {
    const played = phrase.flatMap(([midi, , position], index) =>
      midi === null || !position
        ? []
        : [note(midi, index * 250, { stringNumber: position.string, fretNumber: position.fret })],
    );

    expect(gradeLickPositions(phrase, played)).toEqual({ total: 13, measured: 13, correct: 13 });
  });

  it("counts a right pitch on the wrong string as a wrong position", () => {
    const played = phrase.flatMap(([midi, , position], index) =>
      midi === null || !position
        ? []
        : [
            note(midi, index * 250, {
              stringNumber: index === 0 ? 1 : position.string,
              fretNumber: index === 0 ? 0 : position.fret,
            }),
          ],
    );

    expect(gradeLickPositions(phrase, played)).toMatchObject({ measured: 13, correct: 12 });
  });

  it("reads no position where the played note is not the phrase note", () => {
    const played = phrase.flatMap(([midi, , position], index) =>
      midi === null || !position
        ? []
        : [
            // The second note is a semitone out, on an otherwise correct dot.
            note(index === 1 ? midi + 1 : midi, index * 250, {
              stringNumber: position.string,
              fretNumber: position.fret,
            }),
          ],
    );

    // 12 measured, not 13: the wrong note is counted by the note-order grade,
    // not a second time as a wrong position.
    expect(gradeLickPositions(phrase, played)).toEqual({ total: 13, measured: 12, correct: 12 });
  });

  it("measures nothing from microphone pitch", () => {
    const played = lickMidiNotes(phrase).map((midi, index) => note(midi, index * 250));

    expect(gradeLickPositions(phrase, played)).toEqual({ total: 13, measured: 0, correct: 0 });
  });
});

describe("gradeLickTiming", () => {
  const phrase = LICK_PHRASES[GUITAR_BOX_ONE_LICK]!;
  const bpm = 96;
  const beatMs = 60_000 / bpm;
  const note = (midiNote: number, atMs: number): NoteOnEvent => ({
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "audio",
    instrument: "guitar",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  });

  it("counts every note on the grid as on time", () => {
    const played = lickTimeline(phrase).map((entry) =>
      note(entry.midi, entry.offsetBeats * beatMs),
    );

    expect(gradeLickTiming(phrase, { bpm, startTimestampMs: 0, input: played })).toEqual({
      total: 13,
      onTime: 13,
      ratio: 1,
    });
  });

  it("drops a note that lands outside the on-time window", () => {
    const played = lickTimeline(phrase).map((entry, index) =>
      note(entry.midi, entry.offsetBeats * beatMs + (index === 2 ? 170 : 0)),
    );
    const grade = gradeLickTiming(phrase, { bpm, startTimestampMs: 0, input: played });

    // min(180, beatMs / 4) = 156 ms at 96 BPM.
    expect(grade.onTime).toBe(12);
    expect(grade.ratio).toBeCloseTo(12 / 13, 5);
  });
});
