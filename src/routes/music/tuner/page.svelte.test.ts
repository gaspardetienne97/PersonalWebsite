import { describe, expect, test, vi } from "vite-plus/test";
import { tick } from "svelte";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { setTestUrl } from "../_components/test-url";

type AudioModule = typeof import("@repo/music-core/engines/audio-in");

/** A stand-in mic source, so a test can post frames the way the worklet does. */
const audio = vi.hoisted(() => ({
  states: new Set<(state: { status: string }) => void>(),
  events: new Set<
    (event: { type: string; frequencyHz: number; confidence: number; timestamp: number }) => void
  >(),
}));

vi.mock("@repo/music-core/engines/audio-in", async (importOriginal) => {
  const actual = await importOriginal<AudioModule>();
  class FakeAudioPitchSource {
    static supported = true;
    subscribeState(listener: (state: { status: string }) => void) {
      audio.states.add(listener);
      listener({ status: "idle" });
      return () => audio.states.delete(listener);
    }
    subscribeEvents(listener: (event: never) => void) {
      audio.events.add(listener);
      return () => audio.events.delete(listener);
    }
    subscribe() {
      return () => {};
    }
    subscribeOnsets() {
      return () => {};
    }
    async start() {}
    async stop() {}
  }
  return { ...actual, AudioPitchSource: FakeAudioPitchSource };
});

function emitState(status: string): void {
  for (const listener of audio.states) listener({ status });
}

function emitNote(frequencyHz: number, timestamp = 0): void {
  for (const listener of audio.events)
    listener({ type: "noteOn", frequencyHz, confidence: 0.95, timestamp });
}

const bigNote = () => document.querySelector("span.font-display")?.textContent?.trim() ?? "";

describe("/music/tuner/+page.svelte", () => {
  test("consolidates tuning, intonation, and drone controls into one tool", async () => {
    setTestUrl("/music/tuner");
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Tuner");
    expect(document.body.textContent).toContain("Tune");
    expect(document.body.textContent).toContain("Intonation");
    expect(document.body.textContent).toContain("Drone");

    const intonation = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Intonation",
    );
    intonation?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Hold the pitch"));
    expect(new URLSearchParams(window.location.search).get("mode")).toBe("intonation");
    expect(document.body.textContent).toContain("Scale in tune");
    expect(document.body.textContent).toContain("Pitch trace");

    const drone = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Drone",
    );
    drone?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play drone"));
    expect(document.body.textContent).toContain("Timbre");
    // Drone has no microphone controls and no reference row; A4 lives under Tune.
    expect(document.body.textContent).not.toContain("Reference A4");
    expect(document.body.textContent).not.toContain("Start mic");
    expect(document.querySelectorAll('[aria-label="Drone tonic"] button')).toHaveLength(12);
  });

  test("shows the arc gauge and the reference row in Tune", async () => {
    setTestUrl("/music/tuner?mode=tune");
    render(Page);
    expect(document.querySelector('[data-testid="arc-gauge"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Reference A4");
    expect(document.body.textContent).toContain("Pluck or play a note");
  });

  test("drops a stale reading instead of holding the last note forever", async () => {
    vi.useFakeTimers();
    try {
      setTestUrl("/music/tuner?mode=tune");
      render(Page);
      emitState("running");
      emitNote(110);
      await tick();

      expect(bigNote()).toBe("A2");
      expect(document.querySelector('[data-testid="tuner-direction"]')).not.toBeNull();

      // Frames keep arriving but none is accepted: the readout must go idle.
      await vi.advanceTimersByTimeAsync(1600);
      await tick();

      expect(bigNote()).toBe("–");
      expect(document.querySelector('[data-testid="tuner-direction"]')).toBeNull();
      expect(document.body.textContent).toContain("Listening...");
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps the reading alive while frames are still accepted", async () => {
    vi.useFakeTimers();
    try {
      setTestUrl("/music/tuner?mode=tune");
      render(Page);
      emitState("running");
      emitNote(110);
      await vi.advanceTimersByTimeAsync(1000);
      emitNote(110);
      await vi.advanceTimersByTimeAsync(1000);
      await tick();

      expect(bigNote()).toBe("A2");
    } finally {
      vi.useRealTimers();
    }
  });

  test("drops a stale intonation reading too", async () => {
    vi.useFakeTimers();
    try {
      setTestUrl("/music/tuner?mode=intonation");
      render(Page);
      emitState("running");
      emitNote(440);
      await tick();

      expect(bigNote()).toBe("A");

      await vi.advanceTimersByTimeAsync(1600);
      await tick();

      expect(bigNote()).toBe("–");
      expect(document.body.textContent).toContain("Listening...");
    } finally {
      vi.useRealTimers();
    }
  });

  test("leaves no timer running when the tool changes or the page goes away", async () => {
    vi.useFakeTimers();
    try {
      setTestUrl("/music/tuner?mode=tune");
      const screen = render(Page);
      emitState("running");
      emitNote(110);
      await tick();
      expect(vi.getTimerCount()).toBe(1);

      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.trim() === "Drone")
        ?.click();
      await tick();
      expect(vi.getTimerCount()).toBe(0);

      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.trim() === "Tune")
        ?.click();
      await tick();
      emitNote(110);
      await tick();
      expect(vi.getTimerCount()).toBe(1);

      screen.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("opens the mode named in the URL", async () => {
    setTestUrl("/music/tuner?mode=drone");
    render(Page);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play drone"));
  });
});
