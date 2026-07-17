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

  test("completes an eight-hit run through the on-screen MPC grid", async () => {
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });

    expect(document.querySelector("h1")?.textContent).toContain("MPC Rudiments");
    expect(document.querySelector('[aria-label="MPC pad grid"]')).not.toBeNull();
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")?.disabled).toBe(false));
    expect(runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ variantKey: "v1:mpc:single-strokes", pinnedInstrument: "mpc" }),
    );
    expect(document.querySelector("fieldset")?.disabled).toBe(true);

    for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
      pad(midi)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Rudiment complete");
      expect(button("Repeat rudiment")).not.toBeUndefined();
    });
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
    expect(document.body.textContent).toContain("Tempo · 80 BPM");
    expect(window.location.search).toContain("bpm=80");
  });
});

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
