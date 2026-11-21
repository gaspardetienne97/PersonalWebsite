import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  ACCENT_OPTIONS,
  FONT_SIZE,
  LINE_HEIGHT,
  ReaderSettings,
  shareOfDefault,
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

describe("type settings against their defaults", () => {
  beforeEach(() => localStorage.clear());

  it("gives a size or a spacing as a share of the usual one", () => {
    expect(shareOfDefault("fontSize", 21)).toBe(1);
    expect(shareOfDefault("fontSize", 23)).toBe(1.1);
    expect(shareOfDefault("fontSize", 16)).toBe(0.76);
    expect(shareOfDefault("lineHeight", 1.8)).toBe(1);
    expect(shareOfDefault("lineHeight", 2.2)).toBe(1.22);
  });

  it("knows a changed setting from the default, and puts it back", () => {
    const settings = new ReaderSettings();
    expect(settings.isDefault("fontSize")).toBe(true);
    settings.update("fontSize", 25);
    settings.update("lineHeight", 1.5);
    expect(settings.isDefault("fontSize")).toBe(false);

    settings.reset("fontSize");
    expect(settings.fontSize).toBe(21);
    expect(settings.isDefault("fontSize")).toBe(true);
    // Only the one asked for, and the reset is saved.
    expect(settings.lineHeight).toBe(1.5);
    expect(new ReaderSettings().fontSize).toBe(21);
    expect(new ReaderSettings().lineHeight).toBe(1.5);
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
