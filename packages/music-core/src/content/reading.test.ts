import { describe, expect, it } from "vitest";
import type { ReadingLevelId } from "../data";
import type { Score } from "../types";
import { pc } from "../theory/notes";
import { choicesForKey, diatonicNames, keyByName } from "../theory/spelling";
import { pcOf } from "../theory/notes";
import { rng } from "./random";
import {
  barQuarters,
  levelsFor,
  READING_METERS,
  readingLevel,
  readingRungs,
  climbAfter,
  READING_RUNGS,
  startClimb,
  flashcardCorrect,
  flashcardDeck,
  flashcardPrompt,
  practiceMissedScore,
  READING_LEVELS,
  readingRange,
  sightReadingScore,
  sightReadingSkills,
} from "./reading";

const LEVELS: ReadingLevelId[] = ["primer", "level-1", "level-2", "level-3"];

/** Every bar of every voice must total the meter exactly, with no note crossing a bar line. */
function expectExactBars(score: Score) {
  const bar = barQuarters(score.meter);
  for (const v of score.voices) {
    const totals = Array.from({ length: score.lengthBeats / bar }, () => 0);
    for (const n of v.notes) {
      const b = Math.floor(n.startBeat / bar);
      expect(n.startBeat + n.durationBeats, `${v.id} crosses a bar line`).toBeLessThanOrEqual(
        (b + 1) * bar,
      );
      totals[b] += n.durationBeats;
    }
    expect(totals, `${score.id} ${v.id}`).toEqual(totals.map(() => bar));
  }
}

describe("reading levels", () => {
  it("carries the four authored levels first", () => {
    expect(
      READING_LEVELS.slice(0, 4).map(
        (l) =>
          `${l.id}|${l.recommendedDifficulty}|${l.recommendedClefs.join(",")}|${l.recommendedRange.lowestMidi}-${l.recommendedRange.highestMidi}|${l.recommendedKeys.join(",")}`,
      ),
    ).toEqual([
      "primer|0.2|treble|60-72|C major",
      "level-1|0.4|treble|55-79|C major,G major,F major",
      "level-2|0.55|treble,bass|48-84|C major,G major,F major,A minor,E minor",
      "level-3|0.7|treble,bass|43-88|C major,G major,D major,F major,Bb major,D minor",
    ]);
  });

  it("gives each clef its side of middle C, at least an octave", () => {
    expect(readingRange("primer", ["treble"])).toEqual([60, 72]);
    expect(readingRange("primer", ["bass"])).toEqual([48, 60]);
    expect(readingRange("primer", ["treble", "bass"])).toEqual([48, 72]);
    expect(readingRange("level-1", ["treble"])).toEqual([60, 79]);
    expect(readingRange("level-3", ["bass"])).toEqual([43, 60]);
    expect(readingRange("level-3", ["treble", "bass"])).toEqual([43, 88]);
  });
});

describe("flashcards", () => {
  it("draws diatonic notes in range, spelled to the key, with key-spelled choices", () => {
    const f = keyByName("F major")!;
    const diatonic = new Set(diatonicNames(f).map((n) => pcOf(n)));
    for (let s = 1; s < 200; s++) {
      const p = flashcardPrompt(rng(s), {
        kind: "note",
        clefs: ["treble"],
        key: "F major",
        range: [60, 72],
        difficulty: 0.3,
      });
      expect(p.midi[0]).toBeGreaterThanOrEqual(60);
      expect(p.midi[0]).toBeLessThanOrEqual(72);
      expect(diatonic.has(pc(p.midi[0]))).toBe(true);
      expect(p.choices).toEqual(choicesForKey(f));
      expect(p.choices).toContain(p.answer);
      if (pc(p.midi[0]) === 10) expect(p.answer).toBe("Bb");
    }
  });

  it("splits both clefs at middle C and builds hyphen-joined triads", () => {
    for (let s = 1; s < 100; s++) {
      const p = flashcardPrompt(rng(s), {
        kind: "note",
        clefs: ["treble", "bass"],
        key: "C major",
        range: [48, 72],
        difficulty: 0.3,
      });
      expect(p.clef === "treble" ? p.midi[0] >= 60 : p.midi[0] < 60).toBe(true);
      expect(p.skillIds).toEqual([`reading.${p.clef}`, `reading.${p.clef}.landmarks`]);
      const c = flashcardPrompt(rng(s), {
        kind: "chord",
        clefs: ["treble"],
        key: "G major",
        range: [60, 79],
        difficulty: 0.5,
      });
      expect(c.answer.split("-")).toHaveLength(3);
      expect(c.choices).toHaveLength(7);
      expect(c.choices).toContain(c.answer);
      expect(c.skillIds).toContain("reading.polyphonic");
    }
  });

  it("accepts enharmonic names and played pitch classes", () => {
    const p = flashcardPrompt(rng(9), {
      kind: "chord",
      clefs: ["treble"],
      key: "C major",
      range: [60, 72],
      difficulty: 0.5,
    });
    const alt = p.answer.replace("B", "Cb");
    expect(flashcardCorrect(p, alt)).toBe(true);
    expect(
      flashcardCorrect(
        p,
        p.midi.map((m) => m + 12),
      ),
    ).toBe(true);
    expect(flashcardCorrect(p, [p.midi[0]])).toBe(false);
  });

  it("deals every note once before repeating, never the same card twice in a row", () => {
    const opts = {
      kind: "note" as const,
      clefs: ["treble" as const],
      key: "C major",
      range: [60, 67] as [number, number],
      difficulty: 0.3,
    };
    for (let s = 1; s < 30; s++) {
      const deck = flashcardDeck(rng(s), opts, 10);
      // C4 to G4 in C major is five notes: the first five are all different.
      expect(new Set(deck.slice(0, 5).map((c) => c.id)).size).toBe(5);
      deck.slice(1).forEach((c, i) => expect(c.id).not.toBe(deck[i].id));
    }
    const one = flashcardDeck(rng(1), { ...opts, range: [60, 60] }, 3);
    expect(one).toHaveLength(3);
  });
});

describe("sight-reading", () => {
  it("fills every bar exactly for every level, meter and length", () => {
    let s = 1;
    for (const level of LEVELS)
      for (const meter of ["simple", "compound"] as const)
        for (let measures = 1; measures <= 8; measures++) {
          const score = sightReadingScore(rng(s++), {
            level,
            instrument: "piano",
            clefs: ["treble", "bass"],
            key: "G major",
            range: [43, 84],
            measures,
            meter,
            bpm: 90,
          });
          expect(score.lengthBeats).toBe(measures * (meter === "simple" ? 4 : 3));
          expect(score.meter).toEqual(
            meter === "simple" ? { beats: 4, beatUnit: 4 } : { beats: 6, beatUnit: 8 },
          );
          expectExactBars(score);
        }
  });

  it("puts treble in the right hand and bass in the left, inside range and key", () => {
    const score = sightReadingScore(rng(3), {
      level: "level-2",
      instrument: "piano",
      clefs: ["treble", "bass"],
      key: "E minor",
      range: [48, 84],
      measures: 4,
      meter: "simple",
      bpm: 90,
    });
    const [rh, lh] = score.voices;
    expect([rh.id, rh.clef, rh.hand, lh.id, lh.clef, lh.hand]).toEqual([
      "rh",
      "treble",
      "right",
      "lh",
      "bass",
      "left",
    ]);
    expect(rh.notes.every((n) => n.midi >= 60 && n.midi <= 84)).toBe(true);
    expect(lh.notes.every((n) => n.midi >= 48 && n.midi <= 59)).toBe(true);
    const em = new Set(diatonicNames(keyByName("E minor")!).map((n) => pcOf(n)));
    expect(score.voices.flatMap((v) => v.notes).every((n) => em.has(pc(n.midi)))).toBe(true);
    expect(score.keyFifths).toBe(1);
    expect(sightReadingSkills(score)).toEqual([
      "reading.treble",
      "reading.treble.stepwise",
      "reading.bass",
      "reading.bass.stepwise",
    ]);
  });

  it("drops a clef with no notes on its side of middle C instead of an empty voice", () => {
    const score = sightReadingScore(rng(1), {
      level: "primer",
      instrument: "piano",
      clefs: ["treble", "bass"],
      key: "C major",
      range: [60, 72],
      measures: 2,
      meter: "simple",
      bpm: 90,
    });
    expect(score.voices.map((v) => v.clef)).toEqual(["treble"]);
    expect(score.voices[0].notes.every((n) => n.midi >= 60 && n.midi <= 72)).toBe(true);
    expectExactBars(score);
  });

  it("moves stepwise at the primer, with its level defaults, and one voice on guitar", () => {
    const score = sightReadingScore(rng(11), {
      level: "primer",
      instrument: "guitar",
      measures: 8,
      meter: "simple",
      bpm: 80,
    });
    expect(score.voices).toHaveLength(1);
    const notes = score.voices[0].notes;
    expect(
      notes.every((n) => n.midi >= 60 && n.midi <= 72 && [1, 2].includes(n.durationBeats)),
    ).toBe(true);
    notes
      .slice(1)
      .forEach((n, i) => expect(Math.abs(n.midi - notes[i].midi)).toBeLessThanOrEqual(2));
    const compound = sightReadingScore(rng(2), {
      level: "level-3",
      instrument: "piano",
      clefs: ["treble"],
      measures: 2,
      meter: "compound",
      bpm: 80,
    });
    expect(sightReadingSkills(compound)).toContain("reading.rhythm.compound");
  });

  it("regenerates from missed groups with exact bars", () => {
    const score = sightReadingScore(rng(4), {
      level: "level-1",
      instrument: "piano",
      clefs: ["treble"],
      measures: 2,
      meter: "simple",
      bpm: 90,
    });
    const notes = score.voices[0].notes;
    const missed = [notes[1], notes[3], notes[4]].map((n, index) => ({
      index,
      startBeat: n.startBeat,
      durationBeats: n.durationBeats,
      notes: [{ ...n, voiceId: "rh" }],
    }));
    const retry = practiceMissedScore(score, missed);
    expect(retry.voices[0].notes.map((n) => n.midi)).toEqual([
      notes[1].midi,
      notes[3].midi,
      notes[4].midi,
    ]);
    expect(retry.lengthBeats).toBe(4);
    expectExactBars(retry);
  });
});

describe("the level climb", () => {
  it("climbs a rung on 80%, strikes below it, and ends on three strikes or the top", () => {
    expect(READING_RUNGS.map((r) => r.label).slice(0, 4)).toEqual([
      "Primer, C major",
      "Level 1, C major",
      "Level 1, G major",
      "Level 1, F major",
    ]);
    let c = startClimb();
    c = climbAfter(c, 0.9);
    expect(c).toMatchObject({ rung: 1, best: 0, strikes: 0, over: false });
    c = climbAfter(c, 0.79);
    c = climbAfter(c, 0.5);
    expect(c).toMatchObject({ rung: 1, strikes: 2, over: false });
    c = climbAfter(c, 0.85);
    expect(c).toMatchObject({ rung: 2, best: 1, strikes: 2 });
    c = climbAfter(c, 0);
    expect(c).toMatchObject({ over: true, best: 1, phrases: 5 });
    const top = climbAfter(startClimb(READING_RUNGS.length - 1), 1);
    expect(top).toMatchObject({ over: true, best: READING_RUNGS.length - 1 });
  });
});

describe("levels past 3", () => {
  const MORE: ReadingLevelId[] = [
    "piano-4",
    "piano-5",
    "piano-6",
    "piano-7",
    "piano-8",
    "line-4",
    "line-5",
    "line-6",
  ];
  const scaleOf = (key: string) => {
    const k = keyByName(key)!;
    const pcs = [...new Set(diatonicNames(k).map((n) => pcOf(n)!))].sort((a, b) => a - b);
    const i = pcs.indexOf(k.tonicPc);
    return [...pcs.slice(i), ...pcs.slice(0, i)];
  };

  it("lists the piano's levels for the piano and the single-line levels for the rest", () => {
    expect(levelsFor("piano").map((l) => l.id)).toEqual([
      "primer",
      "level-1",
      "level-2",
      "level-3",
      "piano-4",
      "piano-5",
      "piano-6",
      "piano-7",
      "piano-8",
    ]);
    expect(
      levelsFor("guitar")
        .map((l) => l.id)
        .slice(4),
    ).toEqual(["line-4", "line-5", "line-6"]);
    // Every key a level offers is one the drill can spell.
    for (const l of READING_LEVELS)
      for (const key of [...l.recommendedKeys, ...l.climbKeys])
        expect(keyByName(key), key).toBeTruthy();
  });

  it("writes every level in each of its meters with voices that never overlap", () => {
    let seed = 1;
    for (const level of MORE)
      for (const meter of readingLevel(level).meters)
        for (const measures of [1, 4, 8, 16])
          for (const key of [readingLevel(level).recommendedKeys.at(-1)!, "C major"]) {
            const piano = level.startsWith("piano");
            const score = sightReadingScore(rng(seed++), {
              level,
              instrument: piano ? "piano" : "guitar",
              clefs: piano ? ["treble", "bass"] : ["treble"],
              key,
              range: piano ? [41, 84] : [52, 81],
              measures,
              meter,
              bpm: 80,
            });
            const m = READING_METERS[meter];
            expect(score.meter).toEqual({ beats: m.beats, beatUnit: m.beatUnit });
            expect(score.lengthBeats).toBe(measures * barQuarters(score.meter));
            expect(score.voices.map((v) => v.id)).toEqual(piano ? ["rh", "lh"] : ["melody"]);
            for (const v of score.voices) {
              expect(v.notes.length, `${level} ${meter} ${v.id}`).toBeGreaterThan(0);
              const onsets = [...new Set(v.notes.map((n) => n.startBeat))].sort((a, b) => a - b);
              for (const n of v.notes) {
                // Plain values the engraver draws: on a 32nd grid, ending inside the phrase.
                expect((n.startBeat * 8) % 1, `${level} ${meter}`).toBe(0);
                expect((n.durationBeats * 8) % 1).toBe(0);
                expect(n.startBeat + n.durationBeats).toBeLessThanOrEqual(score.lengthBeats + 1e-9);
                const next = onsets.find((o) => o > n.startBeat + 1e-9);
                if (next !== undefined)
                  expect(n.startBeat + n.durationBeats).toBeLessThanOrEqual(next + 1e-9);
              }
            }
          }
  });

  it("puts a chord under the melody from Piano 4: the right hand's downbeats are tones of the left hand's chord", () => {
    for (let seed = 1; seed < 60; seed++) {
      const level = MORE[seed % 5];
      const key = pick(readingLevel(level).recommendedKeys, seed);
      const score = sightReadingScore(rng(seed), {
        level,
        instrument: "piano",
        clefs: ["treble", "bass"],
        key,
        range: [41, 84],
        measures: 4,
        meter: "simple",
        bpm: 80,
      });
      const [rh, lh] = score.voices;
      const scale = scaleOf(key);
      expect(lh.notes.every((n) => n.midi >= 41 && n.midi <= 66)).toBe(true);
      expect(rh.notes.every((n) => n.midi >= 55 && n.midi <= 84)).toBe(true);
      for (let bar = 0; bar < 4; bar++) {
        const down = lh.notes.filter((n) => n.startBeat >= bar * 4 && n.startBeat < bar * 4 + 4);
        const melody = rh.notes.filter((n) => n.startBeat === bar * 4);
        if (!down.length || !melody.length) continue;
        // Some triad of the key holds the left hand's bar and the melody's top note.
        melody.sort((a, b) => a.midi - b.midi);
        const want = [...down, ...melody.slice(-1)].map((n) => pc(n.midi));
        const fits = scale.some((_, d) => {
          const triad = [0, 2, 4].map((o) => scale[(d + o) % 7]);
          return want.every((p) => triad.includes(p));
        });
        expect(fits, `${level} ${key} bar ${bar}: ${want}`).toBe(true);
      }
    }
  });

  it("keeps Piano 4's right hand in a five-finger position and its notes in the key", () => {
    for (let seed = 1; seed < 30; seed++) {
      const score = sightReadingScore(rng(seed), {
        level: "piano-4",
        instrument: "piano",
        clefs: ["treble", "bass"],
        key: "G major",
        range: [41, 79],
        measures: 6,
        meter: "3/4",
        bpm: 72,
      });
      const rh = score.voices[0].notes.map((n) => n.midi);
      expect(Math.max(...rh) - Math.min(...rh)).toBeLessThanOrEqual(7);
      const g = new Set(scaleOf("G major"));
      expect(score.voices.flatMap((v) => v.notes).every((n) => g.has(pc(n.midi)))).toBe(true);
    }
  });

  it("writes rests, ties over the bar line and chromatic notes off the strong beats", () => {
    let rests = 0;
    let ties = 0;
    let chromatic = 0;
    const d = new Set(scaleOf("D major"));
    for (let seed = 1; seed < 80; seed++) {
      const score = sightReadingScore(rng(seed), {
        level: "line-6",
        instrument: "guitar",
        key: "D major",
        range: [52, 81],
        measures: 8,
        meter: "simple",
        bpm: 80,
      });
      const notes = score.voices[0].notes;
      expect(notes.every((n) => n.midi >= 52 && n.midi <= 81)).toBe(true);
      notes.forEach((n, i) => {
        const end = n.startBeat + n.durationBeats;
        if (Math.floor(n.startBeat / 4) !== Math.floor((end - 1e-9) / 4)) ties++;
        if (i && notes[i - 1].startBeat + notes[i - 1].durationBeats < n.startBeat - 1e-9) rests++;
        if (!d.has(pc(n.midi))) {
          chromatic++;
          expect(n.startBeat % 2).not.toBe(0);
        }
      });
    }
    expect(rests).toBeGreaterThan(10);
    expect(ties).toBeGreaterThan(10);
    expect(chromatic).toBeGreaterThan(10);
  });

  it("climbs each instrument's own levels after the authored rungs", () => {
    expect(readingRungs("piano").slice(0, 14)).toEqual(readingRungs("guitar").slice(0, 14));
    expect(readingRungs("piano").at(-1)!.level).toBe("piano-8");
    expect(readingRungs("aerophone").at(-1)!.label).toBe("Line 6, F minor");
    const n = readingRungs("guitar").length;
    expect(climbAfter(startClimb(n - 1, n), 1, n)).toMatchObject({ over: true, best: n - 1 });
  });
});

describe("flashcards past the authored levels", () => {
  it("adds sharps, flats and naturals inside a key, named as the buttons read", () => {
    const k = keyByName("Eb major")!;
    const diatonic = new Set(diatonicNames(k).map((n) => pcOf(n)));
    let outside = 0;
    for (let s = 1; s < 120; s++) {
      const p = flashcardPrompt(rng(s), {
        kind: "note",
        clefs: ["treble"],
        key: "Eb major",
        range: [60, 79],
        difficulty: 0.8,
        accidentals: true,
      });
      if (!diatonic.has(pc(p.midi[0]))) outside++;
      expect(p.choices).toContain(p.answer);
      expect(flashcardCorrect(p, p.answer)).toBe(true);
    }
    expect(outside).toBeGreaterThan(20);
    // The raised seventh of C# minor is B#, offered as C.
    const cs = flashcardPrompt(rng(1), {
      kind: "note",
      clefs: ["treble"],
      key: "C# minor",
      range: [72, 72],
      difficulty: 0.8,
      accidentals: true,
    });
    expect([cs.answer, cs.choices.includes("C")]).toEqual(["C", true]);
  });

  it("crosses the clefs: either clef shows notes from the whole middle range", () => {
    const seen = { trebleLow: 0, bassHigh: 0 };
    for (let s = 1; s < 120; s++) {
      const p = flashcardPrompt(rng(s), {
        kind: "note",
        clefs: ["treble", "bass"],
        key: "C major",
        range: [53, 67],
        difficulty: 0.9,
        crossed: true,
      });
      if (p.clef === "treble" && p.midi[0] < 60) seen.trebleLow++;
      if (p.clef === "bass" && p.midi[0] >= 60) seen.bassHigh++;
    }
    expect(seen.trebleLow).toBeGreaterThan(5);
    expect(seen.bassHigh).toBeGreaterThan(5);
  });

  it("spaces four-part chords like a chorale and names them as the triad", () => {
    for (let s = 1; s < 120; s++) {
      const key = s % 2 ? "Ab major" : "F# minor";
      const p = flashcardPrompt(rng(s), {
        kind: "satb",
        clefs: ["treble", "bass"],
        key,
        range: [41, 84],
        difficulty: 0.9,
      });
      const [b, t, a, sop] = p.midi;
      expect(p.midi).toHaveLength(4);
      expect(b).toBeGreaterThanOrEqual(41);
      expect(b).toBeLessThanOrEqual(55);
      expect(t - b).toBeGreaterThanOrEqual(3);
      expect(sop - t).toBeLessThan(12);
      expect(a > t && sop > a).toBe(true);
      expect(new Set(p.midi.map(pc)).size).toBe(3);
      expect(p.choices).toContain(p.answer);
      expect(pcOf(p.answer.split("-")[0])).toBe(pc(b));
      expect(flashcardCorrect(p, p.answer)).toBe(true);
      expect(flashcardCorrect(p, [b + 12, ...p.midi.slice(1)])).toBe(true);
    }
  });
});

const pick = <T>(xs: readonly T[], seed: number) => xs[seed % xs.length];
