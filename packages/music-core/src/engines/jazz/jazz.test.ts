import { describe, expect, it } from "vitest";

import {
  buildAlteredDominantVoicings,
  buildIIVIDrill,
  CHORD_SCALE_MAP,
  JAZZ_LICKS,
  JAZZ_REPERTOIRE,
  LICK_PHRASES,
  lickDurationBeats,
  lickTimeline,
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
