import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";
import { openSetup, setupEarTest } from "../_components/ear-test-helpers";

describe("/music/learn/ear/intervals/+page.svelte", () => {
  setupEarTest();

  test("supports Test and Play-back modes without immediate correctness", async () => {
    render(Page);
    await openSetup();
    const testMode = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Test",
    );
    const playBack = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Play-back",
    );
    testMode?.click();
    playBack?.click();

    await vi.waitFor(() => expect(testMode?.getAttribute("aria-pressed")).toBe("true"));
    await vi.waitFor(() => expect(playBack?.getAttribute("aria-pressed")).toBe("true"));

    const interval = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start",
    );
    await vi.waitFor(() => expect(interval?.disabled).toBe(false));
    vi.useFakeTimers();
    interval?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
      ).not.toBeNull(),
    );
    expect(
      [...document.querySelectorAll("button")].some((button) => button.textContent === "C#4"),
    ).toBe(true);
    expect(document.querySelector('[data-testid="feedback"]')).toBeNull();
  });

  test("plays interval prompts louder than the default pattern level", async () => {
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page);
    await openSetup();

    const interval = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start",
    );
    await vi.waitFor(() => expect(interval?.disabled).toBe(false));
    interval?.click();

    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    expect(playPattern.mock.calls.at(-1)?.[1]).toBe(1);
  });
});
