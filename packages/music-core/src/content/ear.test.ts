import { describe, expect, it } from "vitest";
import type { Score, ScoreNote } from "../types";
import {
  cadencePrompt,
  CHORD_FUNCTIONS,
  chordFunctionPrompt,
  chordQualityPrompt,
  functionChord,
  functionLabel,
  functionOfNotes,
  functionSymbol,
  degreeLabel,
  EAR_DRILLS,
  EAR_PATH,
  intervalComparePrompt,
  intervalPrompt,
  EAR_INTERVALS,
  melodyDictationPrompt,
  phrasesFromScore,
  progressionPrompt,
  rankPhrases,
  scalePrompt,
  repertoirePlan,
  repertoirePrompt,
  SCALE_DEGREE_LEVELS,
  SCALE_DEGREES,
  scaleContext,
  scaleDegreePrompt,
  inversionPrompt,
  inversionVoicing,
  bassLinePrompt,
  CENT_STEPS,
  finePitchPrompt,
  staircase,
  errorDetectPrompt,
  type DegreeLabel,
} from "./ear";
import { pc } from "../theory/notes";
import { rng } from "./random";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => rng(i + 1));

describe("seeded randomness", () => {
  it("is reproducible and in [0, 1)", () => {
    const a = rng(42);
    const b = rng(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(rng(1)()).not.toBe(rng(2)());
  });
});

describe("interval prompts", () => {
  it("is ascending only below difficulty 0.4, root 48..60, 0.65 s apart, 0.55 s each", () => {
    for (const r of seeds(200)) {
      const p = intervalPrompt(r, { difficulty: 0.39 });
      expect(p.direction).toBe("ascending");
      expect(p.expectedMidi![0]).toBeGreaterThanOrEqual(48);
      expect(p.expectedMidi![0]).toBeLessThanOrEqual(60);
      expect(p.playback).toEqual([
        { midi: [p.expectedMidi![0]], time: 0, duration: 0.55 },
        { midi: [p.expectedMidi![1]], time: 0.65, duration: 0.55 },
      ]);
      expect(p.skillIds).toEqual(["pitch.intervals", `pitch.interval.${p.answer}`]);
      expect(p.choices).toHaveLength(12);
    }
  });

  it("splits 60/30/10 above 0.4 and plays harmonic for 0.8 s", () => {
    const r = rng(7);
    const counts = { ascending: 0, descending: 0, harmonic: 0 };
    for (let i = 0; i < 4000; i++) counts[intervalPrompt(r, { difficulty: 0.5 }).direction]++;
    expect(counts.ascending / 4000).toBeCloseTo(0.6, 1);
    expect(counts.descending / 4000).toBeCloseTo(0.3, 1);
    expect(counts.harmonic / 4000).toBeCloseTo(0.1, 1);
    let harmonic;
    for (let s = 1; !harmonic; s++) {
      const p = intervalPrompt(rng(s), { difficulty: 0.9, token: "P5" });
      if (p.direction === "harmonic") harmonic = p;
    }
    expect(harmonic.playback).toHaveLength(1);
    expect(harmonic.playback[0].duration).toBe(0.8);
    expect(harmonic.playback[0].midi[1] - harmonic.playback[0].midi[0]).toBe(7);
  });
});

describe("chord quality prompts", () => {
  it("offers only the four triads below 0.65, all nine above", () => {
    for (const r of seeds(100)) {
      const easy = chordQualityPrompt(r, { difficulty: 0.64 });
      expect(easy.choices).toEqual(["major", "minor", "diminished", "augmented"]);
      expect(easy.choices).toContain(easy.answer);
      expect(easy.playback[0].duration).toBe(0.9);
      expect(easy.playback[0].midi[0]).toBeGreaterThanOrEqual(48);
      expect(easy.playback[0].midi[0]).toBeLessThanOrEqual(60);
    }
    const hard = chordQualityPrompt(rng(3), { difficulty: 0.65, token: "half-diminished-7" });
    expect(hard.choices).toHaveLength(9);
    expect(hard.skillIds).toEqual(["harmony.sevenths", "harmony.seventh.half-diminished"]);
  });
});

describe("cadence prompts", () => {
  it("plays the data's two chords transposed by -5..+6", () => {
    const shifts = new Set<number>();
    for (const r of seeds(400)) {
      const p = cadencePrompt(r, { difficulty: 0.5, token: "plagal" });
      const shift = p.playback[1].midi[0] - 48;
      shifts.add(shift);
      expect(p.playback).toEqual([
        { midi: [53, 57, 60, 65].map((m) => m + shift), time: 0, duration: 1 },
        { midi: [48, 52, 55, 60].map((m) => m + shift), time: 1.1, duration: 1.2 },
      ]);
    }
    expect([...shifts].sort((a, b) => a - b)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("scale degrees", () => {
  it("has the six levels and solfege", () => {
    expect(SCALE_DEGREE_LEVELS.map((l) => `${l.id}:${l.degrees.join(" ")}`)).toEqual([
      "anchor:1 5",
      "major-pentachord:1 2 3 4 5",
      "major-diatonic:1 2 3 4 5 6 7",
      "minor-diatonic:1 2 b3 4 5 b6 b7",
      "chromatic-color:1 b2 2 b3 3 4 #4 5 b6 6 b7 7",
      "full-current:1 b2 2 b3 3 4 #4 5 b6 6 b7 7",
    ]);
    expect(SCALE_DEGREES.map((d) => d.solfege).join(" ")).toBe(
      "do ra re me mi fa fi sol le la te ti",
    );
    expect(degreeLabel("3", "degree")).toBe("3 / mi");
    expect(degreeLabel("3", "solfege")).toBe("mi");
  });

  it("chooses the context by difficulty, chromatic when needed", () => {
    expect(scaleContext(0.34, 4)).toBe("major");
    expect(scaleContext(0.2, 3)).toBe("chromatic");
    expect(scaleContext(0.5, 3)).toBe("natural-minor");
    expect(scaleContext(0.7, 11)).toBe("harmonic-minor");
    expect(scaleContext(0.8, 9)).toBe("melodic-minor");
    expect(scaleContext(0.5, 11)).toBe("chromatic");
  });

  it("plays the tonic 0.55 s, then the target 0.7 s later for 0.65 s", () => {
    const p = scaleDegreePrompt(rng(5), { difficulty: 0.2, level: "major-diatonic", degree: "6" });
    const tonic = p.playback[0].midi[0];
    expect(p.playback).toEqual([
      { midi: [tonic], time: 0, duration: 0.55 },
      { midi: [tonic + 9], time: 0.7, duration: 0.65 },
    ]);
    expect(p.choices).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(p.skillIds).toEqual(["pitch.scale-degrees", "pitch.scale-degree.6"]);
  });
});

describe("melody dictation", () => {
  it("is 3 notes below 0.65 starting on the target", () => {
    for (const r of seeds(50)) {
      const p = melodyDictationPrompt(r, { difficulty: 0.5, level: "major-diatonic", degree: "3" });
      const labels = p.answer.split(" ");
      expect(labels).toHaveLength(3);
      expect(labels[0]).toBe("3");
      expect(p.playback.map((e) => e.time)).toEqual(
        [0, 0.55, 1.1, 1.65].map((t) => expect.closeTo(t, 9)),
      );
    }
  });

  it("is 4 notes at 0.65+, returning to the target then the tonic", () => {
    for (const r of seeds(50)) {
      const p = melodyDictationPrompt(r, { difficulty: 0.7, level: "major-diatonic", degree: "5" });
      const labels = p.answer.split(" ");
      expect(labels).toHaveLength(4);
      expect([labels[0], labels[2], labels[3]]).toEqual(["5", "5", "1"]);
      const tonic = p.playback[0].midi[0];
      expect(p.expectedMidi![3]).toBe(tonic);
    }
  });
});

describe("spot the wrong note", () => {
  it("plays the written melody after its tonic with one note changed, never the first", () => {
    for (const r of seeds(40)) {
      const p = errorDetectPrompt(r, { difficulty: 0.3, level: "major-diatonic" });
      expect(p.written).toHaveLength(4);
      const heard = p.playback.slice(1).map((e) => e.midi[0]);
      const diff = heard.map((m, i) => m !== p.expectedMidi![i]);
      expect(diff.filter(Boolean)).toHaveLength(1);
      expect(String(diff.indexOf(true) + 1)).toBe(p.answer);
      expect(p.answer).not.toBe("1");
      expect(p.choices).toEqual(["1", "2", "3", "4"]);
    }
    const hard = seeds(60).map((r) =>
      errorDetectPrompt(r, { difficulty: 0.9, level: "major-diatonic" }),
    );
    expect(hard[0].written).toHaveLength(8);
    expect(hard.some((p) => p.answer === "none")).toBe(true);
    for (const p of hard.filter((x) => x.answer !== "none")) {
      const k = Number(p.answer) - 1;
      expect(Math.abs(p.playback[k + 1].midi[0] - p.expectedMidi![k])).toBe(1);
    }
  });
});

describe("spot the wrong note in a song", () => {
  it("takes the phrase as written and steps one note to its scale neighbour", () => {
    const phrase = {
      id: "song-1:0",
      title: "Test tune",
      midi: [67, 69, 71, 72],
      degrees: ["1", "2", "3", "4"] as DegreeLabel[],
      tonicMidi: 67,
    };
    for (const r of seeds(20)) {
      const p = errorDetectPrompt(r, { difficulty: 0.3, level: "anchor", phrase });
      expect(p.written).toEqual(["1", "2", "3", "4"]);
      expect(p.expectedMidi).toEqual(phrase.midi);
      expect(p.songTitle).toBe("Test tune");
      const k = Number(p.answer) - 1;
      const heard = p.playback[k + 1].midi[0];
      // G major: a neighbour is in the scale, so never a raised or lowered step off it.
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(pc(heard - 67));
      expect(heard).not.toBe(phrase.midi[k]);
    }
  });
});

describe("fine pitch", () => {
  it("detunes the second note by the step, up or down, or not at all from 0.6", () => {
    for (const r of seeds(30)) {
      const p = finePitchPrompt(r, { difficulty: 0.3, cents: 18 });
      const [a, b] = p.playback.map((e) => e.midi[0]);
      expect(Math.round((b - a) * 100)).toBe(p.answer === "higher" ? 18 : -18);
      expect(p.choices).toEqual(["lower", "higher"]);
    }
    const answers = seeds(60).map((r) => finePitchPrompt(r, { difficulty: 0.8, cents: 8 }).answer);
    expect(answers).toContain("same");
  });

  it("walks the staircase two down, one up, inside its steps", () => {
    expect(CENT_STEPS[0]).toBe(50);
    expect(staircase(0, 0, true)).toEqual({ step: 0, streak: 1 });
    expect(staircase(0, 1, true)).toEqual({ step: 1, streak: 0 });
    expect(staircase(3, 1, false)).toEqual({ step: 2, streak: 0 });
    expect(staircase(0, 0, false)).toEqual({ step: 0, streak: 0 });
    expect(staircase(CENT_STEPS.length - 1, 1, true).step).toBe(CENT_STEPS.length - 1);
  });
});

describe("bass lines", () => {
  it("writes the bass by degree: roots from the level's chords, or a line through inversions", () => {
    for (const r of seeds(20)) {
      const p = bassLinePrompt(r, { difficulty: 0.8, level: "roots-primary", token: "5" });
      const bass = p.answer.split(" ");
      expect(bass[0]).toBe("1");
      expect(bass[1]).toBe("5");
      expect(bass.every((d) => ["1", "4", "5"].includes(d))).toBe(true);
      expect(p.choices).toEqual(["1", "4", "5"]);
      // Each chord's lowest note is the bass written down.
      p.playback.forEach((e, i) =>
        expect(pc(e.midi[0] - p.keyPc)).toBe([0, 2, 4, 5, 7, 9, 11][Number(bass[i]) - 1]),
      );
    }
    const line = bassLinePrompt(rng(1), { difficulty: 0.5, level: "inversions", token: "p7" });
    expect(line.answer).toBe("1 7 6 5");
    expect(line.caption).toBe("Bass 1, 7, 6, 5: I, V6, vi, iii6");
    expect(line.skillIds).toContain("ear.bass-lines.inversions");
    expect(Math.min(...line.playback[1].midi)).toBe(line.playback[1].midi[0]);
  });
});

describe("inversions", () => {
  it("puts the asked chord tone in the bass, doubled an octave down", () => {
    expect(inversionVoicing(60, "major", 0)).toEqual([48, 60, 64, 67]);
    expect(inversionVoicing(60, "major", 1)).toEqual([52, 64, 67, 72]);
    expect(inversionVoicing(60, "minor", 2)).toEqual([55, 67, 72, 75]);
    expect(inversionVoicing(60, "dominant-7", 3)).toEqual([58, 70, 72, 76, 79]);
  });

  it("spells the chord out from the bass at first, then plays it together", () => {
    const easy = inversionPrompt(rng(1), { difficulty: 0.2, token: "first" });
    expect(easy.playback).toHaveLength(5);
    expect(easy.playback.at(-1)!.midi).toEqual(easy.expectedMidi);
    expect(easy.choices).toEqual(["root", "first", "second"]);
    expect(easy.skillIds).toEqual(["ear.inversions", "ear.inversion.first"]);
    const hard = inversionPrompt(rng(1), { difficulty: 0.9, token: "7-third" });
    expect(hard.playback).toHaveLength(1);
    expect(hard.choices).toHaveLength(4);
    expect(hard.skillIds).toContain("ear.inversion.sevenths");
  });
});

describe("scales and modes", () => {
  it("plays the scale over a low tonic, up, up and down, or down", () => {
    const up = scalePrompt(rng(1), { difficulty: 0.2, token: "dorian" });
    const tonic = up.playback[1].midi[0];
    expect(up.direction).toBe("ascending");
    expect(up.playback[0].midi).toEqual([tonic - 12]);
    expect(up.playback.slice(1).map((e) => e.midi[0] - tonic)).toEqual([0, 2, 3, 5, 7, 9, 10, 12]);
    expect(up.playback[0].duration).toBeGreaterThan(up.playback.at(-1)!.time);
    expect(up.skillIds).toEqual(["ear.scales", "ear.scale.dorian"]);
    const both = scalePrompt(rng(1), { difficulty: 0.6, token: "major-pentatonic" });
    expect(both.playback.slice(1).map((e) => e.midi[0] - both.playback[1].midi[0])).toEqual([
      0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0,
    ]);
    const down = scalePrompt(rng(1), { difficulty: 0.2, token: "blues", direction: "descending" });
    expect(down.playback[1].midi[0] - down.playback.at(-1)!.midi[0]).toBe(12);
  });
});

describe("chords in a key", () => {
  it("builds each triad of the key: root in the bass, close chord tones from middle C", () => {
    // C major: vi is A minor, vii° is B diminished.
    expect(functionChord(0, "I")).toEqual([48, 60, 64, 67]);
    expect(functionChord(0, "vi")).toEqual([45, 60, 64, 69]);
    expect(functionChord(0, "vii")).toEqual([47, 62, 65, 71]);
    // G major: V is D major.
    expect(functionChord(7, "V")).toEqual([50, 62, 66, 69]);
    for (const f of CHORD_FUNCTIONS)
      for (let k = 0; k < 12; k++) {
        const [bass, ...upper] = functionChord(k, f.token);
        expect(bass).toBeGreaterThanOrEqual(43);
        expect(bass).toBeLessThan(55);
        expect(Math.min(...upper)).toBeGreaterThanOrEqual(60);
        expect(Math.max(...upper)).toBeLessThan(72);
      }
  });

  it("builds minor keys and sevenths, labelled and spelled for their key", () => {
    // C minor: i, iv, V (raised leading tone), VII (the subtonic).
    expect(functionChord(0, "m:I")).toEqual([48, 60, 63, 67]);
    expect(functionChord(0, "m:IV")).toEqual([53, 60, 65, 68]);
    expect(functionChord(0, "m:V")).toEqual([43, 62, 67, 71]);
    expect(functionChord(0, "m:vii")).toEqual([46, 62, 65, 70]);
    // Sevenths: C major's V7 and ii7, C minor's V7 and iiø7.
    expect(functionChord(0, "V7")).toEqual([43, 62, 65, 67, 71]);
    expect(functionChord(0, "ii7")).toEqual([50, 60, 62, 65, 69]);
    expect(functionChord(0, "m:V7")).toEqual([43, 62, 65, 67, 71]);
    expect(functionChord(0, "m:ii7")).toEqual([50, 60, 62, 65, 68]);
    expect(["IV", "m:IV", "vii7", "m:iii7", "?"].map(functionLabel)).toEqual([
      "IV",
      "iv",
      "viiø7",
      "IIImaj7",
      "?",
    ]);
    expect(functionSymbol(0, "m:vi")).toBe("Ab");
    expect(functionSymbol(2, "vii7")).toBe("Dbø7"); // C# half-diminished in D, spelled by its flat name
    expect(functionSymbol(0, "m:iii7")).toBe("Ebmaj7");
  });

  it("asks minor and seventh prompts in their own key, with their own skills", () => {
    const p = chordFunctionPrompt(rng(2), { difficulty: 0.5, minor: true, seventh: true });
    expect(p.answer).toMatch(/^m:.+7$/);
    expect(p.playback[0].midi).toEqual(functionChord(p.keyPc, "m:I")); // the key is set with triads
    expect(p.choices).toHaveLength(7);
    expect(p.skillIds).toContain("ear.chord-functions.minor");
    expect(p.skillIds).toContain("ear.chord-function.sevenths");
    const q = progressionPrompt(rng(4), { difficulty: 0.8, minor: true, choices: ["m:IV", "m:V"] });
    expect(q.answer.split(" ")[0]).toBe("m:I");
    expect(q.answer.split(" ").every((t) => ["m:I", "m:IV", "m:V"].includes(t))).toBe(true);
    expect(functionOfNotes(0, [55, 59, 62, 65], { minor: true, seventh: true })).toBe("m:V7");
  });

  it("names the chord of the key some notes make, in any inversion", () => {
    expect(functionOfNotes(0, [57, 60, 64])).toBe("vi");
    expect(functionOfNotes(0, [65, 69, 72, 77])).toBe("IV");
    expect(functionOfNotes(7, [62, 66, 69])).toBe("V");
    expect(functionOfNotes(0, [62, 66, 69])).toBeUndefined(); // D major is not in C major
    expect(functionOfNotes(0, [60, 64])).toBeUndefined();
  });

  it("sets the key with I IV V I, then plays the chord asked", () => {
    for (const r of seeds(20)) {
      const p = chordFunctionPrompt(r, { difficulty: 0.3, token: "vi" });
      expect(p.answer).toBe("vi");
      expect(p.keyEvents).toBe(4);
      expect(p.playback).toHaveLength(5);
      expect(p.playback[0].midi).toEqual(functionChord(p.keyPc, "I"));
      expect(p.playback[4].midi).toEqual(functionChord(p.keyPc, "vi"));
      expect(p.skillIds).toEqual(["ear.chord-functions", "ear.chord-function.vi"]);
      expect(p.choices).toHaveLength(7);
    }
    expect(chordFunctionPrompt(rng(3), { difficulty: 0.3, choices: ["I", "V"] }).choices).toEqual([
      "I",
      "V",
    ]);
  });

  it("starts progressions on I, uses only the chords picked, never repeats one in a row", () => {
    for (const r of seeds(40)) {
      const p = progressionPrompt(r, { difficulty: 0.8, choices: ["IV", "V", "vi"], token: "vi" });
      const chords = p.answer.split(" ");
      expect(chords).toHaveLength(4);
      expect(chords[0]).toBe("I");
      expect(chords[1]).toBe("vi");
      expect(chords.every((c) => ["I", "IV", "V", "vi"].includes(c))).toBe(true);
      for (let i = 1; i < chords.length; i++) expect(chords[i]).not.toBe(chords[i - 1]);
      expect(p.playback.map((e) => e.midi)).toEqual(chords.map((c) => functionChord(p.keyPc, c)));
      expect(p.skillIds[0]).toBe("ear.progressions");
    }
    expect(progressionPrompt(rng(1), { difficulty: 0.2 }).answer.split(" ")).toHaveLength(3);
  });
});

describe("drill definitions and path", () => {
  it("has 15 drills (the table's 7 and 8 the app adds) and a 17-step path in the research's order", () => {
    expect(EAR_DRILLS.map((d) => d.route)).toEqual(
      [
        "intervals",
        "interval-compare",
        "chord-qualities",
        "cadences",
        "chord-functions",
        "progressions",
        "scales",
        "inversions",
        "bass-lines",
        "fine-pitch",
        "wrong-note",
        "scale-degrees",
        "melody-dictation",
        "repertoire-transfer",
        "mixed",
      ].map((s) => `/music/ear/${s}`),
    );
    // The table's six steps and the eleven the app adds (aural-skills research order).
    expect(EAR_PATH.steps.map((s) => s.id)).toEqual([
      "anchor-tonic",
      "diatonic-degrees",
      "sing-and-play-back",
      "echo-rhythm",
      "spot-the-wrong-note",
      "melody-transfer",
      "rhythm-dictation",
      "chromatic-color",
      "interval-size",
      "interval-names",
      "sing-intervals",
      "scales-and-modes",
      "harmony-and-interval-labels",
      "chords-in-a-key",
      "follow-the-bass",
      "inversions-by-ear",
      "progressions",
    ]);
    expect(EAR_PATH.steps.map((s) => s.order)).toEqual(EAR_PATH.steps.map((_, i) => i + 1));
    const hrefs = EAR_PATH.steps.flatMap((s) => [s.href, ...(s.links ?? []).map((l) => l.href)]);
    expect(hrefs.every((h) => h.startsWith("/music/ear/") || h.startsWith("/music/rhythm?"))).toBe(
      true,
    );
    // The fine-pitch warm-up rides on the table's singing step.
    expect(EAR_PATH.steps[2].links?.at(-1)?.href).toBe("/music/ear/fine-pitch?startCents=50");
    expect(EAR_PATH.steps[0].href).toBe(
      "/music/ear/scale-degrees?answer=listen-along&level=anchor",
    );
  });
});

describe("repertoire transfer", () => {
  const g = (midi: number, startBeat: number): ScoreNote => ({ midi, startBeat, durationBeats: 1 });
  // G major: G A B C | D E F# G | A (third phrase would be 1 note, dropped). A tie continuation is skipped.
  const score: Score = {
    id: "song-1",
    title: "Test tune",
    bpm: 90,
    meter: { beats: 4, beatUnit: 4 },
    keyFifths: 1,
    keyMode: "major",
    voices: [
      {
        id: "v",
        name: "Melody",
        notes: [67, 69, 71, 72, 74, 76, 78, 79, 81]
          .map((m, i) => g(m, i))
          .concat([{ ...g(81, 9), tieFrom: true }]),
      },
      { id: "bass", name: "Bass", notes: [g(43, 0), g(50, 4)] },
    ],
    lengthBeats: 12,
  };

  it("lifts phrases and maps them to degrees of the score key", () => {
    const phrases = phrasesFromScore(score);
    expect(phrases.map((p) => p.degrees.join(" "))).toEqual(["1 2 3 4", "5 6 7 1"]);
    expect(phrases[0].tonicMidi).toBe(67);
    expect(phrases[1].tonicMidi).toBe(67);
    expect(phrases[0].difficulty).toBeCloseTo((5 / 12 + 2 / 12 + 0) / 3);
  });

  it("ranks by weakest degree, tags new/due/strong, and plans blocks", () => {
    const phrases = phrasesFromScore(score);
    const known: Record<string, { mastery: number; due: boolean }> = {
      "pitch.scale-degree.1": { mastery: 0.9, due: false },
      "pitch.scale-degree.2": { mastery: 0.9, due: false },
      "pitch.scale-degree.3": { mastery: 0.9, due: false },
      "pitch.scale-degree.4": { mastery: 0.8, due: false },
    };
    const ranked = rankPhrases(phrases, (id) => known[id]);
    expect(ranked.map((p) => p.tag)).toEqual(["new", "strong"]);
    expect(ranked[0].degrees).toContain("5");
    const plan = repertoirePlan(ranked);
    expect(plan.warmup.map((p) => p.id)).toEqual(["song-1:0"]);
    expect(plan.new.map((p) => p.id)).toEqual(["song-1:4"]);
    known["pitch.scale-degree.4"] = { mastery: 0.8, due: true };
    expect(rankPhrases(phrases, (id) => known[id]).find((p) => p.id === "song-1:0")!.tag).toBe(
      "due",
    );
    const prompt = repertoirePrompt(phrases[0]);
    expect(prompt.expectedMidi).toEqual([67, 69, 71, 72]);
    expect(prompt.playback[0]).toEqual({ midi: [67], time: 0, duration: 0.5 });
  });
});

describe("interval comparison", () => {
  const semis = (p: ReturnType<typeof intervalComparePrompt>) => {
    const [a, b, c, d] = p.expectedMidi!;
    return [b - a, d - c];
  };

  it("answers which interval is bigger, from the same root early on", () => {
    for (const r of seeds(40)) {
      const p = intervalComparePrompt(r, { difficulty: 0.2, gap: "apart" });
      const [a, b] = semis(p);
      expect(Math.abs(a - b)).toBeGreaterThanOrEqual(3);
      expect(p.answer).toBe(a > b ? "first" : "second");
      expect(p.choices).toEqual(["first", "second"]);
      expect(p.expectedMidi![0]).toBe(p.expectedMidi![2]); // same root
      expect(p.playback).toHaveLength(4);
      expect(p.skillIds).toEqual(["pitch.intervals"]);
      expect(a >= 1 && a <= 12 && b >= 1 && b <= 12).toBe(true);
    }
  });

  it("gets closer and adds 'same' as it gets harder", () => {
    const hard = seeds(80).map((r) => intervalComparePrompt(r, { difficulty: 0.8, gap: "close" }));
    for (const p of hard) {
      const [a, b] = semis(p);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      expect(p.answer).toBe(a === b ? "same" : a > b ? "first" : "second");
      expect(p.choices).toContain("same");
    }
    expect(hard.some((p) => p.answer === "same")).toBe(true);
    expect(hard.some((p) => p.expectedMidi![0] !== p.expectedMidi![2])).toBe(true); // roots differ
    expect(hard.some((p) => p.playback.length === 2)).toBe(true); // played as chords sometimes
  });
});

describe("interval choices", () => {
  it("asks a unison, keeps a fixed direction, and narrows the answers", () => {
    const r = seeds(1)[0];
    const u = intervalPrompt(r, {
      difficulty: 0.9,
      token: "P1",
      direction: "ascending",
      choices: ["P1", "P5"],
    });
    expect(u.expectedMidi![0]).toBe(u.expectedMidi![1]);
    expect(u.skillIds).toEqual(["pitch.intervals"]);
    expect(u.choices).toEqual(["P1", "P5"]);
    for (const rr of seeds(20)) {
      const d = intervalPrompt(rr, { difficulty: 0.9, token: "M3", direction: "descending" });
      expect(d.direction).toBe("descending");
      expect(d.expectedMidi![0] - d.expectedMidi![1]).toBe(4);
    }
    expect(EAR_INTERVALS.map((i) => i.token)[0]).toBe("P1");
    // A fixed first note: every prompt starts on it, whichever way it goes.
    for (const rr of seeds(10)) {
      const up = intervalPrompt(rr, {
        difficulty: 0.9,
        token: "P5",
        root: 60,
        direction: "ascending",
      });
      const down = intervalPrompt(rr, {
        difficulty: 0.9,
        token: "P5",
        root: 60,
        direction: "descending",
      });
      expect(up.expectedMidi).toEqual([60, 67]);
      expect(down.expectedMidi).toEqual([60, 53]);
    }
  });
});
