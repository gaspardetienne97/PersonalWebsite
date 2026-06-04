import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";

describe("/music/learn/theory/+page.svelte", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("searches the catalog and plays and saves Cmaj7", async () => {
    const playChord = vi.spyOn(SoundEngine.prototype, "playChord");
    vi.spyOn(SoundEngine.prototype, "enable").mockImplementation(async function () {
      this.enabled = true;
      return { enabled: true, message: "Audio enabled." };
    });

    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Theory library");
    expect(document.body.textContent).toContain("C major seventh");
    expect(document.body.textContent).toContain("Guitar");
    expect(document.body.textContent).toContain("Ukulele");

    const scales = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Scales",
    );
    scales?.click();

    const search = document.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search).not.toBeNull();
    if (search) {
      search.value = "dorian";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("D Dorian"));
    const dorian = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("D Dorian"),
    );
    dorian?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Dorian mode"));

    scales?.click();
    const chords = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Chords",
    );
    chords?.click();
    if (search) {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.waitFor(() => expect(document.body.textContent).toContain("C major seventh"));
    const cmaj7 = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Cmaj7") && button.getAttribute("aria-pressed"),
    );
    cmaj7?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play Cmaj7"));
    const play = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Play Cmaj7"),
    );
    play?.click();
    await vi.waitFor(() => expect(playChord).toHaveBeenCalledWith([60, 64, 67, 71], 0.8));

    const save = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Save chord"),
    );
    save?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved chord"));
  });
});
