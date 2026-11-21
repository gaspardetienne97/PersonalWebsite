import { beforeEach, describe, expect, it } from "vite-plus/test";

import { ReaderSettings } from "./settings.svelte";

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
});
