import { describe, expect, it } from "vitest";
import { FRETBOARD_PATTERNS } from "../data";
import {
  COMPING_PATTERNS,
  KEY_CYCLE,
  cadenceChords,
  chordScaleTargets,
  closestChords,
  voicingTargets,
} from "../content/piano";
import { pcOf } from "../theory/notes";
import { pc } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import { lessonProblems } from "./check";
import { CARD_IDS, boxes, cagedForms, conceptCard, degreesOf, scaleFormula } from "./cards";

const text = (id: string) => JSON.stringify(conceptCard(id));
const keysPc = KEY_CYCLE.map((k) => pcOf(k)!);

describe("concept cards", () => {
  it("every id gives one card that passes the card copy check, and an unknown id gives none", () => {
    for (const id of CARD_IDS) {
      const ls = conceptCard(id);
      expect(
        ls.map((l) => l.id),
        id,
      ).toEqual([id]);
      expect(lessonProblems(ls[0], "card"), id).toEqual([]);
    }
    expect(conceptCard("nope")).toEqual([]);
    expect(CARD_IDS).toEqual(
      expect.arrayContaining([
        "scales.major-formula",
        "positions.caged",
        "comping.charleston",
        "voicings.rootless",
        "voicings.inversions",
        "voicings.cadence",
        "accompany.chord-symbols",
        "chord-scales.why",
        "tips.strum",
        "tips.chords",
        "tips.changes",
        "tips.spider",
        "tips.two-hand",
      ]),
    );
  });

  it("the major formula card steps are the major scale's intervals, W W H W W W H", () => {
    expect(scaleFormula("major")).toEqual(["W", "W", "H", "W", "W", "W", "H"]);
    const [l] = conceptCard("scales.major-formula");
    expect(l.screens[0].steps!.length).toBe(7);
    expect(l.screens[0].text).toContain("W W H W W W H");
    expect(l.screens[1].text).toContain("notes 3 and 4, and between notes 7 and 8");
    expect(l.screens[1].text).toContain("E to F and B to C");
  });

  it("the minor card matches the scale code", () => {
    expect(scaleFormula("natural-minor").join(" ")).toBe("W H W W H W W");
    expect(scaleFormula("harmonic-minor").join(" ")).toBe("W H W W H 1.5 H");
    expect(scaleFormula("melodic-minor").join(" ")).toBe("W H W W W W H");
    const t = text("scales.minor-forms");
    expect(t).toContain("G#");
    expect(t).toContain("F# and G#");
  });

  it("the CAGED card names the five forms from the data, lowest first", () => {
    const forms = cagedForms();
    expect(forms.map((f) => f.letter)).toEqual(["E", "D", "C", "A", "G"]);
    expect(FRETBOARD_PATTERNS.filter((p) => p.family === "caged-major")).toHaveLength(5);
    const steps = conceptCard("positions.caged")[0].screens[0].steps!;
    forms.forEach((f, i) => expect(steps[i].text).toContain(`The ${f.letter} shape`));
    expect(steps[0].text).toContain("at the root fret");
    expect(steps[1].text).toContain("2 frets above the root fret");
  });

  it("the box card's claims hold for every box", () => {
    const bx = boxes();
    expect(bx).toHaveLength(5);
    for (const b of bx) {
      for (let s = 1; s <= 6; s++)
        expect(
          b.offsets.filter((o) => o.stringNumber === s),
          b.id,
        ).toHaveLength(2);
    }
    expect(bx.map((b) => b.base)).toEqual([0, 2, 4, 7, 9]);
    const [l] = conceptCard("positions.boxes");
    const fig = l.screens[0].figure as { marks: { fret: number; label: string }[] };
    expect(Math.max(...fig.marks.map((m) => m.fret))).toBeLessThanOrEqual(5);
    expect(new Set(fig.marks.map((m) => m.label))).toEqual(new Set(["E", "G", "A", "B", "D"]));
    expect(l.screens[1].text).toContain(
      "box 1 is 0, box 2 is 2, box 3 is 4, box 4 is 7 and box 5 is 9",
    );
  });

  it("every Charleston pattern has the rhythm and the shell the card describes", () => {
    for (const p of COMPING_PATTERNS) {
      expect(p.compRhythm, p.id).toEqual([
        { beat: 0, durationBeats: 1 },
        { beat: 1.5, durationBeats: 0.5 },
      ]);
      expect(p.shellMidi[1] - p.shellMidi[0], p.id).toBe(10);
    }
    const t = text("comping.charleston");
    expect(t).toContain("one on 1, held for a beat and one on the and of 2, short");
  });

  it("rootless voicings alternate A and B and barely move, in every key from either start", () => {
    /** The most any voice moves between two chords, by note name (the keys may show another octave). */
    const reach = (from: number[], to: number[]) => {
      const dist = (a: number, b: number) => Math.min(pc(a - b), pc(b - a));
      const perms = (xs: number[]): number[][] =>
        xs.length < 2
          ? [xs]
          : xs.flatMap((x, i) =>
              perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]),
            );
      return Math.min(...perms(to).map((p) => Math.max(...from.map((m, j) => dist(m, p[j])))));
    };
    for (const start of ["A", "B"] as const) {
      const ts = voicingTargets({ variant: "major", startPosition: start, mode: "chord" });
      for (const k of KEY_CYCLE) {
        const three = ts.filter((t) => t.id.startsWith(`${k}-`));
        expect(three).toHaveLength(3);
        const pos = three.map((t) => degreesOf(t.symbol, t.displayMidi.slice(1)));
        const [a, b] = start === "A" ? ["3 5 7 9", "7 9 3 5"] : ["7 9 3 5", "3 5 7 9"];
        expect(pos, `${k} ${start}`).toEqual([a, b, a]);
        for (const t of three) expect(t.displayMidi.length).toBe(5);
        for (let i = 1; i < 3; i++) {
          const from = three[i - 1].displayMidi.slice(1);
          const to = three[i].displayMidi.slice(1);
          expect(reach(from, to), `${k} ${start} ${i}`).toBeLessThanOrEqual(2);
          expect(
            from.some((m) => to.some((n) => pc(n) === pc(m))),
            `${k} ${start} ${i}`,
          ).toBe(true);
        }
      }
    }
    const steps = conceptCard("voicings.rootless")[0].screens[1].steps!;
    expect(steps[0].text).toContain("Dm7: position A, 3 5 7 9");
    expect(steps[1].text).toContain("G7: position B, 7 9 3 5");
  });

  it("closest chords: the C example is as the card says, and a higher key can need a bigger move", () => {
    const steps = conceptCard("voicings.inversions")[0].screens[1].steps!;
    expect(steps).toHaveLength(4);
    expect(steps[1].text).toContain("second inversion, C F A, moving 3 half steps in all. C stays");
    expect(steps[2].text).toContain("No note stays");
    expect(steps[3].text).toContain("G stays");
    // The range sentence: Bb moves its IV chord 9 half steps where C moves 3.
    expect(closestChords(10)[1].movement).toBeGreaterThan(closestChords(0)[1].movement);
  });

  it("cadences: the raised 7th and the pull to the tonic hold in every key", () => {
    for (const k of keysPc) {
      for (const minor of [false, true]) {
        const bs = cadenceChords(k, minor);
        expect(bs.map((b) => b.roman)).toEqual(
          minor ? ["i", "iv", "i", "V7", "i"] : ["I", "IV", "I", "V7", "I"],
        );
        const v = bs[3].rightHand.map(pc);
        const tonicPcs = bs[4].rightHand.map(pc);
        expect(v).toContain(pc(k + 11)); // the raised 7th, the 3rd of V7
        expect(v).not.toContain(pc(k + 10)); // never the natural 7th
        expect(
          bs[3].rightHand.some((m) => pc(m) === pc(k + 11) && bs[4].rightHand.includes(m + 1)),
        ).toBe(true);
        if (!minor) {
          expect(v).toContain(pc(k + 5));
          expect(tonicPcs).toContain(pc(k + 4));
          expect(
            bs[3].rightHand.some((m) => pc(m) === pc(k + 5) && bs[4].rightHand.includes(m - 1)),
          ).toBe(true);
        }
      }
    }
    expect(scaleSemitones("harmonic-minor")![6] - scaleSemitones("natural-minor")![6]).toBe(1);
    expect(text("voicings.cadence-minor")).toContain("B instead of Bb");
  });

  it("in every key the ii and V scales are the key's notes and the I's lydian adds one", () => {
    for (const k of keysPc) {
      const ts = chordScaleTargets("major", k);
      const major = new Set(scaleSemitones("major")!.map((s) => pc(k + s)));
      expect(ts.map((t) => t.scaleLabel.split(" ").slice(1).join(" ").toLowerCase())).toEqual([
        "dorian",
        "mixolydian",
        "lydian",
      ]);
      const sets = ts.map((t) => new Set(t.midi.map(pc)));
      expect(sets[0]).toEqual(major);
      expect(sets[1]).toEqual(major);
      expect([...sets[2]].filter((p) => !major.has(p))).toHaveLength(1);
    }
    const [l] = conceptCard("chord-scales.why");
    expect(l.screens[0].text).toContain("D Dorian: D E F G A B C");
    expect(l.screens[1].steps![0].text).toContain("All of it is in C major");
    expect(l.screens[1].steps![2].text).toContain("F# is not in C major");
  });

  it("the chord symbol card spells the chords on C", () => {
    const steps = conceptCard("accompany.chord-symbols")[0].screens[0].steps!.map((s) => s.text);
    expect(steps[0]).toContain("C is C, E and G");
    expect(steps[1]).toContain("Cm is C, Eb and G");
    expect(steps[2]).toContain("C7 is C, E, G and Bb");
    expect(steps[3]).toContain("Cmaj7 is C, E, G and B");
  });
});
