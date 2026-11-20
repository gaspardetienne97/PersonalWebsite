import { describe, expect, it } from "vite-plus/test";
import { scaleSemitones } from "../theory/scales";
import { parseChordSymbol } from "../theory/chords";
import {
  chorusBars,
  jamToneRoles,
  PROGRESSIONS,
  SONG_PROGRESSIONS,
  transposeProgression,
} from "./jam";

const byRole = (roles: string[], r: string) => roles.flatMap((x, p) => (x === r ? [p] : []));

describe("jam progressions", () => {
  it("matches the catalog table", () => {
    expect(
      PROGRESSIONS.filter((p) => !p.song).map(
        (p) =>
          `${p.id}|${p.key}|${p.group}|${p.difficulty}|${p.bpm}|${p.chords.map((c) => `${c.symbol}/${c.scale.name}(${c.bars})`).join(" ")}`,
      ),
    ).toEqual([
      "ii-v-i|C major|jazz|intermediate|110|Dm7/dorian(2) G7/mixolydian(2) Cmaj7/major(2) A7/mixolydian(2)",
      "minor-ii-v-i|C minor|jazz|advanced|96|Dm7b5/locrian(2) G7alt/altered(2) Cm7/dorian(2)",
      "blues|C|blues|beginner|95|C7/mixolydian(4) F7/mixolydian(2) C7/mixolydian(2) G7/mixolydian(2) C7/mixolydian(2)",
      "modal|D dorian|modal|beginner|84|Dm7/dorian(4) Em7/dorian(4)",
      "pop-axis|C major|pop|beginner|92|C/major(1) G/major(1) Am/major(1) F/major(1)",
      "guitar-g-d-em-c|G major|guitar-uke|beginner|96|G/major(1) D/major(1) Em/major(1) C/major(1)",
    ]);
    expect(chorusBars(PROGRESSIONS[2])).toBe(12);
  });

  it("labels all 12 pitch classes over the current chord", () => {
    const dm7 = jamToneRoles(PROGRESSIONS[0].chords[0]);
    expect(byRole(dm7, "chord")).toEqual([0, 2, 5, 9]);
    expect(byRole(dm7, "scale")).toEqual([4, 7, 11]);
    expect(byRole(dm7, "avoid")).toEqual([1, 3, 6, 8, 10]);
    // Pop chords use the key's scale: F is a scale tone over G in C major.
    expect(jamToneRoles(PROGRESSIONS[4].chords[1])[5]).toBe("scale");
  });

  it("transposes up to ±12 semitones", () => {
    const up = transposeProgression(PROGRESSIONS[0], 2);
    expect(up.key).toBe("D major");
    expect(up.chords.map((c) => c.symbol)).toEqual(["Em7", "A7", "Dmaj7", "B7"]);
    expect(byRole(jamToneRoles(up.chords[0]), "chord")).toEqual([2, 4, 7, 11]);
    expect(transposeProgression(PROGRESSIONS[0], 20).chords[0].symbol).toBe("Dm7");
    expect(transposeProgression(PROGRESSIONS[0], 0)).toBe(PROGRESSIONS[0]);
  });
});

describe("song progressions", () => {
  it("are whole-bar loops of real chords with an artist, in a scale the theory knows", () => {
    for (const p of SONG_PROGRESSIONS) {
      expect(p.group, p.id).toBe("songs");
      expect(p.song?.artist, p.id).toBeTruthy();
      for (const ch of p.chords) {
        expect(Number.isInteger(ch.bars), `${p.id} ${ch.symbol}`).toBe(true);
        expect(parseChordSymbol(ch.symbol), `${p.id} ${ch.symbol}`).toBeTruthy();
        expect(scaleSemitones(ch.scale.name), `${p.id} ${ch.scale.name}`).toBeTruthy();
      }
    }
    expect(PROGRESSIONS).toEqual(expect.arrayContaining(SONG_PROGRESSIONS));
  });
});
