import { afterEach, describe, expect, it } from "vite-plus/test";
import { getNamingKey, setNamingKey, setNoteNaming } from "../theory/note-names";
import { conceptCard } from "./cards";
import { circleLessons } from "./circle";
import { earLessons } from "./ear";
import { fretboardLessons } from "./fretboard";
import { jamGameLesson } from "./jam";
import { readingLessons } from "./reading";
import type { Lesson, LessonFigure } from "./types";

afterEach(() => {
  setNoteNaming("letters");
  setNamingKey(undefined);
});

/** Every text a lesson shows, and the labels drawn on its keys and frets. */
const texts = (ls: Lesson[]) =>
  ls.flatMap((l) =>
    l.screens.flatMap((s) => [
      s.title,
      s.text,
      ...(s.steps ?? []).map((x) => x.text),
      ...(s.options ?? []).map((o) => o.label),
    ]),
  );
const labels = (f: LessonFigure | undefined) =>
  f?.kind === "keys"
    ? Object.values(f.marks)
    : f?.kind === "fretboard"
      ? f.marks.map((x) => x.label)
      : [];

describe("lessons follow the note-name setting", () => {
  it("keep their letters by default", () => {
    const [l] = conceptCard("voicings.rootless");
    expect(l.screens[1].title).toBe("A ii-V-I in C");
    expect(l.screens[1].steps![0].text).toContain("Dm7");
    expect(labels(conceptCard("scales.major-formula")[0].screens[0].figure)).toContain("C");
  });

  it("name notes, chords, keys and key marks in fixed do", () => {
    setNoteNaming("fixed");
    const [l] = conceptCard("voicings.rootless");
    expect(l.screens[1].title).toBe("A ii-V-I in Do");
    expect(l.screens[1].steps![0].text).toBe(
      "Rem7: position A, 3 5 7 9 (Fa La Do Mi) in the right hand over Re in the left.",
    );
    expect(labels(conceptCard("scales.major-formula")[0].screens[0].figure)).toContain("Do");
    const qualities = earLessons("chord-qualities", ["major"])[0];
    expect(qualities.screens[0].options!.map((o) => o.label)).toEqual([
      "Major: Do, Mi, Sol",
      "Minor: Do, Mib, Sol",
    ]);
    const wheel = texts(circleLessons("wheel"));
    expect(wheel).toContain(
      "Going clockwise from Do the keys are Sol Re La Mi Si Fa#. Each is a fifth above the last. Tap Next to walk round.",
    );
    const notes = fretboardLessons("note-finder", "guitar", [64, 59, 55, 50, 45, 40])[0];
    expect(labels(notes.screens[0].figure)).toEqual(["Mi", "Si", "Sol", "Re", "La", "Mi"]);
    const thirds = texts(jamGameLesson("thirds"));
    expect(thirds.some((t) => t.includes("Rem7"))).toBe(true);
    expect(thirds.join(" ")).not.toMatch(/\bDm7\b/);
  });

  it("count movable do from the lesson's own key, not the drill's", () => {
    setNoteNaming("movable");
    setNamingKey({ tonic: "G" });
    // The cards are in C, so C is Do even while the drill sits in G...
    const [formula] = conceptCard("scales.major-formula");
    expect(labels(formula.screens[0].figure)).toEqual([
      "Do",
      "Re",
      "Mi",
      "Fa",
      "Sol",
      "La",
      "Si",
      "Do",
    ]);
    // ...and C minor reads la-based: its leading tone B is Sol#, the natural 7th Bb is Sol.
    const [minor] = conceptCard("voicings.cadence-minor");
    expect(minor.screens[1].options!.map((o) => o.label)).toEqual([
      "Natural 7th, Sol",
      "Raised 7th, Sol#",
    ]);
    expect(minor.screens[1].text).toContain("in Do minor");
    // The drill's key comes back once the lesson is built.
    expect(getNamingKey()).toEqual({ tonic: "G" });
  });

  it("name keys and staff notes absolutely in movable do", () => {
    setNoteNaming("movable");
    setNamingKey({ tonic: "D" });
    expect(texts(circleLessons("wheel"))[0]).toBe("Clockwise from Do");
    const [lines] = readingLessons("flashcards", "treble");
    expect(lines.screens[0].text).toBe(
      "A staff has five lines, counted from the bottom. In the treble clef they are Mi Sol Si Re Fa.",
    );
  });
});
