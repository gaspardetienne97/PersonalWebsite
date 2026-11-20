import { describe, expect, it } from "vite-plus/test";
import { analyseBend, analyseVibrato, type PitchPoint } from "./bends";

const hz = (midi: number, cents = 0) => 440 * 2 ** ((midi - 69 + cents / 100) / 12);
/** A trace at ~23 frames a second (2048 samples at 48 kHz) from cents over time. */
const trace = (ms: number, centsAt: (t: number) => number | null, base = 62): PitchPoint[] =>
  Array.from({ length: Math.round(ms / 43) }, (_, i) => {
    const c = centsAt(i * 43);
    return { at: i * 43, hz: c === null ? null : hz(base, c) };
  });

describe("bends", () => {
  it("judges where a whole-step bend settles", () => {
    // D4 picked, bent up over 200 ms, held at +195 cents for 600 ms.
    const r = analyseBend(
      trace(1000, (t) => (t < 100 ? 0 : t < 300 ? ((t - 100) / 200) * 195 : 195)),
      62,
      64,
    );
    expect(r.verdict).toBe("in-tune");
    expect(r.errorCents).toBeCloseTo(-5, 0);
    expect(r.heldMs).toBeGreaterThanOrEqual(600);
    // Held at +170: 30 cents flat is "close", 50 flat is "flat".
    expect(
      analyseBend(
        trace(1000, (t) => (t < 200 ? 0 : 172)),
        62,
        64,
      ).verdict,
    ).toBe("close");
    expect(
      analyseBend(
        trace(1000, (t) => (t < 200 ? 0 : 150)),
        62,
        64,
      ),
    ).toMatchObject({ verdict: "flat", correct: false });
    // A half-step bend that overshoots to +140.
    expect(
      analyseBend(
        trace(1000, (t) => (t < 200 ? 0 : 140)),
        62,
        63,
      ).verdict,
    ).toBe("sharp");
  });

  it("needs the bend held, and says when no pitch arrived", () => {
    // Up and straight back down: never steady for 250 ms.
    const flick = analyseBend(
      trace(1000, (t) => (t > 300 && t < 450 ? 200 : 0)),
      62,
      64,
    );
    expect(flick).toMatchObject({ verdict: "not-held", score: 0 });
    expect(
      analyseBend(
        trace(800, () => null),
        62,
        64,
      ).notMeasured,
    ).toEqual(["pitch"]);
  });
});

describe("vibrato", () => {
  it("measures rate and width, and calls a steady note none", () => {
    const v = analyseVibrato(trace(2500, (t) => 30 * Math.sin((2 * Math.PI * 5 * t) / 1000)));
    expect(v.rateHz!).toBeGreaterThan(4.5);
    expect(v.rateHz!).toBeLessThan(5.5);
    expect(v.widthCents!).toBeGreaterThan(20);
    expect(v.widthCents!).toBeLessThan(35);
    expect(v.evenness!).toBeGreaterThan(0.7);
    const flat = analyseVibrato(trace(2500, () => 0));
    expect(flat.rateHz).toBeNull();
    // Too short to say.
    expect(analyseVibrato(trace(500, (t) => 30 * Math.sin(t / 30))).rateHz).toBeNull();
  });
});
