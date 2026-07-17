import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs } from "@repo/music-core/domain";
import { ReadingSession } from "@repo/music-core/engines/reading-session";
import { scoreToPattern, SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";
import { MusicRuntime } from "../../_runtime.svelte";

beforeEach(() => {
  vi.spyOn(MusicRuntime.prototype, "ensurePlaybackVoice").mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  setTestUrl("/");
});

describe("/music/learn/reading/+page.svelte", () => {
  test.each([
    { meter: "compound", denominator: 8, engineBpm: 60 },
    { meter: "simple", denominator: 4, engineBpm: 120 },
  ])(
    "converts $meter public BPM for sight-reading scoring and preview",
    async ({ meter, denominator, engineBpm }) => {
      setTestUrl(`/music/learn/reading?activity=sight-reading&meter=${meter}&bpm=120`);
      const prepareSightReading = vi.spyOn(ReadingSession.prototype, "prepareSightReading");
      const playPattern = vi
        .spyOn(SoundEngine.prototype, "playPattern")
        .mockImplementation(() => {});
      render(Page);

      await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
      button("Start Sight-Reading")?.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));

      expect(prepareSightReading).toHaveBeenCalledWith(
        expect.objectContaining({
          bpm: engineBpm,
          timeSignature: { numerator: denominator === 8 ? 6 : 4, denominator },
        }),
      );

      const readingSession = prepareSightReading.mock.contexts[0] as ReadingSession;
      const prompt = readingSession.state.currentPrompt;
      if (!prompt || !("score" in prompt)) throw new Error("Sight-reading score not prepared");
      const expectedPattern = scoreToPattern(prompt.score, { bpm: engineBpm });

      button("Play")?.click();
      await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
      expect(playPattern).toHaveBeenCalledWith(expectedPattern.steps);
      expect(document.body.textContent).toContain("120 BPM");
      expect(window.location.search).toContain("bpm=120");
    },
  );

  test("does not start sight reading when playback activation settles after teardown", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const startSightReading = vi.spyOn(ReadingSession.prototype, "startSightReading");
    const view = render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    button("Assess")?.click();
    button("Start Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start count-in")).not.toBeUndefined());
    button("Start count-in")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());

    view.unmount();
    resolveVoice(true);
    await Promise.resolve();

    expect(beginPerformance).not.toHaveBeenCalled();
    expect(startSightReading).not.toHaveBeenCalled();
  });

  test.each([
    { meter: "simple", hydratedEngineBpm: 120, settledEngineBpm: 140 },
    { meter: "compound", hydratedEngineBpm: 60, settledEngineBpm: 70 },
  ])(
    "settles delayed hydration and retimes a visible $meter prompt without replacing its notes",
    async ({ meter, hydratedEngineBpm, settledEngineBpm }) => {
      setTestUrl(`/music/learn/reading?activity=sight-reading&meter=${meter}`);
      let resolveSettings!: (record: { id: string; value: unknown }) => void;
      const runtime = new MusicRuntime();
      const attaching = runtime.attachStorage({
        get: (id) =>
          id === "music.settings"
            ? new Promise((resolve) => {
                resolveSettings = resolve;
              })
            : Promise.resolve(undefined),
        put: async () => {},
      });
      const prepareSightReading = vi.spyOn(ReadingSession.prototype, "prepareSightReading");
      render(Page, { runtime });

      await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
      button("Start Sight-Reading")?.click();
      await Promise.resolve();
      expect(prepareSightReading).not.toHaveBeenCalled();

      const variantKey = `v1:reading:sight-reading:piano:level-1:${meter}:choice:wait`;
      resolveSettings({
        id: "music.settings",
        value: { activeInstrument: "piano", tempoByVariant: { [variantKey]: 120 } },
      });
      await attaching;
      await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
      expect(prepareSightReading).toHaveBeenCalledWith(
        expect.objectContaining({ bpm: hydratedEngineBpm }),
      );

      const readingSession = prepareSightReading.mock.contexts[0] as ReadingSession;
      const prepared = readingSession.state.currentPrompt;
      if (!prepared || !("score" in prepared)) throw new Error("Sight-reading score not prepared");
      const notes = structuredClone(prepared.score.notes);

      runtime.setPracticeVariantBpm(140, variantKey);
      await vi.waitFor(() => {
        const prompt = readingSession.state.currentPrompt;
        expect(prompt && "score" in prompt ? prompt.options.bpm : undefined).toBe(settledEngineBpm);
      });
      const retimed = readingSession.state.currentPrompt;
      if (!retimed || !("score" in retimed)) throw new Error("Sight-reading prompt disappeared");
      expect(retimed.score.notes).toEqual(notes);
      expect(retimed.score.tempoMap[0]?.bpm).toBe(settledEngineBpm);
      expect(runtime.practiceBpm).toBe(140);
      expect(document.body.textContent).toContain("140 BPM");
      expect(window.location.search).toContain("bpm=140");
    },
  );

  test("shows flashcard and sight-reading setup", async () => {
    const runtime = new MusicRuntime();
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    render(Page, { runtime });

    expect(document.querySelector("h1")?.textContent).toContain("Note Reading");
    expect(document.body.textContent).toContain("Flashcards");
    expect(document.body.textContent).toContain("Sight-Reading");
    expect(button("Enable MIDI")).not.toBeUndefined();
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Start Flashcards")?.click();
    expect(beginPerformance).not.toHaveBeenCalled();
  });

  test("starts performance sight reading only after the shared downbeat", async () => {
    const runtime = new MusicRuntime();
    let resolve!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    vi.spyOn(runtime, "beginPerformance").mockReturnValue(
      new Promise((settle) => {
        resolve = settle;
      }),
    );
    const startSightReading = vi
      .spyOn(ReadingSession.prototype, "startSightReading")
      .mockResolvedValue(undefined);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    button("Assess")?.click();
    await vi.waitFor(() => expect(button("Assess")).toHaveAttribute("aria-pressed", "true"));
    button("Start Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start count-in")).not.toBeUndefined());
    button("Start count-in")?.click();

    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(startSightReading).not.toHaveBeenCalled();
    resolve({ status: "started", downbeat: monotonicMs(1_234) });
    await vi.waitFor(() => expect(startSightReading).toHaveBeenCalledWith(1_234));
  });

  test("keeps performance setup when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Playback voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const startSightReading = vi.spyOn(ReadingSession.prototype, "startSightReading");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    button("Assess")?.click();
    await vi.waitFor(() => expect(button("Assess")).toHaveAttribute("aria-pressed", "true"));
    button("Start Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start count-in")).not.toBeUndefined());
    button("Start count-in")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Playback voice unavailable."),
    );
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(startSightReading).not.toHaveBeenCalled();
    expect(button("Start count-in")).not.toBeUndefined();
  });

  test("plays, pauses, and tears down the ready sight-reading preview locally", async () => {
    const ensurePlaybackVoice = vi
      .spyOn(MusicRuntime.prototype, "ensurePlaybackVoice")
      .mockResolvedValue(true);
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern").mockImplementation(() => {});
    const stopPattern = vi.spyOn(SoundEngine.prototype, "stopPattern").mockImplementation(() => {});
    const view = render(Page);

    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    button("Start Sight-Reading")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    stopPattern.mockClear();

    button("Play")?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalled());
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    await vi.waitFor(() => expect(button("Pause")).not.toBeUndefined());
    button("Pause")?.click();
    await vi.waitFor(() => expect(stopPattern).toHaveBeenCalled());
    expect(button("Play")).not.toBeUndefined();

    stopPattern.mockClear();
    view.unmount();
    expect(stopPattern).toHaveBeenCalled();
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl(
      "/music/learn/reading?activity=sight-reading&instrument=guitar&tuning=guitar-drop-d&answer=play&mode=performance&key=G%20major&level=level-3&difficulty=0.7&transpose=2&bpm=120&strict=strict&meter=compound&measures=4",
    );

    render(Page);

    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    expect(button("Sight-Reading")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Guitar")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Play")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Assess")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Strict")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Compound")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector<HTMLSelectElement>("#reading-key")?.value).toBe("G major");
    expect(document.querySelector<HTMLSelectElement>("#reading-level")?.value).toBe("level-3");
    expect(document.querySelector<HTMLInputElement>("#reading-difficulty")?.value).toBe("0.7");
    expect(document.querySelector<HTMLSelectElement>("#reading-transpose")?.value).toBe("2");
    expect(document.querySelector('[aria-label="Tempo"]')?.textContent).toContain("120 BPM");
    expect(document.querySelector<HTMLInputElement>("#reading-measures")?.value).toBe("4");
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/learn/reading");
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    button("Ukulele")?.click();
    button("Play")?.click();
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Tempo"]')).not.toBeNull());
    button("Assess")?.click();
    button("Strict")?.click();
    button("Compound")?.click();
    setInput(document.querySelector<HTMLInputElement>("#reading-measures")!, "3");
    setInput(document.querySelector<HTMLInputElement>("#reading-difficulty")!, "0.6");
    const levelSelect = document.querySelector<HTMLSelectElement>("#reading-level")!;
    levelSelect.value = "level-2";
    levelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const transposeSelect = document.querySelector<HTMLSelectElement>("#reading-transpose")!;
    transposeSelect.value = "-2";
    transposeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const keySelect = document.querySelector<HTMLSelectElement>("#reading-key")!;
    keySelect.value = "D minor";
    keySelect.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("activity")).toBe("sight-reading");
      expect(params.get("instrument")).toBe("ukulele");
      expect(params.get("answer")).toBe("play");
      expect(params.get("mode")).toBe("performance");
      expect(params.get("key")).toBe("D minor");
      expect(params.get("level")).toBe("level-2");
      expect(params.get("difficulty")).toBe("0.6");
      expect(params.get("transpose")).toBe("-2");
      expect(params.get("bpm")).toBe("90");
      expect(params.get("strict")).toBe("strict");
      expect(params.get("meter")).toBe("compound");
      expect(params.get("measures")).toBe("3");
    });
  });

  test("synchronizes mismatched initial and changed setup instruments through runtime", async () => {
    setTestUrl("/music/learn/reading?instrument=guitar");
    const records = new Map<string, { id: string; value: unknown }>([
      ["music.settings", { id: "music.settings", value: { activeInstrument: "piano" } }],
    ]);
    const runtime = new MusicRuntime();
    await runtime.attachStorage({
      get: async (id) => records.get(id),
      put: async (record) => records.set(record.id, record),
    });
    const register = vi.spyOn(runtime, "registerPracticeContext");

    render(Page, { runtime });

    await vi.waitFor(() => expect(runtime.activeInstrument).toBe("guitar"));
    expect(runtime.router.state.activeInstrument).toBe("guitar");
    expect(runtime.getMusicSettings()?.activeInstrument).toBe("guitar");
    expect(new URLSearchParams(window.location.search).get("instrument")).toBe("guitar");
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ variantKey: expect.stringContaining(":guitar:") }),
    );

    button("Ukulele")?.click();

    await vi.waitFor(() => expect(runtime.activeInstrument).toBe("ukulele"));
    expect(runtime.router.state.activeInstrument).toBe("ukulele");
    expect(runtime.getMusicSettings()?.activeInstrument).toBe("ukulele");
    expect(new URLSearchParams(window.location.search).get("instrument")).toBe("ukulele");
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ variantKey: expect.stringContaining(":ukulele:") }),
    );
    runtime.dispose();
  });

  test("advances piano choice and guitar play flashcards", async () => {
    const { unmount } = render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Start Flashcards")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 / 10"));
    document.querySelector<HTMLButtonElement>('[aria-label="Answer choices"] button')?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
    expect(document.body.textContent).toContain("Session XP");
    unmount();

    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Guitar")?.click();
    await vi.waitFor(() => expect(button("Standard")).not.toBeNull());
    button("Play")?.click();
    await vi.waitFor(() => expect(button("Play")?.getAttribute("aria-pressed")).toBe("true"));
    button("Start Flashcards")?.click();

    await vi.waitFor(() =>
      expect(document.querySelector<HTMLButtonElement>('[aria-label*=", target"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label*=", target"]')?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
  });

  test("persists and deletes a custom tuning across remounts", async () => {
    const first = render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Guitar")?.click();
    await vi.waitFor(() => expect(button("New custom tuning")).not.toBeNull());
    button("New custom tuning")?.click();
    await vi.waitFor(() => expect(input("Tuning name")).not.toBeNull());

    setInput(input("Tuning name")!, "Route Test Tuning");
    document.querySelector<HTMLButtonElement>('[data-testid="save-tuning"]')?.click();
    await vi.waitFor(() => expect(button("Edit Route Test Tuning")).not.toBeNull());
    first.unmount();

    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Guitar")?.click();
    await vi.waitFor(() => expect(button("Edit Route Test Tuning")).not.toBeNull());
    button("Edit Route Test Tuning")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="delete-tuning"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[data-testid="delete-tuning"]')?.click();
    await vi.waitFor(() => expect(button("Edit Route Test Tuning")).toBeUndefined());
  });

  test("completes wait-mode piano sight reading from on-screen expected notes", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    button("Learn")?.click();
    button("Start Sight-Reading")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    button("Start count-in")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Expected notes"));
    expect(document.querySelector('[data-testid="score-hand-hint"]')?.textContent).toContain(
      "Right hand",
    );
    expect(document.querySelector('[data-notation-cursor="current-group"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-active-note="true"]').length).toBeGreaterThan(0);

    for (let index = 0; index < 32 && button("Finish phrase")?.disabled; index += 1) {
      const targets = [
        ...document.querySelectorAll<HTMLButtonElement>('[data-testid="score-expected-note"]'),
      ];
      for (const target of targets) target.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Expected notes"));
    }

    button("Finish phrase")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("100% accuracy"));
    expect(button("Slow to 80 BPM")).not.toBeUndefined();
    button("Slow to 80 BPM")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("80 BPM"));
    expect(new URLSearchParams(window.location.search).get("bpm")).toBe("80");
  });

  test("starts guitar performance sight reading with timing controls", async () => {
    setTestUrl("/music/learn/reading?bpm=120");
    vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(1_000),
    });
    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Tempo"]')).not.toBeNull());
    button("Guitar")?.click();
    button("Assess")?.click();
    button("Strict")?.click();
    button("Compound")?.click();
    button("Start Sight-Reading")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    expect(document.body.textContent).toContain("Standard");
    expect(document.body.textContent).toContain("120 BPM");
    expect(document.body.textContent).toContain("Strict timing");
    expect(document.body.textContent).toContain("Level 1");

    // Opt-in fretboard reveal: hidden by default, shows the phrase as VexFlow tab.
    expect(document.querySelector('[aria-label="Guitar tab"]')).toBeNull();
    button("Show tab")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Guitar tab"] svg')).not.toBeNull(),
    );

    button("Start count-in")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Timing feedback"));
  });

  test("restarts sight reading with only missed groups from the summary", async () => {
    vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(1_000),
    });
    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    button("Assess")?.click();
    button("Start Sight-Reading")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    button("Start count-in")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Expected notes"));
    document.querySelector<HTMLButtonElement>('[data-testid="score-expected-note"]')?.click();

    await vi.waitFor(() => expect(button("Finish phrase")?.disabled).toBe(false));
    button("Finish phrase")?.click();
    await vi.waitFor(() => expect(button("Practice missed groups")).not.toBeUndefined());

    button("Practice missed groups")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    expect(document.body.textContent).toContain("Sight-reading phrase");
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function input(label: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
}

function setInput(element: HTMLInputElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
