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
    downbeat: monotonicMs(0),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  setTestUrl("/");
});

describe("/music/learn/aerophone/+page.svelte", () => {
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

  test("shows the CC2 long-tone trainer for the selected fingering", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Aerophone");
    expect(document.body.textContent).toContain("Long Tone Trainer");
    expect(document.body.textContent).toContain("G4");
    expect(document.body.textContent).toContain("Breath CC2");
    expect(button("Dynamic swell")).not.toBeUndefined();
    expect(button("Articulation")).not.toBeUndefined();
    expect(button("Interval landing")).not.toBeUndefined();
    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));

    button("Start long tone")?.click();
    await vi.waitFor(() => expect(button("Cancel long tone")?.disabled).toBe(false));
    button("Cancel long tone")?.click();
    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));

    button("Dynamic swell")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Dynamic Swell Trainer");
      expect(button("Start dynamic swell")).not.toBeUndefined();
    });
  });

  test("starts the Aerophone engine only after the shared downbeat", async () => {
    const runtime = new MusicRuntime();
    let resolve!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    vi.spyOn(runtime, "beginPerformance").mockReturnValue(
      new Promise((settle) => {
        resolve = settle;
      }),
    );
    const startLongTone = vi
      .spyOn(TechniqueSession.prototype, "startLongTone")
      .mockResolvedValue({} as never);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));
    button("Start long tone")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(startLongTone).not.toHaveBeenCalled();

    resolve({ status: "started", downbeat: monotonicMs(1_234) });
    await vi.waitFor(() => expect(startLongTone).toHaveBeenCalledOnce());
  });

  test("keeps Aerophone setup when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Playback voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const startLongTone = vi.spyOn(TechniqueSession.prototype, "startLongTone");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));
    button("Start long tone")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Playback voice unavailable."),
    );
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(startLongTone).not.toHaveBeenCalled();
    expect(button("Start long tone")).not.toBeUndefined();
  });

  test("runs the articulation drill from the unified Aerophone surface", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));
    button("Articulation")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation Trainer");
      expect(button("Start articulation drill")).not.toBeUndefined();
    });

    const styles = [...document.querySelectorAll('[aria-label="Articulation style"] button')].map(
      (candidate) => candidate.textContent?.trim(),
    );
    expect(styles).toEqual(["Staccato", "Legato"]);

    button("Start articulation drill")?.click();
    await vi.waitFor(() => expect(button("Cancel articulation drill")).not.toBeUndefined());

    for (let index = 0; index < 8; index += 1) keyboardKey("G4")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation complete");
      expect(button("Repeat at 90 BPM")).not.toBeUndefined();
      expect(button("Slow to 70 BPM")).not.toBeUndefined();
      expect(document.body.textContent).toContain("Summary dimensions");
      expect(document.body.textContent).toContain("Pitch");
      expect(document.body.textContent).toContain("Breath");
      expect(document.body.textContent).toContain("Articulation");
      expect(document.body.textContent).toContain("Duration");
    });

    button("Slow to 70 BPM")?.click();
    await vi.waitFor(() => {
      expect(button("Start articulation drill")).not.toBeUndefined();
      expect(new URLSearchParams(window.location.search).get("bpm")).toBe("70");
    });
  });

  test("switches the central technique stage by Aerophone drill mode", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));
    expect(document.body.textContent).toContain("Long-tone stage");
    expect(document.body.textContent).toContain("Pitch lane");
    expect(document.body.textContent).toContain("Breath steadiness");
    expect(document.body.textContent).toContain("Hold timer");

    button("Dynamic swell")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Swell envelope");
      expect(document.body.textContent).toContain("Target CC2 envelope");
      expect(document.body.textContent).toContain("Actual CC2 envelope");
    });

    button("Articulation")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation attack grid");
      expect(document.body.textContent).toContain("Duration markers");
      expect(document.body.textContent).toContain("Breath starts");
      expect(document.body.textContent).toContain("35% beat target");
    });

    button("Legato")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("95% beat target");
    });

    button("Interval landing")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Drone interval lane");
      expect(document.body.textContent).toContain("Drone");
      expect(document.body.textContent).toContain("Landing");
    });
  });

  test("restores and syncs the shareable Aerophone setup URL", async () => {
    setTestUrl("/music/learn/aerophone?mode=articulation&target=69&style=legato&bpm=110");
    render(Page);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation Trainer");
      expect(document.body.textContent).toContain("Target A4");
      expect(button("Legato")).toHaveAttribute("aria-pressed", "true");
      expect(document.querySelector('[aria-label="Articulation tempo"]')?.textContent).toContain(
        "110 BPM",
      );
    });

    button("Long tone")?.click();
    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("mode")).toBe("long-tone");
      expect(params.get("target")).toBe("69");
      expect(params.get("duration")).toBe("5000");
    });

    button("8 sec")?.click();
    buttonByLabel("Next note")?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("target")).toBe("70");
      expect(params.get("duration")).toBe("8000");
    });
  });

  test("restores and starts the interval landing drill", async () => {
    setTestUrl("/music/learn/aerophone?mode=interval-landing&target=60&interval=P5&duration=3000");
    render(Page);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Interval Landing Trainer");
      expect(document.body.textContent).toContain("Target C4");
      expect(button("Perfect fifth")).toHaveAttribute("aria-pressed", "true");
      expect(button("Start interval landing")?.disabled).toBe(false);
    });

    button("Start interval landing")?.click();
    await vi.waitFor(() => {
      expect(button("Cancel interval landing")).not.toBeUndefined();
      expect(document.body.textContent).toContain("Land on G4 over the C4 drone");
    });
  });

  test("restores and starts a descending interval landing below the drone", async () => {
    setTestUrl(
      "/music/learn/aerophone?mode=interval-landing&target=60&interval=P5&direction=down&duration=3000",
    );
    render(Page);

    await vi.waitFor(() => {
      expect(button("Down")).toHaveAttribute("aria-pressed", "true");
      // The landing HUD shows the target below the drone.
      expect(document.body.textContent).toContain("F3");
      expect(button("Start interval landing")?.disabled).toBe(false);
    });

    button("Start interval landing")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Land on F3 below the C4 drone");
    });
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function keyboardKey(label: string): HTMLButtonElement | undefined {
  return [
    ...document.querySelectorAll<HTMLButtonElement>('[aria-label="On-screen keyboard"] button'),
  ].find((candidate) => candidate.textContent?.trim() === label);
}

function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}
