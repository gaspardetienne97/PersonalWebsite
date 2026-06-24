import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/spider/+page.svelte", () => {
  test("completes a guitar 1-2-3-4 pattern on the fretboard", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Spider Drill");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));

    button("Start spider")?.click();
    await vi.waitFor(() => expect(button("Cancel spider")).not.toBeUndefined());

    for (const fret of [5, 6, 7, 8]) {
      fretButton(6, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Spider complete");
      expect(button("Repeat spider")).not.toBeUndefined();
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
