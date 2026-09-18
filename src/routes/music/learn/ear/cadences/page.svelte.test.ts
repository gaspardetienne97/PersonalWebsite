import { continueEarPractice } from "../_components/ear-test-helpers";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";
import { answerChoiceButton, openSetup, setupEarTest } from "../_components/ear-test-helpers";

describe("/music/learn/ear/cadences/+page.svelte", () => {
  setupEarTest();

  test("starts cadence recognition and advances from a choice answer", async () => {
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page);
    await openSetup();

    const cadence = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start",
    );
    await vi.waitFor(() => expect(cadence?.disabled).toBe(false));
    cadence?.click();

    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    expect(document.body.textContent).toContain("What cadence did you hear?");
    expect(document.body.textContent).toContain("Authentic");
    expect(document.body.textContent).toContain("Listen, then choose an answer below.");
    expect(document.body.textContent).not.toContain("or play it on your instrument");
    answerChoiceButton()?.click();
    await continueEarPractice();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
  });
});
