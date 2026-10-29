import { describe, expect, it } from "vitest";
import {
  BAND_SETS,
  DELAY_SETS,
  LOOP_BPM,
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
/** Copy problems; a lesson with fewer than three screens is a card. */
const all = (ls: Lesson[]) =>
  ls.flatMap((l) => lessonProblems(l, l.screens.length < 3 ? "card" : "lesson"));

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
  const ids = (ls: Lesson[]) => ls.map((l) => l.id);
  it("the landmarks are the lessons' own: treble G on the second line, bass F on the fourth", () => {
    const g = readingLessons("flashcards", "treble")[0].screens[2];
    expect(g.title).toBe("A landmark: G");
    expect(g.text).toContain("second line, so that line is G");
    expect(g.figure).toMatchObject({
      kind: "staff",
      clef: "treble",
      notes: [{ midi: 67, beats: 1 }],
    });
    const f = readingLessons("flashcards", "bass")[0].screens[2];
    expect(f.title).toBe("A landmark: F");
    expect(f.text).toContain("fourth line, so that line is F");
    expect(f.figure).toMatchObject({
      kind: "staff",
      clef: "bass",
      notes: [{ midi: 53, beats: 1 }],
    });
  });
  it("flashcards teach each clef the setup reads", () => {
    expect(ids(readingLessons("flashcards", "treble"))).toEqual(["reading.lines-spaces.treble"]);
    expect(ids(readingLessons("flashcards", "bass"))).toEqual(["reading.lines-spaces.bass"]);
    expect(ids(readingLessons("flashcards", "both"))).toEqual([
      "reading.lines-spaces.treble",
      "reading.lines-spaces.bass",
    ]);
  });
  it("flashcard ids follow the setup: accidentals, the key's signature, triads and four-part chords", () => {
    expect(ids(readingLessons("flashcards", "treble", { accidentals: true }))).toContain(
      "reading.accidentals",
    );
    expect(ids(readingLessons("flashcards", "treble", { fifths: 0 }))).toEqual([
      "reading.lines-spaces.treble",
    ]);
    expect(ids(readingLessons("flashcards", "treble", { fifths: 2 }))).toEqual([
      "reading.lines-spaces.treble",
      "reading.key-signature",
      "reading.key-signature.2",
    ]);
    expect(ids(readingLessons("flashcards", "treble", { stack: "chord" }))).toContain(
      "reading.stacked.triad",
    );
    expect(ids(readingLessons("flashcards", "both", { stack: "satb" }))).toContain(
      "reading.stacked.satb",
    );
    expect(ids(readingLessons("flashcards", "treble"))).not.toContain("reading.stacked.triad");
  });
  it("a sight-reading level teaches both clefs when it reads both", () => {
    expect(ids(readingLessons("sight-reading", "both", { level: "primer" }))).toEqual([
      "reading.lines-spaces.treble",
      "reading.lines-spaces.bass",
      "reading.values",
    ]);
  });
  it("sight-reading ids follow the level's items and the meter in use", () => {
    const extra = (level: string, meter = "simple") =>
      ids(readingLessons("sight-reading", "treble", { level, meter })).filter(
        (i) => i.startsWith("reading.values.") || i.startsWith("reading.meter."),
      );
    expect(extra("primer")).toEqual([]);
    expect(extra("level-3")).toEqual(["reading.values.syncopation"]);
    expect(extra("piano-4")).toEqual([
      "reading.values.ties",
      "reading.values.dotted-quarter",
      "reading.values.syncopation",
    ]);
    expect(extra("piano-5", "3/8")).toEqual([
      "reading.values.ties",
      "reading.values.dotted-quarter",
      "reading.values.syncopation",
      "reading.values.sixteenths",
      "reading.meter.3-8",
    ]);
    expect(extra("piano-8", "5/4")).toContain("reading.values.triplets");
    expect(extra("piano-8", "5/4")).toContain("reading.meter.5-4");
    expect(extra("piano-6", "compound")).toContain("reading.meter.compound");
    expect(extra("piano-9", "changing")).toEqual(
      expect.arrayContaining(["reading.values.dotted-eighth", "reading.meter.changing"]),
    );
    expect(extra("line-jazz")).toContain("reading.values.swing");
    expect(extra("piano-5", "3/4")).not.toContain("reading.meter.3-4");
  });
  it("the ledger lines screen draws middle C and names the other side's ledger note", () => {
    const [t] = readingLessons("flashcards", "treble");
    const ledger = t.screens[3];
    expect(ledger.text).toContain("first ledger line below the treble staff");
    expect(ledger.text).toContain("A is on the first one above");
    if (ledger.figure?.kind === "staff")
      expect(ledger.figure.notes.map((n) => n.midi)).toContain(60);
    const [b] = readingLessons("flashcards", "bass");
    expect(b.screens[3].text).toContain("first ledger line above the bass staff");
    expect(b.screens[3].text).toContain("E is on the first one below");
  });
  it("every key signature teaches its own accidentals, on each clef the setup reads", () => {
    for (const k of KEY_SIGNATURES.filter((x) => x.fifths)) {
      const order = (k.fifths > 0 ? "FCGDAEB" : "BEADGCF").slice(0, Math.abs(k.fifths)).split("");
      const word = k.fifths > 0 ? "sharp" : "flat";
      const ls = readingLessons("sight-reading", "both", { fifths: k.fifths });
      const l = ls.find((x) => x.id === `reading.key-signature.${k.fifths}`)!;
      expect(l.screens[0].steps!.map((st) => st.text.split(":")[0])).toEqual(
        order.map((o) => `${o} ${word}`),
      );
      expect(l.screens.slice(1).map((sc) => sc.figure)).toMatchObject([
        { clef: "treble", fifths: k.fifths },
        { clef: "bass", fifths: k.fifths },
      ]);
      expect(l.screens[1].text).toContain(`${order.at(-1)} ${word}`);
      expect(all(ls)).toEqual([]);
    }
  });
  it("all pass the copy check", () => {
    for (const kind of ["flashcards", "sight-reading"] as const)
      expect(
        all(
          readingLessons(kind, "both", {
            accidentals: true,
            fifths: 3,
            stack: "satb",
            level: "piano-9",
            meter: "changing",
          }),
        ),
        kind,
      ).toEqual([]);
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
  it("ids follow the level: counting, the grid in dictation, then each cell the level adds", () => {
    const ids = (m: "echo" | "dictation", l?: string) => rhythmLessons(m, l).map((x) => x.id);
    expect(ids("echo")).toEqual(["rhythm.counting"]);
    expect(ids("dictation")).toEqual(["rhythm.counting", "rhythm.grid"]);
    expect(ids("echo", "rests-halves")).toEqual(["rhythm.counting", "rhythm.rests-halves"]);
    expect(ids("echo", "dotted")).toEqual([
      "rhythm.counting",
      "rhythm.rests-halves",
      "rhythm.dotted-quarter",
    ]);
    expect(ids("dictation", "sixteenths")).toEqual([
      "rhythm.counting",
      "rhythm.counting.sixteenths",
      "rhythm.grid.sixteenths",
      "rhythm.rests-halves",
    ]);
    expect(ids("echo", "syncopation")).toEqual([
      "rhythm.counting",
      "rhythm.counting.sixteenths",
      "rhythm.rests-halves",
      "rhythm.syncopation",
      "rhythm.triplets",
    ]);
    expect(ids("dictation", "syncopation")).not.toContain("rhythm.triplets");
    expect(ids("echo", "dotted-sixteenths")).toContain("rhythm.dotted-eighth");
    expect(ids("dictation", "swing")).toEqual([
      "rhythm.counting",
      "rhythm.grid",
      "rhythm.rests-halves",
      "rhythm.swing",
    ]);
    expect(ids("echo", "compound")).toEqual(["rhythm.counting.compound", "rhythm.rests-halves"]);
    expect(ids("echo", "compound")).not.toContain("rhythm.triplets");
  });
  it("counting screen 1 clicks once a beat and screen 3 plays the rhythm over the click", () => {
    for (const [level, perBar] of [
      ["quarters-eighths", 4],
      ["sixteenths", 4],
      ["compound", 2],
    ] as const) {
      const l = rhythmLessons("echo", level).at(level === "sixteenths" ? 1 : 0)!;
      const clicks = (sc: number) => l.screens[sc].sound!.notes.filter((n) => n.midi[0] === 37);
      expect(clicks(0).map((n) => n.at)).toEqual(
        Array.from({ length: perBar }, (_, i) => (i * 60) / 90),
      );
      expect(l.screens[0].sound!.notes).toHaveLength(perBar);
      expect(clicks(2)).toHaveLength(perBar);
      expect(l.screens[2].sound!.notes.some((n) => n.midi[0] === 42)).toBe(true);
    }
  });
  it("the counting text says a click on each number", () => {
    expect(rhythmLessons("echo")[0].screens[0].text).toContain("one number on each click");
  });
  it("all pass the copy check", () => {
    for (const level of EAR_RHYTHM_LEVELS)
      for (const mode of ["echo", "dictation"] as const)
        expect(all(rhythmLessons(mode, level.id)), `${mode} ${level.id}`).toEqual([]);
  });
});

describe("listening lessons", () => {
  const items = (ls: Lesson[]) => ls.slice(1);
  const opts = (ls: Lesson[]) =>
    ls.flatMap((l) => l.screens.flatMap((s) => s.options ?? [])).filter((o) => o.label !== "Flat");
  it("the EQ lessons have an intro, a gain card and one A/B card per band in the drill's set", () => {
    for (const bands of Object.keys(BAND_SETS) as BandSet[])
      for (const drill of ["peak", "cut"]) {
        const ls = listeningLessons(drill, { bands, gainDb: 6 });
        expect(ls.map((l) => l.id)).toEqual([
          `listening.${drill}`,
          `listening.${drill}.gain.6`,
          ...BAND_SETS[bands].map((b) => `listening.${drill}.band.${b}`),
        ]);
        const bandCards = ls.slice(2);
        expect(bandCards.map((l) => l.screens[0].options!.map((o) => o.label))).toEqual(
          BAND_SETS[bands].map((b) => [
            "Flat",
            `${bandLabel(b)} ${drill === "peak" ? "boosted" : "cut"}`,
          ]),
        );
        expect(
          bandCards.map((l) => l.screens[0].options![1].sound.effect!.change.eq!.gainDb),
        ).toEqual(BAND_SETS[bands].map(() => (drill === "peak" ? 6 : -6)));
      }
  });
  it("a bigger set only adds ids: 9 bands contain the 3-band ids, and each gain has its own", () => {
    const three = listeningLessons("peak", { bands: "3" }).map((l) => l.id);
    const nine = listeningLessons("peak", { bands: "9" }).map((l) => l.id);
    for (const id of three.filter((i) => i.includes(".band."))) expect(nine).toContain(id);
    expect(nine.length).toBeGreaterThan(three.length);
    expect(listeningLessons("peak", { gainDb: 3 }).map((l) => l.id)).toContain(
      "listening.peak.gain.3",
    );
    expect(listeningLessons("peak", { gainDb: 3 }).map((l) => l.id)).not.toContain(
      "listening.peak.gain.12",
    );
  });
  it("boost or cut: intro with boosts then cuts over the fixed five bands, and a card for the gain", () => {
    const ls = listeningLessons("boost-or-cut", { bands: "9", gainDb: 6 });
    expect(ls.map((l) => l.id)).toEqual([
      "listening.boost-or-cut",
      "listening.boost-or-cut.gain.6",
    ]);
    const eq = ls[0].screens
      .flatMap((s) => s.options ?? [])
      .filter((o) => o.label !== "Flat")
      .map((o) => o.sound.effect!.change.eq!);
    expect(eq.map((e) => e.freq)).toEqual([...BAND_SETS["5"], ...BAND_SETS["5"]]);
    expect(eq.map((e) => e.gainDb)).toEqual([
      ...BAND_SETS["5"].map(() => 6),
      ...BAND_SETS["5"].map(() => -6),
    ]);
    expect(opts(ls).every((o) => o.sound.effect!.matched)).toBe(true);
  });
  it("level, pan and delay have an intro and one card per step in the set", () => {
    const l = listeningLessons("level", { levels: [6, 3, 2, 1] });
    expect(l.map((x) => x.id)).toEqual([
      "listening.level",
      "listening.level.6",
      "listening.level.3",
      "listening.level.2",
      "listening.level.1",
    ]);
    expect(opts(items(l)).map((o) => o.sound.effect!.change.levelDb)).toEqual([6, 3, 2, 1]);
    expect(listeningLessons("level", { levels: [6, 3] }).map((x) => x.id)).toEqual([
      "listening.level",
      "listening.level.6",
      "listening.level.3",
    ]);
    const p = listeningLessons("pan", { pans: "5" });
    expect(p.map((x) => x.id)).toEqual([
      "listening.pan",
      ...PAN_SETS["5"].map((v) => `listening.pan.${v}`),
    ]);
    expect(opts(p).map((o) => o.sound.effect!.change.pan)).toEqual([...PAN_SETS["5"]]);
    const d = listeningLessons("delay", { delays: "4" });
    expect(d.map((x) => x.id)).toEqual([
      "listening.delay",
      ...DELAY_SETS["4"].map((ms) => `listening.delay.${Math.round(ms)}`),
    ]);
    expect(opts(d).map((o) => o.sound.effect!.change.delayMs)).toEqual([...DELAY_SETS["4"]]);
    expect(d[0].screens[0].text).toContain(`${LOOP_BPM} BPM`);
    expect(
      opts(listeningLessons("compression", { material: "drums" })).map(
        (o) => o.sound.effect!.change.comp,
      ),
    ).toEqual(["light", "heavy"]);
  });
  it("the options use the drill's material, and flat is no change", () => {
    const ls = listeningLessons("peak", { material: "music" });
    const flat = ls[2].screens[0].options![0];
    expect(flat.label).toBe("Flat");
    expect(flat.sound.effect).toEqual({ material: "music", change: {} });
    expect(opts(ls).every((o) => o.sound.effect!.material === "music")).toBe(true);
  });
  it("every exercise has an intro with id listening.<drill> that passes the copy check; unknown has none", () => {
    for (const e of STUDIO_EXERCISES) {
      const ls = listeningLessons(e.id);
      expect(ls[0].id).toBe(`listening.${e.id}`);
      expect(all(ls), e.id).toEqual([]);
    }
    expect(listeningLessons("nope")).toEqual([]);
  });
});
