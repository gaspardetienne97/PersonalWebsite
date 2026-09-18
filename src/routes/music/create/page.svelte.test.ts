import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { MusicRuntime } from "../_runtime.svelte";
import Page from "./+page.svelte";
import { setTestUrl } from "../_components/test-url";

beforeEach(() => setTestUrl("/music/create"));

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
    practiceBpm: 96,
    router: {
      subscribe: (listener: (typeof listeners)[number]) => {
        listeners.push(listener);
        return () => undefined;
      },
    },
    sound: {
      playNote: vi.fn(),
      stopPattern: vi.fn(),
      startPatternLoop: vi.fn(),
      stopPatternLoop: vi.fn(),
      startDrumPatternLoop: vi.fn(),
      stopDrumPatternLoop: vi.fn(),
      loadDrumKit: vi.fn(async () => undefined),
      playDrum: vi.fn(),
    },
    enableAudio: vi.fn(async () => true),
    ensurePlaybackVoice: vi.fn(async () => true),
    beginPerformance: vi.fn(async () => ({ status: "started", downbeat: 0 })),
    endPerformance: vi.fn(),
    registerPracticeContext: vi.fn(async (context) => {
      context.onBpmChange?.(96);
      return () => undefined;
    }),
    readLocalState: vi.fn(async () => undefined),
    writeLocalState: vi.fn(async () => undefined),
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
  });

  test("renders Studio as the default Create mode", () => {
    render(Page, { runtime: makeRuntime() });

    expect(document.querySelector("h1")?.textContent).toContain("Create");
    expect(button("Beat grid")).not.toBeUndefined();
    expect(button("Piano roll")).not.toBeUndefined();
    expect(button("Recorder")).toBeUndefined();
    expect(document.body.textContent).toContain("Sequencer");
    expect(document.body.textContent).toContain("Pad bank");
  });

  test("switches to the piano roll without leaving Create", async () => {
    render(Page, { runtime: makeRuntime() });

    button("Piano roll")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Multitrack note editor"));
    expect(button("Lead")).not.toBeUndefined();
    expect(document.querySelector('[aria-label="Velocity lane"]')).not.toBeNull();
  });

  test("the old recorder mode redirects to the standalone Record destination", async () => {
    setTestUrl("/music/create?mode=recorder");
    const navigate = vi.fn();
    render(Page, { runtime: makeRuntime(), navigate });

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/music/record", { replaceState: true }),
    );
  });

  test("the redirect keeps every other query param and drops only the mode", async () => {
    setTestUrl("/music/create?mode=recorder&bpm=132&take=take-3#capture");
    const navigate = vi.fn();
    render(Page, { runtime: makeRuntime(), navigate });

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    const [href, options] = navigate.mock.calls[0]!;
    expect(options).toEqual({ replaceState: true });
    const url = new URL(href as string, "http://localhost");
    expect(url.pathname).toBe("/music/record");
    expect(url.searchParams.get("bpm")).toBe("132");
    expect(url.searchParams.get("take")).toBe("take-3");
    expect(url.searchParams.has("mode")).toBe(false);
    expect(url.hash).toBe("#capture");
  });
});
