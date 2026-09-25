import { describe, expect, it } from "vitest";
import { PROGRESSIONS } from "../content/jam";
import { chorusReport, toneRoleOf } from "./jam";

const blues = PROGRESSIONS.find((p) => p.id === "blues")!;
const iiVI = PROGRESSIONS.find((p) => p.id === "ii-v-i")!;

describe("toneRoleOf", () => {
  it("labels over the chord sounding at the time", () => {
    // C7 = C E G Bb; C mixolydian adds D F A; B natural is outside.
    expect(toneRoleOf(blues, 0, 64)).toBe("chord");
    expect(toneRoleOf(blues, 0, 62)).toBe("scale");
    expect(toneRoleOf(blues, 0, 71)).toBe("avoid");
    // Over F7, A is a chord tone and E natural is outside F mixolydian.
    expect(toneRoleOf(blues, 1, 69)).toBe("chord");
    expect(toneRoleOf(blues, 1, 64)).toBe("avoid");
  });
});

describe("chorusReport", () => {
  it("counts roles per chord and overall", () => {
    // Dm7: F (chord), E (scale); G7: B (chord), C# (avoid over G mixolydian).
    const r = chorusReport(iiVI, [
      { midi: 65, chordIndex: 0 },
      { midi: 64, chordIndex: 0 },
      { midi: 71, chordIndex: 1 },
      { midi: 61, chordIndex: 1 },
    ]);
    expect(r).toMatchObject({ notes: 4, chord: 2, scale: 1, avoid: 1 });
    expect(r.perChord[0]).toMatchObject({ symbol: "Dm7", notes: 2, chord: 1, scale: 1 });
    expect(r.perChord[1]).toMatchObject({ symbol: "G7", chord: 1, avoid: 1 });
    expect(r.headline).toMatch(
      /^4 notes: 2 chord tones, 1 scale tone, 1 avoid note\. Nothing was played over Cmaj7, A7\./,
    );
  });

  it("says so plainly when nothing was played", () => {
    expect(chorusReport(iiVI, []).headline).toBe("No notes in this chorus.");
  });
});
