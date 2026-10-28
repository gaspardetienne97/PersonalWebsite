import { describe, expect, it } from "vitest";
import { PROGRESSIONS, chorusBars } from "../content/jam";
import {
  TUNES,
  formatReharm,
  parseReharm,
  reharmDevice,
  reharmOptions,
  reharmonise,
  tuneFromScore,
} from "../content/tunes";
import type { Score } from "../types";
import {
  aSectionBars,
  findQuotes,
  gameOf,
  gradeImprov,
  tradeWindows,
  type ImprovNote,
} from "./improv";

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
      // Peace is one 10-bar form, Infant Eyes three 9-bar phrases.
      expect([10, 12, 16, 24, 27, 32, 36, 48], t.id).toContain(bars);
    }
    const bossa = TUNES.find((t) => t.id === "tune-blue-bossa")!;
    expect(bossa.chords.map((c) => c.symbol).slice(0, 3)).toEqual(["Cm7", "Fm7", "Dm7b5"]);
    expect(bossa.chords[0].bars).toBe(2);
    const rhythm = TUNES.find((t) => t.id === "tune-rhythm-changes")!;
    expect(rhythm.sections!.map((s) => s.label).join(" ")).toBe("A A2 B A");
    expect(rhythm.chords[0]).toMatchObject({ symbol: "Bb6", bars: 0.5 });
    expect(TUNES.find((t) => t.id === "tune-very-early")!.beatsPerBar).toBe(3);
    expect(chorusBars(TUNES.find((t) => t.id === "tune-infant-eyes")!)).toBe(27);
  });

  it("grades a tune's changes like any progression", () => {
    const leaves = TUNES.find((t) => t.id === "tune-autumn-leaves")!;
    // Eb (3rd of Cm7) on the first change, A (3rd of F7) on the second: 2 of the A section's 6 changes.
    const g = grade(leaves, [n(63, 0), n(69, 1)], "guide-tones");
    expect(g.choruses[0].measures.landings!.detail.startsWith("2 of")).toBe(true);
  });
});

describe("gradeImprov: bridge, displacement and side-slips", () => {
  const rhythm = TUNES.find((t) => t.id === "tune-rhythm-changes")!; // A A2 B A, bridge bars 16 to 23

  it("grades only the bridge; the A sections are free", () => {
    // The 3rd of D7, G7, C7 and F7 on each bridge change; anything at all in the A sections.
    const bridge = [n(66, 16), n(71, 18), n(64, 20), n(69, 22)];
    const head = Array.from({ length: 16 }, (_, b) => n(61, b));
    const g = grade(rhythm, [...head, ...bridge], "bridge");
    expect(part(g, "landings").detail).toBe("4 of 4");
    expect(g.passed).toBe(true);
    // Missing two of the four bridge landings.
    expect(grade(rhythm, [...head, ...bridge.slice(0, 2)], "bridge").score).toBeCloseTo(0.5 / 0.85);
  });

  it("counts a motif moved a beat later each time", () => {
    // Three eighths every five beats: beat 1, then 2, then 3... of each bar (the Straight, No Chaser idea).
    const motif = (at: number) =>
      [0, 0.5, 1].map((o, i) => ({ midi: 60 + i * 2, beat: at + o, end: at + o + 0.4 }));
    const notes = Array.from({ length: 9 }, (_, k) => motif(k * 5)).flat();
    const g = grade(blues, notes, "displacement");
    expect(g.choruses[0].measures.displaced!.value).toBe(8);
    expect(g.passed).toBe(true);
    // The same motif every bar on beat 1 is repeated, not displaced.
    const still = Array.from({ length: 12 }, (_, k) => motif(k * 4)).flat();
    expect(grade(blues, still, "displacement").choruses[0].measures.displaced!.value).toBe(0);
  });

  it("finds side-slips and checks each resolves on a chord tone", () => {
    // Over C7 (C mixolydian): Db, Eb, Gb (outside) on beats 3, 3.5 and 4, then E (the 3rd) on the next 1.
    const slip = (bar: number, land: number) => [
      n(61, bar, 2, 0.5),
      n(63, bar, 2.5, 0.5),
      n(66, bar, 3, 0.5),
      n(land, bar + 1, 0),
    ];
    const notes = [0, 2, 6, 10].flatMap((b) => slip(b, 64)); // all over C7
    const g = grade(blues, notes, "side-slip");
    expect(part(g, "slips").value).toBe(4);
    expect(part(g, "resolved").value).toBe(1);
    expect(g.passed).toBe(true);
    // Landing on D (not a chord tone) leaves that slip unresolved.
    const off = [0, 2, 6].flatMap((b) => slip(b, 64)).concat(slip(10, 62));
    expect(part(grade(blues, off, "side-slip"), "resolved").detail).toBe("3 of 4");
    // Inside lines are not slips.
    const inside = Array.from({ length: 24 }, (_, i) => ({
      midi: [60, 62, 64, 65][i % 4],
      beat: i / 2,
    }));
    expect(part(grade(blues, inside, "side-slip"), "slips").value).toBe(0);
  });
});

describe("gradeImprov in 3/4", () => {
  const waltz = { ...iiVI, beatsPerBar: 3 }; // 8 bars of 3: Dm7 2, G7 2, Cmaj7 2, A7 2

  it("lays the changes on three-beat bars and judges beat 1 only", () => {
    // F (3rd of Dm7) at 0, B (3rd of G7) at 6, E at 12, C# at 18.
    const notes = [n(65, 0), { midi: 71, beat: 6 }, { midi: 64, beat: 12 }, { midi: 61, beat: 18 }];
    const g = grade(waltz, notes, "thirds");
    expect(g.passed).toBe(true);
    // A chord tone on beat 3 of a 3/4 bar is not a strong beat.
    const c = grade(waltz, [n(62, 0), { midi: 63, beat: 2 }], "chord-tones");
    expect(part(c, "strong").detail).toBe("1 of 1");
    expect(part(c, "strong").label).toBe("Chord tones on beat 1");
  });

  it("keeps windows in three-beat bars", () => {
    const on = [0, 1, 4, 5].map((b) => ({ midi: 62, beat: b * 3 }));
    expect(grade(waltz, on, "space").passed).toBe(true);
  });
});

describe("reharmonisation", () => {
  const fly = TUNES.find((t) => t.id === "tune-fly-me-to-the-moon")!; // Am7 Dm7 G7 Cmaj7 ...

  it("offers the tritone sub and related ii on a dominant only", () => {
    expect(reharmOptions(fly, 2)).toContain("tritone");
    expect(reharmOptions(fly, 0)).not.toContain("tritone");
  });

  it("swaps chords and keeps the form's length", () => {
    // Dm7 (index 1) is no dominant, so a related ii there is dropped.
    const swaps = parseReharm("2:tritone,1:related-ii,0:secondary,9:nonsense");
    expect(swaps.size).toBe(3);
    const r = reharmonise(fly, swaps);
    expect(r.chords.slice(0, 4).map((c) => c.symbol)).toEqual(["A7", "Dm7", "Db7", "Cmaj7"]);
    expect(chorusBars(r)).toBe(chorusBars(fly));
    expect(reharmDevice(swaps)).toBe("mixed");
    expect(formatReharm(swaps)).toBe("0:secondary,1:related-ii,2:tritone");
    expect(reharmonise(fly, parseReharm("2:related-ii")).chords[2].symbol).toBe("Dm7");
  });

  it("writes the backdoor, passing diminished and chromatic ii-V before the next chord", () => {
    // G7 (index 2) before Cmaj7.
    const one = (d: string) =>
      reharmonise(fly, parseReharm(`2:${d}`))
        .chords.slice(2, 5)
        .map((c) => `${c.symbol} ${c.bars}`);
    expect(one("backdoor").slice(0, 2)).toEqual(["Fm7 0.5", "Bb7 0.5"]);
    expect(one("passing-dim").slice(0, 2)).toEqual(["G7 0.5", "Bdim7 0.5"]);
    expect(one("chromatic-ii-v")).toEqual(["G7 0.5", "Ebm7 0.25", "Ab7 0.25"]);
    expect(reharmDevice(parseReharm("2:backdoor"))).toBe("backdoor");
  });
});

describe("tunes with their melody: quote the head, melody and fills", () => {
  it("finds fragments of four notes or more, in any octave, repeats counted once", () => {
    const head = [67, 64, 64, 65, 67, 72, 71, 69];
    // An octave up, with the repeated E played once, then something else, then the tail.
    const line = [79, 76, 77, 79, 60, 62, 67, 72, 71, 69];
    expect(findQuotes(line, head)).toEqual([
      { from: 0, to: 3, length: 4 },
      { from: 6, to: 9, length: 4 },
    ]);
    // The same notes a step up are not the head; three notes are not enough.
    expect(findQuotes([69, 66, 67, 69], head)).toEqual([]);
    expect(findQuotes([67, 64, 65], head)).toEqual([]);
  });

  // A 16-bar AABA form, four bars a section, with a head that rests in every second bar.
  const score: Score = {
    id: "s1",
    title: "Test tune",
    bpm: 120,
    meter: { beats: 4, beatUnit: 4 },
    keyFifths: 0,
    lengthBeats: 64,
    sections: ["A", "A", "B", "A"].map((label, k) => ({
      label,
      startBeat: k * 16,
      endBeat: k * 16 + 16,
    })),
    chords: Array.from({ length: 8 }, (_, k) => ({
      symbol: k % 2 ? "G7" : "Cmaj7",
      startBeat: k * 8,
      durationBeats: 8,
    })),
    voices: [
      {
        id: "m",
        name: "Melody",
        notes: Array.from({ length: 8 }, (_, k) =>
          [67, 64, 65, 67].map((midi, j) => ({ midi, startBeat: k * 8 + j, durationBeats: 1 })),
        ).flat(),
      },
    ],
  };

  it("reads a score as a tune: the form from its chords, the head from its melody", () => {
    const t = tuneFromScore(score, "song-s1")!;
    expect(t.progression.chords.map((c) => `${c.symbol} ${c.bars}`).slice(0, 2)).toEqual([
      "Cmaj7 2",
      "G7 2",
    ]);
    expect(chorusBars(t.progression)).toBe(16);
    expect(t.progression.sections?.map((x) => x.label).join(" ")).toBe("A A B A");
    expect(aSectionBars(t.progression)).toEqual([0, 4, 12]);
    expect(t.head).toHaveLength(32);
    expect(tuneFromScore({ ...score, chords: [] }, "x")).toBeNull();
  });

  it("quote the head: each A section opened with a fragment", () => {
    const t = tuneFromScore(score, "song-s1")!;
    const opts = { choruses: 1, swing: false, bpm: 120, head: t.head };
    // The fragment an octave up at bars 0 and 4, then a scale at bar 12.
    const at = (bar: number, midis: number[]) =>
      midis.map((midi, j) => ({
        midi: midi,
        beat: bar * 4 + j * 0.5,
        end: bar * 4 + j * 0.5 + 0.5,
      }));
    const quote = [79, 76, 77, 79, 84];
    const two = gradeImprov(
      t.progression,
      [...at(0, quote), ...at(4, quote), ...at(12, [60, 62, 64, 65])],
      {
        ...opts,
        game: gameOf("quote"),
      },
    );
    expect(two.choruses[0].parts[0]).toMatchObject({ value: 2 / 3, detail: "2 of 3 A sections" });
    const all = gradeImprov(t.progression, [...at(0, quote), ...at(4, quote), ...at(12, quote)], {
      ...opts,
      game: gameOf("quote"),
    });
    expect(all.passed).toBe(true);
    // No melody: nothing to quote, so nothing passes.
    expect(
      gradeImprov(t.progression, at(0, quote), { ...opts, head: [], game: gameOf("quote") }).score,
    ).toBe(0);
  });

  it("melody and fills: the head's notes, and 2 to 4 notes in its rests", () => {
    const t = tuneFromScore(score, "song-s1")!;
    const melody = t.head.map((h) => ({ midi: h.midi + 12, beat: h.beat, end: h.end }));
    // A three-note fill in the rest of each of the first six bars of rest (beats 4 to 8 of each 8).
    const fills = Array.from({ length: 6 }, (_, k) =>
      [0, 0.5, 1].map((o) => ({ midi: 72, beat: k * 8 + 4.5 + o, end: k * 8 + 5 + o })),
    ).flat();
    const g = gradeImprov(t.progression, [...melody, ...fills], {
      game: gameOf("melody-fills"),
      choruses: 1,
      swing: false,
      bpm: 120,
      head: t.head,
    });
    expect(g.choruses[0].measures.melody!.value).toBe(1);
    expect(g.choruses[0].measures.fills).toEqual({ value: 6, detail: "6 of 8 rests filled" });
    expect(g.passed).toBe(true);
    // The melody alone fills nothing.
    const bare = gradeImprov(t.progression, melody, {
      game: gameOf("melody-fills"),
      choruses: 1,
      swing: false,
      bpm: 120,
      head: t.head,
    });
    expect(bare.passed).toBe(false);
  });
});
