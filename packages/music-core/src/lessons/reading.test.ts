import { describe, expect, it } from "vitest";
import {
  BAND_SETS,
  DELAY_SETS,
  PAN_SETS,
  STUDIO_EXERCISES,
  bandLabel,
  type BandSet,
} from "../content/studio";
import { EAR_RHYTHM_LEVELS, RHYTHM_CELLS } from "../content/rhythm";
import { KEY_SIGNATURES } from "../theory/spelling";
import { lessonProblems } from "./check";
import {
  cellOnsets,
  countName,
  initials,
  listeningLessons,
  readingLessons,
  rhythmLessons,
  staffLines,
  staffNote,
  staffSpaces,
} from "./reading";
import type { Lesson } from "./types";

const names = (ms: number[]) =>
  ms.map((m) => "C C# D D# E F F# G G# A A# B".split(" ")[m % 12]).join(" ");
const all = (ls: Lesson[]) => ls.flatMap((l) => lessonProblems(l));

describe("the staff", () => {
  it("treble lines are E G B D F and spaces F A C E, bass lines G B D F A and spaces A C E G", () => {
    expect(names(staffLines("treble"))).toBe("E G B D F");
    expect(names(staffSpaces("treble"))).toBe("F A C E");
    expect(names(staffLines("bass"))).toBe("G B D F A");
    expect(names(staffSpaces("bass"))).toBe("A C E G");
  });
  it("middle C is one ledger line below the treble staff and above the bass staff", () => {
    expect(staffNote("treble", -2)).toBe(60);
    expect(staffNote("bass", 10)).toBe(60);
  });
  it("the landmarks: treble G is the second line, bass F the fourth", () => {
    expect(names([staffLines("treble")[1]])).toBe("G");
    expect(names([staffLines("bass")[3]])).toBe("F");
  });
  it("the mnemonics spell the notes", () => {
    const t = readingLessons("flashcards", "treble")[0].screens;
    expect(initials("Every Good Boy Does Fine")).toBe("E G B D F");
    expect(initials("They spell the word FACE")).toBe("F A C E");
    expect(initials("Good Boys Do Fine Always")).toBe("G B D F A");
    expect(initials("All Cows Eat Grass")).toBe("A C E G");
    expect(t[0].text).toContain("E G B D F");
  });
});

describe("reading lessons", () => {
  it("flashcards teach each clef the setup reads, and accidentals only when they are on", () => {
    expect(readingLessons("flashcards", "treble").map((l) => l.id)).toEqual([
      "reading.lines-spaces.treble",
    ]);
    expect(readingLessons("flashcards", "bass").map((l) => l.id)).toEqual([
      "reading.lines-spaces.bass",
    ]);
    expect(readingLessons("flashcards", "both", { accidentals: true }).map((l) => l.id)).toEqual([
      "reading.lines-spaces.treble",
      "reading.lines-spaces.bass",
      "reading.accidentals",
    ]);
  });
  it("sight-reading teaches values, and the key signature only when the key has one", () => {
    expect(readingLessons("sight-reading", "treble").map((l) => l.id)).toEqual(["reading.values"]);
    expect(readingLessons("sight-reading", "bass", { fifths: -2 }).map((l) => l.id)).toEqual([
      "reading.values",
      "reading.key-signature",
    ]);
  });
  it("the ledger lines screen draws middle C and names the other side's ledger note", () => {
    const [t] = readingLessons("flashcards", "treble");
    const ledger = t.screens[3];
    expect(ledger.text).toContain("first ledger line below the treble staff");
    expect(ledger.text).toContain("A is on the first one above");
    expect(ledger.figure).toMatchObject({ kind: "staff", clef: "treble" });
    if (ledger.figure?.kind === "staff")
      expect(ledger.figure.notes.map((n) => n.midi)).toContain(60);
    const [b] = readingLessons("flashcards", "bass");
    expect(b.screens[3].text).toContain("first ledger line above the bass staff");
    expect(b.screens[3].text).toContain("E is on the first one below");
  });
  it("every key signature in the drill's keys gets a lesson that names its first accidental", () => {
    const first = (f: number) => (f > 0 ? "F" : "B");
    for (const k of KEY_SIGNATURES.filter((x) => x.fifths)) {
      for (const clef of ["treble", "bass"] as const) {
        const l = readingLessons("sight-reading", clef, { fifths: k.fifths })[1];
        expect(l.screens[1].steps).toHaveLength(Math.abs(k.fifths));
        expect(l.screens[2].text).toContain(
          `${first(k.fifths)} ${k.fifths > 0 ? "sharp" : "flat"}`,
        );
        expect(lessonProblems(l)).toEqual([]);
      }
    }
  });
  it("all pass the copy check", () => {
    for (const kind of ["flashcards", "sight-reading"] as const)
      expect(all(readingLessons(kind, "both", { accidentals: true, fifths: 3 })), kind).toEqual([]);
  });
});

describe("rhythm lessons", () => {
  it("counting names follow the grid: 1 & for eighths, 1 e & a for sixteenths, 1 & a in 6/8", () => {
    expect([0, 0.5, 1, 1.5].map((b) => countName(b, 2, 4))).toEqual(["1", "1 &", "2", "2 &"]);
    expect([0, 0.25, 0.5, 0.75].map((b) => countName(b, 4, 4))).toEqual(["1", "1 e", "1 &", "1 a"]);
    expect([0, 1 / 3, 2 / 3, 1].map((b) => countName(b, 3, 2))).toEqual(["1", "1 &", "1 a", "2"]);
    expect(rhythmLessons("echo", "sixteenths")[1].screens[0].text).toContain("1 e & a 2 e & a");
    expect(rhythmLessons("echo", "quarters-eighths")[0].screens[0].text).toContain(
      "1 & 2 & 3 & 4 &",
    );
    expect(rhythmLessons("echo", "compound")[0].screens[0].text).toContain("1 & a 2 & a");
  });
  it("examples land on the grid of every level", () => {
    for (const level of EAR_RHYTHM_LEVELS)
      for (const l of rhythmLessons("dictation", level.id).filter(
        (x) => level.perBeat !== 4 || x.id !== "rhythm.counting",
      ))
        for (const s of l.screens)
          if (s.figure?.kind === "rhythm") {
            expect(s.figure.perBeat, level.id).toBe(level.perBeat);
            expect(s.figure.beatsPerBar, level.id).toBe(level.beatsPerBar);
            for (const o of s.figure.onsets)
              expect(Math.abs(o * level.perBeat - Math.round(o * level.perBeat))).toBeLessThan(
                1e-6,
              );
          }
  });
  it("cells give their written onsets", () => {
    expect(cellOnsets(["quarter", "eighths", "swing"]).onsets).toEqual([0, 1, 1.5, 2, 2.5]);
    expect(RHYTHM_CELLS.swing.onsets).not.toEqual(RHYTHM_CELLS.swing.written);
  });
  it("echo teaches counting; dictation adds the grid; sixteenths add 1 e & a after the eighths", () => {
    expect(rhythmLessons("echo").map((l) => l.id)).toEqual(["rhythm.counting"]);
    expect(rhythmLessons("dictation").map((l) => l.id)).toEqual(["rhythm.counting", "rhythm.grid"]);
    expect(rhythmLessons("dictation", "sixteenths").map((l) => l.id)).toEqual([
      "rhythm.counting",
      "rhythm.counting.sixteenths",
      "rhythm.grid.sixteenths",
    ]);
    expect(rhythmLessons("echo", "compound").map((l) => l.id)).toEqual([
      "rhythm.counting.compound",
    ]);
  });
  it("all pass the copy check", () => {
    for (const level of EAR_RHYTHM_LEVELS)
      for (const mode of ["echo", "dictation"] as const)
        expect(all(rhythmLessons(mode, level.id)), `${mode} ${level.id}`).toEqual([]);
  });
});

describe("listening lessons", () => {
  const optionsOf = (l: Lesson) =>
    l.screens.flatMap((s) => s.options ?? []).filter((o) => o.label !== "Flat");
  it("the EQ lessons have one A/B option per band in the drill's set", () => {
    for (const bands of Object.keys(BAND_SETS) as BandSet[])
      for (const drill of ["peak", "cut"]) {
        const [l] = listeningLessons(drill, { bands });
        expect(optionsOf(l).map((o) => o.label)).toEqual(
          BAND_SETS[bands].map((b) => `${bandLabel(b)} ${drill === "peak" ? "boosted" : "cut"}`),
        );
      }
  });
  it("boost or cut uses the fixed five bands, boosted then cut, at the setup's gain", () => {
    const [l] = listeningLessons("boost-or-cut", { bands: "9", gainDb: 6 });
    const eq = optionsOf(l).map((o) => o.sound.effect!.change.eq!);
    expect(eq.map((e) => e.freq)).toEqual([...BAND_SETS["5"], ...BAND_SETS["5"]]);
    expect(eq.map((e) => e.gainDb)).toEqual([
      ...BAND_SETS["5"].map(() => 6),
      ...BAND_SETS["5"].map(() => -6),
    ]);
    expect(optionsOf(l).every((o) => o.sound.effect!.matched)).toBe(true);
  });
  it("level, pan and delay have one option per step in the set; compression has light and heavy", () => {
    expect(
      optionsOf(listeningLessons("level", { levels: [6, 3, 2, 1] })[0]).map(
        (o) => o.sound.effect!.change.levelDb,
      ),
    ).toEqual([6, 3, 2, 1]);
    expect(
      optionsOf(listeningLessons("pan", { pans: "5" })[0]).map((o) => o.sound.effect!.change.pan),
    ).toEqual([...PAN_SETS["5"]]);
    expect(
      optionsOf(listeningLessons("delay", { delays: "4" })[0]).map(
        (o) => o.sound.effect!.change.delayMs,
      ),
    ).toEqual([...DELAY_SETS["4"]]);
    expect(
      optionsOf(listeningLessons("compression", { material: "drums" })[0]).map(
        (o) => o.sound.effect!.change.comp,
      ),
    ).toEqual(["light", "heavy"]);
  });
  it("the options use the drill's material, and flat is no change", () => {
    const [l] = listeningLessons("peak", { material: "music" });
    const flat = l.screens[1].options![0];
    expect(flat.label).toBe("Flat");
    expect(flat.sound.effect).toEqual({ material: "music", change: {} });
    expect(optionsOf(l).every((o) => o.sound.effect!.material === "music")).toBe(true);
  });
  it("every exercise has a lesson with id listening.<drill> that passes the copy check; unknown has none", () => {
    for (const e of STUDIO_EXERCISES) {
      const ls = listeningLessons(e.id);
      expect(ls.map((l) => l.id)).toEqual([`listening.${e.id}`]);
      expect(all(ls), e.id).toEqual([]);
    }
    expect(listeningLessons("nope")).toEqual([]);
  });
});
