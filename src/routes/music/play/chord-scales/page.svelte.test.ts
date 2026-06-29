import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/chord-scales/+page.svelte", () => {
  test("renders the ii-V-I changes with each chord's go-to scale", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Chord-Scale Drill");

    const body = document.body.textContent ?? "";
    // Major ii-V-I is the default: Dm7 (Dorian), G7 (Mixolydian), Cmaj7 (Major).
    expect(body).toContain("Dm7");
    expect(body).toContain("D Dorian");
    expect(body).toContain("G Mixolydian");
    expect(body).toContain("C Major");

    const actions = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(actions).toContain("Hear scale");
    expect(actions).toContain("Play it back");
  });

  test("switching to minor changes swaps in the altered/locrian scales", async () => {
    render(Page);

    const minor = [...document.querySelectorAll('[aria-label="Changes"] button')].find(
      (button) => button.textContent?.trim() === "Minor ii-V-i",
    ) as HTMLButtonElement | undefined;
    minor?.click();
    await Promise.resolve();

    const body = document.body.textContent ?? "";
    expect(body).toContain("G Altered");
    expect(body).toContain("D Locrian");
  });
});
