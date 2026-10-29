import { describe, expect, it } from "vitest";
import {
  ACCOMP_PROGRESSIONS,
  LEAD_SHEETS,
  chartProgression,
  generatedLeadSheet,
  wholeBars,
} from "../content/accompany";
import {
  COMPING_PATTERNS,
  GOSPEL_PROGRESSIONS,
  KEY_CYCLE,
  cadenceChords,
  chordScaleTargets,
  closestChords,
  voicingTargets,
} from "../content/piano";
import { SCALE_FINGERINGS } from "../content/piano-fingering";
import { POSITION_PATTERNS } from "../content/technique";
import { FRETBOARD_PATTERNS } from "../data";
import { parseChordSymbol } from "../theory/chords";
import { CURATED_TUNINGS } from "../theory/fretboard";
import { FLAT_NAMES, pc, pcOf } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import { lessonProblems } from "./check";
import {
  ARPEGGIO_IDS,
  CARD_IDS,
  SYMBOL_KINDS,
  conceptCard,
  degreesOf,
  hasThumbUnder,
  positionsCard,
  scaleFormula,
} from "./cards";
import { boxes, cagedForms, placed, ukulelePositions } from "./cards-guitar";
import { tagsOf } from "./cards-piano";

const text = (id: string, o = {}) => JSON.stringify(conceptCard(id, o));
const keysPc = KEY_CYCLE.map((k) => pcOf(k)!);
const guitars = CURATED_TUNINGS.filter((t) => t.instrument === "guitar");
const ukes = CURATED_TUNINGS.filter((t) => t.instrument === "ukulele");

describe("concept cards", () => {
  it("every id gives one card that passes the card copy check, with the tuning and arpeggio versions too", () => {
    for (const id of CARD_IDS) {
      for (const o of [
        {},
        ...guitars.map((tuning) => ({ tuning })),
        ...ukes.map((tuning) => ({ tuning })),
        { arpeggio: true },
      ]) {
        const ls = conceptCard(id, o);
        const arp = "arpeggio" in o && ARPEGGIO_IDS.includes(id);
        expect(
          ls.map((l) => l.id),
          id,
        ).toEqual([arp ? `${id}.arp` : id]);
        expect(lessonProblems(ls[0], "card"), id).toEqual([]);
      }
    }
    expect(conceptCard("nope")).toEqual([]);
    expect(CARD_IDS).toEqual(
      expect.arrayContaining([
        "scales.major-formula",
        "scales.minor-forms",
        "scales.thumb-under",
        "positions.caged",
        "positions.boxes",
        "positions.connected",
        "positions.boxes-ukulele",
        "positions.bb-box",
        "comping.charleston",
        "voicings.rootless",
        "voicings.minor",
        "voicings.altered",
        "voicings.inversions",
        "voicings.guide-tones",
        "voicings.cadence",
        "voicings.cadence-minor",
        "accompany.chord-symbols",
        "chord-scales.why",
        "chord-scales.minor",
        "chord-scales.patterns",
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

  it("the thumb passes under the 3rd or 4th finger, in every fingering the drill shows", () => {
    for (const [kind, byKey] of Object.entries(SCALE_FINGERINGS))
      for (const [k, f] of Object.entries(byKey)) {
        f.rh.forEach((x, i) => {
          if (i > 0 && x === 1) expect([3, 4], `${kind} ${k} rh`).toContain(f.rh[i - 1]);
        });
        f.lh.forEach((x, i) => {
          if (i > 0 && f.lh[i - 1] === 1) expect([3, 4], `${kind} ${k} lh`).toContain(x);
        });
      }
    expect(hasThumbUnder("major")).toBe(true);
    expect(hasThumbUnder("whole-tone")).toBe(false);
    expect(text("scales.thumb-under")).toContain("passes under finger 3 to play F");
  });

  it("the CAGED card names the five forms from the data, lowest first, on every tuning", () => {
    const forms = cagedForms();
    expect(forms.map((f) => f.letter)).toEqual(["E", "D", "C", "A", "G"]);
    expect(forms.map((f) => f.low)).toEqual([0, 2, 4, 7, 9]);
    expect(FRETBOARD_PATTERNS.filter((p) => p.family === "caged-major")).toHaveLength(5);
    const steps = conceptCard("positions.caged")[0].screens[0].steps!;
    forms.forEach((f, i) => expect(steps[i].text).toContain(`The ${f.letter} shape`));
    expect(steps[0].text).toContain("at the root fret");
    expect(steps[1].text).toContain("2 frets above the root fret");
    for (const s of steps) expect(s.figure?.kind).toBe("fretboard");
    // Retuned, the frets move: Drop D takes the other strings two frets lower against the root string.
    const drop = conceptCard("positions.caged", {
      tuning: guitars.find((t) => t.id === "guitar.drop-d")!,
    })[0];
    expect(JSON.stringify(drop)).not.toEqual(JSON.stringify(conceptCard("positions.caged")[0]));
    expect(JSON.stringify(drop)).toContain("on Drop D");
    for (const t of guitars)
      for (const f of cagedForms(t)) {
        const fig = conceptCard("positions.caged", { tuning: t })[0].screens[0].steps!.find((st) =>
          st.text.includes(`The ${f.letter} shape`),
        )!.figure as { from: number; to: number; marks: { fret: number }[] };
        expect(Math.min(...fig.marks.map((m) => m.fret)), t.id).toBeGreaterThanOrEqual(fig.from);
        expect(Math.max(...fig.marks.map((m) => m.fret)), t.id).toBeLessThanOrEqual(fig.to);
      }
  });

  it("the box card's claims hold for every box on every guitar tuning", () => {
    for (const t of guitars) {
      const bx = boxes(t);
      expect(bx, t.id).toHaveLength(5);
      for (const b of bx) {
        expect(b.perString, `${t.id} ${b.p.id}`).toBe(2);
        expect(b.stringCount).toBe(6);
      }
    }
    expect(boxes().map((b) => b.low)).toEqual([0, 2, 4, 7, 9]);
    const [l] = conceptCard("positions.boxes");
    const fig = l.screens[0].figure as { marks: { fret: number; label: string }[] };
    expect(Math.max(...fig.marks.map((m) => m.fret))).toBeLessThanOrEqual(5);
    expect(new Set(fig.marks.map((m) => m.label))).toEqual(new Set(["E", "G", "A", "B", "D"]));
    expect(l.screens[0].text).toContain("two notes on each of the 6 strings");
    expect(l.screens[1].text).toContain(
      "box 1 is 0, box 2 is 2, box 3 is 4, box 4 is 7 and box 5 is 9",
    );
  });

  it("the connected run plays box 1 up, box 2 down, and so on, as the card says", () => {
    const p = POSITION_PATTERNS.find((x) => x.family === "connected")!;
    const seg = p.segment!;
    expect(p.offsets.length).toBe(5 * seg);
    for (let k = 0; k < 5; k++) {
      const strs = p.offsets.slice(k * seg, (k + 1) * seg).map((o) => o.stringNumber);
      const sorted = [...strs].sort((a, b) => (k % 2 ? a - b : b - a));
      expect(strs, `box ${k + 1}`).toEqual(sorted);
    }
    const steps = conceptCard("positions.connected")[0].screens[0].steps!;
    expect(steps.map((s) => s.text.includes("high string to low"))).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it("the ukulele card holds on every ukulele tuning", () => {
    for (const t of ukes) {
      const ps = ukulelePositions(t);
      expect(ps, t.id).toHaveLength(5);
      for (const x of ps) {
        expect(x.perString, `${t.id} ${x.p.id}`).toBe(2);
        expect(x.stringCount).toBe(4);
      }
      expect(
        ps.map((x) => x.low),
        t.id,
      ).toEqual([0, 2, 4, 7, 9]);
    }
    expect(text("positions.boxes-ukulele", { tuning: ukes[0] })).toContain(
      "two notes on each of the 4 strings",
    );
  });

  it("every Positions shape has a card that exists", () => {
    for (const p of POSITION_PATTERNS) expect(CARD_IDS, p.id).toContain(positionsCard(p));
  });

  it("the triads card gives three inversions, each higher up the neck, on every guitar tuning", () => {
    for (const p of POSITION_PATTERNS.filter((x) => x.family === "triads"))
      for (const tu of guitars) {
        const x = placed(p.id, tu);
        const mean = (k: number) =>
          x.targets.slice(k * 3, k * 3 + 3).reduce((a, n) => a + n.fret, 0) / 3;
        expect(mean(0) < mean(1) && mean(1) < mean(2), `${p.id} ${tu.id}`).toBe(true);
        const steps = conceptCard(positionsCard(p), { tuning: tu })[0].screens[0].steps!;
        expect(new Set(steps.map((s) => s.text.split(":")[0])).size, `${p.id} ${tu.id}`).toBe(3);
      }
    expect(conceptCard("positions.triads-major-strings-1-3")[0].screens[0].text).toContain(
      "on strings 3 to 1",
    );
  });

  it("the B.B. box roles are the same on every guitar tuning", () => {
    const lines = (t: (typeof guitars)[number]) =>
      conceptCard("positions.bb-box", { tuning: t })[0].screens[0].text;
    for (const t of guitars)
      expect(lines(t), t.id).toContain(
        "string 3 has the 6th; string 2 has the root, 2nd and flat 3rd; string 1 has the 4th and 5th",
      );
    expect(placed("bb-box", guitars[0]).targets).toHaveLength(6);
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

  it("the arpeggio versions say nothing about hands", () => {
    for (const id of ARPEGGIO_IDS) {
      const t = text(id, { arpeggio: true });
      expect(t, id).not.toMatch(/left hand|right hand|in the left|in the right/i);
      expect(t, id).toContain(`${id}.arp`);
    }
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

  it("the minor and altered voicings read the same in every key", () => {
    for (const variant of ["minor", "altered"] as const) {
      const tags = (k: string) =>
        voicingTargets({ variant, startPosition: "A", mode: "chord" })
          .filter((t) => t.id.startsWith(`${k}-`))
          .map((t) => `${t.symbol.replace(/^[A-G][b#]?/, "")} ${tagsOf(t.symbol, t.displayMidi)}`);
      for (const k of KEY_CYCLE) expect(tags(k), `${variant} ${k}`).toEqual(tags("C"));
    }
    const m = conceptCard("voicings.minor")[0];
    expect(m.screens[0].steps![0].text).toContain("Dm7b5: b3 b5 b7 1 is F Ab C D");
    expect(m.screens[0].text).toContain("root on top");
    expect(m.screens[0].steps![1].text).toContain("G7alt: 7 b9 3 b13");
    const a = conceptCard("voicings.altered")[0];
    expect(a.screens[0].steps![0].text).toContain("G7b9: 3 7 b9 5");
    expect(a.screens[0].steps![2].text).toContain("G13#11: 3 7 9 #11 13");
  });

  it("guide tones: the 7th falls a half step to the next 3rd in every key", () => {
    for (const k of keysPc) {
      const sym = [
        `${FLAT_NAMES[pc(k + 2)]}m7`,
        `${FLAT_NAMES[pc(k + 7)]}7`,
        `${FLAT_NAMES[k]}maj7`,
      ];
      const c = sym.map((s) => parseChordSymbol(s)!);
      const third = (x: (typeof c)[number]) => pc(x.rootPc + (x.intervals.includes(3) ? 3 : 4));
      const seventh = (x: (typeof c)[number]) =>
        pc(x.rootPc + (x.intervals.includes(10) ? 10 : 11));
      expect(pc(seventh(c[0]) - 1), `${k} ii`).toBe(third(c[1]));
      expect(pc(seventh(c[1]) - 1), `${k} V`).toBe(third(c[2]));
    }
    expect(text("voicings.guide-tones")).toContain("C to B, then F to E");
  });

  it("each gospel progression has a card with its bass line", () => {
    for (const g of GOSPEL_PROGRESSIONS) {
      const [l] = conceptCard(`voicings.gospel.${g.id}`);
      expect(l.id).toBe(`voicings.gospel.${g.id}`);
      expect(l.screens[1].text).toContain("In C the bass plays");
    }
    expect(text("voicings.gospel.slash-walk")).toContain("C B A G F E D G");
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

  it("the minor tab and the patterns have cards that match the data", () => {
    const ts = chordScaleTargets("minor", 0);
    expect(ts.map((t) => t.scaleLabel)).toEqual(["D Locrian", "G Altered", "C Dorian"]);
    const [m] = conceptCard("chord-scales.minor");
    expect(m.screens[0].steps![0].text).toContain("All of it is in C natural minor");
    expect(m.screens[0].steps![1].text).toContain("not in C natural minor");
    const [p] = conceptCard("chord-scales.patterns");
    expect(p.screens[0].steps![0].text).toContain(
      "Dm7: 1-2-3-5 is D E F A, and 3-5-7-9 is F A C E",
    );
    expect(p.screens[1].steps![1].text).toContain("G7alt: 1-2-3-5 is G Ab B Eb");
  });

  it("the chord symbol card covers every kind of chord the lead-sheet charts use", () => {
    const covered = new Set(SYMBOL_KINDS.map((k) => k.suffix));
    const progs = [
      ...ACCOMP_PROGRESSIONS,
      ...["chart-1", "chart-2", "chart-3"].flatMap((l) =>
        [1, 2, 3, 4, 5, 6, 7, 8].map((sd) => chartProgression(l, sd)),
      ),
    ];
    const symbols = [
      ...progs.flatMap((p) => p.chords.map((c) => c.symbol)),
      ...progs
        .filter((p) => wholeBars(p))
        .flatMap((p) => generatedLeadSheet(p, 0, 1).chart.map((c) => c.symbol)),
      ...LEAD_SHEETS.flatMap((t) => t.chart.map((c) => c.symbol)),
    ];
    const used = new Set(
      symbols.map((s) => {
        const c = parseChordSymbol(s)!;
        return s.slice(c.rootName.length).split("/")[0];
      }),
    );
    for (const u of used) expect(covered, `suffix "${u}"`).toContain(u);
    const steps = conceptCard("accompany.chord-symbols")[0].screens[0].steps!.map((s) => s.text);
    expect(steps[0]).toContain("C is C, E and G");
    expect(steps.find((s) => s.startsWith("C7alt"))).toContain("Db, D#, F# and Ab");
    expect(steps.find((s) => s.startsWith("Cadd9"))).toContain("9th, D");
    expect(steps.find((s) => s.startsWith("Csus4"))).toContain("4th, F");
    expect(steps.find((s) => s.startsWith("C6"))).toContain("6th, A");
  });
});
