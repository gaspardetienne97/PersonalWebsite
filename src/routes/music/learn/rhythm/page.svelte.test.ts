import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { RhythmSession } from "@repo/music-core/engines/rhythm-session";

import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";
import { MusicRuntime } from "../../_runtime.svelte";

beforeEach(() => {
  vi.spyOn(MusicRuntime.prototype, "ensurePlaybackVoice").mockResolvedValue(true);
  vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
    status: "started",
    downbeat: monotonicMs(0),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  setTestUrl("/");
  document.body.replaceChildren();
});

describe("/music/learn/rhythm/+page.svelte", () => {
  test("recommends repeating a poor run before increasing tempo", async () => {
    setTestUrl("/music/learn/rhythm?beats=2");
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")!.click();
    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    button("Tap beat")!.click();
    button("Tap beat")!.click();
    await vi.waitFor(() => expect(button("Repeat at 100 BPM")).not.toBeUndefined());
    expect(button("Repeat at 100 BPM")?.className).toContain("bg-primary");
    expect(button("Increase to 110 BPM")?.className).not.toContain("bg-primary");
  });
  test("shows pulse setup with MIDI, microphone, and shared tempo readout", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Rhythm Trainer");
    expect(button("Enable MIDI")).not.toBeUndefined();
    expect(button("Start microphone")).not.toBeUndefined();
    expect(bpmReadout()?.textContent).toContain("100 BPM");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  });

  test("starts a pulse run and accepts on-screen taps", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    expect(button("Start")).toBeUndefined();
    expect(button("Stop")).not.toBeUndefined();
    expect(button("Enable MIDI")).not.toBeUndefined();
    expect(button("Start microphone")).not.toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Quarter-note pulse");
    expect(liveAnnouncement()?.textContent).toContain("Tap Quarter-note pulse");
    button("Tap beat")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Progress"));
  });

  test("cancels from the stage action and returns focus to setup", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    button("Stop")?.click();

    await vi.waitFor(() => expect(button("Start")).not.toBeUndefined());
    expect(button("Stop")).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Quarter-note pulse");
    expect(liveAnnouncement()?.textContent).toContain("Rhythm cancelled");
  });

  test("keeps a deferred completion authoritative when Cancel is clicked", async () => {
    setTestUrl("/music/learn/rhythm?beats=2");
    let markPersistenceStarted!: () => void;
    let releasePersistence!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => (markPersistenceStarted = resolve));
    const persistenceGate = new Promise<void>((resolve) => (releasePersistence = resolve));
    const ingest = AnalyticsEngine.prototype.ingest;
    vi.spyOn(AnalyticsEngine.prototype, "ingest").mockImplementation(async function (event) {
      markPersistenceStarted();
      await persistenceGate;
      await ingest.call(this, event);
    });
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    button("Tap beat")?.click();
    button("Tap beat")?.click();
    await persistenceStarted;

    button("Stop")?.click();
    await vi.waitFor(() =>
      expect(liveAnnouncement()?.textContent).toMatch(/Finishing rhythm result|Rhythm cancelled/),
    );
    const announcementAfterCancel = liveAnnouncement()?.textContent;
    const returnedToSetup = button("Start") !== undefined;
    releasePersistence();
    await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());

    expect(returnedToSetup).toBe(false);
    expect(announcementAfterCancel).toContain("Finishing rhythm result");
    expect(liveAnnouncement()?.textContent).toContain("Pulse complete");
  });

  test("starts the rhythm engine only after the shared downbeat", async () => {
    const runtime = new MusicRuntime();
    let resolve!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    vi.spyOn(runtime, "beginPerformance").mockReturnValue(
      new Promise((settle) => {
        resolve = settle;
      }),
    );
    const start = vi.spyOn(RhythmSession.prototype, "start").mockResolvedValue({} as never);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(start).not.toHaveBeenCalled();
    expect(button("Starting...")?.disabled).toBe(true);
    expect(button("Start microphone")?.matches(":disabled")).toBe(true);

    resolve({ status: "started", downbeat: monotonicMs(1_234) });
    await vi.waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.objectContaining({ startTimestampMs: 1_234 })),
    );
  });

  test("keeps rhythm setup when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Playback voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const start = vi.spyOn(RhythmSession.prototype, "start");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Playback voice unavailable."),
    );
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(button("Start")).not.toBeUndefined();
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl("/music/learn/rhythm?mode=read-and-tap&bpm=72&beats=6&pattern=eighth-rests");
    render(Page);

    await openSetup();
    expect(button("Read & tap")).toHaveAttribute("aria-pressed", "true");
    expect(select("Pattern")?.value).toBe("eighth-rests");
    expect(bpmReadout()?.textContent).toContain("72 BPM");
    expect(input("Beats")?.value).toBe("6");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/learn/rhythm");
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    await openSetup();

    select("Pattern")!.value = "triplets";
    select("Pattern")!.dispatchEvent(new Event("change", { bubbles: true }));
    input("Beats")!.value = "8";
    input("Beats")!.dispatchEvent(new Event("input", { bubbles: true }));
    button("Read & tap")?.click();
    // The variant context re-registers asynchronously after the mode and pattern
    // change; the tempo only reaches the URL once that context is active, so
    // keep setting it until it lands rather than racing the registration.
    await vi.waitFor(() => {
      runtime.setPracticeVariantBpm(88, "v1:rhythm:read-and-tap:triplets");
      expect(window.location.search).toContain("bpm=88");
    });
    expect(window.location.search).toContain("pattern=triplets");
    expect(window.location.search).toContain("beats=8");
    expect(window.location.search).toContain("mode=read-and-tap");
  });

  test("starts a selected rhythm pattern", async () => {
    setTestUrl("/music/learn/rhythm?pattern=eighth-rests");
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    await openSetup();

    expect(select("Pattern")?.value).toBe("eighth-rests");
    button("Start")?.click();

    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    expect(document.body.textContent).toContain("Eighth-note rests");
  });

  test("starts read-and-tap with a visible rhythm target", async () => {
    setTestUrl("/music/learn/rhythm?mode=read-and-tap");
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    await openSetup();
    expect(button("Read & tap")).toHaveAttribute("aria-pressed", "true");
    button("Start")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Read & tap");
      expect(document.querySelector('[aria-label="Rhythm pattern target"]')).not.toBeNull();
    });
    expect(button("Tap rhythm")).not.toBeUndefined();
  });

  test("gap-click gates the on bar, silences the off bar, and resets from absolute beat", async () => {
    setTestUrl("/music/learn/rhythm?pattern=gap-click-1-on-1-off&bpm=120");
    const runtime = new MusicRuntime();
    runtime.countInBars = 1;
    let gate: Parameters<MusicRuntime["registerPracticeContext"]>[0]["shouldPlayMetronome"];
    vi.spyOn(runtime, "registerPracticeContext").mockImplementation(async (context) => {
      gate = context.shouldPlayMetronome;
      return () => {};
    });
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await vi.waitFor(() => expect(gate).toBeTypeOf("function"));
    const event = {
      kind: "beat" as const,
      atSeconds: 0,
      atMonotonicMs: monotonicMs(0),
      beat: 0,
      subdivision: 0,
      accented: true,
      countingIn: false,
    };
    expect(gate?.({ ...event, absoluteBeat: 4 })).toBe(true);
    expect(gate?.({ ...event, absoluteBeat: 8 })).toBe(false);
    expect(gate?.({ ...event, absoluteBeat: 4 })).toBe(true);
    runtime.dispose();
  });

  test("offers a slower retry after a completed pulse run", async () => {
    setTestUrl("/music/learn/rhythm?bpm=100&beats=2");
    render(Page);
    await openSetup();
    input("Beats")!.value = "2";
    input("Beats")!.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    button("Tap beat")?.click();
    button("Tap beat")?.click();

    await vi.waitFor(() => expect(button("Slow to 90 BPM")).not.toBeUndefined());
    button("Slow to 90 BPM")?.click();

    await vi.waitFor(() => expect(bpmReadout()?.textContent).toContain("90 BPM"));
    expect(input("Beats")?.value).toBe("2");
    expect(document.body.textContent).toContain("Ready. Press Start, or Space.");
  });

  test("shows the standard summary actions and changes back to setup", async () => {
    setTestUrl("/music/learn/rhythm?bpm=100&beats=2");
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    button("Tap beat")?.click();
    button("Tap beat")?.click();

    await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
    expect(button("Increase to 110 BPM")).not.toBeUndefined();
    expect(button("Repeat at 100 BPM")).not.toBeUndefined();
    expect(button("Slow to 90 BPM")).not.toBeUndefined();
    expect(button("Start")).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Pulse complete");
    expect(liveAnnouncement()?.textContent).toContain("Pulse complete");

    button("Change setup")?.click();

    await vi.waitFor(() => expect(button("Start")).not.toBeUndefined());
    expect(document.activeElement?.textContent).toContain("Quarter-note pulse");
    expect(liveAnnouncement()?.textContent).toContain("Ready. Press Start, or Space.");
  });
});

// Setup is collapsed behind "Edit setup" on the ready stage; open it before
// touching the mode, pattern or beats controls.
async function openSetup(): Promise<void> {
  if (!button("Hide setup")) button("Edit setup")?.click();
  await vi.waitFor(() => expect(select("Pattern")).not.toBeUndefined());
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function input(label: string): HTMLInputElement | undefined {
  return [...document.querySelectorAll<HTMLInputElement>("input")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

function bpmReadout(): HTMLElement | null {
  return document.querySelector('[aria-label="BPM"]');
}

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

function liveAnnouncement(): HTMLElement | null {
  return document.querySelector('[data-testid="rhythm-live-announcement"]');
}
