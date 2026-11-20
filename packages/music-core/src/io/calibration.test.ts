import { describe, expect, it } from "vite-plus/test";
import {
  deviceInput,
  estimateOffset,
  isCalibrated,
  lookupOffset,
  migrateOffsets,
  outputKeys,
  routerOffsets,
} from "./calibration";

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

describe("offsets per input and output pair", () => {
  const speakers = outputKeys({ latencyMs: 12 });
  const bluetooth = outputKeys({ latencyMs: 180 });
  const none = { audioMs: 0, midiMs: 0, deviceMs: {} };

  it("names an output by sink, then device label, then latency class", () => {
    expect(speakers).toEqual(["out:direct"]);
    expect(bluetooth).toEqual(["out:delayed"]);
    expect(outputKeys({ latencyMs: null })).toEqual(["out:default"]);
    expect(
      outputKeys({ sinkId: "s1", device: "Default - Kitchen speaker", latencyMs: 12 }),
    ).toEqual(["sink:s1", "dev:Kitchen speaker", "out:direct"]);
  });

  it("finds an offset only on the output it was measured on", () => {
    const map = { "midi:keys|out:direct": 25 };
    expect(lookupOffset(map, deviceInput("keys"), speakers)).toBe(25);
    expect(lookupOffset(map, deviceInput("keys"), bluetooth)).toBeUndefined();
    expect(isCalibrated(map, deviceInput("keys"), bluetooth)).toBe(false);
    expect(routerOffsets(map, none, bluetooth)).toEqual(none);
    expect(routerOffsets(map, none, speakers).deviceMs).toEqual({ keys: 25 });
  });

  it("prefers the named device over the latency class, and falls back to the class", () => {
    const map = { "audio|out:direct": 40, "audio|dev:g1": 55 };
    expect(lookupOffset(map, "audio", outputKeys({ device: "g1", latencyMs: 12 }))).toBe(55);
    expect(lookupOffset(map, "audio", outputKeys({ device: "g2", latencyMs: 12 }))).toBe(40);
  });

  it("counts a device as calibrated through the all-devices pair, and a saved zero as calibrated", () => {
    const map = { "midi|out:direct": 0 };
    expect(isCalibrated(map, deviceInput("keys"), speakers)).toBe(true);
    expect(isCalibrated(map, "audio", speakers)).toBe(false);
    expect(isCalibrated({}, deviceInput("keys"), speakers)).toBe(false);
  });

  it("migrates saved offsets to the current output and nowhere else", () => {
    const legacy = { audioMs: 40, midiMs: 0, deviceMs: { keys: 25, pads: -10 } };
    const map = migrateOffsets({}, legacy, speakers);
    expect(map).toEqual({
      "audio|out:direct": 40,
      "midi:keys|out:direct": 25,
      "midi:pads|out:direct": -10,
    });
    // Same timing as before on this output, with the old fields cleared.
    expect(routerOffsets(map, none, speakers)).toEqual(routerOffsets({}, legacy, speakers));
    expect(routerOffsets(map, none, bluetooth)).toEqual(none);
    expect(isCalibrated(map, "midi", speakers)).toBe(false);
  });

  it("keeps a pair already saved, moves nothing before the output is known, and is repeatable", () => {
    const legacy = { audioMs: 40, midiMs: 15, deviceMs: {} };
    expect(migrateOffsets({ "audio|out:direct": 30 }, legacy, speakers)).toEqual({
      "audio|out:direct": 30,
      "midi|out:direct": 15,
    });
    expect(migrateOffsets({}, legacy, [])).toEqual({});
    const once = migrateOffsets({}, legacy, speakers);
    expect(migrateOffsets(once, legacy, speakers)).toEqual(once);
  });

  it("applies saved offsets as before until they are migrated", () => {
    const legacy = { audioMs: 40, midiMs: 15, deviceMs: { keys: 25 } };
    expect(routerOffsets({}, legacy, [])).toEqual(legacy);
  });
});
