import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { MusicRuntime } from "../_runtime.svelte";
import Page from "./+page.svelte";
import { setTestUrl } from "../_components/test-url";

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function makeRuntime(): MusicRuntime {
  const listeners: Array<(event: { type: string; midiNote: number; velocity: number }) => void> =
    [];
  return {
    activeInstrument: "piano",
    activeSource: "onscreen",
    audioEnabled: true,
    transportBpm: 96,
    router: {
      subscribe: (listener: (typeof listeners)[number]) => {
        listeners.push(listener);
        return () => undefined;
      },
    },
    sound: {
      playNote: vi.fn(),
      startPatternLoop: vi.fn(),
      stopPatternLoop: vi.fn(),
      startDrumPatternLoop: vi.fn(),
      stopDrumPatternLoop: vi.fn(),
      loadDrumKit: vi.fn(async () => undefined),
      playDrum: vi.fn(),
    },
    enableAudio: vi.fn(async () => true),
    readLocalState: vi.fn(async () => undefined),
    writeLocalState: vi.fn(async () => undefined),
    setPlaybackSource: vi.fn(),
    surfaceFor: vi.fn(() => "piano"),
    setInputSurface: vi.fn(async () => undefined),
    setActiveInstrument: vi.fn(),
  } as unknown as MusicRuntime;
}

describe("/music/create/+page.svelte", () => {
  test("syncs Create mode changes into the URL without dropping import params", async () => {
    setTestUrl("/music/create?source=practice-lab-take#compose");
    render(Page, { runtime: makeRuntime() });

    button("Piano roll")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Multitrack note editor"));

    expect(window.location.pathname).toBe("/music/create");
    expect(window.location.search).toBe("?source=practice-lab-take&mode=piano-roll");
    expect(window.location.hash).toBe("#compose");

    button("Recorder")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Record any take"));

    expect(window.location.search).toBe("?source=practice-lab-take&mode=recorder");
  });

  test("renders Studio as the default Create mode", () => {
    render(Page, { runtime: makeRuntime() });

    expect(document.querySelector("h1")?.textContent).toContain("Create");
    expect(button("Beat grid")).not.toBeUndefined();
    expect(button("Piano roll")).not.toBeUndefined();
    expect(button("Recorder")).not.toBeUndefined();
    expect(document.body.textContent).toContain("Sequencer");
    expect(document.body.textContent).toContain("Pad bank");
  });

  test("switches between piano-roll and recorder modes without leaving Create", async () => {
    render(Page, { runtime: makeRuntime() });

    button("Piano roll")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Multitrack note editor"));
    expect(button("Lead")).not.toBeUndefined();
    expect(document.querySelector('[aria-label="Velocity lane"]')).not.toBeNull();

    button("Recorder")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Record any take"));
    expect(document.body.textContent).toContain("Compare takes");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });
});
