import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { MUSIC_RUNTIME, MusicRuntime } from "../_runtime.svelte";

describe("/music/settings/+page.svelte", () => {
  test("renders the settings sections", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Settings");
    // Groups: Audio, Input, Latency, Appearance, Your data, each a SectionHeading.
    await vi.waitFor(() => expect(document.body.textContent).toContain("Latency calibration"));
    const headings = [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim());
    expect(headings).toEqual(["Audio", "Input", "Latency calibration", "Appearance", "Your data"]);
    expect(document.querySelectorAll("[data-settings-row]").length).toBeGreaterThanOrEqual(12);
  });

  test("offers export and a confirmed reset of local data", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Your data"));
    const button = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent?.trim() === label,
      );
    expect(button("Export journal")).toBeDefined();
    expect(button("Yes, reset")).toBeUndefined();
    button("Reset local data")?.click();
    await vi.waitFor(() => expect(button("Yes, reset")).toBeDefined());
    button("Keep")?.click();
    await vi.waitFor(() => expect(button("Yes, reset")).toBeUndefined());
  });

  test("steps latency offsets by 5 ms", async () => {
    const runtime = new MusicRuntime();
    await runtime.attachStorage({
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {},
    });
    render(Page, { context: new Map([[MUSIC_RUNTIME, runtime]]) });

    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#audio-offset")).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Audio offset plus 5 ms"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#audio-offset")?.value).toBe("5"),
    );
    runtime.dispose();
  });

  test("shows playback sound selector", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Playback sound"));
    expect(document.body.textContent).toContain("Sampled Piano");
    expect(document.body.textContent).toContain("Warm Synth");
    expect(document.body.textContent).toContain("E-Piano");
  });

  test("shows runtime audio controls and sample attribution", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Enable/Test audio"));
    expect(document.body.textContent).toContain("Playback & drill sounds");
    expect(document.body.textContent).toContain("Metronome");
    expect(document.body.textContent).toContain("Master volume");
    expect(document.body.textContent).toContain("Mute all audio");
    expect(document.body.textContent).toContain("Alexander Holm");
    expect(document.body.textContent).toContain("CC BY 3.0");
  });

  test("shows and clears persistence failures from external runtime setters", async () => {
    let writes = 0;
    const runtime = new MusicRuntime();
    await runtime.attachStorage({
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {
        writes += 1;
        if (writes === 1) throw new Error("Storage full");
      },
    });
    render(Page, { context: new Map([[MUSIC_RUNTIME, runtime]]) });

    runtime.toggleMute();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Storage full"));

    runtime.toggleMute();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Storage full"));
    runtime.dispose();
  });
});
