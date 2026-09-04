import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { openSetup, setupEarTest } from "../_components/ear-test-helpers";

describe("/music/learn/ear/melody-dictation/+page.svelte", () => {
  setupEarTest();

  test("starts melody dictation in play-back mode and advances from on-screen notes", async () => {
    render(Page);
    await openSetup();

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Play-back")
      ?.click();
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent?.trim() === "Play-back")
          ?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );

    const melody = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start",
    );
    await vi.waitFor(() => expect(melody?.disabled).toBe(false));
    vi.useFakeTimers();
    melody?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play back the phrase"));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="melody-slot-stage"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="melody-slot-stage"]')?.textContent).toContain(
      "Phrase memory",
    );
    expect(document.querySelector('[data-testid="melody-slot-stage"]')?.textContent).toContain(
      "3 notes",
    );
    expect(document.querySelector('[data-testid="melody-slot-stage"]')?.textContent).toContain(
      "Hear tonic again",
    );
    expect(document.querySelectorAll('[data-testid="melody-slot"]')).toHaveLength(3);

    [...document.querySelectorAll("button")].find((button) => button.textContent === "C4")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="melody-slot"]')?.textContent).toContain("C4"),
    );

    for (const noteName of ["F4", "C4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="phrase-result-feedback"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "Position feedback",
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "/ 3 matched",
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "Expected",
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "Played",
    );
    const resultStates = [
      ...document.querySelectorAll('[data-testid="phrase-result-position"]'),
    ].map((element) => element.getAttribute("data-state"));
    expect(resultStates).toHaveLength(3);
    expect(resultStates).toContain("review");
  });
});
