import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { tick } from "svelte";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
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

  test("restores setup from shareable query parameters", async () => {
    window.history.replaceState(
      {},
      "",
      "/music/play/mpc?pattern=paradiddle&left=40&right=41&hits=16&bpm=100",
    );

    render(Page);

    expect(button("Paradiddle")).toHaveAttribute("aria-pressed", "true");
    expect(select("Left pad")?.value).toBe("40");
    expect(select("Right pad")?.value).toBe("41");
    expect(button("16 hits")).toHaveAttribute("aria-pressed", "true");
    expect(button("100 BPM")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    window.history.replaceState({}, "", "/music/play/mpc");
    render(Page);

    select("Left pad")!.value = "44";
    select("Left pad")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Right pad")!.value = "45";
    select("Right pad")!.dispatchEvent(new Event("change", { bubbles: true }));
    button("Double strokes")?.click();
    button("16 hits")?.click();
    button("120 BPM")?.click();

    await vi.waitFor(() => expect(window.location.search).toContain("pattern=double-strokes"));
    await vi.waitFor(() => expect(window.location.search).toContain("left=44"));
    expect(window.location.search).toContain("right=45");
    expect(window.location.search).toContain("hits=16");
    expect(window.location.search).toContain("bpm=120");
  });

  test("starts a paradiddle rudiment from core pattern data", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Paradiddle")?.click();
    button("Start rudiment")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("MPC paradiddle");
      expect(document.body.textContent).toContain("Pad 36");
      expect(
        document.querySelector('[aria-label="Rudiment sequence lane"]')?.textContent,
      ).toContain("Pad 38");
    });
  });

  test("offers a slower retry after a completed rudiment", async () => {
    render(Page);
    button("100 BPM")?.click();
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
    for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
      pad(midi)?.click();
    }

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
    expect(button("80 BPM")).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toContain("bpm=80");
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

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}
