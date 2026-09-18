import { describe, expect, test } from "vitest";

import { accuracyTone, intensityStep, masteryTone, timingVerdict, timingZone } from "./index";

describe("masteryTone", () => {
  test("buckets low/mid/high mastery into error/warn/success", () => {
    expect(masteryTone(0)).toBe("error");
    expect(masteryTone(33)).toBe("error");
    expect(masteryTone(34)).toBe("warn");
    expect(masteryTone(66)).toBe("warn");
    expect(masteryTone(67)).toBe("success");
    expect(masteryTone(100)).toBe("success");
  });

  test("clamps out-of-range input", () => {
    expect(masteryTone(-20)).toBe("error");
    expect(masteryTone(250)).toBe("success");
  });
});

describe("accuracyTone", () => {
  test("maps a 0–1 ratio onto the mastery tones", () => {
    expect(accuracyTone(0.2)).toBe("error");
    expect(accuracyTone(0.5)).toBe("warn");
    expect(accuracyTone(0.9)).toBe("success");
  });
});

describe("timingZone", () => {
  test("classifies behind / pocket / ahead", () => {
    expect(timingZone(-40)).toBe("behind");
    expect(timingZone(0)).toBe("pocket");
    expect(timingZone(40)).toBe("ahead");
  });

  test("respects the pocket width at the boundary", () => {
    expect(timingZone(15)).toBe("pocket");
    expect(timingZone(16)).toBe("ahead");
    expect(timingZone(-15)).toBe("pocket");
    expect(timingZone(-16)).toBe("behind");
    expect(timingZone(8, 5)).toBe("ahead");
  });
});

describe("timingVerdict", () => {
  test("calls a positive error late, because errorMs is hit minus expected", () => {
    expect(timingVerdict(40)).toBe("late");
    expect(timingVerdict(0)).toBe("pocket");
    expect(timingVerdict(-40)).toBe("early");
  });

  test("respects the pocket width at the boundary", () => {
    expect(timingVerdict(15)).toBe("pocket");
    expect(timingVerdict(16)).toBe("late");
    expect(timingVerdict(-16)).toBe("early");
    expect(timingVerdict(8, 5)).toBe("late");
  });
});

describe("intensityStep", () => {
  test("returns 0 for empty data", () => {
    expect(intensityStep(0, 10)).toBe(0);
    expect(intensityStep(5, 0)).toBe(0);
  });

  test("buckets 1..steps by ratio to max", () => {
    expect(intensityStep(1, 8, 4)).toBe(1);
    expect(intensityStep(4, 8, 4)).toBe(2);
    expect(intensityStep(8, 8, 4)).toBe(4);
  });

  test("never drops a present value below step 1", () => {
    expect(intensityStep(1, 1000, 4)).toBe(1);
  });
});
