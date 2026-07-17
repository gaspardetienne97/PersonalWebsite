import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { scaleSemitones } from "@repo/music-core/exercises/scale-pattern";
import { monotonicMs } from "@repo/music-core/domain";

import Page from "./+page.svelte";
import { pushTestUrl, setTestUrl } from "../../_components/test-url";
import { MusicRuntime } from "../../_runtime.svelte";

beforeEach(() => {
  vi.spyOn(MusicRuntime.prototype, "ensurePlaybackVoice").mockResolvedValue(true);
  vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
    status: "started",
    downbeat: monotonicMs(1_000),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  setTestUrl("/");
  document.body.replaceChildren();
});

describe("/music/play/chord-scales/+page.svelte", () => {
  test("invalidates a pending attempt when the drill configuration changes", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const subscribe = vi.spyOn(runtime.router, "subscribe");
    render(Page, { runtime });

    button("Play it back")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());
    button("Minor ii-V-i")?.click();
    resolveVoice(true);
    await Promise.resolve();

    expect(beginPerformance).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  test("replaces previews and cancels delayed preview work on attempt start and teardown", async () => {
    const runtime = new MusicRuntime();
    let resolveFirst!: (enabled: boolean) => void;
    const ensureVoice = vi
      .spyOn(runtime, "ensurePlaybackVoice")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
    const view = render(Page, { runtime });

    button("Hear scale")?.click();
    button("Hear scale")?.click();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
    resolveFirst(true);
    await Promise.resolve();
    expect(playPattern).toHaveBeenCalledOnce();

    const stopsBeforeAttempt = stopPattern.mock.calls.length;
    button("Play it back")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(stopPattern.mock.calls.length).toBeGreaterThan(stopsBeforeAttempt);

    let resolveNavigation!: (enabled: boolean) => void;
    ensureVoice.mockImplementationOnce(
      () => new Promise((resolve) => (resolveNavigation = resolve)),
    );
    button("Hear scale")?.click();
    const stopsBeforeUnmount = stopPattern.mock.calls.length;
    view.unmount();
    resolveNavigation(true);
    await Promise.resolve();
    expect(playPattern).toHaveBeenCalledOnce();
    expect(stopPattern.mock.calls.length).toBeGreaterThan(stopsBeforeUnmount);
  });

  test("keeps the attempt stopped when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Preferred voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    render(Page, { runtime });

    button("Play it back")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Play D Dorian over Dm7");
  });

  test("renders the ii-V-I changes with each chord's go-to scale", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Chord-Scale Drill");

    const body = document.body.textContent ?? "";
    // Major ii-V-I is the default: Dm7 (Dorian), G7 (Mixolydian), Cmaj7 (Major).
    expect(body).toContain("Dm7");
    expect(body).toContain("D Dorian");
    expect(body).toContain("G Mixolydian");
    expect(body).toContain("C Major");

    expect(
      document.querySelector('[data-testid="progression-current-symbol"]')?.textContent,
    ).toContain("Dm7");
    expect(
      document.querySelector('[data-testid="progression-cell-0"]')?.getAttribute("data-state"),
    ).toBe("current");
    expect(
      document.querySelector('[data-testid="progression-cell-1"]')?.getAttribute("data-state"),
    ).toBe("next");
    expect(document.querySelectorAll('[data-tone-role="chord"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-tone-role="scale"]').length).toBeGreaterThan(0);

    const actions = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(actions).toContain("Hear scale");
    expect(actions).toContain("Play it back");
  });

  test("switching to minor changes swaps in the altered/locrian scales", async () => {
    render(Page);

    const minor = [...document.querySelectorAll('[aria-label="Changes"] button')].find(
      (button) => button.textContent?.trim() === "Minor ii-V-i",
    ) as HTMLButtonElement | undefined;
    minor?.click();
    await Promise.resolve();

    const body = document.body.textContent ?? "";
    expect(body).toContain("G Altered");
    expect(body).toContain("D Locrian");
  });

  test("restores chord-scale setup from shareable query parameters", async () => {
    pushTestUrl("/music/play/chord-scales?changes=minor");

    render(Page);

    const body = document.body.textContent ?? "";
    expect(body).toContain("Minor ii-V-i");
    expect(body).toContain("G Altered");
    expect(body).toContain("D Locrian");
  });

  test("keeps chord-scale setup changes in the shareable URL", async () => {
    render(Page);

    const minor = [...document.querySelectorAll('[aria-label="Changes"] button')].find(
      (button) => button.textContent?.trim() === "Minor ii-V-i",
    ) as HTMLButtonElement | undefined;
    minor?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("changes")).toBe("minor");
    });
  });

  test("records completed chord-scales with scoring events and run metadata", async () => {
    const harness = makeRuntime();
    render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

    const scales = [
      scaleSemitones("dorian").map((semitones) => 62 + semitones),
      scaleSemitones("mixolydian").map((semitones) => 67 + semitones),
      scaleSemitones("major").map((semitones) => 60 + semitones),
    ];

    button("Play it back")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play D Dorian"));
    expect(harness.runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(harness.runtime.registerPracticeContext).toHaveBeenCalledWith(
      expect.objectContaining({ variantKey: "v1:chord-scales:piano:major" }),
    );
    for (const [index, midi] of scales[0]!.entries()) {
      harness.emit(midi, index * 100);
    }
    await vi.waitFor(() => expect(document.body.textContent ?? "").toContain("next chord: G7"));
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-testid="progression-current-symbol"]')?.textContent,
      ).toContain("G7"),
    );
    expect(
      document.querySelector('[data-testid="progression-cell-1"]')?.getAttribute("data-state"),
    ).toBe("current");

    // Wait for each chord's UI state before playing it — a single microtask
    // isn't a real synchronization point once phase changes drive effects
    // (focus mode, stage updates).
    const symbols = ["G7", "Cmaj7"];
    for (const [scaleIndex, scale] of scales.slice(1).entries()) {
      await vi.waitFor(() =>
        expect(
          document.querySelector('[data-testid="progression-current-symbol"]')?.textContent,
        ).toContain(symbols[scaleIndex]!),
      );
      button("Play it back")?.click();
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain(
          scaleIndex === 0 ? "Play G Mixolydian" : "Play C Major",
        ),
      );
      for (const [index, midi] of scale.entries()) {
        harness.emit(midi, index * 100);
      }
    }

    await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledOnce(), {
      timeout: 5_000,
    });
    const entry = harness.runtime.recordPractice.mock.calls[0]![0];
    expect(entry.tags).toEqual(["jazz", "chord-scales"]);
    expect(entry.scoringEvents).toHaveLength(3);
    expect(entry.runs).toHaveLength(1);
    expect(entry.scoringEvents.map((event) => event.exerciseId)).toEqual([
      "jazz.chord-scale.major",
      "jazz.chord-scale.major",
      "jazz.chord-scale.major",
    ]);
    expect(entry.scoringEvents[0]).toMatchObject({
      skillIds: expect.arrayContaining(["harmony.ii-v-i", "technique.scale.dorian"]),
      partialCredit: 1,
    });
    expect(entry.runs[0]).toMatchObject({
      exerciseId: "jazz.chord-scale.major",
      targetSkillIds: expect.arrayContaining(["harmony.ii-v-i"]),
    });
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function makeRuntime() {
  let listener:
    | ((event: { type: "noteOn"; midiNote: number; velocity: number; timestamp: number }) => void)
    | undefined;
  const runtime = {
    activeSource: "onscreen",
    activeInstrument: "piano",
    audioEnabled: false,
    audioMessage: "",
    dailyRoutine: undefined,
    enableAudio: vi.fn(async () => true),
    ensurePlaybackVoice: vi.fn(async () => true),
    sound: { playNote: vi.fn(), playPattern: vi.fn(), stopPattern: vi.fn() },
    router: {
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      push: vi.fn(() => true),
    },
    recordPractice: vi.fn(async () => undefined),
    setActiveInstrument: vi.fn(),
    registerPracticeContext: vi.fn(
      async (context: Parameters<MusicRuntime["registerPracticeContext"]>[0]) => {
        context.onBpmChange?.(132);
        return vi.fn();
      },
    ),
    beginPerformance: vi.fn(async () => ({ status: "started", downbeat: monotonicMs(1_000) })),
    endPerformance: vi.fn(),
  };

  return {
    runtime,
    emit(midiNote: number, timestamp: number) {
      listener?.({ type: "noteOn", midiNote, velocity: 1, timestamp });
    },
  };
}
