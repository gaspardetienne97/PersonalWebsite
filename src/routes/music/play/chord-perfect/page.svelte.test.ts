import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/chord-perfect/+page.svelte", () => {
  test("completes a guitar C major chord-perfect check on the fretboard", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Chord-Perfect");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));

    button("Start drill")?.click();
    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());

    // C major [0,1,0,2,3,x]: voiced strings sounded low → high.
    for (const [stringNumber, fret] of [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Chord-perfect check");
      expect(button("Repeat chord")).not.toBeUndefined();
    });
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function fretButton(stringNumber: number, fret: number): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(`String ${stringNumber} fret ${fret},`),
  );
}
