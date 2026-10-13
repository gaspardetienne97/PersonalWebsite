import { describe, expect, it } from "vitest";
import { TUNINGS } from "../data";
import { AEROPHONE_RANGE, fingeringFor } from "./winds-pads";
import { PHRASES, phraseBeats, phraseNotes, phrasesFor } from "./phrases";

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
