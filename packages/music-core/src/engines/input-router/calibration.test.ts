import { describe, expect, test } from "vitest";

import {
  CALIBRATION_BPM,
  CALIBRATION_MIN_MATCHED,
  CALIBRATION_TAPS,
  CALIBRATION_WARMUP_TAPS,
  estimateInputOffset,
} from "./calibration";

const beatMs = 60_000 / CALIBRATION_BPM;

/** Click grid the metronome plays, on the performance.now basis. */
function clicks(count = CALIBRATION_TAPS, startMs = 1_000): number[] {
  return Array.from({ length: count }, (_, beat) => startMs + beat * beatMs);
}

/** Taps that land `biasMs` after each click, with a deterministic jitter. */
function taps(biasMs: number, jitter: readonly number[] = [0], grid = clicks()): number[] {
  return grid.map((click, index) => click + biasMs + jitter[index % jitter.length]!);
}

describe("music-core/input-router calibration", () => {
  test("recovers a +35 ms bias from a tap set and calls it late", () => {
    const estimate = estimateInputOffset(taps(35, [-4, 2, 6, -2, 0]), clicks());

    expect(estimate.accepted).toBe(true);
    expect(estimate.offsetMs).toBeGreaterThanOrEqual(30);
    expect(estimate.offsetMs).toBeLessThanOrEqual(40);
    expect(estimate.matched).toBe(CALIBRATION_TAPS - CALIBRATION_WARMUP_TAPS);
    expect(estimate.considered).toBe(CALIBRATION_TAPS - CALIBRATION_WARMUP_TAPS);
  });

  test("a replay through the applied offset leaves a residual within 10 ms", () => {
    const grid = clicks();
    const first = estimateInputOffset(taps(35, [-4, 2, 6, -2, 0], grid), grid);
    // The router subtracts the saved offset before the tap is seen again.
    const replayed = taps(35, [3, -5, 1, 4, -3], grid).map((tap) => tap - first.offsetMs);

    const residual = estimateInputOffset(replayed, grid);

    expect(Math.abs(residual.offsetMs)).toBeLessThanOrEqual(10);
  });

  test("ignores the warm-up clicks so a late start does not skew the median", () => {
    const grid = clicks();
    const late = taps(20, [0], grid);
    for (let i = 0; i < CALIBRATION_WARMUP_TAPS; i += 1) late[i]! += 120;

    expect(estimateInputOffset(late, grid).offsetMs).toBe(20);
  });

  test("rejects a set whose spread is wider than the IQR ceiling", () => {
    const estimate = estimateInputOffset(taps(10, [-90, 90, -70, 70]), clicks());

    expect(estimate.accepted).toBe(false);
    expect(estimate.iqrMs).toBeGreaterThan(30);
    expect(estimate.reason).toContain("varied");
  });

  test("rejects a set with too few taps near a click", () => {
    const grid = clicks();
    const sparse = taps(10, [0], grid).slice(0, CALIBRATION_WARMUP_TAPS + 5);

    const estimate = estimateInputOffset(sparse, grid);

    expect(estimate.accepted).toBe(false);
    expect(estimate.matched).toBe(5);
    expect(estimate.considered).toBe(CALIBRATION_TAPS - CALIBRATION_WARMUP_TAPS);
    expect(estimate.reason).toContain(`${CALIBRATION_MIN_MATCHED}`);
  });

  test("ignores a tap that is nowhere near a click", () => {
    const grid = clicks();
    const withStray = taps(10, [0], grid);
    withStray[9]! += 250;

    const estimate = estimateInputOffset(withStray, grid);

    expect(estimate.matched).toBe(CALIBRATION_TAPS - CALIBRATION_WARMUP_TAPS - 1);
    expect(estimate.offsetMs).toBe(10);
  });

  test("measures a Bluetooth-class round trip instead of blaming the player", () => {
    // 250 ms is ordinary for wireless headphones and is what calibration exists for.
    const estimate = estimateInputOffset(taps(250, [-6, 3, 0, 5]), clicks());

    expect(estimate.accepted).toBe(true);
    expect(estimate.offsetMs).toBeGreaterThanOrEqual(245);
    expect(estimate.offsetMs).toBeLessThanOrEqual(255);
  });

  test("a click can only be answered once, so a double onset is not counted twice", () => {
    const grid = clicks();
    // The detector fires twice on every attack, 15 ms apart.
    const doubled = taps(20, [0], grid).flatMap((tap) => [tap, tap + 15]);

    const estimate = estimateInputOffset(doubled, grid);

    expect(estimate.matched).toBe(CALIBRATION_TAPS - CALIBRATION_WARMUP_TAPS);
    expect(estimate.offsetMs).toBe(20);
  });

  test("reports an empty run rather than throwing", () => {
    const estimate = estimateInputOffset([], clicks());

    expect(estimate).toMatchObject({ accepted: false, matched: 0, considered: 16, offsetMs: 0 });
    expect(estimate.reason).toContain("0 of 16");
  });
});
