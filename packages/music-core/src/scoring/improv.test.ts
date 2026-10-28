import { describe, expect, it } from "vitest";
import { PROGRESSIONS, chorusBars } from "../content/jam";
import { TUNES } from "../content/tunes";
import { gameOf, gradeImprov, tradeWindows, type ImprovNote } from "./improv";

const blues = PROGRESSIONS.find((p) => p.id === "blues")!; // C7 4, F7 2, C7 2, G7 2, C7 2
const iiVI = PROGRESSIONS.find((p) => p.id === "ii-v-i")!; // Dm7 2, G7 2, Cmaj7 2, A7 2
const grade = (
  p: typeof blues,
  notes: ImprovNote[],
  game: string,
  more: Partial<Parameters<typeof gradeImprov>[2]> = {},
) => gradeImprov(p, notes, { game: gameOf(game), choruses: 1, swing: true, bpm: 100, ...more });
const part = (g: ReturnType<typeof grade>, metric: string) =>
  g.choruses[0].parts.find((x) => x.metric === metric)!;

/** A note on `bar`, `beat` (from 0), held `len` beats. */
const n = (midi: number, bar: number, beat = 0, len = 1): ImprovNote => ({
  midi,
  beat: bar * 4 + beat,
  end: bar * 4 + beat + len,
});

describe("gradeImprov: the three-note game", () => {
  // C, Eb, G in each of the 12 bars on beats 1 and 2, then two beats of rest: 12 rests.
  const riff = Array.from({ length: 12 }, (_, b) => [n(60, b, 0), n(63, b, 1)]).flat();

  it("passes with every note in the set and a rest every bar", () => {
    const g = grade(blues, riff, "three-notes");
    expect(part(g, "set").value).toBe(1);
    expect(g.choruses[0].measures.rests!.value).toBe(12);
    expect(g.passed).toBe(true);
    expect(g.score).toBe(1);
  });

  it("names the weakest part when notes leave the set", () => {
    const wrong = riff.map((x, i) => (i % 4 === 1 ? { ...x, midi: 64 } : x)); // E natural in half the bars
    const g = grade(blues, wrong, "three-notes");
    expect(part(g, "set").value).toBe(0.75);
    expect(g.score).toBeCloseTo(0.75 / 0.9);
    expect(g.headline).toMatch(/weakest part: notes from the set, 18 of 24 \(aim 90%\)/);
  });

  it("counts rests: a chorus of unbroken quarter notes has none", () => {
    const busy = Array.from({ length: 48 }, (_, i) => ({ midi: 60, beat: i, end: i + 1 }));
    expect(grade(blues, busy, "three-notes").choruses[0].measures.rests!.value).toBe(0);
  });
});

describe("gradeImprov: chord tones, guide tones and time", () => {
  it("lands guide tones on each change of a ii-V-I", () => {
    // F (3rd of Dm7), B (3rd of G7), E (3rd of Cmaj7), C# (3rd of A7), one per change.
    const notes = [n(65, 0), n(71, 2), n(64, 4), n(61, 6)];
    const g = grade(iiVI, notes, "guide-tones");
    expect(part(g, "landings").value).toBe(1);
    expect(part(g, "set").value).toBe(1);
    expect(g.passed).toBe(true);
    // The 3rds game too; a 7th instead of a 3rd lands a guide tone but not a 3rd.
    expect(grade(iiVI, [n(72, 0), ...notes.slice(1)], "thirds").score).toBe(0.75);
    expect(grade(iiVI, [n(72, 0), ...notes.slice(1)], "guide-tones").passed).toBe(true);
  });

  it("takes an anticipated landing half a beat early", () => {
    const g = grade(iiVI, [n(65, 0), { midi: 71, beat: 7.5, end: 8.5 }], "guide-tones");
    expect(g.choruses[0].measures.landings!.detail).toBe("2 of 4");
  });

  it("counts chord tones on beats 1 and 3 only", () => {
    // Over C7: C on 1 (chord), D on 2 (ignored), F on 3 (not a chord tone).
    const g = grade(blues, [n(60, 0, 0), n(62, 0, 1), n(65, 0, 2)], "chord-tones");
    expect(part(g, "strong").detail).toBe("1 of 2");
    expect(g.score).toBe(0.5);
  });

  it("reads swung eighths on the triplet grid and straight ones off it", () => {
    const eighths = (at: number) =>
      Array.from({ length: 16 }, (_, i) => ({
        midi: 60,
        beat: Math.floor(i / 2) + (i % 2 ? at : 0),
      }));
    const swung = grade(blues, eighths(2 / 3), "free");
    expect(swung.choruses[0].measures.time!.value).toBe(1);
    expect(swung.choruses[0].swing).toBe(2);
    // Straight eighths at 100 BPM sit 100 ms off the swung grid: the off-beats miss.
    expect(grade(blues, eighths(0.5), "free").choruses[0].measures.time!.value).toBe(0.5);
    expect(
      grade(blues, eighths(0.5), "free", { swing: false }).choruses[0].measures.time!.value,
    ).toBe(1);
  });

  it("splits choruses, giving a note half a beat early to the next", () => {
    const g = grade(blues, [n(64, 0), { midi: 64, beat: 47.6 }, n(64, 13)], "chord-tones", {
      choruses: 2,
    });
    expect(g.choruses.map((c) => c.notes)).toEqual([1, 2]);
  });

  it("scores nothing played as zero", () => {
    const g = grade(blues, [], "free");
    expect(g.score).toBe(0);
    expect(g.headline).toBe("Nothing was played, so nothing passed.");
  });
});

describe("gradeImprov: rhythm games", () => {
  it("finds one rhythmic motif and the chord tone on each beat 1", () => {
    // The same rhythm (1, the and-of-2) in every bar, the root of each bar's chord on 1.
    const roots = [60, 60, 60, 60, 65, 65, 60, 60, 67, 67, 60, 60];
    const notes = roots.flatMap((r, b) => [n(r, b, 0, 0.5), n(r + 2, b, 1.67, 0.5)]);
    const g = grade(blues, notes, "motif");
    expect(part(g, "motif").value).toBe(1);
    expect(part(g, "downbeats").value).toBe(1);
    // Half the bars change rhythm: 6 of 12 with the motif, short of 8.
    const broken = notes.map((x, i) => (i % 4 === 3 ? { ...x, beat: x.beat + 1 } : x));
    expect(grade(blues, broken, "motif").score).toBeCloseTo(0.5 / (2 / 3));
  });

  it("checks beat 1 chord tones approached by a half step", () => {
    // B then C on bar 1 (approached), D then E on bar 2 (a whole step: not).
    const g = grade(
      blues,
      [n(59, 0, -0.5, 0.5), n(60, 0), n(62, 1, -0.5, 0.5), n(64, 1)],
      "approach",
    );
    expect(part(g, "approach").detail).toBe("1 of 12 bars");
  });

  it("counts phrases that start off the beat", () => {
    const g = grade(blues, [n(60, 0, 0.67), n(62, 0, 1), n(64, 2, 0), n(65, 4, 3.67)], "off-beat");
    expect(part(g, "offbeat").detail).toBe("2 of 3");
  });
});

describe("gradeImprov: windows and trading", () => {
  it("keeps two bars on and two off", () => {
    const on = [0, 1, 4, 5, 8, 9].map((b) => n(60, b));
    expect(grade(blues, on, "space").passed).toBe(true);
    // A note in the second window (bars 3 and 4) breaks it; a landing on its first half beat does not.
    expect(grade(blues, [...on, n(60, 2, 0.25)], "space").passed).toBe(true);
    expect(grade(blues, [...on, n(60, 3, 1)], "space").score).toBeCloseTo(5 / 6);
  });

  it("answers in call and response: the band takes bars 1 and 2", () => {
    const answers = [2, 6, 10].map((b) => n(60, b));
    expect(grade(blues, answers, "call-response").passed).toBe(true);
    expect(grade(blues, [n(60, 0, 1), ...answers], "call-response").score).toBeCloseTo(5 / 6);
  });

  it("trades fours on top of another game, judging only your bars", () => {
    // Chord tones on 1 in bars 1 to 4 and 9 to 12; a wrong note in the band's four is a window lost, not a wrong chord tone.
    const mine = [0, 1, 2, 3, 8, 9, 10, 11].map((b) => n(b === 8 || b === 9 ? 67 : 64, b));
    const g = grade(blues, [...mine, n(61, 5)], "chord-tones", { windows: tradeWindows(4) });
    expect(part(g, "strong").value).toBe(1);
    expect(part(g, "windows").detail).toBe("2 of 3 windows");
    expect(g.score).toBeCloseTo(2 / 3);
  });
});

describe("tunes", () => {
  it("parses every chord and adds up each form", () => {
    for (const t of TUNES) {
      expect(
        t.chords.every((c) => c.bars > 0),
        t.id,
      ).toBe(true);
      const bars = t.sections!.reduce((a, s) => a + s.bars, 0);
      expect(chorusBars(t), t.id).toBe(bars);
      expect([12, 16, 32, 36], t.id).toContain(bars);
    }
    const bossa = TUNES.find((t) => t.id === "tune-blue-bossa")!;
    expect(bossa.chords.map((c) => c.symbol).slice(0, 3)).toEqual(["Cm7", "Fm7", "Dm7b5"]);
    expect(bossa.chords[0].bars).toBe(2);
    const rhythm = TUNES.find((t) => t.id === "tune-rhythm-changes")!;
    expect(rhythm.sections!.map((s) => s.label).join(" ")).toBe("A A2 B A");
    expect(rhythm.chords[0]).toMatchObject({ symbol: "Bb6", bars: 0.5 });
  });

  it("grades a tune's changes like any progression", () => {
    const leaves = TUNES.find((t) => t.id === "tune-autumn-leaves")!;
    // Eb (3rd of Cm7) on the first change, A (3rd of F7) on the second: 2 of the A section's 6 changes.
    const g = grade(leaves, [n(63, 0), n(69, 1)], "guide-tones");
    expect(g.choruses[0].measures.landings!.detail.startsWith("2 of")).toBe(true);
  });
});
