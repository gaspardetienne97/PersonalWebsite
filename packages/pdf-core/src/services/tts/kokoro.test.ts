import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_KOKORO_QUALITY,
  DEFAULT_KOKORO_VOICE,
  KOKORO_QUALITIES,
  KOKORO_VOICES,
  bytesToMb,
  downloadTracker,
  kokoroDownloadMb,
  kokoroStatus,
  kokoroUsesGpu,
  mapAudioToPos,
  noteDownloadBytes,
  webgpuAvailable,
} from "./kokoro";

describe("KOKORO_VOICES", () => {
  it("exposes a non-empty curated list with unique ids", () => {
    expect(KOKORO_VOICES.length).toBeGreaterThan(0);
    const ids = KOKORO_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defaults to a voice that exists in the list", () => {
    expect(KOKORO_VOICES.some((v) => v.id === DEFAULT_KOKORO_VOICE)).toBe(true);
  });

  it("tags each voice with a BCP-47 language", () => {
    for (const v of KOKORO_VOICES) expect(v.lang).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
  });
});

describe("voice type", () => {
  it("reads the voice type from Kokoro's own ids", () => {
    const byId = Object.fromEntries(KOKORO_VOICES.map((v) => [v.id, v.gender]));
    expect(byId.af_heart).toBe("female");
    expect(byId.am_michael).toBe("male");
    expect(byId.bf_emma).toBe("female");
    expect(byId.bm_george).toBe("male");
  });
});

describe("downloadTracker", () => {
  const MB = 1_000_000;

  it("reports bytes and a fraction for the model file", () => {
    const track = downloadTracker();
    expect(
      track({ status: "progress", file: "model.onnx", loaded: 23 * MB, total: 92 * MB }),
    ).toEqual({ fraction: 0.25, loadedBytes: 23 * MB, totalBytes: 92 * MB });
  });

  it("ignores the small config files, so the bar never jumps to full and back", () => {
    const track = downloadTracker();
    expect(track({ status: "progress", file: "config.json", loaded: 900, total: 900 })).toBeNull();
    expect(
      track({ status: "progress", file: "model.onnx", loaded: 0, total: 92 * MB })?.fraction,
    ).toBe(0);
  });

  it("adds large files together", () => {
    const track = downloadTracker();
    track({ status: "progress", file: "a.onnx", loaded: 10 * MB, total: 10 * MB });
    expect(track({ status: "progress", file: "b.onnx", loaded: 5 * MB, total: 30 * MB })).toEqual({
      fraction: 15 / 40,
      loadedBytes: 15 * MB,
      totalBytes: 40 * MB,
    });
  });

  it("falls back to a bare percentage, and skips events that are not progress", () => {
    const track = downloadTracker();
    expect(track({ status: "progress", progress: 40 })).toEqual({ fraction: 0.4 });
    expect(track({ status: "done", file: "model.onnx" })).toBeNull();
  });
});

describe("kokoroDownloadMb and kokoroStatus", () => {
  it("sizes each preset by the model this device would download", () => {
    expect(kokoroDownloadMb("compact")).toBe(92);
    expect(kokoroDownloadMb("recommended")).toBe(webgpuAvailable() ? 326 : 92);
  });

  it("follows the loader once it reports the download's real total, so every size agrees", () => {
    noteDownloadBytes("compact", undefined);
    expect(kokoroDownloadMb("compact")).toBe(92);
    noteDownloadBytes("compact", 95_400_000);
    expect(kokoroDownloadMb("compact")).toBe(95);
    expect(bytesToMb(95_400_000)).toBe(95);
    noteDownloadBytes("compact", 92_361_116);
    expect(kokoroDownloadMb("compact")).toBe(92);
  });

  it("is idle before anything was asked for", () => {
    expect(kokoroStatus("recommended")).toBe("idle");
    expect(kokoroStatus("compact")).toBe("idle");
  });
});

describe("KOKORO_QUALITIES", () => {
  it("exposes presets with a valid default", () => {
    expect(KOKORO_QUALITIES.length).toBeGreaterThan(0);
    expect(KOKORO_QUALITIES.some((q) => q.id === DEFAULT_KOKORO_QUALITY)).toBe(true);
  });

  it("offers a CPU-only compact option", () => {
    expect(KOKORO_QUALITIES.some((q) => q.id === "compact")).toBe(true);
  });
});

describe("mapAudioToPos", () => {
  const START = 1000;
  const END = 3000;

  it("maps the start and end of audio onto the sentence span", () => {
    expect(mapAudioToPos(START, END, 0, 4)).toBe(START);
    expect(mapAudioToPos(START, END, 4, 4)).toBe(END);
  });

  it("interpolates linearly through the span", () => {
    expect(mapAudioToPos(START, END, 2, 4)).toBe(2000); // halfway
    expect(mapAudioToPos(START, END, 1, 4)).toBe(1500); // quarter
  });

  it("clamps audio time outside the duration", () => {
    expect(mapAudioToPos(START, END, -1, 4)).toBe(START);
    expect(mapAudioToPos(START, END, 99, 4)).toBe(END);
  });

  it("returns the span start for a zero or unknown duration", () => {
    expect(mapAudioToPos(START, END, 1, 0)).toBe(START);
  });
});

describe("kokoroUsesGpu", () => {
  it("is never true for the CPU-only preset, whatever the device offers", () => {
    expect(kokoroUsesGpu("compact")).toBe(false);
    expect(kokoroUsesGpu("recommended")).toBe(webgpuAvailable());
  });
});
