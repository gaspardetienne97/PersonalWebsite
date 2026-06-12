import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { tick } from "svelte";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/mpc/+page.svelte", () => {
  test("completes an eight-hit run through the on-screen MPC grid", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("MPC Rudiments");
    expect(document.querySelector('[aria-label="MPC pad grid"]')).not.toBeNull();
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")?.disabled).toBe(false));
    expect(document.querySelector("fieldset")?.disabled).toBe(true);

    for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
      pad(midi)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Rudiment complete");
      expect(button("Repeat rudiment")).not.toBeUndefined();
    });
  });

  test("rejects identical left and right pads", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    const right = document.querySelector<HTMLSelectElement>('[aria-label="Right pad"]');
    if (!right) throw new Error("Right pad selector not found");
    right.value = "36";
    right.dispatchEvent(new Event("input", { bubbles: true }));
    right.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    button("Start rudiment")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Choose two different MPC pads.");
      expect(button("Cancel rudiment")).toBeUndefined();
    });
  });

  test("cancels an active run and allows a restart", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
    button("Cancel rudiment")?.click();
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function pad(midi: number): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[aria-label="Pad ${midi}"]`);
}
