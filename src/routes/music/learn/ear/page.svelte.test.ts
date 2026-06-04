import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";

describe("/music/learn/ear/+page.svelte", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SoundEngine.prototype, "enable").mockImplementation(async function () {
      this.enabled = true;
      return { enabled: true, message: "Audio enabled." };
    });
  });

  test("starts a mixed Practice session and advances the session rail", async () => {
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Ear Training");
    expect(document.body.textContent).toContain("Interval");
    expect(document.body.textContent).toContain("Chord Quality");
    expect(document.body.textContent).toContain("Scale Degree");

    const mixed = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Mixed Session"),
    );
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    expect(document.body.textContent).toContain("1 / 10");

    const firstAnswer = document.querySelector<HTMLButtonElement>(
      '[aria-label="Answer choices"] button',
    );
    firstAnswer?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
    expect(document.querySelector('[data-testid="feedback"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Session XP");
    expect(document.body.textContent).toContain("Streak");
  });

  test("supports Test and Play-back modes without immediate correctness", async () => {
    render(Page);
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

    const interval = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start Interval"),
    );
    await vi.waitFor(() => expect(interval?.disabled).toBe(false));
    interval?.click();

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

  test("renders recent results and retry actions in the summary", async () => {
    render(Page);
    const mixed = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Mixed Session"),
    );
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    for (let index = 0; index < 10; index += 1) {
      await vi.waitFor(() =>
        expect(
          document.querySelector<HTMLButtonElement>('[aria-label="Answer choices"] button'),
        ).not.toBeNull(),
      );
      document.querySelector<HTMLButtonElement>('[aria-label="Answer choices"] button')?.click();
      if (index < 9) {
        await vi.waitFor(() => expect(document.body.textContent).toContain(`${index + 2} / 10`));
      }
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("Recent results");
    expect(document.body.textContent).toContain("Retry mistakes");
    expect(document.body.textContent).toContain("Repeat session");
  });
});
