import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { MusicRuntime } from "../../_runtime.svelte";
import Page from "./TranscribeView.svelte";

describe("/music/transcribe/+page.svelte", () => {
  test("announces playback failures through a live region", async () => {
    const runtime = {
      activeInstrument: "piano",
      audioMessage: "Transcription audio unavailable.",
      router: { subscribe: vi.fn(() => vi.fn()), push: vi.fn() },
      sound: { playPattern: vi.fn(), stopPattern: vi.fn() },
      ensurePlaybackVoice: vi.fn(async () => false),
    } as unknown as MusicRuntime;
    render(Page, { runtime });
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Build transcription"))
      ?.click();
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLButtonElement>("button")].some(
          (button) => button.textContent?.trim() === "Play",
        ),
      ).toBe(true),
    );
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Play")
      ?.click();

    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll('[role="status"][aria-live="polite"]')].some((region) =>
          region.textContent?.includes("Transcription audio unavailable."),
        ),
      ).toBe(true),
    );
  });

  test("builds and saves a manual transcription score", async () => {
    const saveScore = vi.fn(async () => ({
      id: "song-transcription",
      title: "Voice memo",
    }));
    render(Page, { library: { saveScore } });

    expect(document.querySelector("h2")?.textContent).toContain("Transcription Trainer");
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "C4 0 1\nE4 1 1";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const build = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Build transcription"),
    );
    build?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 notes"));
    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Save to repertoire"),
    );
    save?.click();

    await vi.waitFor(() => expect(saveScore).toHaveBeenCalledOnce());
    expect(saveScore).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "audio-transcription" }),
    );
  });

  test("runs an injected audio extractor and converts its notes to a score", async () => {
    const extractor = vi.fn(async () => [
      { midiNote: 60, startSec: 0, durationSec: 0.5, confidence: 0.8 },
      { midiNote: 64, startSec: 0.5, durationSec: 0.5, confidence: 0.7 },
    ]);
    render(Page, { extractor });

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Audio file"]')!;
    Object.defineProperty(input, "files", {
      value: [new File(["audio"], "memo.wav", { type: "audio/wav" })],
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("Attached memo.wav"));
    const extract = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Extract notes"),
    );
    extract?.click();

    await vi.waitFor(() => expect(extractor).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.body.textContent).toContain("Extracted 2 notes"));
  });

  test("can use a saved Practice Lab audio take as the transcription source", async () => {
    const runtime = {
      activeInstrument: "piano",
      router: {
        subscribe: vi.fn(() => vi.fn()),
        push: vi.fn(),
      },
      sound: {
        playPattern: vi.fn(),
        stopPattern: vi.fn(),
      },
      enableAudio: vi.fn(async () => true),
      ensurePlaybackVoice: vi.fn(async () => true),
      media: {
        listTakes: vi.fn(async () => [
          {
            id: "audio-take-1",
            name: "Practice Lab dry take",
            mimeType: "audio/webm",
            size: 2048,
            durationMs: 12_000,
            createdAt: Date.now(),
            instrument: "piano",
            backingOffsetMs: 0,
          },
        ]),
        takeBlob: vi.fn(async () => new Blob(["audio"], { type: "audio/webm" })),
      },
    } as unknown as MusicRuntime;

    render(Page, { runtime });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice Lab dry take"));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Use as source"))
      ?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Attached Practice Lab dry take.webm"),
    );
  });

  test("practices the generated transcription with score-following input", async () => {
    render(Page);

    const build = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Build transcription"),
    );
    build?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice transcription"));
    const start = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Start trainer"),
    );
    start?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Expected C4"));
    document.querySelector<HTMLButtonElement>("button[data-note='C4']")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Expected E4"));
    document.querySelector<HTMLButtonElement>("button[data-note='E4']")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Expected G4"));
    document.querySelector<HTMLButtonElement>("button[data-note='G4']")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Trainer complete"));
    expect(document.body.textContent).toContain("100%");
  });

  test("plays and pauses the generated transcription locally", async () => {
    const runtime = {
      activeInstrument: "piano",
      router: {
        subscribe: vi.fn(() => vi.fn()),
        push: vi.fn(),
      },
      sound: {
        playPattern: vi.fn(),
        stopPattern: vi.fn(),
      },
      enableAudio: vi.fn(async () => true),
      ensurePlaybackVoice: vi.fn(async () => true),
    } as unknown as MusicRuntime;
    render(Page, { runtime });

    const build = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Build transcription"),
    );
    build?.click();

    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLButtonElement>("button")].some(
          (button) => button.textContent?.trim() === "Play",
        ),
      ).toBe(true),
    );
    const preview = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Play",
    );
    preview?.click();

    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalled());
    expect(runtime.sound.playPattern).toHaveBeenCalledWith(expect.any(Array));
    await vi.waitFor(() => expect(preview?.textContent).toContain("Pause"));
    preview?.click();
    await vi.waitFor(() => expect(runtime.sound.stopPattern).toHaveBeenCalled());
    expect(preview?.textContent).toContain("Play");
  });

  test("cancels a pending preview on teardown", async () => {
    let resolveVoice!: (enabled: boolean) => void;
    const ensurePlaybackVoice = vi.fn(
      () => new Promise<boolean>((resolve) => (resolveVoice = resolve)),
    );
    const runtime = {
      activeInstrument: "piano",
      audioMessage: "Audio unavailable.",
      router: { subscribe: vi.fn(() => vi.fn()), push: vi.fn() },
      sound: { playPattern: vi.fn(), stopPattern: vi.fn() },
      ensurePlaybackVoice,
    } as unknown as MusicRuntime;
    const view = render(Page, { runtime });
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Build transcription"))
      ?.click();
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLButtonElement>("button")].some(
          (button) => button.textContent?.trim() === "Play",
        ),
      ).toBe(true),
    );
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Play")
      ?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalled());

    view.unmount();
    resolveVoice(true);
    await Promise.resolve();
    expect(runtime.sound.playPattern).not.toHaveBeenCalled();
    expect(runtime.sound.stopPattern).toHaveBeenCalled();
  });
});
