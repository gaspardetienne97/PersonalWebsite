import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("/music/play/two-hand/+page.svelte", () => {
  test("completes a two-hand drill from the on-screen keys", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Two-Hand Independence");
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[aria-label="On-screen keyboard"] svg').length).toBe(2),
    );
    expect(document.querySelector('[data-testid="finger-36"]')?.textContent).toBe("5");
    expect(document.querySelector('[data-testid="finger-60"]')?.textContent).toBe("1");
    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));

    button("Start drill")?.click();
    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());

    // 2 bars: left hand = 8 beats, right hand = 16 eighth notes → 24 notes total.
    for (let beat = 0; beat < 8; beat += 1) button("C2")?.click();
    for (let eighth = 0; eighth < 16; eighth += 1) button("C4")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Drill complete");
      expect(button("Repeat drill")).not.toBeUndefined();
    });
  });

  test("restores and syncs the shareable two-hand setup URL", async () => {
    window.history.replaceState({}, "", "/music/play/two-hand?tonic=G4&bpm=120");
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("120BPM"));
    expect(
      document.querySelector('[aria-label="Key"] button[aria-pressed="true"]')?.textContent,
    ).toBe("G");

    button("F")?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("tonic")).toBe("F4");
      expect(params.get("bpm")).toBe("120");
    });
  });

  test("offers a slower retry after a completed two-hand drill", async () => {
    window.history.replaceState({}, "", "/music/play/two-hand?tonic=C4&bpm=100");
    render(Page);

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    button("Start drill")?.click();
    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());

    for (let beat = 0; beat < 8; beat += 1) button("C2")?.click();
    for (let eighth = 0; eighth < 16; eighth += 1) button("C4")?.click();

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("bpm")).toBe("80");
      expect(button("Cancel drill")).not.toBeUndefined();
    });
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}
