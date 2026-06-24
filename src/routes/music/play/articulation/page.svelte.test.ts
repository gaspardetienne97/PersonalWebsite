import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/articulation/+page.svelte", () => {
  test("renders the style toggle and completes the pitch run from on-screen keys", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Aerophone Articulation");
    const styles = [...document.querySelectorAll('[aria-label="Articulation"] button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(styles).toEqual(["Staccato", "Legato"]);

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    button("Start drill")?.click();
    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());

    // The on-screen keyboard sends noteOn only, so this completes the 8-note
    // pitch run; articulation needs a wind controller (note-off + breath).
    for (let i = 0; i < 8; i += 1) keyboardKey("G4")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation check");
      expect(button("Repeat drill")).not.toBeUndefined();
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
