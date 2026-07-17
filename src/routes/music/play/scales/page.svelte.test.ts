import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs } from "@repo/music-core/domain";
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

    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
    button("Start Scale")?.click();
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

    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
    button("Start Scale")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(button("End run")).toBeUndefined();
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

    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
    button("Start Scale")?.click();
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
    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
  });

  test("offers a scale selector with modes and jazz scales", async () => {
    render(Page);
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

  test("restores setup from shareable query parameters", async () => {
    setTestUrl(
      "/music/play/scales?scale=blues&tonic=Eb4&instrument=guitar&bpm=90&span=two-octave&motion=up-down",
    );

    render(Page);

    expect(document.querySelector<HTMLSelectElement>("#scale-kind")?.value).toBe("blues");
    expect(select("Tonic")?.value).toBe("Eb4");
    expect(select("Span")?.value).toBe("two-octave");
    expect(select("Motion")?.value).toBe("up-down");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(document.body.textContent).toContain("90 BPM"));
    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/play/scales?bpm=90");
    render(Page);

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
    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
    button("Start Scale")?.click();

    await vi.waitFor(() => expect(button("End run")).not.toBeUndefined());
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
  });

  test("offers a slower retry after a completed scale run", async () => {
    setTestUrl("/music/play/scales?bpm=90");
    render(Page);
    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));

    button("Start Scale")?.click();
    await vi.waitFor(() => expect(button("C4")).not.toBeUndefined());
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

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function input(label: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
}

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}
