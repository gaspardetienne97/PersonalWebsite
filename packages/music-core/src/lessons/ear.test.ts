import { describe, expect, it } from "vite-plus/test";
import { CADENCES_AND_QUALITIES, SCALE_DATA } from "../data";
import {
  BASS_LEVELS,
  CENT_STEPS,
  CHORD_FUNCTIONS,
  EAR_INTERVALS,
  EAR_INVERSIONS,
  EAR_SCALES,
  SCALE_DEGREES,
  SCALE_DEGREE_LEVELS,
  functionChord,
  functionToken,
  intervalPrompt,
  inversionVoicing,
  keyCadence,
  scaleRun,
  KEY_CHANGE_PATHS,
} from "../content/ear";
import { FEELS } from "../content/pads-studio";
import { CHORD_LOOPS, loopsIn, numeralChord, parseNumeral } from "../content/loops";
import { rng } from "../content/random";
import { pc } from "../theory/notes";
import { lessonProblems } from "./check";
import { earLessons, loopLessonItems, qualityCue } from "./ear";
import { pendingLessons, type Lesson } from "./types";

const sounds = (l: Lesson) =>
  l.screens.flatMap((s) => [s.sound, ...(s.options ?? []).map((o) => o.sound)]);
const text = (l: Lesson) => l.screens.map((s) => `${s.title} ${s.text}`).join(" ");
const midis = (l: Lesson) => l.screens[0].sound!.notes.map((n) => n.midi);
const QUALITIES = CADENCES_AND_QUALITIES.chordQualities;
const CADENCES = CADENCES_AND_QUALITIES.cadences;
const MAJOR = SCALE_DATA.semitonesByKind.major;
const loopSets = [...new Set(CHORD_LOOPS.map((l) => l.set))];

/** Every drill with the whole set of items it can offer. */
const ALL: Record<string, string[]> = {
  intervals: EAR_INTERVALS.map((i) => i.token),
  "interval-compare": [],
  "chord-qualities": QUALITIES.map((q) => q.token),
  cadences: CADENCES.map((c) => c.token),
  "chord-functions": [
    ...CHORD_FUNCTIONS.map((f) => f.token),
    ...CHORD_FUNCTIONS.map((f) => functionToken(f.token, { minor: true, seventh: true })),
    ...CHORD_FUNCTIONS.map((f) => functionToken(f.token, { seventh: true })),
  ],
  progressions: CHORD_FUNCTIONS.map((f) => f.token),
  "key-changes": [],
  "song-loops": [...new Set(loopSets.flatMap((s) => loopLessonItems(s)))],
  scales: EAR_SCALES.map((s) => s.token),
  inversions: EAR_INVERSIONS.map((i) => i.token),
  "bass-lines": ["1", "2", "3", "4", "5", "6", "7"],
  "fine-pitch": [],
  "wrong-note": SCALE_DEGREES.map((d) => d.label),
  "scale-degrees": SCALE_DEGREES.map((d) => d.label),
  "melody-dictation": SCALE_DEGREES.map((d) => d.label),
  feel: FEELS.map((f) => f.id),
};

describe("ear lessons", () => {
  it("intervals: an intro, then one lesson per interval", () => {
    const ls = earLessons("intervals", ["P5", "M3"]);
    expect(ls.map((l) => l.id)).toEqual(["ear.intervals", "ear.intervals:P5", "ear.intervals:M3"]);
    const [a, b] = midis(ls[1]);
    expect(b[0] - a[0]).toBe(7);
  });
  it("a new level teaches only the new item", () => {
    const seen = ["ear.intervals", "ear.intervals:P5"];
    const left = pendingLessons({ lessons: earLessons("intervals", ["P5", "M3"]) }, seen);
    expect(left.map((l) => l.id)).toEqual(["ear.intervals:M3"]);
  });
  it("an unknown drill has no lessons, and an unknown item is left out", () => {
    expect(earLessons("nope", ["a"])).toEqual([]);
    expect(earLessons("intervals", ["zzz"]).map((l) => l.id)).toEqual(["ear.intervals"]);
  });
  it("every drill and every item passes the copy check, one screen per item", () => {
    for (const [drill, items] of Object.entries(ALL)) {
      const ls = earLessons(drill, items);
      expect(ls.length, drill).toBe(items.length + 1);
      expect(new Set(ls.map((l) => l.id)).size, drill).toBe(ls.length);
      expect(ls[0].id).toBe(`ear.${drill}`);
      ls.forEach((l, i) => {
        expect(lessonProblems(l, "card"), l.id).toEqual([]);
        expect(JSON.stringify(l), l.id).not.toMatch(/undefined|NaN/);
        if (i > 0) {
          expect(l.screens.length, l.id).toBe(1);
          const want = `ear.${drill}:${items[i - 1]}`;
          // A chord quality's id also carries the cue that separates it within the set.
          if (drill === "chord-qualities") expect(l.id.startsWith(`${want}|`)).toBe(true);
          else expect(l.id).toBe(want);
          expect(l.screens[0].sound?.notes.length, l.id).toBeGreaterThan(0);
        }
      });
    }
  });
  it("intervals: the sound is the drill's, the text counts half steps", () => {
    for (const i of EAR_INTERVALS) {
      const l = earLessons("intervals", [i.token])[1];
      const p = intervalPrompt(rng(1), {
        difficulty: 0.3,
        token: i.token,
        direction: "ascending",
        root: 60,
      });
      expect(l.screens[0].sound!.notes.map((n) => [n.midi, n.at, n.dur])).toEqual(
        p.playback.map((e) => [e.midi, e.time, e.duration]),
      );
      expect(text(l)).toContain(i.semitones === 1 ? "1 half step" : `${i.semitones} half steps`);
    }
  });
  it("chord qualities play the data's chord", () => {
    for (const q of QUALITIES) {
      const l = earLessons("chord-qualities", [q.token])[1];
      const root = Math.min(...midis(l).flat());
      expect(midis(l)).toEqual([q.intervals.map((i) => root + i)]);
    }
    expect(earLessons("chord-qualities", ["half-diminished-7"])[1].title).toBe(
      "Half-diminished 7th",
    );
  });
  it("every cue, in every subset of the nine qualities, is a clear sentence that separates the quality", () => {
    const tokens = QUALITIES.map((q) => q.token);
    const NAMES: Record<string, ["third" | "fifth" | "seventh", number]> = {
      "minor 3rd": ["third", 3],
      "major 3rd": ["third", 4],
      "diminished 5th": ["fifth", 6],
      "perfect 5th": ["fifth", 7],
      "augmented 5th": ["fifth", 8],
      "diminished 7th": ["seventh", 9],
      "minor 7th": ["seventh", 10],
      "major 7th": ["seventh", 11],
    };
    const has = (t: string, kind: string, n: number) => {
      const [, third, fifth, seventh] = QUALITIES.find((q) => q.token === t)!.intervals;
      return kind === "third"
        ? n === third
        : kind === "fifth"
          ? n === fifth
          : kind === "seventh"
            ? n === seventh
            : !seventh;
    };
    for (let m = 1; m < 1 << tokens.length; m++) {
      const set = tokens.filter((_, i) => m & (1 << i));
      const ls = earLessons("chord-qualities", set);
      for (const t of set) {
        const l = ls.find((x) => x.id.startsWith(`ear.chord-qualities:${t}|`))!;
        const cue = /Listen for (.*)$/.exec(text(l))![1];
        const named = Object.entries(NAMES)
          .filter(([w]) => cue.includes(w))
          .map(([, v]) => v);
        const where = `${t} in [${set}]: ${cue}`;
        expect(named.length, where).toBeGreaterThan(0);
        expect(cue, where).not.toMatch(/the ,|, ,|for the :/);
        const nums = /: ([\d, and]+) half steps/
          .exec(cue)![1]
          .split(/, | and /)
          .map(Number);
        expect(nums, where).toEqual(named.map(([, n]) => n));
        const no7 = cue.includes("no 7th");
        const all = [...named, ...(no7 ? [["none7", 0] as [string, number]] : [])];
        expect(
          all.every(([k, n]) => has(t, k, n)),
          where,
        ).toBe(true);
        for (const o of set.filter((x) => x !== t))
          expect(
            all.every(([k, n]) => has(o, k, n)),
            `${where} also fits ${o}`,
          ).toBe(false);
        expect(
          qualityCue(t, set).some((c) => c.kind !== "none7"),
          where,
        ).toBe(true);
      }
    }
  });
  it("the cue is in the id: the same quality gets two ids when the set needs another cue", () => {
    const id = (t: string, set: string[]) =>
      earLessons("chord-qualities", set).find((l) => l.id.includes(`:${t}|`))!.id;
    expect(id("major", ["major", "minor"])).toBe("ear.chord-qualities:major|M3");
    expect(id("major", ["major", "augmented"])).not.toBe(id("major", ["major", "minor"]));
    expect(id("major", ["major", "major-7"])).toContain("no7");
    expect(id("major", ["major", "minor", "minor-7"])).toBe(
      id("major", ["major", "minor", "diminished-7"]),
    );
  });
  it("cadences: the four progressions from the data, played as the data has them", () => {
    const ls = earLessons(
      "cadences",
      CADENCES.map((c) => c.token),
    );
    expect(ls.map((l) => l.id)).toEqual([
      "ear.cadences",
      "ear.cadences:authentic",
      "ear.cadences:plagal",
      "ear.cadences:half",
      "ear.cadences:deceptive",
    ]);
    CADENCES.forEach((c, i) => {
      const l = ls[i + 1];
      expect(midis(l)).toEqual(c.playback.map((e) => e.midiNotes));
      expect(text(l)).toContain(c.romanProgression.join(" to "));
    });
    expect(text(ls[3])).toMatch(/ends on V/);
  });
  it("chord functions play the setup then the chord, in the key's own tokens", () => {
    for (const token of ALL["chord-functions"]) {
      const l = earLessons("chord-functions", [token])[1];
      const minor = token.startsWith("m:");
      const notes = l.screens[0].sound!.notes;
      expect(notes.slice(0, 4).map((n) => n.midi)).toEqual(keyCadence(0, minor).map((e) => e.midi));
      expect(notes.at(-1)!.midi).toEqual(functionChord(0, token));
      expect(notes.at(-1)!.at).toBeGreaterThan(notes[3].at + notes[3].dur);
    }
    expect(text(earLessons("chord-functions", ["IV"])[1])).toContain("F");
    expect(text(earLessons("chord-functions", ["m:IV"])[1])).toContain("Fm");
  });
  it("song loops: each numeral is its chord in C after the setup of its kind of key", () => {
    for (const id of ALL["song-loops"]) {
      const minor = id.startsWith("min:");
      const n = minor ? id.slice(4) : id;
      const l = earLessons("song-loops", [id])[1];
      const notes = l.screens[0].sound!.notes;
      expect(l.id).toBe(`ear.song-loops:${id}`);
      expect(
        notes.slice(0, 4).map((x) => x.midi),
        id,
      ).toEqual(keyCadence(0, minor).map((e) => e.midi));
      expect(notes.at(-1)!.midi).toEqual(numeralChord(0, n));
      expect(text(l)).toContain(minor ? "i, iv, V, i" : "I, IV, V, I");
      expect(text(l)).toContain(minor ? "C minor" : "C major");
      const root = parseNumeral(n)!.root;
      expect(text(l), id).toContain(
        root === 0 ? "the tonic" : root === 1 ? "1 half step" : `${root} half steps`,
      );
    }
  });
  it("a numeral only minor loops use is taught after the minor setup; one used in both kinds is taught twice", () => {
    expect(loopLessonItems("minor")).toContain("min:bIII");
    expect(loopLessonItems("minor")).not.toContain("bIII");
    const both = loopLessonItems("rock");
    expect(both).toContain("bVII");
    expect(both).toContain("min:bVII");
    for (const set of ["songs", "pop", "rock", "minor", "modal"])
      for (const id of loopLessonItems(set)) {
        const minor = id.startsWith("min:");
        const n = minor ? id.slice(4) : id;
        expect(
          loopsIn(set).some((l) => !!l.minor === minor && l.numerals.includes(n)),
          `${set} ${id}`,
        ).toBe(true);
      }
  });
  it("scales: the scale up from the tonic, with a true colour note", () => {
    for (const s of EAR_SCALES) {
      const l = earLessons("scales", [s.token])[1];
      const notes = l.screens[0].sound!.notes;
      const tonic = Math.min(...notes.map((n) => n.midi[0])) + 12;
      expect(notes.slice(1).map((n) => n.midi[0])).toEqual(scaleRun(tonic, s.token, "ascending"));
    }
    const semis = (t: string) =>
      SCALE_DATA.semitonesByKind[t as keyof typeof SCALE_DATA.semitonesByKind];
    expect(semis("dorian")).toContain(9);
    expect(semis("dorian")).toContain(3);
    expect(semis("lydian")).toContain(6);
    expect(semis("mixolydian")).toContain(10);
    expect(semis("mixolydian")).toContain(4);
    expect(semis("phrygian")).toContain(1);
    expect(semis("locrian")).toContain(6);
    expect(semis("blues")).toContain(6);
    expect(semis("harmonic-minor")).toContain(11);
    expect(semis("harmonic-minor")).toContain(8);
    expect(semis("melodic-minor")).toContain(9);
    expect(semis("melodic-minor")).toContain(3);
    expect(semis("major-pentatonic")).not.toContain(5);
    expect(semis("major-pentatonic")).not.toContain(11);
    expect(semis("minor-pentatonic")).not.toContain(2);
    expect(semis("minor-pentatonic")).not.toContain(8);
    expect(semis("minor-pentatonic")).not.toContain(9);
  });
  it("inversions: the named note is lowest", () => {
    for (const inv of EAR_INVERSIONS) {
      const l = earLessons("inversions", [inv.token])[1];
      const quality = inv.seventh ? "dominant-7" : "major";
      const v = inversionVoicing(60, quality, inv.position);
      expect(l.screens[0].sound!.notes.at(-1)!.midi).toEqual(v);
      const lowest = Math.min(...v);
      const tone = ["root", "3rd", "5th", "7th"][inv.position];
      expect(text(l)).toContain(tone);
      const c = (quality === "major" ? [0, 4, 7] : [0, 4, 7, 10])[inv.position];
      expect(pc(lowest)).toBe(pc(60 + c));
    }
  });
  it("bass lines: the bass is the degree, in the key of C", () => {
    for (const lv of BASS_LEVELS)
      for (const d of lv.degrees) {
        const l = earLessons("bass-lines", [d])[1];
        const last = l.screens[0].sound!.notes.at(-1)!;
        expect(pc(last.midi[0]), `${lv.id} ${d}`).toBe(MAJOR[Number(d) - 1]);
        expect(last.midi.slice(1).length).toBeGreaterThanOrEqual(3);
      }
    expect(text(earLessons("bass-lines", ["3"])[1])).toContain(
      "the I chord has its 3rd in the bass",
    );
    expect(text(earLessons("bass-lines", ["7"])[1])).toContain(
      "the V chord has its 3rd in the bass",
    );
  });
  it("degrees: the key is set first where the quiz sets it, then the tonic, then the degree", () => {
    for (const drill of ["scale-degrees", "wrong-note", "melody-dictation"])
      for (const minor of [false, true])
        for (const d of SCALE_DEGREES.map((x) => x.label)) {
          const l = earLessons(drill, [d], { minor })[1];
          const semis = SCALE_DEGREES.find((x) => x.label === d)!.semitones;
          const notes = l.screens[0].sound!.notes;
          const keyed = drill !== "wrong-note";
          if (keyed) {
            expect(notes.slice(0, 4).map((x) => x.midi)).toEqual(
              keyCadence(0, minor).map((e) => e.midi),
            );
            expect(text(l)).toContain(minor ? "i, iv, V, i" : "I, IV, V, I");
          } else expect(notes.length).toBe(2);
          const [t, n] = notes.slice(-2).map((x) => x.midi);
          expect(n[0] - t[0], `${drill} ${d}`).toBe(semis);
          expect(text(l)).toContain(semis === 0 ? "tonic" : `${semis} half step`);
        }
  });
  it("interval direction follows the drill's setting", () => {
    const l = (direction: string) => earLessons("intervals", ["P5"], { direction })[1];
    const m = (direction: string) => l(direction).screens[0].sound!.notes.map((n) => n.midi[0]);
    expect(m("descending")).toEqual([60, 53]);
    expect(text(l("descending"))).toContain("below");
    expect(text(l("descending"))).not.toContain("also play");
    const together = l("harmonic").screens[0].sound!.notes;
    expect(together.length).toBe(1);
    expect(together[0].midi).toEqual([60, 67]);
    expect(m("ascending")).toEqual([60, 67]);
    expect(text(l("ascending"))).not.toContain("also play");
    for (const d of ["auto", "mixed"]) expect(text(l(d))).toContain("also play");
  });
  it("fine pitch: one wide example of cents, higher and lower", () => {
    const [intro] = earLessons("fine-pitch", []);
    const opts = intro.screens.flatMap((s) => s.options ?? []);
    expect(opts.length).toBe(2);
    for (const o of opts) {
      const [a, b] = o.sound.notes.map((n) => n.midi[0]);
      expect(Math.abs(b - a)).toBeCloseTo(CENT_STEPS[0] / 100);
    }
    expect(text(intro)).toContain(`${CENT_STEPS[0]} cents`);
    expect(text(intro)).toContain("in tune");
  });
  it("key changes: the ways in come from the drill's paths", () => {
    const [intro] = earLessons("key-changes", []);
    const opts = intro.screens.flatMap((s) => s.options ?? []);
    expect(opts.length).toBe(KEY_CHANGE_PATHS.major.length);
    expect(
      opts.every((o) => o.sound.notes.length === 4 + 3 || o.sound.notes.length === 4 + 2),
    ).toBe(true);
  });
  it("chord qualities: Root, 3rd and 5th on the keys, a screen named by each quality asked", () => {
    const [intro] = earLessons("chord-qualities", ["major", "minor", "diminished", "augmented"]);
    expect(intro.screens.map((s) => s.title)).toEqual([
      "Major and minor",
      "Diminished",
      "Augmented",
    ]);
    for (const s of intro.screens) {
      expect(Object.values((s.figure as { marks: object }).marks)).toEqual(["Root", "3rd", "5th"]);
      expect(s.sound ?? s.options).toBeTruthy();
    }
    expect(earLessons("chord-qualities", ["major", "minor"])[0].screens).toHaveLength(1);
  });
  it("intervals: the first screen already shows two notes with the count between them", () => {
    const marks = (earLessons("intervals", [])[0].screens[0].figure as { marks: object }).marks;
    expect(marks).toMatchObject({ 60: "0", 64: "4" });
  });
  it("intros follow the drill's setup: direction, level degrees, minor setup", () => {
    const steps = earLessons("intervals", [], { direction: "descending" })[0].screens[0].steps!;
    for (const o of steps)
      expect(o.sound!.notes[1].midi[0]).toBeLessThan(o.sound!.notes[0].midi[0]);
    // Each step numbers every half step from the start key "0", counting down.
    expect((steps[1].figure as { marks: Record<number, string> }).marks).toMatchObject({
      60: "0",
      53: "7",
    });
    expect(Object.keys((steps[2].figure as { marks: object }).marks).length).toBe(13);
    for (const level of SCALE_DEGREE_LEVELS) {
      const [intro] = earLessons("melody-dictation", [], { level: level.id });
      const notes = intro.screens[0].sound!.notes;
      const minor = level.degrees.includes("b3") && !level.degrees.includes("3");
      expect(
        notes.slice(0, 4).map((n) => n.midi),
        level.id,
      ).toEqual(keyCadence(0, minor).map((e) => e.midi));
      const labels = /This one is ([^.]+)\./.exec(text(intro))![1].split(" ");
      for (const d of labels) expect(level.degrees, `${level.id} ${d}`).toContain(d);
      const [w] = earLessons("wrong-note", [], { level: level.id });
      for (const d of /here ([\d b#]+)\./.exec(text(w))![1].trim().split(" "))
        expect(level.degrees, level.id).toContain(d);
    }
  });
  it("interval compare and wrong note intros have something to hear", () => {
    expect(
      earLessons("interval-compare", [])[0].screens.flatMap((s) => s.options ?? []).length,
    ).toBe(2);
    expect(earLessons("wrong-note", [])[0].screens.flatMap((s) => s.options ?? []).length).toBe(2);
    expect(sounds(earLessons("melody-dictation", [])[0]).some(Boolean)).toBe(true);
  });
  it("feel: a drum example of each feel, with the content's own hint", () => {
    const ls = earLessons(
      "feel",
      FEELS.map((f) => f.id),
    );
    FEELS.forEach((f, i) => {
      const l = ls[i + 1];
      expect(l.screens[0].sound!.notes.every((n) => n.drum)).toBe(true);
      expect(text(l)).toContain(f.hint);
    });
  });
});
