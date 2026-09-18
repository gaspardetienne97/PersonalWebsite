import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";
import { MusicRuntime } from "../../../_runtime.svelte";
import {
  answerChoiceButton,
  button,
  openSetup,
  setupEarTest,
} from "../_components/ear-test-helpers";

describe("/music/learn/ear/mixed/+page.svelte", () => {
  setupEarTest();

  test("starts a mixed Practice session and advances the session rail", async () => {
    const runtime = new MusicRuntime();
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page, { runtime });
    await openSetup();

    expect(document.querySelector("h1")?.textContent).toContain("Ear training review");
    expect(document.querySelector('[data-testid="ear-ready-heading"]')?.textContent).toContain(
      "Ready. Press Start, or Space.",
    );

    const mixed = button("Start");
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    expect(document.body.textContent).toContain("1 / 10");

    const question = document.querySelector("h2")?.textContent;
    const calls = playPattern.mock.calls.length;
    answerChoiceButton()?.click();
    await vi.waitFor(() => expect(button("Continue")).not.toBeUndefined());
    expect(document.body.textContent).toContain("1 / 10");
    expect(document.querySelector("h2")?.textContent).toBe(question);
    expect(playPattern).toHaveBeenCalledTimes(calls);
    expect(document.querySelector('[data-testid="feedback"]')?.textContent).toContain(
      "Your answer:",
    );
    expect(document.activeElement?.textContent).toMatch(/Correct|Review this answer/);
    button("Replay answered sound")?.click();
    expect(playPattern).toHaveBeenCalledTimes(calls + 1);
    button("Continue")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
    expect(document.querySelector("h2")?.textContent).not.toBe(question);
    expect(document.querySelector('[data-testid="feedback"]')).toBeNull();
    expect(document.body.textContent).toContain("Session XP");
    expect(document.body.textContent).toContain("Streak");
    expect(beginPerformance).not.toHaveBeenCalled();
  });

  test("keeps setup locked during preflight, then renders only the active stage", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => (resolveVoice = resolve)),
    );
    render(Page, { runtime });
    await openSetup();

    const mixed = button("Start");
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    await vi.waitFor(() => expect(mixed?.disabled).toBe(true));
    expect(button("Stop")).toBeUndefined();
    expect(document.querySelector('[data-testid="ear-phase-announcement"]')?.textContent).toContain(
      "Starting",
    );

    resolveVoice(true);
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(button("Start")).toBeUndefined();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Ear training session");
  });

  test("returns from the active stage to setup through the standard end action", async () => {
    render(Page);
    await openSetup();

    const mixed = button("Start");
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    button("Stop")?.click();

    await vi.waitFor(() => expect(button("Start")).not.toBeUndefined());
    expect(button("Stop")).toBeUndefined();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Ear training setup");
    expect(document.querySelector('[data-testid="ear-phase-announcement"]')?.textContent).toContain(
      "Session ended",
    );
  });

  test("starts Pocket mode and advances from listening self-assessment", async () => {
    render(Page);
    await openSetup();

    const pocket = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Pocket",
    );
    pocket?.click();
    await vi.waitFor(() => expect(pocket?.getAttribute("aria-pressed")).toBe("true"));

    const mixed = button("Start");
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Pocket recall"));
    expect(document.querySelector('[aria-label="Answer choices"]')).toBeNull();
    expect(document.querySelector('[role="group"][aria-label="On-screen keyboard"]')).toBeNull();

    expect(document.querySelector('[data-testid="revealed-answer"]')).toBeNull();
    expect(button("I recalled it")).toBeUndefined();
    button("Reveal answer")?.click();
    await vi.waitFor(() => expect(button("I recalled it")).not.toBeUndefined());
    expect(document.activeElement).toBe(document.querySelector('[data-testid="revealed-answer"]'));
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "I recalled it")
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
  });

  test("plays Listen along without rating or scoring, and cancels its timer on Stop", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern").mockImplementation(() => undefined);
    const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue(undefined);
    render(Page, { runtime });
    await openSetup();
    button("Listen along")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    vi.useFakeTimers();
    button("Start")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="revealed-answer"]')).not.toBeNull(),
    );
    expect(button("Reveal answer")).toBeUndefined();
    expect(button("I recalled it")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Accuracy");
    button("Stop")?.focus();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(document.activeElement).toBe(button("Stop"));
    for (let index = 0; index < 9; index++) await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Listen along complete"));
    expect(recordPractice).toHaveBeenCalledWith(
      expect.objectContaining({ scoringEvents: [], xpEarned: 0 }),
    );
    expect(document.body.textContent).not.toContain("0 of 0 correct");
    button("Again")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    button("Stop")?.click();
    const calls = playPattern.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(playPattern).toHaveBeenCalledTimes(calls);
    expect(button("Start")).not.toBeUndefined();
  });

  test("stops the free-play drone before starting a scored session", async () => {
    const stopDrone = vi.spyOn(SoundEngine.prototype, "stopDrone");
    render(Page);
    await openSetup();

    const startDroneButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start drone"),
    );
    await vi.waitFor(() => expect(startDroneButton?.disabled).toBe(false));
    startDroneButton?.click();

    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")].some((button) =>
          button.textContent?.includes("Stop drone"),
        ),
      ).toBe(true),
    );

    const mixed = button("Start");
    mixed?.click();

    await vi.waitFor(() => expect(stopDrone).toHaveBeenCalled());
  });

  test("renders recent results and retry actions in the summary", async () => {
    render(Page);
    await openSetup();
    const mixed = button("Start");
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    for (let index = 0; index < 10; index += 1) {
      await vi.waitFor(() => expect(answerChoiceButton()).not.toBeNull());
      answerChoiceButton()?.click();
      await vi.waitFor(() => expect(button("Continue")).not.toBeUndefined());
      button("Continue")?.click();
      if (index < 9) {
        await vi.waitFor(() => expect(document.body.textContent).toContain(`${index + 2} / 10`));
      }
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("Recent results");
    expect(document.body.textContent).toContain("Retry mistakes");
    expect(button("Again")).not.toBeUndefined();
    expect(document.body.textContent).toContain("Change setup");
    expect(document.activeElement?.textContent).toContain("Session complete");
    expect(document.querySelector('[data-testid="ear-phase-announcement"]')?.textContent).toContain(
      "Session complete",
    );

    button("Change setup")?.click();

    await vi.waitFor(() => expect(button("Start")).not.toBeUndefined());
    expect(document.body.textContent).not.toContain("Recent results");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Ear training setup");
  });
});
