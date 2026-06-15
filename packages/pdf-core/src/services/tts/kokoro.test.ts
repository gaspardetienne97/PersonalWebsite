import { describe, expect, it } from "vitest";

import { DEFAULT_KOKORO_VOICE, KOKORO_VOICES, mapAudioToPos } from "./kokoro";

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
