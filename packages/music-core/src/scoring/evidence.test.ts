import { describe, expect, it } from "vitest";
import { enough, evennessRow, timingBreakdown, timingRow, TOO_FEW } from "./evidence";

describe("timingBreakdown", () => {
  it("sorts each target by its error, null is a miss", () => {
    expect(timingBreakdown([0, -50, 70, null, 20, -30, 30, undefined], 30)).toEqual({
      onTime: 4,
      early: 1,
      late: 1,
      missed: 2,
    });
    expect(timingBreakdown([], 30)).toEqual({ onTime: 0, early: 0, late: 0, missed: 0 });
  });
});

describe("enough", () => {
  it("needs half the targets and at least four, or all of fewer than four", () => {
    expect(enough(4, 16)).toBe(false);
    expect(enough(8, 16)).toBe(true);
    expect(enough(3, 15)).toBe(false);
    expect(enough(3, 3)).toBe(true);
    expect(enough(2, 3)).toBe(false);
    expect(enough(4, 8)).toBe(true);
    expect(enough(3, 5)).toBe(false);
    expect(enough(0, 0)).toBe(false);
  });
});

describe("timingRow", () => {
  it("is Not measured with the reason when too few landed", () => {
    expect(timingRow([0, 0, 0, 0], 12, 100)).toEqual({
      label: "Timing",
      notMeasured: true,
      text: TOO_FEW,
    });
    expect(timingRow([], 0, 100, "Timing vs the click")).toMatchObject({
      label: "Timing vs the click",
      notMeasured: true,
    });
  });
  it("averages the absolute error and says how many it came from", () => {
    expect(timingRow([-20, 20, 10, 30, 20], 8, 100)).toEqual({
      label: "Timing",
      value: 0.8,
      text: "20 ms off on average, from 5 of 8",
    });
    expect(timingRow([10, -10, 10, -10], 4, 40).text).toBe("10 ms off on average");
    expect(timingRow([300, 300, 300, 300], 4, 100).value).toBe(0);
  });
  it("names the on-time window and fills only as far as the average sits inside it", () => {
    const r = timingRow([25, -25, 25, -25], 4, 150, "Timing", 15);
    expect(r.text).toBe("25 ms off on average (on time is within 15 ms)");
    expect(r.value).toBeCloseTo(0.6);
    expect(timingRow([10, -10, 10, -10], 4, 150, "Timing", 15).value).toBe(1);
    expect(timingRow([20, 20, 20, 20, 20], 8, 150, "Timing", 15).text).toBe(
      "20 ms off on average, from 5 of 8 (on time is within 15 ms)",
    );
  });
});

describe("evennessRow", () => {
  it("shares the gate", () => {
    expect(evennessRow(1, 3, 15)).toEqual({ label: "Evenness", notMeasured: true, text: TOO_FEW });
    expect(evennessRow(0.9, 12, 15)).toEqual({
      label: "Evenness",
      value: 0.9,
      text: "90%, from 12 of 15",
    });
    expect(evennessRow(0.9, 4, 4).text).toBe("90%");
  });
});
