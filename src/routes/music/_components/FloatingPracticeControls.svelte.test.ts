import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import FloatingPracticeControls from "./FloatingPracticeControls.svelte";

const defaults = {
  instrument: "piano" as const,
  instruments: ["piano", "guitar"] as const,
  bpm: 96,
  countInBars: 1 as const,
  metronomeEnabled: true,
  metronomeRunning: false,
  performancePending: false,
  phase: "idle" as const,
  activeBeat: -1,
  beatsPerBar: 4,
};

describe("FloatingPracticeControls", () => {
  test("shows pinned and phase-locked state while leaving the metronome toggle available", async () => {
    const onToggleMetronome = vi.fn();
    const view = render(FloatingPracticeControls, {
      ...defaults,
      instrumentPinned: true,
      onToggleMetronome,
    });

    const instrument = document.querySelector<HTMLButtonElement>(
      '[data-practice-control="instrument"]',
    );
    const metronome = document.querySelector<HTMLButtonElement>(
      '[data-practice-control="metronome"]',
    );
    expect(instrument?.getAttribute("aria-disabled")).toBe("true");
    expect(instrument?.getAttribute("aria-label")).toContain("pinned");
    expect(metronome?.getAttribute("aria-pressed")).toBe("false");

    await view.rerender({
      ...defaults,
      instrumentPinned: true,
      phase: "running",
      metronomeRunning: true,
      onToggleMetronome,
    });

    expect(
      document.querySelector('[data-practice-control="instrument"]')?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      document.querySelector('[data-practice-control="bpm"]')?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      document.querySelector('[data-practice-control="count-in"]')?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(metronome?.getAttribute("aria-disabled")).toBeNull();
    metronome?.click();
    expect(onToggleMetronome).toHaveBeenCalledOnce();
  });

  test("closes an open BPM popover and returns focus when a run locks controls", async () => {
    const view = render(FloatingPracticeControls, defaults);
    const bpm = document.querySelector<HTMLButtonElement>('[data-practice-control="bpm"]');
    bpm?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Common tempos"));

    await view.rerender({ ...defaults, phase: "count-in" });

    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Common tempos"));
    expect(document.activeElement).toBe(bpm);
  });

  test("locks mutable controls during a pending start and leaves metronome available", async () => {
    const onToggleMetronome = vi.fn();
    const view = render(FloatingPracticeControls, {
      ...defaults,
      performancePending: true,
      onToggleMetronome,
    });

    for (const control of ["instrument", "bpm", "count-in"]) {
      expect(
        document
          .querySelector(`[data-practice-control="${control}"]`)
          ?.getAttribute("aria-disabled"),
      ).toBe("true");
    }
    const metronome = document.querySelector<HTMLButtonElement>(
      '[data-practice-control="metronome"]',
    );
    metronome?.click();
    expect(onToggleMetronome).toHaveBeenCalledOnce();

    await view.rerender({ ...defaults, onToggleMetronome });
    expect(
      document.querySelector('[data-practice-control="bpm"]')?.getAttribute("aria-disabled"),
    ).toBe("false");
  });

  test("keeps all four compact controls named for assistive technology", () => {
    render(FloatingPracticeControls, defaults);

    expect(
      document.querySelector('[data-practice-control="instrument"]')?.getAttribute("aria-label"),
    ).toBe("Practice instrument: Piano");
    expect(
      document.querySelector('[data-practice-control="metronome"]')?.getAttribute("aria-label"),
    ).toBe("Turn metronome on");
    expect(
      document.querySelector('[data-practice-control="bpm"]')?.getAttribute("aria-label"),
    ).toBe("Tempo: 96 BPM");
    expect(
      document.querySelector('[data-practice-control="count-in"]')?.getAttribute("aria-label"),
    ).toBe("Count in: 1 bar");
  });

  test("names idle audible state and active-run preference independently", async () => {
    const view = render(FloatingPracticeControls, defaults);
    const metronome = document.querySelector('[data-practice-control="metronome"]');

    expect(metronome?.getAttribute("aria-pressed")).toBe("false");
    expect(metronome?.getAttribute("aria-label")).toBe("Turn metronome on");

    await view.rerender({ ...defaults, metronomeRunning: true });
    expect(metronome?.getAttribute("aria-pressed")).toBe("true");
    expect(metronome?.getAttribute("aria-label")).toBe("Turn metronome off");

    await view.rerender({
      ...defaults,
      metronomeEnabled: false,
      metronomeRunning: true,
      phase: "count-in",
    });
    expect(metronome?.getAttribute("aria-pressed")).toBe("false");
    expect(metronome?.getAttribute("aria-label")).toBe("Turn metronome on");
  });
});
