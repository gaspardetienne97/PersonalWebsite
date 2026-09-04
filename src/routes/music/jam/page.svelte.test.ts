import { afterEach, describe, expect, test } from "vite-plus/test";
import { vi } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { setTestUrl } from "../_components/test-url";
import type { MusicRuntime } from "../_runtime.svelte";

function createRuntimeStub() {
  const subscribers = new Set<(event: unknown) => void>();
  const runtime = {
    activeSource: "screen",
    audioEnabled: true,
    audioMessage: "",
    mediaVolume: 1,
    transportBpm: 96,
    router: {
      subscribe: vi.fn((listener: (event: unknown) => void) => {
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      }),
      noteOn: vi.fn((midiNote: number, source = "midi", instrument = "piano") => {
        const event = {
          type: "noteOn",
          midiNote,
          velocity: 0.8,
          source,
          timestamp: performance.now(),
          clock: "performance",
          instrument,
        };
        for (const listener of subscribers) listener(event);
      }),
    },
    setTransportBpm: vi.fn((value: number) => {
      runtime.transportBpm = value;
    }),
    sound: {
      playChord: vi.fn(),
      playNote: vi.fn(),
      playPattern: vi.fn(),
      stopPattern: vi.fn(),
      startPatternLoop: vi.fn(),
      stopPatternLoop: vi.fn(),
    },
    enableAudio: vi.fn(async () => true),
    ensurePlaybackVoice: vi.fn(async () => true),
    writeLocalState: vi.fn(async () => undefined),
  };

  return runtime;
}

// Transpose and the drum-track select sit behind "Edit setup"; group, progression
// and backing source stay visible.
async function openSetup(): Promise<void> {
  const toggle = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "Edit setup",
  );
  toggle?.click();
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Transpose"]')).not.toBeNull());
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("/music/jam/+page.svelte", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setTestUrl("/");
  });

  test("renders the current chord, progression, and solo keyboard", () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Jam / Improv");
    expect(document.body.textContent).toContain("Now playing");
    // ii–V–I default starts on Dm7
    expect(document.body.textContent).toContain("Dm7");
    expect(document.body.textContent).toContain("Target tones");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });

  test("the chart follows the backing transport while it plays, and resets on Stop", async () => {
    const runtime = createRuntimeStub();
    const clock = { value: 10_000 };
    render(Page, {
      props: { runtime: runtime as unknown as MusicRuntime, now: () => clock.value },
    });
    const symbol = () =>
      document.querySelector('[data-testid="progression-current-symbol"]')?.textContent?.trim();
    const click = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes(label))
        ?.click();

    click("Synth chords");
    click("Play backing");
    await vi.waitFor(() => expect(runtime.sound.startPatternLoop).toHaveBeenCalled());
    expect(symbol()).toBe("Dm7");
    // Next chord is the transport's job while the backing plays.
    const nextChord = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Next chord"),
    );
    expect(nextChord?.disabled).toBe(true);

    // ii–V–I holds each chord for two bars (8 beats). At 96 BPM that is 5 s.
    clock.value += 5_100;
    await vi.waitFor(() => expect(symbol()).toBe("G7"));
    clock.value += 5_000;
    await vi.waitFor(() => expect(symbol()).toBe("Cmaj7"));

    click("Stop");
    await vi.waitFor(() => expect(symbol()).toBe("Dm7"));
  });

  test("reports chord-tone accuracy for each completed chorus", async () => {
    const runtime = createRuntimeStub();
    const clock = { value: 10_000 };
    render(Page, {
      props: { runtime: runtime as unknown as MusicRuntime, now: () => clock.value },
    });
    const click = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes(label))
        ?.click();

    click("Synth chords");
    click("Play backing");
    await vi.waitFor(() => expect(runtime.sound.startPatternLoop).toHaveBeenCalled());

    // Over Dm7: D and F are chord tones, E is a scale tone, C# is outside.
    runtime.router.noteOn(62);
    runtime.router.noteOn(65);
    runtime.router.noteOn(64);
    runtime.router.noteOn(61);

    // A full chorus of four two-bar chords at 96 BPM is 20 s.
    clock.value += 20_100;
    await vi.waitFor(() => expect(document.body.textContent).toContain("Chorus 1 · 4 notes"));
    expect(document.body.textContent).toContain("50% chord tones · 25% scale · 25% outside");
  });

  test("advances to the next chord", async () => {
    render(Page);
    const nextChord = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Next chord"),
    );
    expect(nextChord).not.toBeUndefined();
    nextChord?.click();
    // After advancing from Dm7, the V chord (G7) is now current.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.textContent).toContain("G7");
  });

  test("defaults to a bundled drum-track backing and can switch to synth chords", async () => {
    const runtime = createRuntimeStub();

    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    // Default backing is a bundled drum track.
    expect(document.body.textContent).toContain("Drum track");

    // Switch to synth chords → generated progression playback.
    const synth = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Synth chords",
    );
    synth?.click();

    const play = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Play backing"),
    );
    play?.click();

    await vi.waitFor(() =>
      expect(runtime.sound.startPatternLoop).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Number),
      ),
    );
    expect(play?.textContent).toContain("Pause backing");
    play?.click();
    await vi.waitFor(() => expect(runtime.sound.stopPatternLoop).toHaveBeenCalled());
    expect(runtime.sound.playPattern).not.toHaveBeenCalled();
  });

  test("Stop cancels deferred generated backing activation", async () => {
    const runtime = createRuntimeStub();
    const activation = deferred<boolean>();
    runtime.ensurePlaybackVoice.mockImplementation(() => activation.promise);
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Synth chords")
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Play backing"))
      ?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Stop")
      ?.click();
    activation.resolve(true);
    await vi.waitFor(() => expect(document.body.textContent).toContain("stopped"));

    expect(runtime.sound.startPatternLoop).not.toHaveBeenCalled();
  });

  test("Stop cancels deferred builtin backing activation", async () => {
    const runtime = createRuntimeStub();
    const activation = deferred<boolean>();
    runtime.enableAudio.mockImplementation(() => activation.promise);
    const mediaPlay = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Play backing"))
      ?.click();
    await vi.waitFor(() => expect(runtime.enableAudio).toHaveBeenCalledOnce());

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Stop")
      ?.click();
    activation.resolve(true);
    await vi.waitFor(() => expect(document.body.textContent).toContain("stopped"));

    expect(mediaPlay).not.toHaveBeenCalled();
  });

  test("announces chord-preview activation failure and remains idle", async () => {
    const runtime = createRuntimeStub();
    runtime.audioMessage = "Playback voice unavailable.";
    runtime.ensurePlaybackVoice.mockResolvedValue(false);
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Play chord"))
      ?.click();

    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Playback voice unavailable.",
      ),
    );
    expect(runtime.sound.playChord).not.toHaveBeenCalled();
  });

  test("restores shareable jam query config", async () => {
    setTestUrl("/music/jam?group=blues&progression=blues&backing=chords&bpm=140&transpose=2");
    const runtime = createRuntimeStub();

    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    await vi.waitFor(() => expect(runtime.setTransportBpm).toHaveBeenCalledWith(140));
    expect(document.body.textContent).toContain("12-bar blues");
    expect(document.body.textContent).toContain("D7");
    expect(document.body.textContent).toContain("Synth chords");
    await openSetup();
    expect(
      document.querySelector('[aria-label="Transpose"] button[aria-pressed="true"]')?.textContent,
    ).toContain("+2");
  });

  test("syncs jam setup changes into the URL", async () => {
    setTestUrl("/music/jam");
    const runtime = createRuntimeStub();
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });
    await openSetup();

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Modal")
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Modal vamp")
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Synth chords")
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "+2")
      ?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("group")).toBe("modal");
      expect(params.get("progression")).toBe("modal");
      expect(params.get("backing")).toBe("chords");
      expect(params.get("bpm")).toBe("84");
      expect(params.get("transpose")).toBe("2");
    });
    expect(runtime.setTransportBpm).toHaveBeenCalledWith(84);
  });

  test("records a chorus take into the shared take review panel", async () => {
    const runtime = createRuntimeStub();
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Record chorus"))
      ?.click();
    runtime.router.noteOn(60);
    runtime.router.noteOn(64);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Recording · 2"));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Stop chorus"))
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Review chorus takes"));
    expect(document.body.textContent).toContain("ii–V–I chorus 1");
    expect(document.querySelectorAll("[data-density-bucket]")).toHaveLength(16);
  });

  test("owns chorus take playback through pause, completion, replacement, delete, other playback, and teardown", async () => {
    const runtime = createRuntimeStub();
    const view = render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    const record = () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((candidate) => candidate.textContent?.includes("Record chorus"))
        ?.click();
    const stop = () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((candidate) => candidate.textContent?.includes("Stop chorus"))
        ?.click();

    record();
    runtime.router.noteOn(60);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Recording · 1"));
    stop();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play ii–V–I chorus 1"]')).not.toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Play ii–V–I chorus 1"]')?.click();
    await vi.waitFor(() => expect(runtime.sound.playPattern).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause ii–V–I chorus 1"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Pause ii–V–I chorus 1"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play ii–V–I chorus 1"]')).not.toBeNull(),
    );

    vi.useFakeTimers();
    document.querySelector<HTMLButtonElement>('[aria-label="Play ii–V–I chorus 1"]')?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('[aria-label="Pause ii–V–I chorus 1"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.querySelector('[aria-label="Play ii–V–I chorus 1"]')).not.toBeNull();
    vi.useRealTimers();

    record();
    runtime.router.noteOn(64);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Recording · 1"));
    stop();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play ii–V–I chorus 2"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Play ii–V–I chorus 2"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause ii–V–I chorus 2"]')).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>('[aria-label="Select MIDI take ii–V–I chorus 1"]')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play ii–V–I chorus 1"]')).not.toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Play ii–V–I chorus 1"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause ii–V–I chorus 1"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Delete MIDI take"]')?.click();
    await vi.waitFor(() => expect(runtime.sound.stopPattern).toHaveBeenCalled());

    document.querySelector<HTMLButtonElement>('[aria-label="Play ii–V–I chorus 2"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause ii–V–I chorus 2"]')).not.toBeNull(),
    );
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "Synth chords")
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.includes("Play backing"))
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play ii–V–I chorus 2"]')).not.toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Play ii–V–I chorus 2"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause ii–V–I chorus 2"]')).not.toBeNull(),
    );
    const stopsBeforeUnmount = runtime.sound.stopPattern.mock.calls.length;
    view.unmount();
    expect(runtime.sound.stopPattern.mock.calls.length).toBeGreaterThan(stopsBeforeUnmount);
  });

  test("announces chorus take activation failure and remains idle", async () => {
    const runtime = createRuntimeStub();
    runtime.audioMessage = "Playback voice unavailable.";
    runtime.ensurePlaybackVoice.mockResolvedValue(false);
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.includes("Record chorus"))
      ?.click();
    runtime.router.noteOn(60);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Recording · 1"));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.includes("Stop chorus"))
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play ii–V–I chorus 1"]')).not.toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Play ii–V–I chorus 1"]')?.click();

    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Playback voice unavailable.",
      ),
    );
    expect(runtime.sound.playPattern).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-label="Pause ii–V–I chorus 1"]')).toBeNull();
  });

  test("sends a recorded chorus take to the Create piano roll", async () => {
    const runtime = createRuntimeStub();
    const navigateToCreate = vi.fn();
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime, navigateToCreate } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Record chorus"))
      ?.click();
    runtime.router.noteOn(60);
    runtime.router.noteOn(64);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Recording · 2"));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Stop chorus"))
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Open in Piano Roll"));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Open in Piano Roll"))
      ?.click();

    await vi.waitFor(() => {
      expect(runtime.writeLocalState).toHaveBeenCalledWith(
        "music.piano-roll.pending-take-import",
        expect.objectContaining({
          bpm: 96,
          take: expect.objectContaining({
            name: "ii–V–I chorus 1",
            notes: [expect.objectContaining({ midi: 60 }), expect.objectContaining({ midi: 64 })],
          }),
        }),
      );
      expect(navigateToCreate).toHaveBeenCalledWith(
        "/music/create?mode=piano-roll&source=jam-chorus-take",
      );
    });
  });
});
