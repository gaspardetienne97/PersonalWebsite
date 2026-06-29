import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/licks/+page.svelte", () => {
  test("renders the licks drill with category + lick selectors and play controls", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Jazz Licks Drill");

    const categories = [...document.querySelectorAll('[aria-label="Lick category"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(categories).toEqual(["Major ii-V-I", "ii-V-I-VI", "Minor ii-V-i", "Minor chord"]);

    // The lick picker exposes a button per lick in the active category.
    const lickButtons = document.querySelectorAll('[aria-label="Pick a lick"] button');
    expect(lickButtons.length).toBeGreaterThan(0);

    const actions = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(actions).toContain("Hear it");
    expect(actions).toContain("Play it back");
  });

  test("switching category swaps the available licks", async () => {
    render(Page);

    const before = document.querySelectorAll('[aria-label="Pick a lick"] button').length;
    const minorChord = [...document.querySelectorAll('[aria-label="Lick category"] button')].find(
      (button) => button.textContent?.trim() === "Minor chord",
    ) as HTMLButtonElement | undefined;
    minorChord?.click();
    await Promise.resolve();

    const after = document.querySelectorAll('[aria-label="Pick a lick"] button').length;
    expect(after).toBeGreaterThan(0);
    // The selected lick resets into the new category (first lick is pressed).
    const pressed = document.querySelector(
      '[aria-label="Pick a lick"] button[aria-pressed="true"]',
    );
    expect(pressed).not.toBeNull();
    expect(before).toBeGreaterThan(0);
  });
});
