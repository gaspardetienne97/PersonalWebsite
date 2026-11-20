import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  defaultNoteNaming,
  setNamingKey,
  setNoteNaming,
  showChord,
  showKeyName,
  showMarked,
  showNote,
} from "./note-names";

afterEach(() => {
  setNoteNaming("letters");
  setNamingKey(undefined);
});

describe("note names", () => {
  it("leaves everything as it is with letters", () => {
    expect(showNote("F#4")).toBe("F#4");
    expect(showChord("Dm7/G")).toBe("Dm7/G");
    expect(showMarked("Play ⟦C⟧ then ⟦G7⟧.")).toBe("Play C then G7.");
  });

  it("names every letter in fixed do, keeping accidentals and octaves", () => {
    setNoteNaming("fixed");
    expect(["C", "D", "E", "F", "G", "A", "B"].map((n) => showNote(n))).toEqual([
      "Do",
      "Re",
      "Mi",
      "Fa",
      "Sol",
      "La",
      "Si",
    ]);
    expect(showNote("F#4")).toBe("Fa#4");
    expect(showNote("Bb3")).toBe("Sib3");
    expect(showNote("E♭")).toBe("Mi♭");
    expect(showNote("C-1")).toBe("Do-1");
  });

  it("names chord roots and slash basses, not qualities", () => {
    setNoteNaming("fixed");
    expect(showChord("C7")).toBe("Do7");
    expect(showChord("Dm7/G")).toBe("Rem7/Sol");
    expect(showChord("F#maj7")).toBe("Fa#maj7");
    expect(showChord("Bbm7b5")).toBe("Sibm7b5");
    expect(showChord("Ab/C")).toBe("Lab/Do");
    expect(showChord("C6 (E)")).toBe("Do6 (Mi)");
    expect(showChord("Cmaj7 (B4)")).toBe("Domaj7 (Si4)");
  });

  it("can be applied twice", () => {
    setNoteNaming("fixed");
    for (const name of ["C7", "Dm7/G", "F#maj7", "Fadd9", "Bbm7b5", "G"])
      expect(showChord(showChord(name))).toBe(showChord(name));
    expect(showChord("Fadd9")).toBe("Faadd9");
    expect(showNote(showNote("C4"))).toBe("Do4");
  });

  it("returns what isn't a note unchanged", () => {
    setNoteNaming("fixed");
    for (const text of ["", "Hold", "ii-V-I", "R", "b3", "Am I", "H"])
      expect(showNote(text)).toBe(text);
    expect(showChord("N.C.")).toBe("N.C.");
    expect(showChord("IV7")).toBe("IV7");
  });

  it("counts movable do from the key's tonic", () => {
    setNoteNaming("movable");
    const g = { tonic: "G" };
    expect(showNote("G", g)).toBe("Do");
    expect(showNote("F#", g)).toBe("Si");
    expect(showNote("F", g)).toBe("Sib");
    expect(showNote("C#5", g)).toBe("Fa#5");
    expect(showChord("D7", g)).toBe("Sol7");
    expect(showChord("Am7/D", g)).toBe("Rem7/Sol");
  });

  it("reads minor keys la-based", () => {
    setNoteNaming("movable");
    const a = { tonic: "A", minor: true };
    expect(showNote("A", a)).toBe("La");
    expect(showNote("C", a)).toBe("Do");
    expect(showNote("G#", a)).toBe("Sol#");
    expect(showNote("E", { tonic: "E", minor: true })).toBe("La");
  });

  it("uses the screen's key when none is passed, and fixed do when there's no key", () => {
    setNoteNaming("movable");
    expect(showNote("D")).toBe("Re");
    setNamingKey({ tonic: "Bb" });
    expect(showNote("Bb")).toBe("Do");
    expect(showNote("Eb")).toBe("Fa");
    expect(showNote("E")).toBe("Fa#");
  });

  it("names keys absolutely, even in movable do", () => {
    setNoteNaming("movable");
    setNamingKey({ tonic: "G" });
    expect(showKeyName("G")).toBe("Sol");
    expect(showKeyName("Bb")).toBe("Sib");
  });

  it("shows marked notes and chords inside text", () => {
    setNoteNaming("fixed");
    expect(showMarked("A tune in ⟦G⟧: ⟦G4⟧ to ⟦C5⟧, then ⟦D7⟧.")).toBe(
      "A tune in Sol: Sol4 to Do5, then Re7.",
    );
    expect(showMarked("No notes here")).toBe("No notes here");
  });

  it("defaults to letters in English and fixed do elsewhere", () => {
    expect(defaultNoteNaming("en")).toBe("letters");
    expect(["es", "fr", "ht"].map(defaultNoteNaming)).toEqual(["fixed", "fixed", "fixed"]);
  });
});
