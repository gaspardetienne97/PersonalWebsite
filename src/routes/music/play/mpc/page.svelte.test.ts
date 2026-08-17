import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { tick } from "svelte";
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

    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));
    button("Start rudiment")?.click();
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
    expect(select("Left pad")).not.toBeUndefined();
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")?.disabled).toBe(false));
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
      expect(button("Repeat rudiment")).not.toBeUndefined();
      expect(button("Change setup")).not.toBeUndefined();
      expect(document.activeElement?.textContent).toContain("Rudiment complete");
    });
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
      "MPC results ready",
    );

    button("Change setup")?.click();
    await vi.waitFor(() => expect(select("Left pad")).not.toBeUndefined());
    expect(button("Cancel rudiment")).toBeUndefined();
    expect(button("Change setup")).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Single strokes");
  });

  test("rejects identical left and right pads", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    const right = document.querySelector<HTMLSelectElement>('[aria-label="Right pad"]');
    if (!right) throw new Error("Right pad selector not found");
    right.value = "36";
    right.dispatchEvent(new Event("input", { bubbles: true }));
    right.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    button("Start rudiment")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Choose two different MPC pads.");
      expect(button("Cancel rudiment")).toBeUndefined();
    });
  });

  test("cancels an active run and allows a restart", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
    button("Cancel rudiment")?.click();
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl("/music/play/mpc?pattern=moving-accent&left=40&right=41&hits=16&bpm=100");

    render(Page);

    expect(button("Moving accent")).toHaveAttribute("aria-pressed", "true");
    expect(select("Left pad")?.value).toBe("40");
    expect(select("Right pad")?.value).toBe("41");
    expect(button("16 hits")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Tempo · 100 BPM"));
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/play/mpc");
    const runtime = new MusicRuntime();
    render(Page, { runtime });

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
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Paradiddle")?.click();
    button("Start rudiment")?.click();

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
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Moving accent")?.click();
    button("Start rudiment")?.click();

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
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
    for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
      pad(midi)?.click();
    }

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
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

    button("Repeat rudiment")?.click();

    await vi.waitFor(() => expect(beginPerformance).toHaveBeenCalledOnce());
    expect(document.body.textContent).not.toContain("Rudiment complete");
    expect(button("Starting...")?.disabled).toBe(true);
    expect(button("Change setup")).toBeUndefined();

    resolveActivation({ status: "failed", message: "MPC transport unavailable." });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("MPC transport unavailable."),
    );
    expect(document.body.textContent).not.toContain("Rudiment complete");
    expect(button("Start rudiment")?.disabled).toBe(false);
    expect(button("Cancel rudiment")).toBeUndefined();
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
    button("Repeat rudiment")?.click();
    button("Change setup")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(beginPerformance).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Rudiment complete");
    expect(button("Start rudiment")?.disabled).toBe(false);
    expect(button("Cancel rudiment")).toBeUndefined();
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

    button("Repeat rudiment")?.click();
    await vi.waitFor(() => expect(beginPerformance).toHaveBeenCalledOnce());
    invokeChangeSetup.call(changeSetup, new MouseEvent("click"));
    await tick();

    expect(button("Starting...")?.disabled).toBe(true);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Setup ready.");
    button("Starting...")?.click();
    expect(beginPerformance).toHaveBeenCalledOnce();

    resolveActivation({ status: "started", downbeat: monotonicMs(2_000) });
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));
    expect(endPerformance).toHaveBeenCalledOnce();

    endPerformance.mockClear();
    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
    expect(beginPerformance).toHaveBeenCalledTimes(2);
    expect(endPerformance).not.toHaveBeenCalled();
  });
});

async function completeRudiment(): Promise<void> {
  await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));
  button("Start rudiment")?.click();
  await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
  for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
    pad(midi)?.click();
  }
  await vi.waitFor(() => expect(button("Repeat rudiment")).not.toBeUndefined());
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
