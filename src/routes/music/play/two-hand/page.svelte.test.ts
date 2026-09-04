import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";
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
  document.body.replaceChildren();
  setTestUrl("/");
});

describe("/music/play/two-hand/+page.svelte", () => {
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
    await openSetup();
    button("Start")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(button("Stop")).toBeUndefined();
  });

  test("starts from the settled tempo while setup stays locked during preflight", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const startTwoHand = vi.spyOn(TechniqueSession.prototype, "startTwoHand");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());

    runtime.setPracticeVariantBpm(120, "v1:two-hand:lh-pulse-rh-line:both:even");
    expect(button("F")?.matches(":disabled")).toBe(true);
    button("F")?.click();
    resolveVoice(true);

    await vi.waitFor(() => expect(startTwoHand).toHaveBeenCalledOnce());
    expect(startTwoHand).toHaveBeenCalledWith(expect.objectContaining({ tonic: "C4", bpm: 120 }));
    expect(runtime.practiceBpm).toBe(120);
    expect(window.location.search).toContain("tonic=C4");
    expect(window.location.search).toContain("bpm=120");
  });

  test("completes a two-hand drill from the on-screen keys", async () => {
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });

    expect(document.querySelector("h1")?.textContent).toContain("Two-Hand Independence");
    // One hand-tagged surface, not one keyboard per hand.
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[aria-label="On-screen keyboard"]').length).toBe(1),
    );
    expect(button("C2")?.getAttribute("data-state")).toBe("target-left");
    expect(button("C4")?.getAttribute("data-state")).toBe("target-right");
    expect(document.querySelector('[data-testid="finger-36"]')?.textContent).toBe("5");
    expect(document.querySelector('[data-testid="finger-60"]')?.textContent).toBe("1");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(document.body.textContent).not.toContain("Remembered setup");
    expect(button("Stop")?.closest('[data-surface="stage"]')).toBeNull();
    expect(runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        variantKey: "v1:two-hand:lh-pulse-rh-line:both:even",
        pinnedInstrument: "piano",
      }),
    );

    // 2 bars: left hand = 8 beats, right hand = 16 eighth notes → 24 notes total.
    for (let beat = 0; beat < 8; beat += 1) button("C2")?.click();
    for (let eighth = 0; eighth < 16; eighth += 1) button("C4")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Drill complete");
      expect(button("Again")).not.toBeUndefined();
    });
  });

  test("emits exactly one router event per QWERTY press", async () => {
    const runtime = new MusicRuntime();
    const events: NoteEvent[] = [];
    runtime.router.subscribe((event) => events.push(event));
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("C2")).not.toBeUndefined());
    // `A` is the QWERTY map's C, anchored on the lowest rendered note (C2).
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "noteOn",
      midiNote: 36,
      source: "onscreen",
    });

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", bubbles: true }));

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: "noteOff", midiNote: 36 });
    runtime.dispose();
  });

  test.each([
    {
      hand: "left",
      notes: Array(8).fill("C2"),
      practiced: "Left",
      sentinel: "Right",
    },
    {
      hand: "right",
      notes: [
        "C4",
        "D4",
        "E4",
        "F4",
        "G4",
        "A4",
        "B4",
        "B4",
        "A4",
        "G4",
        "F4",
        "E4",
        "D4",
        "C4",
        "C4",
        "D4",
      ],
      practiced: "Right",
      sentinel: "Left",
    },
  ])(
    "uses the engine score and omits the unpracticed hand from a $hand-only summary",
    async ({ hand, notes, practiced, sentinel }) => {
      setTestUrl(`/music/play/two-hand?hand=${hand}`);
      render(Page);

      await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
      await openSetup();
      button("Start")?.click();
      await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

      for (const note of notes) button(note)?.click();

      await vi.waitFor(() => expect(document.body.textContent).toContain("Drill complete"));
      const scoreLabel = [...document.querySelectorAll("p")].find(
        (element) => element.textContent?.trim() === "Two-hand score",
      );
      expect(scoreLabel?.parentElement?.textContent).toContain("80");
      expect(
        [...document.querySelectorAll("span")].find(
          (element) => element.textContent?.trim() === `${sentinel} note accuracy`,
        ),
      ).toBeUndefined();
      expect(document.body.textContent).toContain(`${practiced}-hand note accuracy: 100%.`);
      expect(document.body.textContent).not.toContain(`${sentinel}-hand note accuracy`);

      button("Change setup")?.click();
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(
          document.querySelector('[data-testid="two-hand-ready-heading"]'),
        ),
      );
      expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
        "Setup ready",
      );
    },
  );

  test("uses neutral metric-specific copy when both hands have equal note accuracy", async () => {
    setTestUrl("/music/play/two-hand?dynamics=1");
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    for (let index = 0; index < 8; index += 1) {
      runtime.router.push({
        type: "noteOn",
        source: "onscreen",
        instrument: "piano",
        midiNote: 37,
        velocity: 0.8,
        timestamp: monotonicMs(1_000 + index),
      });
    }
    for (let index = 0; index < 16; index += 1) {
      runtime.router.push({
        type: "noteOn",
        source: "onscreen",
        instrument: "piano",
        midiNote: 61,
        velocity: 0.8,
        timestamp: monotonicMs(2_000 + index),
      });
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Drill complete"));
    expect(document.body.textContent).toContain("Both hands matched on note accuracy: 0%.");
    expect(document.body.textContent).toContain("Mean spacing error");
    expect(document.body.textContent).toContain("MIDI velocity contrast +0.00");
    expect(document.body.textContent).not.toContain("% louder");
  });

  test("returns focus and announces when a drill is cancelled", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-testid="two-hand-ready-heading"]'),
      ),
    );
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Drill cancelled",
    );
  });

  test("keeps dismissed results hidden when restart activation fails", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    await completeDrill();
    button("Change setup")?.click();

    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-testid="two-hand-ready-heading"]'),
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
    expect(document.body.textContent).not.toContain("Two-hand score");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).not.toContain(
      "Drill complete",
    );
    expect(document.activeElement).toBe(setupSummary);

    resolveVoice(false);
    await vi.waitFor(() =>
      expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
        runtime.audioMessage,
      ),
    );
    expect(button("Start")).not.toBeUndefined();
    expect(document.body.textContent).not.toContain("Two-hand score");
    expect(document.activeElement).toBe(setupSummary);
  });

  test("dismisses stale results while a deferred retry activation fails", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeDrill();

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
    expect(document.body.textContent).not.toContain("Two-hand score");
    expect(button("Starting...")?.disabled).toBe(true);
    expect(button("Change setup")).toBeUndefined();

    resolveVoice(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(document.body.textContent).not.toContain("Two-hand score");
    expect(button("Start")?.disabled).toBe(false);
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      runtime.audioMessage,
    );
  });

  test("keeps Change setup authoritative when it races retry preflight", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeDrill();

    const beginPerformance = vi.mocked(runtime.beginPerformance);
    beginPerformance.mockClear();
    button("Again")?.click();
    button("Change setup")?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(button("Stop")).toBeUndefined();
    expect(button("Start")?.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Two-hand score");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
  });

  test("cleans a stale performance when deferred session start rejects", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeDrill();

    let rejectStart!: (reason?: unknown) => void;
    const startTwoHand = vi.spyOn(TechniqueSession.prototype, "startTwoHand").mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectStart = reject;
      }),
    );
    const changeSetup = button("Change setup");
    button("Again")?.click();
    await vi.waitFor(() => expect(startTwoHand).toHaveBeenCalledOnce());
    const endPerformance = vi.spyOn(runtime, "endPerformance");

    document.body.append(changeSetup!);
    changeSetup?.click();
    changeSetup?.remove();
    expect(button("Starting...")?.disabled).toBe(true);
    rejectStart(new Error("Deferred session start failed."));

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    expect(endPerformance).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Setup ready.");
    expect(document.body.textContent).not.toContain("Deferred session start failed.");

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(startTwoHand).toHaveBeenCalledTimes(2);
  });

  test("restores and syncs the shareable two-hand setup URL", async () => {
    setTestUrl("/music/play/two-hand?tonic=G4&bpm=120&pattern=alberti-rh-holds&hand=left");
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("120 BPM"));
    expect(document.body.textContent).toContain("Alberti + holds");
    await openSetup();
    expect(
      document.querySelector('[aria-label="Key"] button[aria-pressed="true"]')?.textContent,
    ).toBe("G");
    expect(
      document.querySelector('[aria-label="Hand mode"] button[aria-pressed="true"]')?.textContent,
    ).toContain("Left");

    button("F")?.click();
    button("Contrary scale")?.click();
    button("Both")?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("tonic")).toBe("F4");
      expect(params.get("bpm")).toBe("120");
      expect(params.get("pattern")).toBe("contrary-motion-scale");
      expect(params.get("hand")).toBe("both");
    });
  });

  test("restores the melody-louder dynamics format and hides it for isolated hands", async () => {
    setTestUrl("/music/play/two-hand?dynamics=1");
    render(Page);

    await openSetup();
    await vi.waitFor(() => {
      expect(button("Melody louder")).toHaveAttribute("aria-pressed", "true");
      expect(new URLSearchParams(window.location.search).get("dynamics")).toBe("1");
    });

    // Isolating one hand removes the dynamics choice (nothing to contrast).
    button("Left")?.click();
    await vi.waitFor(() => {
      expect(button("Melody louder")).toBeUndefined();
    });
  });

  test("offers a slower retry after a completed two-hand drill", async () => {
    setTestUrl("/music/play/two-hand?tonic=C4&bpm=100");
    render(Page);

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    for (let beat = 0; beat < 8; beat += 1) button("C2")?.click();
    for (let eighth = 0; eighth < 16; eighth += 1) button("C4")?.click();

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("bpm")).toBe("80");
      expect(button("Stop")).not.toBeUndefined();
    });
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

async function completeDrill(): Promise<void> {
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  await openSetup();
  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  for (let beat = 0; beat < 8; beat += 1) button("C2")?.click();
  for (let eighth = 0; eighth < 16; eighth += 1) button("C4")?.click();
  await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
}

/** Setup is collapsed behind its summary line; open it before touching controls. */
async function openSetup(): Promise<void> {
  if (button("Hide setup")) return;
  await vi.waitFor(() => expect(button("Edit setup")).not.toBeUndefined());
  button("Edit setup")?.click();
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Pattern"]')).not.toBeNull());
}
