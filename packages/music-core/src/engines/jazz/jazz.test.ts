import { describe, expect, it } from "vitest";

import { Capability, unixMs } from "@repo/music-core/domain";

import {
  buildJazzSequenceCapture,
  buildAlteredDominantVoicings,
  buildIIVIDrill,
  CHORD_SCALE_MAP,
  gradeLickSequence,
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
  it("is ordered and derives status from skill mastery", async () => {
    const { buildJazzLessonPath } = await import("./index");
    const path = buildJazzLessonPath({
      mastery: (id) => (id === "harmony.ii-v-i" ? 0.8 : id === "harmony.sevenths" ? 0.2 : 0),
    });

    expect(path.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(path.find((s) => s.id === "rootless-voicings")?.status).toBe("done"); // 0.8 ≥ 0.66
    expect(path.find((s) => s.id === "chord-symbols")?.status).toBe("in-progress"); // 0.2
    expect(path.find((s) => s.id === "intervals")?.status).toBe("todo"); // no skill
  });

  it("annotates polyphonic lessons on a monophonic instrument", async () => {
    const { buildJazzLessonPath } = await import("./index");
    const path = buildJazzLessonPath({ instrument: "aerophone" });
    expect(path.find((s) => s.id === "rootless-voicings")?.instrumentNote).toMatch(/arpeggio/i);
    expect(path.find((s) => s.id === "intervals")?.instrumentNote).toBeUndefined();
  });
});

describe("content catalogues", () => {
  it("has all 29 licks numbered 1-29", () => {
    expect(JAZZ_LICKS).toHaveLength(29);
    expect(JAZZ_LICKS.map((l) => l.number)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
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
    const played = phrase.map(([midi]) => midi);
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
