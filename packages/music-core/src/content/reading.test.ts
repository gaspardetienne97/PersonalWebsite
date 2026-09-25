import { describe, expect, it } from "vitest";
import type { ReadingLevelId } from "../data";
import type { Score } from "../types";
import { pc } from "../theory/notes";
import { choicesForKey, diatonicNames, keyByName } from "../theory/spelling";
import { pcOf } from "../theory/notes";
import { rng } from "./random";
import {
  barQuarters,
  flashcardCorrect,
  flashcardPrompt,
  practiceMissedScore,
  READING_LEVELS,
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
  it("carries the four authored levels", () => {
    expect(
      READING_LEVELS.map(
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
