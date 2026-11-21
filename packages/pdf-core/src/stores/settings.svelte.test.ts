import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  ACCENT_OPTIONS,
  FONT_SIZE,
  LINE_HEIGHT,
  ReaderSettings,
  stepWithin,
} from "./settings.svelte";

describe("ReaderSettings", () => {
  beforeEach(() => localStorage.clear());

  it("starts a new reader on the app accent, not each document's colour", () => {
    const settings = new ReaderSettings();

    expect(settings.accentAuto).toBe(false);
    expect(settings.accentFor("#22C55E")).toBe(settings.accent);
  });

  it("leaves saved settings as they were", () => {
    localStorage.setItem(
      "narrator.settings.v2",
      JSON.stringify({ accentAuto: true, fontSize: 25 }),
    );
    const settings = new ReaderSettings();

    expect(settings.accentAuto).toBe(true);
    expect(settings.fontSize).toBe(25);
    expect(settings.accentFor("#22C55E")).toBe("#22C55E");
  });

  it("moves an accent saved before the retune to the one that took its place", () => {
    localStorage.setItem("narrator.settings.v2", JSON.stringify({ accent: "#ff0c0d" }));

    expect(ACCENT_OPTIONS).toContain(new ReaderSettings().accent);
  });

  it("keeps the reading face across visits", () => {
    new ReaderSettings().update("font", "serif");

    expect(new ReaderSettings().font).toBe("serif");
  });
});

describe("stepWithin", () => {
  it("moves one step and stops at the ends of the range", () => {
    expect(stepWithin(21, 1, FONT_SIZE)).toBe(22);
    expect(stepWithin(30, 1, FONT_SIZE)).toBe(30);
    expect(stepWithin(16, -1, FONT_SIZE)).toBe(16);
    expect(stepWithin(1.8, 1, LINE_HEIGHT)).toBe(1.9);
    expect(stepWithin(1.4, -1, LINE_HEIGHT)).toBe(1.4);
  });
});
