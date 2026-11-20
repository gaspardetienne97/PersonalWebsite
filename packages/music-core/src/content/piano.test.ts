import { describe, expect, it } from "vite-plus/test";
import { COMPING, JAZZ, TWO_HAND, VOICING_DRILL, type TwoHandPatternId } from "../data";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import {
  chordScaleTargets,
  cadenceChords,
  pedalChords,
  closestChords,
  compingScore,
  cycleTranspose,
  goToScale,
  lickChunk,
  lickChunkIn,
  lickNotes,
  lickScore,
  lickWindow,
  LICKS,
  lickTip,
  nearestVoicing,
  transposeText,
  twoHandPattern,
  voiceLeadingTargets,
  voicingTargets,
} from "./piano";

describe("two-hand patterns", () => {
  it("reproduces every reference rendering at C4, 80 BPM, 2 bars", () => {
    const examples = TWO_HAND.examplesTonicC4Bpm80Bars2;
    for (const id of Object.keys(examples) as TwoHandPatternId[])
      expect(twoHandPattern({ pattern: id, tonic: 60, bars: 2, handMode: "both" }), id).toEqual(
        examples[id],
      );
  });

  it("transposes to other tonics and filters by hand", () => {
    const g = twoHandPattern({ pattern: "contrary-five", tonic: 67, bars: 2, handMode: "both" });
    expect(g.splitMidi).toBe(61);
    expect(g.targetEvents.slice(0, 2)).toEqual([
      { hand: "left", midiNote: 55, beat: 0, finger: 1 },
      { hand: "right", midiNote: 67, beat: 0, finger: 1 },
    ]);
    // G major five-finger: G A B C D / G F# E D C, all in key.
    const inG = new Set([7, 9, 11, 0, 2, 4, 6]);
    expect(g.targetEvents.every((e) => inG.has(pc(e.midiNote)))).toBe(true);
    const right = twoHandPattern({
      pattern: "lh-pulse-rh-line",
      tonic: 62,
      bars: 1,
      handMode: "right",
    });
    expect(right.targetEvents.every((e) => e.hand === "right")).toBe(true);
    expect(right.targetEvents).toHaveLength(8);
    expect(right.splitMidi).toBe(50);
  });
});

describe("comping", () => {
  it("builds the blue-third lick over a Charleston shell", () => {
    const s = compingScore("blue-third-c7");
    const [rh, lh] = s.voices;
    expect(rh.notes.map((n) => n.midi)).toEqual([67, 70, 72, 70, 67, 64, 63, 64, 67, 60]);
    for (const bar of [0, 1])
      expect(
        rh.notes
          .filter((n) => Math.floor(n.startBeat / 4) === bar)
          .reduce((a, n) => a + n.durationBeats, 0),
      ).toBe(4);
    expect(lh.notes.map((n) => `${n.startBeat}:${n.midi}`)).toEqual([
      "0:48",
      "0:58",
      "1.5:48",
      "1.5:58",
      "4:48",
      "4:58",
      "5.5:48",
      "5.5:58",
    ]);
    expect(s.bpm).toBe(84);
  });

  it("carries F7 and G7 as transpositions of C7", () => {
    const [c7, f7, g7] = COMPING.patterns;
    expect(f7.lick.map((n) => pc(n.midiNote - 5))).toEqual(c7.lick.map((n) => pc(n.midiNote)));
    expect(g7.lick.map((n) => pc(n.midiNote - 7))).toEqual(c7.lick.map((n) => pc(n.midiNote)));
    expect(compingScore("blue-third-f7").keyFifths).toBe(-1);
  });
});

describe("ii-V-I voicings", () => {
  it("builds all 36 major targets with the pitch classes of the reference data", () => {
    const t = voicingTargets({ variant: "major", startPosition: "A" });
    expect(VOICING_DRILL.targets).toHaveLength(36);
    expect(t.map((x) => [x.symbol, [...x.expectedPitchClasses].sort()])).toEqual(
      VOICING_DRILL.targets.map((x) => [x.symbol, [...x.expectedPitchClasses].sort()]),
    );
  });

  it("keeps the root low and each voicing near the last, in every key", () => {
    for (const variant of ["major", "minor", "altered"] as const) {
      const t = voicingTargets({ variant });
      for (const x of t) {
        expect(x.displayMidi[0], x.id).toBeGreaterThanOrEqual(41);
        expect(x.displayMidi[0], x.id).toBeLessThanOrEqual(52);
        for (const m of x.displayMidi.slice(1)) {
          expect(m, x.id).toBeGreaterThanOrEqual(50);
          expect(m, x.id).toBeLessThanOrEqual(81);
        }
      }
    }
    // Dm7 G7 Cmaj7 in C: A, B, A moving by step (F A C E, F A B D, E G B D).
    expect(
      voicingTargets({ variant: "major" })
        .slice(0, 3)
        .map((t) => t.displayMidi),
    ).toEqual([
      [50, 53, 57, 60, 64],
      [43, 53, 57, 59, 62],
      [48, 52, 55, 59, 62],
    ]);
  });

  it("starts on B when asked, arpeggiates on a monophonic instrument", () => {
    const b = voicingTargets({ variant: "major", startPosition: "B" });
    expect(b[0].displayMidi).toEqual([50, 60, 64, 65, 69]);
    expect(
      voicingTargets({ variant: "major", mode: "arpeggio" }).every((t) => t.mode === "arpeggio"),
    ).toBe(true);
  });

  it("builds the minor variant: iiø7 rootless A, V7alt, i-m7 rootless B", () => {
    const m = voicingTargets({ variant: "minor" });
    expect(m).toHaveLength(36);
    expect(m.slice(0, 3).map((t) => [t.symbol, t.displayMidi])).toEqual([
      ["Dm7b5", [50, 65, 68, 72, 74]],
      ["G7alt", [43, 65, 68, 71, 75]],
      ["Cm7", [48, 70, 74, 75, 79]],
    ]);
    expect(m[0].expectedPitchClasses).toEqual([2, 5, 8, 0]);
    expect(m[0].skillIds).toEqual(["harmony.ii-v-i", "harmony.ii-v-i.voicings.minor"]);
  });

  it("builds the altered variant: V7b9, V7alt, II upper structure over V7", () => {
    const a = voicingTargets({ variant: "altered" });
    expect(a).toHaveLength(36);
    expect(a.slice(0, 3).map((t) => [t.symbol, t.displayMidi])).toEqual([
      ["G7b9", [43, 59, 65, 68, 74]],
      ["G7alt", [43, 65, 68, 71, 75]],
      ["G13#11", [43, 59, 65, 69, 73, 76]],
    ]);
    for (const t of a) {
      const chord = parseChordSymbol(t.symbol)!;
      for (const p of t.expectedPitchClasses) expect(chord.pcs, t.id).toContain(p);
    }
  });
});

describe("voice leading", () => {
  it("finds the closest guide tones inside the register", () => {
    const targets = voiceLeadingTargets([53, 72]);
    expect(targets).toHaveLength(35);
    expect(targets[0]).toMatchObject({
      symbol: "G7",
      fromMidi: [60, 65],
      targetMidi: [59, 65],
      minimumSemitones: 1,
    });
    for (const t of targets) {
      expect(t.targetMidi.every((m) => m >= 53 && m <= 72)).toBe(true);
      expect(t.targetMidi.map(pc).sort()).toEqual([...t.pcs].sort());
    }
  });

  it("reproduces the piano path's closest chords I IV V I in C", () => {
    const bars = closestChords(0);
    expect(bars.map((b) => [b.symbol, b.rightHand, b.leftHand, b.inversion, b.movement])).toEqual([
      ["C", [60, 64, 67], 48, 0, 0],
      ["F", [60, 65, 69], 41, 2, 3],
      ["G", [59, 62, 67], 43, 1, 6],
      ["C", [60, 64, 67], 48, 0, 3],
    ]);
    expect(bars.reduce((n, b) => n + b.movement, 0)).toBe(12);
    expect(closestChords(7)[0].rightHand).toEqual([67, 71, 74]);
    expect(nearestVoicing([60, 64, 67], [5, 9, 0], [55, 76])).toEqual({
      midi: [60, 65, 69],
      movement: 3,
    });
  });
});

describe("licks", () => {
  it("has 31 transcribed licks with well-formed phrases", () => {
    expect(LICKS.filter((l) => l.number < 100)).toHaveLength(31);
    expect(Object.keys(JAZZ.LICK_PHRASES)).toHaveLength(31);
    for (const phrase of Object.values(JAZZ.LICK_PHRASES))
      for (const n of phrase) {
        expect(n[0] === null || Number.isInteger(n[0])).toBe(true);
        expect(n[1]).toBeGreaterThan(0);
      }
  });

  it("turns lick 30 into the curriculum's box-one table", () => {
    const notes = lickNotes(30);
    expect(notes.map((n) => `${n.startBeat}:${n.midi}:${n.string}/${n.fret}:${n.finger}`)).toEqual([
      "0:64:4/14:3",
      "0.5:67:3/12:1",
      "1:69:3/14:3",
      "1.5:71:2/12:1",
      "2:74:2/15:4",
      "3:71:2/12:1",
      "3.5:69:3/14:3",
      "4:67:3/12:1",
      "4.5:69:3/14:3",
      "5:67:3/12:1",
      "5.5:64:4/14:3",
      "6:62:4/12:1",
      "7:64:4/14:3",
    ]);
    expect(lickScore(30, { bpm: 96 }).lengthBeats).toBe(8);
    // Lick 31 is the same shape at the fifth fret.
    expect(lickNotes(31).map((n) => n.fret! + 7)).toEqual(notes.map((n) => n.fret));
  });

  it("chunks, windows and transposes through the key cycle", () => {
    const notes = lickNotes(1);
    expect(lickChunk(notes, 2, 4).map((n) => [n.index, n.startBeat])).toEqual([
      [2, 0],
      [3, 0.5],
      [4, 1],
    ]);
    // Two taps on the written line: notes 3 and 5 (beats 1 and 2) mark notes 3 to 5.
    expect(
      lickChunkIn(notes, { startBeat: notes[2].startBeat, endBeat: notes[5].startBeat }),
    ).toEqual([2, 4]);
    expect(
      lickChunkIn(notes, { startBeat: notes[7].startBeat, endBeat: notes[7].startBeat + 0.25 }),
    ).toEqual([7, 7]);
    expect(lickChunkIn(notes, { startBeat: 99, endBeat: 100 })).toBeNull();
    expect(lickWindow(notes, 0)).toEqual([0, 3]);
    expect(lickWindow(notes, 10)).toEqual([9, 12]);
    expect(lickWindow(notes, 22)).toEqual([19, 22]);
    expect(JAZZ.TWELVE_KEY_CYCLE.map(cycleTranspose)).toEqual([
      0, -2, -4, -6, 4, 2, 1, -1, -3, -5, 5, 3,
    ]);
    const bb = lickNotes(30, -2);
    expect(bb[0]).toEqual({ index: 0, midi: 62, startBeat: 0, durationBeats: 0.5 });
    expect(lickScore(1, { bpm: 120, transpose: -2 }).title).toBe("Lick 1: Cm7 F7 Bbmaj7");
  });
});

describe("chord-scale drill", () => {
  it("uses the go-to scale per chord", () => {
    expect(chordScaleTargets("major").map((t) => t.scaleLabel)).toEqual([
      "D Dorian",
      "G Mixolydian",
      "C Lydian",
    ]);
    expect(chordScaleTargets("minor").map((t) => t.scaleLabel)).toEqual([
      "D Locrian",
      "G Altered",
      "C Dorian",
    ]);
    expect(chordScaleTargets("major")[0].midi).toEqual([62, 64, 65, 67, 69, 71, 72, 74]);
    expect(goToScale("Cm6")?.label).toBe("Dorian");
    expect(goToScale("C6")?.label).toBe("Major (Ionian)");
    expect(goToScale("CmMaj7")?.label).toBe("Melodic minor");
    expect(goToScale("Cdim7")?.semitones).toEqual([0, 2, 3, 5, 6, 8, 9, 11, 12]);
    expect(goToScale("G7b9")?.label).toBe("Diminished (half-whole)");
    expect(goToScale("G13#11")?.label).toBe("Lydian dominant");
  });

  it("accepts the scales listed beside the go-to, and only the fitting ones", () => {
    const [dm7, g7, cmaj7] = chordScaleTargets("major");
    // Over Cmaj7, Ionian's F counts; over G7, mixolydian's C does.
    expect(cmaj7.accepted).toContain(5);
    expect(g7.accepted).toContain(0);
    expect(g7.others).toEqual(["Lydian dominant", "Dominant bebop"]);
    expect(dm7.accepted).not.toContain(1);
    const [m7b5, alt] = chordScaleTargets("minor");
    // An altered dominant does not list mixolydian; Locrian #2 is the sixth mode of melodic minor (D E F G Ab Bb C).
    expect(alt.others).toEqual(["Diminished (half-whole)"]);
    expect(m7b5.accepted).toEqual([0, 2, 3, 4, 5, 7, 8, 10]);
  });

  it("labels chord, scale and avoid tones", () => {
    const [dm7] = chordScaleTargets("major");
    const byRole = (r: string) => dm7.roles.flatMap((x, p) => (x === r ? [p] : []));
    expect(byRole("chord")).toEqual([0, 2, 5, 9]);
    expect(byRole("scale")).toEqual([4, 7, 11]);
    expect(byRole("avoid")).toEqual([1, 3, 6, 8, 10]);
    expect(chordScaleTargets("major", 2)[0].symbol).toBe("Em7");
  });
});

describe("lick text in another key", () => {
  it("moves note names and chord roots, not words", () => {
    expect(
      transposeText("Half-step-below approach into the changes: Bb→B and Eb→E.", 2, true),
    ).toBe("Half-step-below approach into the changes: C→C# and F→F#.");
    expect(transposeText("G altered (Ab melodic minor)", -2)).toBe("F altered (Gb melodic minor)");
    expect(transposeText("A sequence: the A7 resolves back to Dm7 over Cmaj7.", 5)).toBe(
      "A sequence: the D7 resolves back to Gm7 over Fmaj7.",
    );
    expect(transposeText("End lines on 1 3 5 or 7 (C E G B).", 0)).toBe(
      "End lines on 1 3 5 or 7 (C E G B).",
    );
  });

  it("drops the left-hand claims from the tips", () => {
    for (const l of LICKS)
      expect(lickTip(l), String(l.number)).not.toMatch(/left.hand|stride|—|–/i);
  });
});

describe("keyboard cadences", () => {
  it("voices I IV I V7 I the textbook way: C E G, C F A, C E G, B F G, C E G", () => {
    const c = cadenceChords(0);
    expect(c.map((b) => b.rightHand)).toEqual([
      [60, 64, 67],
      [60, 65, 69],
      [60, 64, 67],
      [59, 65, 67],
      [60, 64, 67],
    ]);
    expect(c.map((b) => b.symbol)).toEqual(["C", "F", "C", "G7", "C"]);
    expect(c.map((b) => b.inversion)).toEqual([0, 2, 0, 1, 0]);
    expect(c.map((b) => b.movement)).toEqual([0, 3, 3, 2, 2]);
    // Minor: the raised leading tone in V7, Ab in iv.
    expect(cadenceChords(0, true).map((b) => b.rightHand)).toEqual([
      [60, 63, 67],
      [60, 65, 68],
      [60, 63, 67],
      [59, 65, 67],
      [60, 63, 67],
    ]);
    // Every key starts in root position inside the register, the root on the left from F2 to E3.
    for (let k = 0; k < 12; k++) {
      const bars = cadenceChords(k);
      expect(bars[0].inversion).toBe(0);
      for (const b of bars) {
        expect(b.rightHand.every((m) => m >= 55 && m <= 76)).toBe(true);
        expect(b.leftHand).toBeGreaterThanOrEqual(41);
        expect(b.leftHand).toBeLessThanOrEqual(52);
      }
    }
  });
});

describe("pedal progressions", () => {
  it("voices I vi IV V with the least movement, a minor vi", () => {
    const bars = pedalChords(0, "I-vi-IV-V");
    expect(bars.map((b) => b.symbol)).toEqual(["C", "Am", "F", "G"]);
    expect(bars.map((b) => b.rightHand)).toEqual([
      [60, 64, 67],
      [60, 64, 69],
      [60, 65, 69],
      [59, 62, 67],
    ]);
  });
});
