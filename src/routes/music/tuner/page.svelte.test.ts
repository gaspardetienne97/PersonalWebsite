import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/tuner/+page.svelte", () => {
  test("consolidates tuning, intonation, and drone controls into one tool", async () => {
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
    expect(document.body.textContent).toContain("Scale in tune");
    expect(document.body.textContent).toContain("Pitch trace");

    const drone = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Drone",
    );
    drone?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play drone"));
    expect(document.body.textContent).toContain("Timbre");
    expect(document.body.textContent).toContain("Reference A4");
  });
});
