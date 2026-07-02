import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
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

  test("restores setup from shareable query parameters", async () => {
    window.history.replaceState(
      {},
      "",
      "/music/play/spider?instrument=ukulele&tuning=ukulele.low-g&string=4&fret=7&bpm=100",
    );

    render(Page);

    expect(button("Ukulele")).toHaveAttribute("aria-pressed", "true");
    expect(select("Tuning")?.value).toBe("ukulele.low-g");
    expect(select("String")?.value).toBe("4");
    expect(select("Starting fret")?.value).toBe("7");
    expect(button("100 BPM")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    window.history.replaceState({}, "", "/music/play/spider");
    render(Page);

    button("Ukulele")?.click();
    await vi.waitFor(() => expect(window.location.search).toContain("instrument=ukulele"));
    select("String")!.value = "3";
    select("String")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Starting fret")!.value = "4";
    select("Starting fret")!.dispatchEvent(new Event("change", { bubbles: true }));
    button("120 BPM")?.click();

    await vi.waitFor(() => expect(window.location.search).toContain("string=3"));
    expect(window.location.search).toContain("fret=4");
    expect(window.location.search).toContain("bpm=120");
  });

  test("offers a slower retry after a completed spider run", async () => {
    render(Page);
    button("100 BPM")?.click();
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));
    button("Start spider")?.click();
    await vi.waitFor(() => expect(button("Cancel spider")).not.toBeUndefined());

    for (const fret of [5, 6, 7, 8]) {
      fretButton(6, fret)?.click();
    }

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => expect(button("Cancel spider")).not.toBeUndefined());
    expect(button("80 BPM")).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toContain("bpm=80");
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

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}
