import { describe, expect, it } from "vite-plus/test";
import { staffOffset } from "./engrave";

describe("staffOffset", () => {
  it("puts a pitch on its line or space, half a gap a step from the top line", () => {
    expect(staffOffset(77, "treble", 0, 10)).toBe(0); // F5, the top line
    expect(staffOffset(64, "treble", 0, 10)).toBe(40); // E4, the bottom line
    expect(staffOffset(60, "treble", 0, 10)).toBe(50); // middle C, one ledger line down
    expect(staffOffset(57, "bass", 0, 10)).toBe(0); // A3, the bass top line
  });
  it("spells in the key: F sharp sits on the F line, G flat on the G space", () => {
    expect(staffOffset(78, "treble", 1, 10)).toBe(0);
    expect(staffOffset(66, "treble", -6, 10)).toBe(30);
  });
});
