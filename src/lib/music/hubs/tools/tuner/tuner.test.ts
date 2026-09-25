import { describe, expect, it } from "vitest";
import { degreeRole, direction, nearestString, pretty, signedCents, tracePath } from "./tuner";

describe("tuner helpers", () => {
  it("names the direction with a ±5 cent in-tune zone", () => {
    expect(direction(-5)).toBe("in tune");
    expect(direction(5)).toBe("in tune");
    expect(direction(-5.1)).toBe("flat");
    expect(direction(12)).toBe("sharp");
    expect(signedCents(12.4)).toBe("+12");
    expect(signedCents(-7.6)).toBe("−8");
    expect(signedCents(0.2)).toBe("0");
  });

  it("finds the nearest open string", () => {
    const standard = [64, 59, 55, 50, 45, 40];
    expect(nearestString(110, standard)).toBe(4); // A2
    expect(nearestString(84, standard)).toBe(5); // flat low E
    expect(nearestString(330, standard)).toBe(0); // E4
    expect(nearestString(110, [])).toBe(-1);
  });

  it("colours degrees relative to the tonic", () => {
    expect(degreeRole(0)).toBe("tonic");
    expect(degreeRole(7)).toBe("fifth");
    expect(degreeRole(4)).toBe("scale");
    expect(degreeRole(1)).toBe("other");
    expect(degreeRole(-1)).toBe("scale");
  });

  it("breaks the trace where no pitch was heard", () => {
    const d = tracePath(
      [
        { at: 0, cents: 0 },
        { at: 5000, cents: 50 },
        { at: 6000, cents: null },
        { at: 10000, cents: -50 },
      ],
      10000,
    );
    expect(d).toBe("M0.0 80.0L300.0 0.0M600.0 160.0");
    expect(pretty("Bb4")).toBe("B♭4");
  });
});
