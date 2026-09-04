import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore } from "@repo/music-core/engines/skills";
import { TechniqueSession } from "@repo/music-core/engines/technique-session";

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
  setTestUrl("/");
  document.body.replaceChildren();
});

describe("/music/play/spider/+page.svelte", () => {
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

  test("dismisses stale results while a deferred retry activation fails", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeSpider();

    runtime.audioMessage = "Preferred voice unavailable.";
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
    expect(document.body.textContent).not.toContain("Spider complete");
    expect(button("Starting...")?.disabled).toBe(true);
    // Setup is collapsed while pending; the exercise picker carries the same lock.
    expect(button("Spider")?.matches(":disabled")).toBe(true);
    expect(button("Change setup")).toBeUndefined();

    resolveVoice(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(document.body.textContent).not.toContain("Spider complete");
    expect(button("Start")?.disabled).toBe(false);
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      runtime.audioMessage,
    );
  });

  test("keeps Change setup authoritative when it races retry preflight", async () => {
    const runtime = new MusicRuntime();
    const beginPerformance = vi.mocked(runtime.beginPerformance);
    const startSpider = vi.spyOn(TechniqueSession.prototype, "startSpider");
    render(Page, { runtime });
    await completeSpider();
    beginPerformance.mockClear();
    startSpider.mockClear();

    const changeSetup = button("Change setup");
    button("Again")?.click();
    changeSetup?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(startSpider).not.toHaveBeenCalled();
    expect(button("Stop")).toBeUndefined();
    expect(button("Start")?.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Spider complete");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
  });

  test("starts from the settled tempo while excluded setup stays locked during preflight", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const startSpider = vi.spyOn(TechniqueSession.prototype, "startSpider");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());

    runtime.setPracticeVariantBpm(120, "v1:spider:guitar:ascending-1234:single");
    // Setup is collapsed while pending; the exercise picker carries the same lock.
    expect(button("Spider")?.matches(":disabled")).toBe(true);
    resolveVoice(true);

    await vi.waitFor(() => expect(startSpider).toHaveBeenCalledOnce());
    expect(startSpider).toHaveBeenCalledWith(expect.objectContaining({ startFret: 5, bpm: 120 }));
    expect(runtime.practiceBpm).toBe(120);
    expect(select("Starting fret")).toBeUndefined();
    expect(window.location.search).toContain("fret=5");
    expect(window.location.search).toContain("bpm=120");
  });

  test("completes a guitar 1-2-3-4 pattern on the fretboard", async () => {
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });

    expect(document.querySelector("h1")?.textContent).toContain("String Independence");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    button("Start")?.click();
    await vi.waitFor(() => {
      expect(button("Stop")).not.toBeUndefined();
      expect(select("Starting fret")).toBeUndefined();
      expect(document.activeElement?.textContent).toContain("Guitar string 6");
    });
    expect(runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        variantKey: "v1:spider:guitar:ascending-1234:single",
        allowedInstruments: ["guitar", "ukulele"],
      }),
    );

    for (const fret of [5, 6, 7, 8]) {
      fretButton(6, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Spider complete");
      expect(button("Again")).not.toBeUndefined();
      expect(button("Change setup")).not.toBeUndefined();
      expect(document.activeElement?.textContent).toContain("Spider complete");
    });
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Spider complete",
    );

    button("Change setup")?.click();
    await vi.waitFor(() => {
      expect(button("Start")).not.toBeUndefined();
      expect(button("Edit setup")).not.toBeUndefined();
      expect(document.activeElement?.textContent).toContain("Pattern permutations across strings");
    });
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
  });

  test("returns focus and announces when an active spider is cancelled", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(select("Starting fret")).toBeUndefined();

    button("Stop")?.click();

    await vi.waitFor(() => {
      expect(button("Start")).not.toBeUndefined();
      expect(button("Edit setup")).not.toBeUndefined();
      expect(document.activeElement?.textContent).toContain("Pattern permutations across strings");
    });
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Spider cancelled",
    );
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl(
      "/music/play/spider?instrument=ukulele&tuning=ukulele.low-g&string=4&span=adjacent-2&fret=7&bpm=100&pattern=inside-out-1324",
    );

    render(Page);

    expect(button("Ukulele")).toHaveAttribute("aria-pressed", "true");
    await openSetup();
    expect(select("Pattern")?.value).toBe("inside-out-1324");
    expect(select("Tuning")?.value).toBe("ukulele.low-g");
    expect(select("String")?.value).toBe("4");
    await openSetup();
    expect(select("String span")?.value).toBe("adjacent-2");
    expect(select("Starting fret")?.value).toBe("7");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Tempo · 100 BPM"));
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/play/spider");
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    button("Ukulele")?.click();
    await vi.waitFor(() => expect(window.location.search).toContain("instrument=ukulele"));
    await openSetup();
    select("Pattern")!.value = "outside-in-1423";
    select("Pattern")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("String")!.value = "3";
    select("String")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("String span")!.value = "adjacent-2";
    select("String span")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Starting fret")!.value = "4";
    select("Starting fret")!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(window.location.search).toContain("span=adjacent-2"));
    runtime.setPracticeVariantBpm(120, "v1:spider:ukulele:outside-in-1423:adjacent-2");

    await vi.waitFor(() => expect(window.location.search).toContain("string=3"));
    expect(window.location.search).toContain("pattern=outside-in-1423");
    expect(window.location.search).toContain("span=adjacent-2");
    expect(window.location.search).toContain("fret=4");
    expect(window.location.search).toContain("bpm=120");
  });

  test("completes note finder mode on the fretboard", async () => {
    setTestUrl("/music/play/spider?mode=note-finder");
    render(Page);

    expect(button("Note Finder")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Find A2"));
    fretButton(6, 5)?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Note found");
      expect(button("Again")).not.toBeUndefined();
    });
    expect(window.location.search).toContain("mode=note-finder");
  });

  test("completes a selected spider permutation on the fretboard", async () => {
    setTestUrl("/music/play/spider?pattern=outside-in-1423");
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    await openSetup();
    expect(select("Pattern")?.value).toBe("outside-in-1423");
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    for (const fret of [5, 8, 6, 7]) {
      fretButton(6, fret)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Spider complete"));
  });

  test("completes a multi-string spider pattern on the fretboard", async () => {
    setTestUrl("/music/play/spider?span=adjacent-2");
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    await openSetup();
    expect(select("String span")?.value).toBe("adjacent-2");
    button("Start")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("strings 6-5"));

    for (const [stringNumber, fret] of [
      [6, 5],
      [6, 6],
      [6, 7],
      [6, 8],
      [5, 5],
      [5, 6],
      [5, 7],
      [5, 8],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Spider complete"));
  });

  test("completes a string-crossing spider that alternates strings per note", async () => {
    setTestUrl("/music/play/spider?span=adjacent-2&crossing=1");
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    await openSetup();
    expect(button("Crossing")).toHaveAttribute("aria-pressed", "true");
    button("Start")?.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("crossing strings on every note"),
    );

    // Fingers 1-4 hop strings every step: 6-5-6-5, then the pass from string 5.
    for (const [stringNumber, fret] of [
      [6, 5],
      [5, 6],
      [6, 7],
      [5, 8],
      [5, 5],
      [6, 6],
      [5, 7],
      [6, 8],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Spider complete"));
  });

  test("shows microphone input controls for acoustic guitar practice", async () => {
    const audioSource = createAudioSource();
    render(Page, { audioSource, audioSupported: true });

    await vi.waitFor(() => expect(button("Start microphone")?.disabled).toBe(false));
    button("Start microphone")?.click();

    await vi.waitFor(() => {
      expect(audioSource.start).toHaveBeenCalledOnce();
      expect(button("Stop microphone")).not.toBeUndefined();
      expect(document.body.textContent).toContain("Microphone is listening");
    });
  });

  test("completes a spider pattern from microphone pitch events", async () => {
    const audioSource = createAudioSource();
    render(Page, { audioSource, audioSupported: true });

    await vi.waitFor(() => expect(button("Start microphone")?.disabled).toBe(false));
    button("Start microphone")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    for (const midiNote of [45, 46, 47, 48]) {
      audioSource.emit(audioNote(midiNote));
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Spider complete"));
  });

  test("offers a slower retry after a completed spider run", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await vi.waitFor(() => expect(window.location.search).toContain("bpm=80"));
    runtime.setPracticeVariantBpm(100, "v1:spider:guitar:ascending-1234:single");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    for (const fret of [5, 6, 7, 8]) {
      fretButton(6, fret)?.click();
    }

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(document.body.textContent).toMatch(/Tempo\s*80\s*BPM/);
    expect(select("Starting fret")).toBeUndefined();
    expect(window.location.search).toContain("bpm=80");
  });
});

// Pattern, tuning, string, span, fret and string order sit behind "Edit setup"
// on the ready stage; exercise and instrument pickers stay on the stage.
async function openSetup(): Promise<void> {
  if (!button("Hide setup")) button("Edit setup")?.click();
  await vi.waitFor(() => expect(select("Pattern")).not.toBeUndefined());
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

async function completeSpider(): Promise<void> {
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  for (const fret of [5, 6, 7, 8]) fretButton(6, fret)?.click();
  await vi.waitFor(() => expect(button("Again")).not.toBeUndefined());
}

function createAudioSource() {
  let listener: ((event: NoteOnEvent) => void) | undefined;
  let stateListener: ((state: { status: "idle" | "running" }) => void) | undefined;
  return {
    state: { status: "idle" as const },
    start: vi.fn(async function (this: { state: { status: "idle" | "running" } }) {
      this.state = { status: "running" };
      stateListener?.(this.state);
    }),
    stop: vi.fn(async function (this: { state: { status: "idle" | "running" } }) {
      this.state = { status: "idle" };
      stateListener?.(this.state);
    }),
    subscribeState: vi.fn((next: (state: { status: "idle" | "running" }) => void) => {
      stateListener = next;
      return vi.fn();
    }),
    subscribeEvents: vi.fn((next: (event: NoteOnEvent) => void) => {
      listener = next;
      return vi.fn();
    }),
    emit(event: NoteOnEvent): void {
      listener?.(event);
    },
  };
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
