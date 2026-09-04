import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore } from "@repo/music-core/engines/skills";

import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";
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
  document.body.replaceChildren();
  setTestUrl("/");
});

describe("/music/play/chord-perfect/+page.svelte", () => {
  test("does not install session subscriptions when services resolve after teardown", async () => {
    let resolveServices!: () => void;
    vi.spyOn(SkillGraphStore.prototype, "seed").mockReturnValue(
      new Promise((resolve) => {
        resolveServices = resolve;
      }),
    );
    vi.spyOn(AnalyticsEngine.prototype, "load").mockResolvedValue();
    vi.spyOn(ProgressEngine.prototype, "load").mockResolvedValue();
    const runtime = new MusicRuntime();
    const subscribe = vi.spyOn(runtime.router, "subscribe");
    const view = render(Page, { runtime });
    const subscriptionCount = subscribe.mock.calls.length;

    view.unmount();
    resolveServices();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(subscribe).toHaveBeenCalledTimes(subscriptionCount);
    runtime.dispose();
  });

  test("prepares capture from Start but waits for practice context before recording", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    let resolveContext!: (cleanup: () => void) => void;
    vi.spyOn(runtime, "registerPracticeContext").mockReturnValue(
      new Promise((resolve) => {
        resolveContext = resolve;
      }),
    );
    const ensurePlaybackVoice = vi.spyOn(runtime, "ensurePlaybackVoice");
    const record = vi.fn(async () => [60, 64, 67]);
    const prepareStrum = vi.fn(async () => ({ record, dispose: vi.fn() }));
    render(Page, { runtime, prepareStrum, audioSupported: true });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await Promise.resolve();
    expect(prepareStrum).toHaveBeenCalledOnce();
    expect(ensurePlaybackVoice).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();

    resolveContext(vi.fn());
    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());
  });

  test("prepares buffered capture before count-in and records on the shared downbeat", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    let resolvePrepare!: (capture: { record(): Promise<number[]>; dispose(): void }) => void;
    let resolveDownbeat!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    const record = vi.fn(async () => [60, 64, 67]);
    const dispose = vi.fn();
    const prepareStrum = vi.fn(
      () =>
        new Promise<{ record(): Promise<number[]>; dispose(): void }>((resolve) => {
          resolvePrepare = resolve;
        }),
    );
    vi.spyOn(runtime, "beginPerformance").mockReturnValue(
      new Promise((resolve) => {
        resolveDownbeat = resolve;
      }),
    );
    render(Page, { runtime, prepareStrum, audioSupported: true });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(prepareStrum).toHaveBeenCalledOnce());
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();

    resolvePrepare({ record, dispose });
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(record).not.toHaveBeenCalled();

    resolveDownbeat({ status: "started", downbeat: monotonicMs(2_000) });
    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  });

  test("releases prepared strum capture when count-in is cancelled", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "beginPerformance").mockResolvedValue({ status: "cancelled" });
    const record = vi.fn(async () => [60, 64, 67]);
    const dispose = vi.fn();
    const prepareStrum = vi.fn(async () => ({ record, dispose }));
    render(Page, { runtime, prepareStrum, audioSupported: true });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(record).not.toHaveBeenCalled();
  });

  test("does not start the clock when buffered capture permission is denied", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    const recordPractice = vi.spyOn(runtime, "recordPractice");
    const prepareStrum = vi.fn(async () => {
      throw new Error("Microphone access denied.");
    });
    render(Page, { runtime, prepareStrum, audioSupported: true });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Microphone access denied."),
    );
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(recordPractice).not.toHaveBeenCalled();
  });

  test("releases prepared strum capture when configuration is replaced during count-in", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    let resolveDownbeat!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    vi.spyOn(runtime, "beginPerformance").mockReturnValue(
      new Promise((resolve) => {
        resolveDownbeat = resolve;
      }),
    );
    const record = vi.fn(async () => [60, 64, 67]);
    const dispose = vi.fn();
    render(Page, {
      runtime,
      prepareStrum: vi.fn(async () => ({ record, dispose })),
      audioSupported: true,
    });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    const chord = select("Chord")!;
    chord.value = "guitar.g-major";
    chord.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    resolveDownbeat({ status: "started", downbeat: monotonicMs(2_000) });
    await Promise.resolve();
    expect(record).not.toHaveBeenCalled();
  });

  test("releases prepared strum capture when the route tears down during count-in", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "beginPerformance").mockReturnValue(new Promise(() => {}));
    const record = vi.fn(async () => [60, 64, 67]);
    const dispose = vi.fn();
    const view = render(Page, {
      runtime,
      prepareStrum: vi.fn(async () => ({ record, dispose })),
      audioSupported: true,
    });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    view.unmount();

    expect(dispose).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
  });

  test("does not grade or persist when strum analysis settles after teardown", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    const recordPractice = vi.spyOn(runtime, "recordPractice");
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    let resolveAnalysis!: (notes: number[]) => void;
    const analyzeStrum = vi.fn(
      () =>
        new Promise<number[]>((resolve) => {
          resolveAnalysis = resolve;
        }),
    );
    const view = render(Page, { runtime, analyzeStrum, audioSupported: true });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(analyzeStrum).toHaveBeenCalledOnce());
    view.unmount();
    const endCallsAfterUnmount = endPerformance.mock.calls.length;
    resolveAnalysis([60, 64, 67]);
    await vi.waitFor(() =>
      expect(endPerformance.mock.calls.length).toBeGreaterThan(endCallsAfterUnmount),
    );

    expect(recordPractice).not.toHaveBeenCalled();
  });

  test("does not grade a strum against replacement configuration", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    const recordPractice = vi.spyOn(runtime, "recordPractice");
    const skillIngest = vi.spyOn(SkillGraphStore.prototype, "ingest");
    const analyticsIngest = vi.spyOn(AnalyticsEngine.prototype, "ingest");
    const progressIngest = vi.spyOn(ProgressEngine.prototype, "ingest");
    let resolveAnalysis!: (notes: number[]) => void;
    const analyzeStrum = vi.fn(
      () =>
        new Promise<number[]>((resolve) => {
          resolveAnalysis = resolve;
        }),
    );
    render(Page, { runtime, analyzeStrum, audioSupported: true });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(analyzeStrum).toHaveBeenCalledOnce());
    const chord = select("Chord")!;
    chord.value = "guitar.g-major";
    chord.dispatchEvent(new Event("change", { bubbles: true }));
    resolveAnalysis([60, 64, 67]);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    expect(recordPractice).not.toHaveBeenCalled();
    expect(skillIngest).not.toHaveBeenCalled();
    expect(analyticsIngest).not.toHaveBeenCalled();
    expect(progressIngest).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Detected tones: C, E, G");
  });

  test("does not publish or persist a stale pipeline result", async () => {
    setTestUrl("/music/play/chord-perfect?mode=strum");
    const runtime = new MusicRuntime();
    const recordPractice = vi.spyOn(runtime, "recordPractice");
    let resolveProgress!: (xp: number) => void;
    vi.spyOn(ProgressEngine.prototype, "ingest").mockReturnValue(
      new Promise((resolve) => {
        resolveProgress = resolve;
      }),
    );
    render(Page, {
      runtime,
      analyzeStrum: vi.fn(async () => [60, 64, 67]),
      audioSupported: true,
    });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(ProgressEngine.prototype.ingest).toHaveBeenCalled());
    const chord = select("Chord")!;
    chord.value = "guitar.g-major";
    chord.dispatchEvent(new Event("change", { bubbles: true }));
    resolveProgress(5);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    expect(recordPractice).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Open chord ID scored");
  });

  test("keeps the engine stopped when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Preferred voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(button("Stop")).toBeUndefined();
  });

  test("separates chord-perfect workflows into one primary mode at a time", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    // Every workflow starts with one "Start"; only the verifier adds a microphone
    // start and a Reset, and only the build drill shows the Space hint.
    expect(button("Build shape")).toHaveAttribute("aria-pressed", "true");
    expect(button("Start")).not.toBeUndefined();
    expect(button("Start with microphone")).toBeUndefined();
    expect(button("Reset")).toBeUndefined();

    button("Pick strings cleanly")?.click();
    await vi.waitFor(() => {
      expect(button("Pick strings cleanly")).toHaveAttribute("aria-pressed", "true");
      expect(button("Start")).not.toBeUndefined();
      expect(button("Start with microphone")).not.toBeUndefined();
      expect(button("Reset")).not.toBeUndefined();
    });

    button("Strum and identify")?.click();
    await vi.waitFor(() => {
      expect(button("Strum and identify")).toHaveAttribute("aria-pressed", "true");
      expect(button("Start")).not.toBeUndefined();
      expect(button("Start with microphone")).toBeUndefined();
      expect(button("Reset")).toBeUndefined();
    });
  });

  test("shows suggested fingers plus open and muted strings for the selected shape", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    expect(document.body.textContent).toContain("Suggested fingering");
    expect(document.body.textContent).toContain("String 5");
    expect(document.body.textContent).toContain("Fret 3");
    expect(document.body.textContent).toContain("Finger 3");
    expect(document.body.textContent).toContain("String 3");
    expect(document.body.textContent).toContain("Open");
    expect(document.body.textContent).toContain("String 6");
    expect(document.body.textContent).toContain("Muted");
  });

  test("completes a guitar C major chord-perfect check on the fretboard", async () => {
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });

    expect(document.querySelector("h1")?.textContent).toContain("Chord-Perfect");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        variantKey: "v1:chord-perfect:guitar:build",
        allowedInstruments: ["guitar", "ukulele"],
      }),
    );

    // C major [0,1,0,2,3,x]: voiced strings sounded low → high.
    for (const [stringNumber, fret] of [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Chord-perfect check");
      expect(button("Again")).not.toBeUndefined();
    });
  });

  test("verifies target chord tones from accumulated fretboard input", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Pick strings cleanly")).not.toBeUndefined());
    button("Pick strings cleanly")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    for (const [stringNumber, fret] of [
      [5, 3],
      [4, 2],
      [3, 0],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Target complete");
      expect(document.body.textContent).toContain("100%");
    });
  });

  test("summarizes verifier progress with feedback and a compact tone map", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Pick strings cleanly")).not.toBeUndefined());
    button("Pick strings cleanly")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    fretButton(5, 3)?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Target chord tones");
      expect(document.body.textContent).toContain("1/3 tones covered");
      expect(document.body.textContent).toContain("Tone map");
      expect(document.body.textContent).toContain("C matched");
      expect(document.body.textContent).toContain("E missing");
      expect(document.body.textContent).toContain("G missing");
    });
  });

  test("verifies target chord tones from microphone pitch events", async () => {
    let audioListener: ((event: NoteOnEvent) => void) | undefined;
    const audioSource = {
      state: { status: "running" as const },
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      subscribeState: vi.fn(() => vi.fn()),
      subscribeEvents: vi.fn((listener: (event: NoteOnEvent) => void) => {
        audioListener = listener;
        return vi.fn();
      }),
    };
    render(Page, { audioSource, audioSupported: true });

    await vi.waitFor(() => expect(button("Pick strings cleanly")).not.toBeUndefined());
    button("Pick strings cleanly")?.click();
    await vi.waitFor(() => expect(button("Start with microphone")?.disabled).toBe(false));
    button("Start with microphone")?.click();

    await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledOnce());
    for (const midiNote of [60, 64, 67]) {
      audioListener?.(audioNote(midiNote));
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Target complete");
      expect(document.body.textContent).toContain("100%");
    });
  });

  test("keeps microphone verification in setup when capture errors", async () => {
    const audioSource = {
      state: { status: "error" as const, message: "Worklet setup failed." },
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      subscribeState: vi.fn(() => vi.fn()),
      subscribeEvents: vi.fn(() => vi.fn()),
    };
    const runtime = new MusicRuntime();
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    render(Page, { audioSource, audioSupported: true, runtime });

    await vi.waitFor(() => expect(button("Pick strings cleanly")).not.toBeUndefined());
    button("Pick strings cleanly")?.click();
    await vi.waitFor(() => expect(button("Start with microphone")?.disabled).toBe(false));
    button("Start with microphone")?.click();

    await vi.waitFor(() => expect(audioSource.stop).toHaveBeenCalled());
    expect(document.body.textContent).toContain("Worklet setup failed.");
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(endPerformance).toHaveBeenCalled();
    expect(button("Stop microphone")).toBeUndefined();
  });

  test("identifies a strummed chord and verifies it against the target shape", async () => {
    const analyzeStrum = vi.fn(async () => [60, 64, 67]); // C major
    render(Page, { analyzeStrum, audioSupported: true });

    await vi.waitFor(() => expect(button("Strum and identify")).not.toBeUndefined());
    button("Strum and identify")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    await vi.waitFor(() => expect(analyzeStrum).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Detected tones: C, E, G");
      expect(document.body.textContent).toContain("Tone map");
      expect(document.body.textContent).toContain("C matched");
      expect(document.body.textContent).toContain("E matched");
      expect(document.body.textContent).toContain("G matched");
      expect(document.body.textContent).toContain("100% match");
      expect(document.body.textContent).toContain("matches the target");
      expect(document.body.textContent).toContain("Open chord ID scored");
      expect(document.body.textContent).toContain("Heard C");
    });
  });

  test("restores and syncs the shareable chord-perfect setup URL", async () => {
    setTestUrl("/music/play/chord-perfect?mode=pick&instrument=ukulele&shape=ukulele.g-major");
    render(Page);

    await vi.waitFor(() => {
      expect(button("Pick strings cleanly")).toHaveAttribute("aria-pressed", "true");
      expect(button("Ukulele")).toHaveAttribute("aria-pressed", "true");
    });
    expect(select("Chord")?.value).toBe("ukulele.g-major");

    button("Strum and identify")?.click();
    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("mode")).toBe("strum");
      expect(params.get("instrument")).toBe("ukulele");
      expect(params.get("shape")).toBe("ukulele.g-major");
    });
  });

  test("restores and completes the chord-change trainer workflow", async () => {
    setTestUrl(
      "/music/play/chord-perfect?mode=changes&instrument=guitar&shape=guitar.c-major&to=guitar.g-major&reps=1",
    );
    render(Page);

    await vi.waitFor(() => {
      expect(button("Change trainer")).toHaveAttribute("aria-pressed", "true");
      expect(button("Start")?.disabled).toBe(false);
    });
    expect(select("Chord")?.value).toBe("guitar.c-major");
    expect(select("To chord")?.value).toBe("guitar.g-major");
    // The shareable reps param restores into the repetitions control.
    await openSetup();
    expect(button("1×")).toHaveAttribute("aria-pressed", "true");
    expect(document.body.textContent).toContain("C major to G major");

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    for (const [stringNumber, fret] of [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
      [6, 3],
      [5, 2],
      [4, 0],
      [3, 0],
      [2, 0],
      [1, 3],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Chord changes complete");
      expect(button("Again")).not.toBeUndefined();
    });
  });
  test("runs one-minute changes on a clock and reports changes per minute", async () => {
    setTestUrl(
      "/music/play/chord-perfect?mode=changes&instrument=guitar&shape=guitar.c-major&to=guitar.g-major&timed=1",
    );
    render(Page, { changeDurationSeconds: 1 });

    await openSetup();
    await vi.waitFor(() => {
      expect(button("One-minute")).toHaveAttribute("aria-pressed", "true");
      expect(button("Start")?.disabled).toBe(false);
    });
    // The reps selector yields to the clock in timed format.
    expect(button("1×")).toBeUndefined();

    button("Start")?.click();
    await vi.waitFor(() => {
      expect(button("Stop")).not.toBeUndefined();
      expect(document.querySelector('[data-testid="change-clock"]')?.textContent).toContain(
        "1s timed run",
      );
    });

    // One clean C-major strum inside the window.
    for (const [stringNumber, fret] of [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    // The clock, not input progress, ends the run.
    await vi.waitFor(
      () => {
        expect(document.body.textContent).toContain("clean changes/min");
        expect(button("Again")).not.toBeUndefined();
      },
      { timeout: 5_000 },
    );
  });

  test("hides setup configuration and moves Cancel into the stage during an active run", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    // Setup configuration is reachable before the run.
    expect(select("Chord")).not.toBeUndefined();
    expect(button("Build shape")).not.toBeUndefined();
    expect(button("Stop")).toBeUndefined();

    button("Start")?.click();

    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    // The stage owns the page: setup config recedes, cancel lives in the stage.
    expect(select("Chord")).toBeUndefined();
    expect(button("Build shape")).toBeUndefined();
    expect(button("Start")).toBeUndefined();
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="chord-perfect-stage-heading"]'),
    );

    button("Stop")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="chord-perfect-setup-heading"]'),
    );
  });

  test("dismisses stale results while a deferred retry activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Preferred voice unavailable.";
    render(Page, { runtime });
    await completeBuildDrill();

    let resolveVoice!: (enabled: boolean) => void;
    const ensurePlaybackVoice = vi.mocked(runtime.ensurePlaybackVoice);
    ensurePlaybackVoice.mockClear();
    ensurePlaybackVoice.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );

    button("Again")?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(button("Starting...")?.disabled).toBe(true));
    expect(document.body.textContent).not.toContain("Chord-perfect check");
    expect(document.body.textContent).toContain("Starting chord-perfect drill.");
    expect(button("Change setup")).toBeUndefined();

    resolveVoice(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(document.body.textContent).not.toContain("Chord-perfect check");
    expect(button("Start")?.disabled).toBe(false);
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      runtime.audioMessage,
    );
  });

  test("keeps Change setup authoritative when it races retry preflight", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeBuildDrill();

    const beginPerformance = vi.mocked(runtime.beginPerformance);
    beginPerformance.mockClear();
    button("Again")?.click();
    button("Change setup")?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(button("Stop")).toBeUndefined();
    expect(button("Start")?.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Chord-perfect check");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
  });

  test("returns from the summary to setup via Change setup", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    for (const [stringNumber, fret] of [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Chord-perfect check");
      expect(button("Change setup")).not.toBeUndefined();
    });
    // The consolidated summary frame replaces the setup while it is shown.
    expect(select("Chord")).toBeUndefined();
    expect(fretButton(5, 3)).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("strings clean");
    expect(document.querySelectorAll("p.sr-only[aria-live='polite']")).toHaveLength(1);
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Chord-perfect results ready",
    );

    button("Change setup")?.click();

    await vi.waitFor(() => {
      expect(select("Chord")).not.toBeUndefined();
      expect(button("Start")).not.toBeUndefined();
      expect(button("Again")).toBeUndefined();
    });
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="chord-perfect-setup-heading"]'),
    );
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
  });
});

async function completeBuildDrill(): Promise<void> {
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  for (const [stringNumber, fret] of [
    [5, 3],
    [4, 2],
    [3, 0],
    [2, 1],
    [1, 0],
  ]) {
    fretButton(stringNumber, fret)?.click();
  }
  await vi.waitFor(() => expect(button("Again")).not.toBeUndefined());
}

// Format, repetitions and MIDI sit behind "Edit setup" on the ready stage; the
// workflow, instrument and chord pickers stay on the stage.
async function openSetup(): Promise<void> {
  if (!button("Hide setup")) button("Edit setup")?.click();
  await vi.waitFor(() => expect(button("Hide setup")).not.toBeUndefined());
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function fretButton(stringNumber: number, fret: number): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(`String ${stringNumber} fret ${fret},`),
  );
}

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

function audioNote(midiNote: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "audio",
    confidence: 0.9,
    timestamp: monotonicMs(0),
    clock: "performance",
  };
}
