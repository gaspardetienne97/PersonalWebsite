import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
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
      expect(button("Slow down")).not.toBeUndefined();
      expect(document.body.textContent).toContain("Summary dimensions");
      expect(document.body.textContent).toContain("Pitch");
      expect(document.body.textContent).toContain("Breath");
      expect(document.body.textContent).toContain("Articulation");
      expect(document.body.textContent).toContain("Duration");
    });

    button("Slow down")?.click();
    await vi.waitFor(() => {
      expect(button("Cancel articulation drill")).not.toBeUndefined();
      expect(new URLSearchParams(window.location.search).get("bpm")).toBe("70");
    });
  });

  test("switches the central technique stage by Aerophone drill mode", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start long tone")?.disabled).toBe(false));
    expect(document.body.textContent).toContain("Long-tone stage");
    expect(document.body.textContent).toContain("Pitch lane");
    expect(document.body.textContent).toContain("Breath steadiness");
    expect(document.body.textContent).toContain("Hold timer");

    button("Dynamic swell")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Swell envelope");
      expect(document.body.textContent).toContain("Target CC2 envelope");
      expect(document.body.textContent).toContain("Actual CC2 envelope");
    });

    button("Articulation")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation attack grid");
      expect(document.body.textContent).toContain("Duration markers");
      expect(document.body.textContent).toContain("Breath starts");
      expect(document.body.textContent).toContain("35% beat target");
    });

    button("Legato")?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("95% beat target");
    });
  });

  test("restores and syncs the shareable Aerophone setup URL", async () => {
    window.history.replaceState(
      {},
      "",
      "/music/learn/aerophone?mode=articulation&target=69&style=legato&bpm=110",
    );
    render(Page);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Articulation Trainer");
      expect(document.body.textContent).toContain("Target A4");
      expect(button("Legato")).toHaveAttribute("aria-pressed", "true");
      expect(button("110 BPM")).toHaveAttribute("aria-pressed", "true");
    });

    button("Long tone")?.click();
    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("mode")).toBe("long-tone");
      expect(params.get("target")).toBe("69");
      expect(params.get("duration")).toBe("5000");
    });

    button("8 sec")?.click();
    buttonByLabel("Next note")?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("target")).toBe("70");
      expect(params.get("duration")).toBe("8000");
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

function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}
