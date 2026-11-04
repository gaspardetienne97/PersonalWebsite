import { describe, expect, it } from "vitest";
import { midiToHz } from "@repo/music-core";
import {
  degreeRole,
  direction,
  nearestString,
  pretty,
  signedCents,
  tracePath,
  centsToTarget,
  scopePath,
  intonationVerdict,
} from "./tuner";

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

describe("target notes and the scope", () => {
  it("measures against the chosen note in the nearest octave", () => {
    // A3 (220 Hz) against target A: in tune, octave 3.
    expect(centsToTarget(220, 9).targetMidi).toBe(57);
    expect(centsToTarget(220, 9).cents).toBeCloseTo(0, 6);
    // A4 against target A: the octave follows the singer.
    expect(centsToTarget(440, 9).targetMidi).toBe(69);
    // A little sharp of G4 against target G.
    const g = centsToTarget(midiToHz(67) * 2 ** (10 / 1200), 7);
    expect(g.targetMidi).toBe(67);
    expect(g.cents).toBeCloseTo(10, 5);
    // Playing A while aiming for C: three semitones below the nearest C.
    expect(Math.round(centsToTarget(440, 0).cents)).toBe(-300);
  });
  it("starts the scope on a rising zero crossing", () => {
    const buf = new Float32Array(2048).map((_, i) => Math.sin((2 * Math.PI * (i - 100)) / 200));
    const d = scopePath(buf, { width: 100, height: 100, samples: 200 });
    expect(d.startsWith("M0.0 50.0")).toBe(true);
  });

  it("reads the intonation stats as one verdict", () => {
    expect(intonationVerdict({ inTunePct: 0, steadinessPct: 100, avgDriftCents: 18 })).toEqual({
      tone: "close",
      text: "Steady, but 18 cents sharp. Tune down, then hold it again.",
    });
    expect(
      intonationVerdict({ inTunePct: 10, steadinessPct: 90, avgDriftCents: -9 }).text,
    ).toContain("9 cents flat. Tune up");
    expect(intonationVerdict({ inTunePct: 95, steadinessPct: 98, avgDriftCents: 1 }).tone).toBe(
      "good",
    );
    expect(intonationVerdict({ inTunePct: 30, steadinessPct: 40, avgDriftCents: 2 }).text).toBe(
      "The pitch wanders. Hold one even note, a little softer.",
    );
  });
});
