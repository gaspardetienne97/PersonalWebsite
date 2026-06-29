import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/learn/aerophone/+page.svelte", () => {
  test("shows the CC2 long-tone trainer for the selected fingering", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Aerophone");
    expect(document.body.textContent).toContain("Long Tone Trainer");
    expect(document.body.textContent).toContain("G4");
    expect(document.body.textContent).toContain("Breath CC2");
    expect(button("Dynamic swell")).not.toBeUndefined();
    expect(button("Articulation")).not.toBeUndefined();
    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));

    button("Start long tone")?.click();
    await vi.waitFor(() => expect(button("Cancel long tone")?.disabled).toBe(false));
    button("Cancel long tone")?.click();
    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));

    button("Dynamic swell")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Dynamic Swell Trainer");
      expect(button("Start dynamic swell")).not.toBeUndefined();
    });
  });

  test("runs the articulation drill from the unified Aerophone surface", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));
    button("Articulation")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation Trainer");
      expect(button("Start articulation drill")).not.toBeUndefined();
    });

    const styles = [...document.querySelectorAll('[aria-label="Articulation style"] button')].map(
      (candidate) => candidate.textContent?.trim(),
    );
    expect(styles).toEqual(["Staccato", "Legato"]);

    button("Start articulation drill")?.click();
    await vi.waitFor(() => expect(button("Cancel articulation drill")).not.toBeUndefined());

    for (let index = 0; index < 8; index += 1) keyboardKey("G4")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation complete");
      expect(button("Repeat articulation")).not.toBeUndefined();
    });
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function keyboardKey(label: string): HTMLButtonElement | undefined {
  return [
    ...document.querySelectorAll<HTMLButtonElement>('[aria-label="On-screen keyboard"] button'),
  ].find((candidate) => candidate.textContent?.trim() === label);
}
