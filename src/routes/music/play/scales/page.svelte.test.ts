import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/scales/+page.svelte", () => {
  test("shows scale setup with MIDI and tempo controls", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Scales & Technique");
    expect(button("Enable MIDI")).not.toBeUndefined();
    expect(input("Tempo")).not.toBeNull();
    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
  });

  test("offers a scale selector with modes and jazz scales", async () => {
    render(Page);
    const select = document.querySelector<HTMLSelectElement>("#scale-kind");
    expect(select).not.toBeNull();
    const values = [...(select?.options ?? [])].map((option) => option.value);
    expect(values).toContain("major");
    expect(values).toContain("dorian");
    expect(values).toContain("altered");
    // Grouped into Modes vs Jazz/modal.
    expect(select?.querySelectorAll("optgroup")).toHaveLength(2);
  });

  test("completes an on-screen C major scale with evenness feedback", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
    button("Start Scale")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("C Major"));
    for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
      button(note)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Scale complete"));
    expect(document.body.textContent).toContain("Evenness error:");
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function input(label: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
}
