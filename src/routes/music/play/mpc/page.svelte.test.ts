import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { tick } from "svelte";
import { render } from "vitest-browser-svelte";

import { monotonicMs } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore } from "@repo/music-core/engines/skills";
import { PracticeStore } from "@repo/music-core/engines/store";
import { TechniqueSession } from "@repo/music-core/engines/technique-session";

import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";
import { MusicRuntime } from "../../_runtime.svelte";

beforeEach(() => {
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

describe("/music/play/mpc/+page.svelte", () => {
  test("keeps setup key assignments during a run without remapping controls", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    await openSetup();
    document.querySelector<HTMLElement>("details summary")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Assign key for pad 36"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Assign key for pad 36"]')?.click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(document.querySelector('[aria-label^="Assign key"]')).toBeNull();
    const accepted = vi.fn();
    const unsubscribe = runtime.router.subscribe(accepted);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
    expect(accepted).toHaveBeenCalledWith(
      expect.objectContaining({ midiNote: 36, instrument: "mpc" }),
    );
    unsubscribe();
    runtime.dispose();
  });
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

  test("settles and locks setup before snapshotting a deferred context", async () => {
    const runtime = new MusicRuntime();
    let resolveContext!: (cleanup: () => void) => void;
    let applyBpm: ((bpm: number) => void) | undefined;
    vi.spyOn(runtime, "registerPracticeContext").mockImplementation((context) => {
      applyBpm = context.onBpmChange;
      return new Promise((resolve) => {
        resolveContext = resolve;
      });
    });
    const startMpcRudiment = vi.spyOn(TechniqueSession.prototype, "startMpcRudiment");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    // The setup controls sit behind Edit setup; open them so the lock is observable.
    await openSetup();
    button("Start")?.click();
    await vi.waitFor(() => expect(applyBpm).toBeTypeOf("function"));
    const setupLocked = select("Left pad")?.closest("fieldset")?.disabled;
    applyBpm?.(120);
    resolveContext(vi.fn());

    await vi.waitFor(() => expect(startMpcRudiment).toHaveBeenCalledOnce());
    expect(setupLocked).toBe(true);
    expect(startMpcRudiment).toHaveBeenCalledWith(expect.objectContaining({ bpm: 120 }));
    expect(window.location.search).toContain("bpm=120");
  });

  test("moves from setup to the cancellable stage and summary, then restores setup", async () => {
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });

    expect(document.querySelector("h1")?.textContent).toContain("MPC Rudiments");
    await openSetup();
    expect(select("Left pad")).not.toBeUndefined();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")?.disabled).toBe(false));
    expect(runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        variantKey: "v1:mpc:single-strokes",
        pinnedInstrument: "mpc",
      }),
    );
    expect(select("Left pad")).toBeUndefined();
    expect(document.querySelector('[aria-label="MPC pad grid"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toContain("Single strokes");

    for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
      pad(midi)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Rudiment complete");
      expect(document.body.textContent).toContain("Not measured");
      expect(button("Again")).not.toBeUndefined();
      expect(button("Change setup")).not.toBeUndefined();
      expect(document.activeElement?.textContent).toContain("Rudiment complete");
    });
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
      "Rudiment complete.",
    );

    button("Change setup")?.click();
    await vi.waitFor(() => expect(select("Left pad")).not.toBeUndefined());
    expect(button("Stop")).toBeUndefined();
    expect(button("Change setup")).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Single strokes");
  });

  test("rejects identical left and right pads", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    await openSetup();
    const right = document.querySelector<HTMLSelectElement>('[aria-label="Right pad"]');
    if (!right) throw new Error("Right pad selector not found");
    right.value = "36";
    right.dispatchEvent(new Event("input", { bubbles: true }));
    right.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    button("Start")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Choose two different MPC pads.");
      expect(button("Stop")).toBeUndefined();
    });
  });

  test("cancels an active run and allows a restart", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    button("Stop")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl("/music/play/mpc?pattern=moving-accent&left=40&right=41&hits=16&bpm=100");

    render(Page);

    expect(button("Moving accent")).toHaveAttribute("aria-pressed", "true");
    await openSetup();
    expect(select("Left pad")?.value).toBe("40");
    expect(select("Right pad")?.value).toBe("41");
    expect(button("16 hits")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Tempo · 100 BPM"));
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/play/mpc");
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    await openSetup();
    select("Left pad")!.value = "44";
    select("Left pad")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Right pad")!.value = "45";
    select("Right pad")!.dispatchEvent(new Event("change", { bubbles: true }));
    button("Double strokes")?.click();
    button("16 hits")?.click();
    await vi.waitFor(() => expect(window.location.search).toContain("hits=16"));
    runtime.setPracticeVariantBpm(120, "v1:mpc:double-strokes");

    await vi.waitFor(() => expect(window.location.search).toContain("pattern=double-strokes"));
    await vi.waitFor(() => expect(window.location.search).toContain("left=44"));
    expect(window.location.search).toContain("right=45");
    expect(window.location.search).toContain("hits=16");
    expect(window.location.search).toContain("bpm=120");
  });

  test("pins MPC without persisting over the general instrument", async () => {
    const records = new Map<string, { id: string; value: unknown }>([
      ["music.settings", { id: "music.settings", value: { activeInstrument: "guitar" } }],
    ]);
    const runtime = new MusicRuntime();
    await runtime.attachStorage({
      get: async (id) => records.get(id),
      put: async (record) => records.set(record.id, record),
    });

    const view = render(Page, { runtime });
    await vi.waitFor(() => expect(runtime.activeInstrument).toBe("mpc"));
    expect(runtime.router.state.activeInstrument).toBe("mpc");
    expect(runtime.getMusicSettings()?.activeInstrument).toBe("guitar");

    view.unmount();
    await vi.waitFor(() => expect(runtime.activeInstrument).toBe("guitar"));
    expect(runtime.router.state.activeInstrument).toBe("guitar");
    expect(runtime.getMusicSettings()?.activeInstrument).toBe("guitar");
    runtime.dispose();
  });

  test("starts a paradiddle rudiment from core pattern data", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    button("Paradiddle")?.click();
    button("Start")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("MPC paradiddle");
      expect(document.body.textContent).toContain("Pad 36");
      expect(
        document.querySelector('[aria-label="Rudiment sequence lane"]')?.textContent,
      ).toContain("Pad 38");
    });
  });

  test("starts a moving-accent rudiment with visible accent cues", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    button("Moving accent")?.click();
    button("Start")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("MPC moving accent");
      expect(
        document.querySelector('[aria-label="Rudiment sequence lane"]')?.textContent,
      ).toContain("Accent");
      expect(
        document.querySelector('[aria-label="Rudiment sequence lane"]')?.textContent,
      ).toContain("Tap");
    });
  });

  test("offers a slower retry after a completed rudiment", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await vi.waitFor(() => expect(window.location.search).toContain("bpm=80"));
    runtime.setPracticeVariantBpm(100, "v1:mpc:single-strokes");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
      pad(midi)?.click();
    }

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(select("Left pad")).toBeUndefined();
    expect(document.body.textContent).toContain("80BPM");
    expect(window.location.search).toContain("bpm=80");
  });

  test("dismisses stale results while a deferred retry activation fails", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeRudiment();

    const beginPerformance = vi.mocked(runtime.beginPerformance);
    beginPerformance.mockClear();
    let resolveActivation!: (result: Awaited<ReturnType<typeof runtime.beginPerformance>>) => void;
    beginPerformance.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveActivation = resolve;
      }),
    );

    button("Again")?.click();

    await vi.waitFor(() => expect(beginPerformance).toHaveBeenCalledOnce());
    expect(document.body.textContent).not.toContain("Rudiment complete");
    expect(button("Starting...")?.disabled).toBe(true);
    expect(button("Change setup")).toBeUndefined();

    resolveActivation({ status: "failed", message: "MPC transport unavailable." });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("MPC transport unavailable."),
    );
    expect(document.body.textContent).not.toContain("Rudiment complete");
    expect(button("Start")?.disabled).toBe(false);
    expect(button("Stop")).toBeUndefined();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
      "MPC transport unavailable.",
    );
  });

  test("keeps Change setup authoritative when it races retry preflight", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeRudiment();

    const beginPerformance = vi.mocked(runtime.beginPerformance);
    beginPerformance.mockClear();
    button("Again")?.click();
    button("Change setup")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(beginPerformance).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Rudiment complete");
    expect(button("Start")?.disabled).toBe(false);
    expect(button("Stop")).toBeUndefined();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Setup ready.");
  });

  test("keeps a stale activation pending until it settles before allowing a fresh start", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await completeRudiment();

    const changeSetup = button("Change setup");
    if (!changeSetup) throw new Error("Change setup button not found");
    const eventSymbol = Object.getOwnPropertySymbols(changeSetup).find(
      (symbol) => String(symbol) === "Symbol(events)",
    );
    const invokeChangeSetup = eventSymbol
      ? (Reflect.get(changeSetup, eventSymbol)?.click as EventListener | undefined)
      : undefined;
    if (!invokeChangeSetup) throw new Error("Change setup handler not found");
    const beginPerformance = vi.mocked(runtime.beginPerformance);
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    beginPerformance.mockClear();
    endPerformance.mockClear();
    let resolveActivation!: (result: Awaited<ReturnType<typeof runtime.beginPerformance>>) => void;
    beginPerformance.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveActivation = resolve;
      }),
    );

    button("Again")?.click();
    await vi.waitFor(() => expect(beginPerformance).toHaveBeenCalledOnce());
    invokeChangeSetup.call(changeSetup, new MouseEvent("click"));
    await tick();

    expect(button("Starting...")?.disabled).toBe(true);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Setup ready.");
    button("Starting...")?.click();
    expect(beginPerformance).toHaveBeenCalledOnce();

    resolveActivation({ status: "started", downbeat: monotonicMs(2_000) });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(endPerformance).toHaveBeenCalledOnce();

    endPerformance.mockClear();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(beginPerformance).toHaveBeenCalledTimes(2);
    expect(endPerformance).not.toHaveBeenCalled();
  });
});

async function completeRudiment(): Promise<void> {
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
    pad(midi)?.click();
  }
  await vi.waitFor(() => expect(button("Again")).not.toBeUndefined());
}

// Pads, hit count and MIDI sit behind "Edit setup" on the ready stage; the
// pattern picker stays on the stage.
async function openSetup(): Promise<void> {
  if (!button("Hide setup")) button("Edit setup")?.click();
  await vi.waitFor(() => expect(select("Left pad")).not.toBeUndefined());
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

function pad(midi: number): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[aria-label="Pad ${midi}"]`);
}

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

test("groove hides targets through preparation and response, then completes an empty bar and starts Again", async () => {
  setTestUrl("/music/play/mpc?mode=groove&groove=eighth-hats&bpm=240&kick=40&snare=41&hats=42");
  const runtime = new MusicRuntime();
  const play = vi.spyOn(runtime.sound, "playPercussion").mockImplementation(() => {});
  const stop = vi.spyOn(runtime.sound, "stopPercussion");
  let resolveStart!: (result: Awaited<ReturnType<typeof runtime.beginPerformance>>) => void;
  vi.mocked(runtime.beginPerformance)
    .mockImplementationOnce((options) => {
      options?.leadIn?.onStart({
        kind: "beat",
        atSeconds: 10,
        atMonotonicMs: monotonicMs(performance.now()),
        beat: 0,
        absoluteBeat: 0,
        subdivision: 0,
        accented: true,
        countingIn: true,
      });
      return new Promise((resolve) => {
        resolveStart = resolve;
      });
    })
    .mockImplementation(async () => ({
      status: "started",
      downbeat: monotonicMs(performance.now() + 40),
    }));
  const capture = vi.spyOn(runtime, "recordPractice").mockResolvedValue(undefined);
  const view = render(Page, { runtime });
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  expect(window.location.search).toContain("kick=40");
  button("Start")?.click();
  await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(12));
  expect(runtime.beginPerformance).toHaveBeenCalledWith(
    expect.objectContaining({ countInBars: 1, leadIn: expect.objectContaining({ bars: 1 }) }),
  );
  expect(document.body.textContent).not.toContain("Next pad");
  expect(document.querySelector('[aria-label="Expected groove"]')).toBeNull();
  expect(document.querySelector('[aria-label="Pad 40"]')).not.toBeNull();
  resolveStart({ status: "started", downbeat: monotonicMs(performance.now() + 40) });
  await vi.waitFor(() => expect(document.body.textContent).toContain("Your turn"));
  expect(document.querySelector('[aria-label="Expected groove"]')).toBeNull();
  await vi.waitFor(() => expect(document.body.textContent).toContain("Groove complete"), {
    timeout: 2500,
  });
  expect(document.body.textContent).toContain("Not measured");
  expect(document.querySelector('[aria-label="Expected groove"]')).not.toBeNull();
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      tags: ["mpc", "groove", "eighth-hats"],
      comparison: expect.objectContaining({ bpm: 240 }),
    }),
  );
  expect(stop).toHaveBeenCalled();
  button("Again")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  button("Stop")?.click();
  expect(document.querySelector('[aria-label="Expected groove"]')).toBeNull();
  view.unmount();
  runtime.dispose();
});

test("cancelled deferred groove start cannot open input or schedule a deadline", async () => {
  setTestUrl("/music/play/mpc?mode=groove&bpm=240");
  const runtime = new MusicRuntime();
  let resolveStart!: (result: Awaited<ReturnType<typeof runtime.beginPerformance>>) => void;
  vi.mocked(runtime.beginPerformance).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const start = vi.spyOn(TechniqueSession.prototype, "startMpcGroove");
  const view = render(Page, { runtime });
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Start")?.click();
  await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalled());
  button("Stop")?.click();
  resolveStart({ status: "started", downbeat: monotonicMs(performance.now()) });
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  expect(start).not.toHaveBeenCalled();
  view.unmount();
  runtime.dispose();
});

test("Demo plays the same model the count-in reference plays", async () => {
  // turnaround-fill authors a landing kick on the downbeat after its four bars:
  // it belongs to the response, so neither the reference nor Demo sounds it.
  setTestUrl("/music/play/mpc?mode=groove&groove=turnaround-fill&bpm=240");
  const runtime = new MusicRuntime();
  vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
  const play = vi.spyOn(runtime.sound, "playPercussion").mockImplementation(() => {});
  const view = render(Page, { runtime });

  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Demo")?.click();

  await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(51), { timeout: 8000 });
  await vi.waitFor(() => expect(button("Demo")).not.toBeUndefined(), { timeout: 8000 });
  expect(play).toHaveBeenCalledTimes(51);
  view.unmount();
  runtime.dispose();
}, 15000);

test("Demo is locked while a start is in flight", async () => {
  // Rudiment mode keeps the ready stage up across the count-in (groove mode swaps
  // to the stage as soon as its reference starts), so this is where Demo is exposed.
  setTestUrl("/music/play/mpc?bpm=240&hits=8");
  const runtime = new MusicRuntime();
  vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
  vi.spyOn(runtime.sound, "playPercussion").mockImplementation(() => {});
  let resolveStart!: (result: {
    status: "started";
    downbeat: ReturnType<typeof monotonicMs>;
  }) => void;
  vi.mocked(runtime.beginPerformance).mockReturnValue(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const view = render(Page, { runtime });

  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Start")?.click();
  await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());

  // The count-in is running with the ready stage, and its Demo control, still up.
  expect(button("Demo")?.disabled).toBe(true);
  button("Demo")?.click();
  expect(mode()).not.toBe("demo");
  resolveStart({ status: "started", downbeat: monotonicMs(performance.now()) });

  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  expect(mode()).toBe("practice");
  expect(document.body.textContent).not.toContain("listening, not scored");
  view.unmount();
  runtime.dispose();
});

test("Demo plays the groove model once and writes nothing", async () => {
  setTestUrl("/music/play/mpc?mode=groove&bpm=240");
  const runtime = new MusicRuntime();
  vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
  const play = vi.spyOn(runtime.sound, "playPercussion").mockImplementation(() => {});
  const startGroove = vi.spyOn(TechniqueSession.prototype, "startMpcGroove");
  const recordPractice = vi.spyOn(runtime, "recordPractice");
  const view = render(Page, { runtime });

  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  expect(mode()).toBe("practice");
  button("Demo")?.click();

  await vi.waitFor(() => expect(button("Stop demo")).not.toBeUndefined());
  expect(mode()).toBe("demo");
  expect(document.body.textContent).toContain("listening, not scored");
  // The pad grid comes on so the model is visible as well as audible.
  expect(document.querySelector('[aria-label="MPC pad grid"]')).not.toBeNull();
  await vi.waitFor(() => expect(play).toHaveBeenCalled());
  // A demonstration is not a run: nothing starts, nothing is scored, nothing is journalled.
  expect(runtime.beginPerformance).not.toHaveBeenCalled();
  expect(startGroove).not.toHaveBeenCalled();
  expect(recordPractice).not.toHaveBeenCalled();

  button("Stop demo")?.click();
  await vi.waitFor(() => expect(button("Demo")).not.toBeUndefined());
  expect(mode()).toBe("practice");
  expect(document.body.textContent).not.toContain("listening, not scored");
  view.unmount();
  runtime.dispose();
});

test("Demo plays the rudiment model and the graded run takes it off the stage", async () => {
  setTestUrl("/music/play/mpc?bpm=240&hits=8");
  const runtime = new MusicRuntime();
  vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
  const play = vi.spyOn(runtime.sound, "playPercussion").mockImplementation(() => {});
  const store = new PracticeStore();
  const eventsBefore = (await store.scoringEvents.all()).length;
  const view = render(Page, { runtime });

  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Demo")?.click();
  await vi.waitFor(() => expect(play).toHaveBeenCalled());
  expect(mode()).toBe("demo");
  // The model must not change under a demo that is already sounding.
  expect(document.querySelector("fieldset")?.disabled).toBe(true);
  // The acceptance itself: the stored scoring-event list is unchanged by a demo.
  button("Stop demo")?.click();
  await vi.waitFor(() => expect(button("Demo")).not.toBeUndefined());
  expect((await store.scoringEvents.all()).length).toBe(eventsBefore);

  // Starting a run leaves Demo behind: the stage carries no demonstration control.
  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  expect(mode()).toBe("practice");
  expect(button("Demo")).toBeUndefined();
  expect(button("Stop demo")).toBeUndefined();
  view.unmount();
  runtime.dispose();
});

test("failed reference scheduling disposes partially queued groove sound", async () => {
  setTestUrl("/music/play/mpc?mode=groove");
  const runtime = new MusicRuntime();
  const stop = vi.spyOn(runtime.sound, "stopPercussion");
  vi.mocked(runtime.beginPerformance).mockResolvedValueOnce({
    status: "failed",
    message: "Reference playback failed.",
  });
  const view = render(Page, { runtime });
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  stop.mockClear();
  button("Start")?.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain("Reference playback failed."));
  expect(stop.mock.calls.length).toBeGreaterThanOrEqual(2);
  view.unmount();
  runtime.dispose();
});

test("plays the four-bar reference and reports the fill section on its own", async () => {
  setTestUrl("/music/play/mpc?mode=groove&groove=turnaround-fill&bpm=300");
  const runtime = new MusicRuntime();
  const play = vi.spyOn(runtime.sound, "playPercussion").mockImplementation(() => {});
  vi.mocked(runtime.beginPerformance).mockImplementation(async (options) => {
    options?.leadIn?.onStart({
      kind: "beat",
      atSeconds: 10,
      atMonotonicMs: monotonicMs(performance.now()),
      beat: 0,
      absoluteBeat: 0,
      subdivision: 0,
      accented: true,
      countingIn: true,
    });
    return { status: "started", downbeat: monotonicMs(performance.now()) };
  });
  vi.spyOn(runtime, "recordPractice").mockResolvedValue(undefined);
  const view = render(Page, { runtime });
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Start")?.click();

  // The 51 onsets inside the four-bar model; the closing downbeat of bar 5 belongs to
  // the response, so the reference does not play it over the count-in click.
  await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(51));
  expect(runtime.beginPerformance).toHaveBeenCalledWith(
    expect.objectContaining({ leadIn: expect.objectContaining({ bars: 4 }) }),
  );
  await vi.waitFor(() => expect(document.body.textContent).toContain("Groove complete"), {
    timeout: 8000,
  });
  expect(document.body.textContent).toContain("Groove: 0 of 37");
  expect(document.body.textContent).toContain("Fill: 0 of 15");
  view.unmount();
  runtime.dispose();
}, 15000);
