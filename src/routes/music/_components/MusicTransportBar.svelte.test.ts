import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import MusicTransportBar from "./MusicTransportBar.svelte";

describe("MusicTransportBar", () => {
  test("shows tempo and a play control", () => {
    render(MusicTransportBar, { bpm: 120 });
    expect(document.body.textContent).toContain("120");
    expect(document.body.textContent).toContain("Tempo");
    expect(document.querySelector('[aria-label="Play metronome"]')).not.toBeNull();
  });

  test("toggles play and reflects running state", () => {
    let toggled = 0;
    render(MusicTransportBar, { bpm: 96, running: true, onToggle: () => (toggled += 1) });
    const stop = document.querySelector<HTMLButtonElement>('[aria-label="Pause metronome"]');
    expect(stop).not.toBeNull();
    stop?.click();
    expect(toggled).toBe(1);
  });

  test("offers enable audio until audio is enabled", () => {
    render(MusicTransportBar, { bpm: 96, audioEnabled: false });
    expect(document.body.textContent).toContain("Enable audio");
  });

  test("selects a count-in length", () => {
    let bars = -1;
    render(MusicTransportBar, {
      bpm: 96,
      countInBars: 1,
      onCountIn: (value: number) => (bars = value),
    });
    const group = document.querySelector('[role="group"][aria-label="Count in"]');
    expect(group).not.toBeNull();
    const off = [...(group?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.textContent?.trim() === "Off",
    );
    off?.click();
    expect(bars).toBe(0);
  });

  test("toggles master mute", () => {
    let muteCalls = 0;
    render(MusicTransportBar, { bpm: 96, muted: false, onToggleMute: () => (muteCalls += 1) });
    const mute = document.querySelector<HTMLButtonElement>('[aria-label="Mute audio"]');
    expect(mute).not.toBeNull();
    mute?.click();
    expect(muteCalls).toBe(1);
  });
});
