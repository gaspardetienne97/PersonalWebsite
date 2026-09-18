import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore } from "@repo/music-core/engines/skills";
import { PracticeStore } from "@repo/music-core/engines/store";
import {
  TechniqueSession,
  TEMPO_LADDER_SETTINGS_ID,
} from "@repo/music-core/engines/technique-session";

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

afterEach(async () => {
  vi.restoreAllMocks();
  setTestUrl("/");
  document.body.replaceChildren();
  // Runs persist their unlocked rung; keep the ladder out of the next test.
  await new PracticeStore().settings.delete(TEMPO_LADDER_SETTINGS_ID);
});

describe("/music/play/scales/+page.svelte", () => {
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

  test("waits for practice context registration before starting", async () => {
    const runtime = new MusicRuntime();
    let resolveContext!: (cleanup: () => void) => void;
    vi.spyOn(runtime, "registerPracticeContext").mockReturnValue(
      new Promise((resolve) => {
        resolveContext = resolve;
      }),
    );
    const ensurePlaybackVoice = vi.spyOn(runtime, "ensurePlaybackVoice");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();
    await Promise.resolve();
    expect(ensurePlaybackVoice).not.toHaveBeenCalled();

    resolveContext(vi.fn());
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalledOnce());
    expect(runtime.beginPerformance).toHaveBeenCalledOnce();
  });

  test("keeps the engine stopped when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Preferred voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(button("Stop")).toBeUndefined();
  });

  test("settles and locks setup before snapshotting a deferred start", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const startScale = vi.spyOn(TechniqueSession.prototype, "startScale");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());
    const setupLocked = select("Tonic")?.closest("fieldset")?.disabled;
    runtime.setPracticeVariantBpm(120, "v1:scales:piano:major:up:one-octave");
    resolveVoice(true);

    await vi.waitFor(() => expect(startScale).toHaveBeenCalledOnce());
    expect(setupLocked).toBe(true);
    expect(startScale).toHaveBeenCalledWith(expect.objectContaining({ bpm: 120 }));
    expect(window.location.search).toContain("bpm=120");
  });

  test("shows scale setup with shared tempo readout", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Scales & Technique");
    expect(button("Enable MIDI")).not.toBeUndefined();
    expect(input("Tempo")).toBeNull();
    expect(document.body.textContent).toContain("100 BPM");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
  });

  test("offers a scale selector with modes and jazz scales", async () => {
    render(Page);
    await openSetup();
    const scaleSelect = document.querySelector<HTMLSelectElement>("#scale-kind");
    expect(scaleSelect).not.toBeNull();
    const values = [...(scaleSelect?.options ?? [])].map((option) => option.value);
    expect(values).toContain("major");
    expect(values).toContain("harmonic-minor");
    expect(values).toContain("blues");
    expect(values).toContain("dorian");
    expect(values).toContain("altered");
    expect(values).toContain("bebop-major");
    // Grouped into Modes vs Jazz/modal.
    expect(scaleSelect?.querySelectorAll("optgroup")).toHaveLength(2);
    expect(select("Span")?.value).toBe("one-octave");
    expect(select("Motion")?.value).toBe("up");
  });

  test("offers a hands option that lights both octaves when hands play together", async () => {
    render(Page);
    await openSetup();
    expect(select("Hands")?.value).toBe("right");
    expect(targetNotes()).not.toContain("C3");

    select("Hands")!.value = "both";
    select("Hands")!.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(targetNotes()).toContain("C3"));
    expect(targetNotes()).toContain("C4");
    expect(window.location.search).toContain("hands=both");
  });

  test("selects the hands-together checkpoint preset", async () => {
    render(Page);
    await openSetup();
    button("Hands together, one octave, 80")?.click();

    await vi.waitFor(() => expect(select("Hands")?.value).toBe("both"));
    expect(select("Span")?.value).toBe("one-octave");
    await vi.waitFor(() => expect(document.body.textContent).toContain("80 BPM"));
  });

  test("shows the persisted tempo ladder rung on setup after a remount", async () => {
    const store = new PracticeStore();
    await store.settings.put({
      id: TEMPO_LADDER_SETTINGS_ID,
      value: { "major:C4:up:one-octave:right": 130 },
    });

    render(Page);
    await openSetup();

    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-testid="scales-ladder-readout"]')?.textContent,
      ).toContain("130 BPM"),
    );
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl(
      "/music/play/scales?scale=blues&tonic=Eb4&instrument=guitar&bpm=90&span=two-octave&motion=up-down",
    );

    render(Page);

    await openSetup();
    expect(document.querySelector<HTMLSelectElement>("#scale-kind")?.value).toBe("blues");
    expect(select("Tonic")?.value).toBe("Eb4");
    expect(select("Span")?.value).toBe("two-octave");
    expect(select("Motion")?.value).toBe("up-down");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(document.body.textContent).toContain("90 BPM"));
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/play/scales?bpm=90");
    render(Page);
    await openSetup();

    const scaleSelect = document.querySelector<HTMLSelectElement>("#scale-kind");
    if (!scaleSelect) throw new Error("Scale selector not found");
    scaleSelect.value = "dorian";
    scaleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    select("Tonic")!.value = "F4";
    select("Tonic")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Span")!.value = "pentascale";
    select("Span")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Motion")!.value = "down";
    select("Motion")!.dispatchEvent(new Event("change", { bubbles: true }));
    button("Ukulele")?.click();

    await vi.waitFor(() => expect(window.location.search).toContain("scale=dorian"));
    expect(window.location.search).toContain("tonic=F4");
    expect(window.location.search).toContain("instrument=ukulele");
    expect(window.location.search).toContain("bpm=90");
    expect(window.location.search).toContain("span=pentascale");
    expect(window.location.search).toContain("motion=down");
  });

  test("completes an on-screen C major scale with evenness feedback", async () => {
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();

    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        variantKey: "v1:scales:piano:major:up:one-octave",
        allowedInstruments: ["piano", "guitar", "ukulele", "aerophone"],
      }),
    );
    for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
      button(note)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Scale complete"));
    expect(document.body.textContent).toContain("Evenness error:");
    expect(button("Practice next tempo")).not.toBeUndefined();
    expect(button("Slow down")).not.toBeUndefined();

    button("Change setup")?.click();
    await vi.waitFor(() => {
      expect(button("Start")).not.toBeUndefined();
      expect(document.activeElement).toBe(
        document.querySelector('[data-testid="scales-ready-heading"]'),
      );
    });
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
  });

  test("returns focus and announces when an active run ends", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-testid="scales-ready-heading"]'),
      ),
    );
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Run ended",
    );
  });

  test("keeps dismissed results hidden when restart activation fails", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
      button(note)?.click();
    }
    await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
    button("Change setup")?.click();

    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-testid="scales-ready-heading"]'),
      ),
    );
    const setupSummary = document.activeElement;
    runtime.audioMessage = "Preferred voice unavailable.";
    let resolveVoice!: (enabled: boolean) => void;
    const ensurePlaybackVoice = vi.mocked(runtime.ensurePlaybackVoice);
    ensurePlaybackVoice.mockClear();
    ensurePlaybackVoice.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );

    button("Start")?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalledOnce());
    expect(button("Starting...")).not.toBeUndefined();
    expect(document.body.textContent).not.toContain("Scale complete");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).not.toContain(
      "Scale complete",
    );
    expect(document.activeElement).toBe(setupSummary);

    resolveVoice(false);
    await vi.waitFor(() =>
      expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
        runtime.audioMessage,
      ),
    );
    expect(button("Start")).not.toBeUndefined();
    expect(document.body.textContent).not.toContain("Scale complete");
    expect(document.activeElement).toBe(setupSummary);
  });

  test("dismisses stale results while a deferred retry activation fails", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeScale();

    runtime.audioMessage = "Preferred voice unavailable.";
    let resolveVoice!: (enabled: boolean) => void;
    const ensurePlaybackVoice = vi.mocked(runtime.ensurePlaybackVoice);
    ensurePlaybackVoice.mockClear();
    ensurePlaybackVoice.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );

    button("Practice next tempo")?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalledOnce());
    expect(document.body.textContent).not.toContain("Scale complete");
    expect(button("Starting...")?.disabled).toBe(true);
    expect(button("Change setup")).toBeUndefined();

    resolveVoice(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(document.body.textContent).not.toContain("Scale complete");
    expect(button("Start")?.disabled).toBe(false);
  });

  test("keeps Change setup authoritative when it races retry preflight", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeScale();

    const beginPerformance = vi.mocked(runtime.beginPerformance);
    beginPerformance.mockClear();
    button("Practice next tempo")?.click();
    button("Change setup")?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(button("Stop")).toBeUndefined();
    expect(button("Start")?.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Scale complete");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
  });

  test("cleans a stale performance when deferred session start rejects", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeScale();

    let rejectStart!: (reason?: unknown) => void;
    const startScale = vi.spyOn(TechniqueSession.prototype, "startScale").mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectStart = reject;
      }),
    );
    const changeSetup = button("Change setup");
    button("Practice next tempo")?.click();
    await vi.waitFor(() => expect(startScale).toHaveBeenCalledOnce());
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    const abandon = vi.spyOn(TechniqueSession.prototype, "abandon");

    document.body.append(changeSetup!);
    changeSetup?.click();
    changeSetup?.remove();
    expect(button("Starting...")?.disabled).toBe(true);
    rejectStart(new Error("Deferred session start failed."));

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    expect(endPerformance).toHaveBeenCalledOnce();
    expect(abandon).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Setup ready.");
    expect(document.body.textContent).not.toContain("Deferred session start failed.");

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(startScale).toHaveBeenCalledTimes(2);
  });

  test("Demo plays the scale once and writes nothing", async () => {
    const runtime = new MusicRuntime();
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
    const startScale = vi.spyOn(TechniqueSession.prototype, "startScale");
    const recordPractice = vi.spyOn(runtime, "recordPractice");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(mode()).toBe("practice");
    button("Demo")?.click();

    await vi.waitFor(() => expect(button("Stop demo")).not.toBeUndefined());
    expect(playPattern).toHaveBeenCalledOnce();
    expect(mode()).toBe("demo");
    expect(document.body.textContent).toContain("listening, not scored");
    expect(document.querySelector('[aria-label="Demo beat lane"]')).not.toBeNull();
    // A demonstration is not a run: nothing starts, nothing is scored, nothing is journalled.
    expect(startScale).not.toHaveBeenCalled();
    expect(recordPractice).not.toHaveBeenCalled();
    expect(runtime.beginPerformance).not.toHaveBeenCalled();

    button("Stop demo")?.click();
    await vi.waitFor(() => expect(button("Demo")).not.toBeUndefined());
    expect(stopPattern).toHaveBeenCalled();
    expect(mode()).toBe("practice");
    expect(document.querySelector('[aria-label="Demo beat lane"]')).toBeNull();
    runtime.dispose();
  });

  test("hands-together Demo lights each octave in its own hand colour", async () => {
    setTestUrl("/music/play/scales?hands=both&bpm=100");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime.sound, "playPattern").mockReturnValue(undefined);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Demo")?.click();

    // The tonic beat sounds both octaves: the lower one is the left hand.
    await vi.waitFor(() => expect(keyState("C3")).toBe("sounding-left"));
    expect(keyState("C4")).toBe("sounding-right");
    button("Stop demo")?.click();
    runtime.dispose();
  });

  test("Demo is locked while a start is in flight", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());

    expect(button("Demo")?.disabled).toBe(true);
    button("Demo")?.click();
    expect(playPattern).not.toHaveBeenCalled();
    resolveVoice(true);

    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(mode()).toBe("practice");
    runtime.dispose();
  });

  test("the graded run replaces Demo with the live beat lane", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(button("Demo")).not.toBeUndefined();
    button("Start")?.click();

    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(button("Demo")).toBeUndefined();
    expect(button("Stop demo")).toBeUndefined();
    expect(document.querySelector('[aria-label="Beat lane"]')).not.toBeNull();
  });

  test("offers a slower retry after a completed scale run", async () => {
    setTestUrl("/music/play/scales?bpm=90");
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();

    button("Start")?.click();
    // The ready stage already has a live keyboard, so wait for the run itself.
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
      button(note)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Scale complete"));
    expect(button("Slow down")).not.toBeUndefined();
    button("Slow down")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("80 BPM"));
    expect(window.location.search).toContain("bpm=80");
  });
});

async function completeScale(): Promise<void> {
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  await openSetup();
  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
    button(note)?.click();
  }
  await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
}

/** The piano surface's rendered state for one key. */
function keyState(note: string): string | null | undefined {
  return document
    .querySelector(`[aria-label="On-screen keyboard"] button[data-note="${note}"]`)
    ?.getAttribute("data-state");
}

/** The stage mode the shell is rendering. */
function mode(): string | null | undefined {
  return document.querySelector("[data-mode]")?.getAttribute("data-mode");
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function input(label: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
}

/** Note names the piano surface is currently lighting as targets. */
function targetNotes(): string[] {
  return [...document.querySelectorAll('[data-state="target"]')].map(
    (key) => key.getAttribute("data-note") ?? "",
  );
}

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

/** Setup is collapsed behind its summary line; open it before touching controls. */
async function openSetup(): Promise<void> {
  if (button("Hide setup")) return;
  await vi.waitFor(() => expect(button("Edit setup")).not.toBeUndefined());
  button("Edit setup")?.click();
  await vi.waitFor(() => expect(document.querySelector("#scale-kind")).not.toBeNull());
}
