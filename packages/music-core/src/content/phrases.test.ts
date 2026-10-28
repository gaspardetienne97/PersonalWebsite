import { describe, expect, it } from "vitest";
import { TUNINGS } from "../data";
import { AEROPHONE_RANGE, fingeringFor } from "./winds-pads";
import { PHRASES, phraseBeats, phraseNotes, phrasesFor, stepsFromNotes } from "./phrases";

const GUITAR = TUNINGS.guitar[0].openStrings;
const UKULELE = TUNINGS.ukulele[0].openStrings;

describe("phrases", () => {
  it("has a set for every instrument, with unique ids", () => {
    for (const i of ["piano", "guitar", "ukulele", "aerophone"] as const)
      expect(phrasesFor(i).length, i).toBeGreaterThanOrEqual(8);
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length);
  });

  it("keeps every phrase short and playable on its instrument", () => {
    for (const p of PHRASES) {
      const notes = phraseNotes(p);
      expect(notes.length, p.id).toBeGreaterThanOrEqual(4);
      // A pickup's leading rest is not part of the phrase's length.
      const lead = p.steps[0][0] === null ? p.steps[0][1] : 0;
      expect(phraseBeats(p) - lead, p.id).toBeLessThanOrEqual(p.beatsPerBar * 4);
      // Plain note values the staff can draw.
      for (const [, beats] of p.steps)
        expect([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4], `${p.id} ${beats}`).toContain(beats);
      if (p.instrument === "aerophone")
        for (const n of notes) {
          expect(n.midi, p.id).toBeGreaterThanOrEqual(AEROPHONE_RANGE.lowestMidi);
          expect(n.midi, p.id).toBeLessThanOrEqual(AEROPHONE_RANGE.highestMidi);
          expect(fingeringFor(n.midi), `${p.id} ${n.midi}`).toBeTruthy();
        }
      if (p.instrument === "guitar" || p.instrument === "ukulele") {
        const open = p.instrument === "guitar" ? GUITAR : UKULELE;
        for (const n of notes) {
          expect(n.string, `${p.id} note ${n.index}`).toBeDefined();
          expect(open[n.string! - 1] + n.fret!, `${p.id} note ${n.index}`).toBe(n.midi);
        }
      }
    }
  });

  it("puts a pickup's first strong note on beat 1 of a bar", () => {
    const strong: Record<string, number> = {
      "piano.happy-birthday": 2, // "birth"
      "ukulele.happy-birthday": 2,
      "piano.greensleeves": 1, // "las"
      "guitar.amazing-grace": 1, // "ma"
      "ukulele.amazing-grace": 1,
      "ukulele.oh-susanna": 2, // "from"
    };
    for (const [id, index] of Object.entries(strong)) {
      const p = PHRASES.find((x) => x.id === id)!;
      expect(phraseNotes(p)[index].startBeat % p.beatsPerBar, id).toBe(0);
    }
  });
});

describe("campanella and the new licks", () => {
  it("rings each campanella note on a new string (only D after the open C has no other)", () => {
    const camp = PHRASES.filter((p) => p.style === "Campanella");
    expect(camp.map((p) => p.id)).toHaveLength(5);
    for (const p of camp) {
      const notes = phraseNotes(p);
      notes.slice(1).forEach((n, i) => {
        const prev = notes[i];
        if (n.midi !== prev.midi && n.string === prev.string)
          expect([prev.midi, n.midi].sort(), `${p.id} note ${n.index}`).toEqual([60, 62]);
      });
    }
  });

  it("keeps chord melody's tune as the top note of each chord", () => {
    const p = PHRASES.find((x) => x.id === "ukulele.chord-melody-amazing-grace")!;
    const tops = p.steps.flatMap(([head]) =>
      head === null ? [] : Array.isArray(head) ? [Math.max(...head)] : [head],
    );
    // G | C E C | E D | C A | G: Amazing Grace's first line.
    expect(tops).toEqual([67, 72, 76, 72, 76, 74, 72, 69, 67]);
  });

  it("has six D minor licks and the stock box-1 blues licks", () => {
    expect(PHRASES.filter((p) => p.id.startsWith("guitar.d-")).length).toBe(6);
    const dorian = new Set([2, 4, 5, 7, 9, 11, 0]);
    for (const p of PHRASES.filter((x) => x.id.startsWith("guitar.d-")))
      for (const n of phraseNotes(p))
        expect(dorian.has(n.midi % 12), `${p.id} ${n.midi}`).toBe(true);
    const blues = new Set([9, 0, 2, 3, 4, 7]);
    for (const id of [
      "guitar.root-b7-5",
      "guitar.blues-scale-run",
      "guitar.minor-third-rub",
      "ukulele.blues-pentatonic-lick",
    ])
      for (const n of phraseNotes(PHRASES.find((p) => p.id === id)!))
        expect(blues.has(n.midi % 12), `${id} ${n.midi}`).toBe(true);
  });
});

describe("riffs, fills and the strings' rhythm phrases", () => {
  const get = (id: string) => PHRASES.find((p) => p.id === id)!;

  it("writes each piano riff in its keys, the left hand below the split", () => {
    const riffs = PHRASES.filter((p) => p.split !== undefined);
    expect(riffs.length).toBeGreaterThanOrEqual(25);
    for (const p of riffs) {
      const notes = phraseNotes(p);
      expect(
        notes.some((n) => n.midi < p.split!),
        p.id,
      ).toBe(true);
      expect(
        notes.some((n) => n.midi >= p.split!),
        p.id,
      ).toBe(true);
    }
    // The F version is the C version a fourth up.
    const c = phraseNotes(get("piano.blues-turnaround-c")).map((n) => n.midi);
    expect(phraseNotes(get("piano.blues-turnaround-f")).map((n) => n.midi)).toEqual(
      c.map((m) => m + 5),
    );
    expect(get("piano.amen-ending-f").keyFifths).toBe(-1);
    for (const id of [
      "piano.fill-pentatonic-run-g",
      "piano.rock-octave-run-g",
      "piano.gospel-653-f",
      "piano.seven-three-six-c",
    ])
      expect(get(id), id).toBeDefined();
  });

  it("walks the turnaround's bass up and closes the 7-3-6-2-5-1 on its roots", () => {
    const bass = (id: string) =>
      get(id).steps.map(([head]) => (Array.isArray(head) ? Math.min(...head) : head));
    expect(bass("piano.blues-turnaround-c").map((m) => m! % 12)).toEqual([0, 0, 5, 6, 7, 9, 2, 7]);
    expect(bass("piano.seven-three-six-c").map((m) => m! % 12)).toEqual([11, 4, 9, 2, 7, 0]);
  });

  it("counts 12/8 phrases in dotted quarters, a whole number of bars", () => {
    for (const p of PHRASES.filter((x) => x.click)) {
      expect(p.meter, p.id).toEqual([12, 8]);
      expect(phraseBeats(p) % p.beatsPerBar, p.id).toBe(0);
    }
    // The Texas shuffle: long-short pairs, the boogie 5 6 b7 6 over E, A, E and B.
    const shuffle = phraseNotes(get("guitar.texas-shuffle"));
    const tops = shuffle.filter((_, i) => i % 4 === 1).map((n) => n.midi);
    expect(tops.slice(0, 4)).toEqual([47, 49, 50, 49]);
    expect(tops.slice(12, 16)).toEqual([54, 56, 57, 56]);
  });

  it("has the chord embellishments on guitar", () => {
    for (const id of ["guitar.hammer-on-chords", "guitar.sus-to-major", "guitar.add9-moves"])
      expect(get(id), id).toBeDefined();
  });
});

describe("your licks", () => {
  it("turns a played line into plain steps from its first note, chords together, rests where it was silent", () => {
    const steps = stepsFromNotes([
      { midi: 62, startBeat: 1.02, durationBeats: 0.5 },
      { midi: 64, startBeat: 1.5, durationBeats: 0.4 },
      { midi: 67, startBeat: 2.5, durationBeats: 1.2 },
      { midi: 60, startBeat: 4.5, durationBeats: 1 },
      { midi: 64, startBeat: 4.5, durationBeats: 1 },
    ]);
    expect(steps).toEqual([
      [62, 0.5],
      [64, 0.5],
      [null, 0.5],
      [67, 1],
      [null, 1],
      [[60, 64], 1],
    ]);
    for (const [, beats] of steps) expect([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]).toContain(beats);
  });

  it("keeps at most four bars", () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      midi: 60 + (i % 5),
      startBeat: i * 0.5,
      durationBeats: 0.5,
    }));
    expect(stepsFromNotes(long).reduce((a, s) => a + s[1], 0)).toBeLessThanOrEqual(16);
  });
});
