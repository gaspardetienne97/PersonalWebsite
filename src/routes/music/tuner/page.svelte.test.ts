import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { setTestUrl } from "../_components/test-url";

describe("/music/tuner/+page.svelte", () => {
  test("consolidates tuning, intonation, and drone controls into one tool", async () => {
    setTestUrl("/music/tuner");
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Tuner");
    expect(document.body.textContent).toContain("Tune");
    expect(document.body.textContent).toContain("Intonation");
    expect(document.body.textContent).toContain("Drone");

    const intonation = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Intonation",
    );
    intonation?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Hold the pitch"));
    expect(new URLSearchParams(window.location.search).get("mode")).toBe("intonation");
    expect(document.body.textContent).toContain("Scale in tune");
    expect(document.body.textContent).toContain("Pitch trace");

    const drone = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Drone",
    );
    drone?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play drone"));
    expect(document.body.textContent).toContain("Timbre");
    // Drone has no microphone controls and no reference row; A4 lives under Tune.
    expect(document.body.textContent).not.toContain("Reference A4");
    expect(document.body.textContent).not.toContain("Start mic");
    expect(document.querySelectorAll('[aria-label="Drone tonic"] button')).toHaveLength(12);
  });

  test("shows the arc gauge and the reference row in Tune", async () => {
    setTestUrl("/music/tuner?mode=tune");
    render(Page);
    expect(document.querySelector('[data-testid="arc-gauge"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Reference A4");
    expect(document.body.textContent).toContain("Pluck or play a note");
  });

  test("opens the mode named in the URL", async () => {
    setTestUrl("/music/tuner?mode=drone");
    render(Page);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play drone"));
  });
});
