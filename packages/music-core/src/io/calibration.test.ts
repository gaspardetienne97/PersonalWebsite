import { describe, expect, it } from "vitest";
import { estimateOffset } from "./calibration";

const beat = 60000 / 90;
const clicks = Array.from({ length: 20 }, (_, i) => 1000 + i * beat);
/** Deterministic jitter, +-8 ms, median 0 over clicks 4..19. */
const jitter = (i: number) => [0, 5, -5, 8, -8, 3, -3, 6, -6, 0][i % 10];

describe("tap-along calibration", () => {
  it("reads a +35 ms bias as 35 ms", () => {
    const taps = clicks.map((c, i) => c + 35 + jitter(i));
    expect(estimateOffset(clicks, taps)).toMatchObject({ ok: true, offsetMs: 35, answered: 16 });
  });

  it("reads a 250 ms Bluetooth round trip as 250, not as missed taps", () => {
    const taps = clicks.map((c, i) => c + 250 + jitter(i));
    const r = estimateOffset(clicks, taps);
    expect(r).toMatchObject({ ok: true, offsetMs: 250, answered: 16 });
  });

  it("ignores the first 4 clicks and accepts 14 of 16", () => {
    // Nothing during warm-up, then two scored clicks missed.
    const taps = clicks.flatMap((c, i) =>
      i < 4 || i === 9 || i === 12 ? [] : [c + 20 + (i % 2 ? 4 : -4)],
    );
    expect(estimateOffset(clicks, taps)).toMatchObject({ ok: true, offsetMs: 20, answered: 14 });
  });

  it("rejects 13 of 16 with the plain message", () => {
    const taps = clicks.flatMap((c, i) => (i === 5 || i === 9 || i === 15 ? [] : [c + 20]));
    const r = estimateOffset(clicks, taps);
    expect(r).toMatchObject({ ok: false, reason: "missed-clicks", answered: 13 });
    expect(r.ok === false && r.message).toMatch(/^Tap once on every click\./);
  });

  it("lets a flam answer only one click and drops taps outside +-200 ms of the coarse median", () => {
    // Click 10 gets a flam; click 12's only tap is 290 ms late: inside the half-beat
    // reach (333 ms) but 260 ms from the coarse median, so it is not an answer.
    const taps = clicks.flatMap((c, i) =>
      i === 10 ? [c + 30, c + 45] : i === 12 ? [c + 290] : [c + 30 + jitter(i)],
    );
    const r = estimateOffset(clicks, taps);
    expect(r).toMatchObject({ ok: true, offsetMs: 30, answered: 15 });
  });

  it("uses the exclusive IQR and rejects a spread over 30 ms", () => {
    // Diffs alternate 0 / 40: IQR (exclusive) = 40.
    const loose = clicks.map((c, i) => c + (i % 2 ? 40 : 0));
    expect(estimateOffset(clicks, loose)).toMatchObject({
      ok: false,
      reason: "too-loose",
      iqrMs: 40,
    });
    // 16 diffs 0..15 * 2 ms: lower half median 7, upper 23 -> IQR 16; median 15.
    const spread = clicks.map((c, i) => c + Math.max(0, i - 4) * 2);
    expect(estimateOffset(clicks, spread)).toMatchObject({ ok: true, offsetMs: 15, iqrMs: 16 });
  });

  it("rounds the median to whole ms and needs all 20 clicks", () => {
    const taps = clicks.map((c, i) => c + 12 + (i % 2 ? 0.6 : 0.2));
    expect(estimateOffset(clicks, taps)).toMatchObject({ ok: true, offsetMs: 12 });
    expect(estimateOffset(clicks.slice(0, 19), taps)).toMatchObject({
      ok: false,
      reason: "too-few-clicks",
    });
  });

  it("accepts an early tapper (negative offset)", () => {
    const taps = clicks.map((c, i) => c - 60 + jitter(i));
    expect(estimateOffset(clicks, taps)).toMatchObject({ ok: true, offsetMs: -60 });
  });
});
