import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
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
    const scaleSelect = document.querySelector<HTMLSelectElement>("#scale-kind");
    expect(scaleSelect).not.toBeNull();
    const values = [...(scaleSelect?.options ?? [])].map((option) => option.value);
    expect(values).toContain("major");
    expect(values).toContain("harmonic-minor");
    expect(values).toContain("blues");
    expect(values).toContain("dorian");
    expect(values).toContain("altered");
    expect(values).toContain("bebop-major");
    // Grouped into Modes vs Jazz/modal.
    expect(scaleSelect?.querySelectorAll("optgroup")).toHaveLength(2);
    expect(select("Span")?.value).toBe("one-octave");
    expect(select("Motion")?.value).toBe("up");
  });

  test("restores setup from shareable query parameters", async () => {
    window.history.replaceState(
      {},
      "",
      "/music/play/scales?scale=blues&tonic=Eb4&instrument=guitar&bpm=90&span=two-octave&motion=up-down",
    );

    render(Page);

    expect(document.querySelector<HTMLSelectElement>("#scale-kind")?.value).toBe("blues");
    expect(select("Tonic")?.value).toBe("Eb4");
    expect(select("Span")?.value).toBe("two-octave");
    expect(select("Motion")?.value).toBe("up-down");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    expect(input("Tempo")?.value).toBe("90");
    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    window.history.replaceState({}, "", "/music/play/scales");
    render(Page);

    const scaleSelect = document.querySelector<HTMLSelectElement>("#scale-kind");
    if (!scaleSelect) throw new Error("Scale selector not found");
    scaleSelect.value = "dorian";
    scaleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    select("Tonic")!.value = "F4";
    select("Tonic")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Span")!.value = "pentascale";
    select("Span")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Motion")!.value = "down";
    select("Motion")!.dispatchEvent(new Event("change", { bubbles: true }));
    button("Ukulele")?.click();
    input("Tempo")!.value = "90";
    input("Tempo")!.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => expect(window.location.search).toContain("scale=dorian"));
    expect(window.location.search).toContain("tonic=F4");
    expect(window.location.search).toContain("instrument=ukulele");
    expect(window.location.search).toContain("bpm=90");
    expect(window.location.search).toContain("span=pentascale");
    expect(window.location.search).toContain("motion=down");
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
    expect(button("Practice next tempo")).not.toBeUndefined();
    expect(button("Slow down")).not.toBeUndefined();
  });

  test("offers a slower retry after a completed scale run", async () => {
    window.history.replaceState({}, "", "/music/play/scales?bpm=90");
    render(Page);
    await vi.waitFor(() => expect(button("Start Scale")?.disabled).toBe(false));

    button("Start Scale")?.click();
    await vi.waitFor(() => expect(button("C4")).not.toBeUndefined());
    for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
      button(note)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Scale complete"));
    expect(button("Slow down")).not.toBeUndefined();
    button("Slow down")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("90 BPM"));
    expect(window.location.search).toContain("bpm=90");
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

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}
