import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("/music/learn/reading/+page.svelte", () => {
  test("shows flashcard and sight-reading setup", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Note Reading");
    expect(document.body.textContent).toContain("Flashcards");
    expect(document.body.textContent).toContain("Sight-Reading");
    expect(button("Enable MIDI")).not.toBeUndefined();
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
  });

  test("restores setup from shareable query parameters", async () => {
    window.history.replaceState(
      {},
      "",
      "/music/learn/reading?activity=sight-reading&instrument=guitar&tuning=guitar-drop-d&answer=play&mode=performance&key=G%20major&difficulty=0.7&bpm=120&strict=strict&meter=compound&measures=4",
    );

    render(Page);

    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    expect(button("Sight-Reading")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Guitar")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Play")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Assess")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Strict")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Compound")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector<HTMLSelectElement>("#reading-key")?.value).toBe("G major");
    expect(document.querySelector<HTMLInputElement>("#reading-difficulty")?.value).toBe("0.7");
    expect(document.querySelector<HTMLInputElement>("#reading-tempo")?.value).toBe("120");
    expect(document.querySelector<HTMLInputElement>("#reading-measures")?.value).toBe("4");
  });

  test("keeps setup changes in the shareable URL", async () => {
    window.history.replaceState({}, "", "/music/learn/reading");
    render(Page);

    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    button("Ukulele")?.click();
    button("Play")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#reading-tempo")).not.toBeNull(),
    );
    button("Assess")?.click();
    button("Strict")?.click();
    button("Compound")?.click();
    setInput(document.querySelector<HTMLInputElement>("#reading-tempo")!, "132");
    setInput(document.querySelector<HTMLInputElement>("#reading-measures")!, "3");
    setInput(document.querySelector<HTMLInputElement>("#reading-difficulty")!, "0.6");
    const keySelect = document.querySelector<HTMLSelectElement>("#reading-key")!;
    keySelect.value = "D minor";
    keySelect.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("activity")).toBe("sight-reading");
      expect(params.get("instrument")).toBe("ukulele");
      expect(params.get("answer")).toBe("play");
      expect(params.get("mode")).toBe("performance");
      expect(params.get("key")).toBe("D minor");
      expect(params.get("difficulty")).toBe("0.6");
      expect(params.get("bpm")).toBe("132");
      expect(params.get("strict")).toBe("strict");
      expect(params.get("meter")).toBe("compound");
      expect(params.get("measures")).toBe("3");
    });
  });

  test("advances piano choice and guitar play flashcards", async () => {
    const { unmount } = render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Start Flashcards")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 / 10"));
    document.querySelector<HTMLButtonElement>('[aria-label="Answer choices"] button')?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
    expect(document.body.textContent).toContain("Session XP");
    unmount();

    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Guitar")?.click();
    await vi.waitFor(() => expect(button("Standard")).not.toBeNull());
    button("Play")?.click();
    await vi.waitFor(() => expect(button("Play")?.getAttribute("aria-pressed")).toBe("true"));
    button("Start Flashcards")?.click();

    await vi.waitFor(() =>
      expect(document.querySelector<HTMLButtonElement>('[aria-label*=", target"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label*=", target"]')?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
  });

  test("persists and deletes a custom tuning across remounts", async () => {
    const first = render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Guitar")?.click();
    await vi.waitFor(() => expect(button("New custom tuning")).not.toBeNull());
    button("New custom tuning")?.click();
    await vi.waitFor(() => expect(input("Tuning name")).not.toBeNull());

    setInput(input("Tuning name")!, "Route Test Tuning");
    document.querySelector<HTMLButtonElement>('[data-testid="save-tuning"]')?.click();
    await vi.waitFor(() => expect(button("Edit Route Test Tuning")).not.toBeNull());
    first.unmount();

    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Guitar")?.click();
    await vi.waitFor(() => expect(button("Edit Route Test Tuning")).not.toBeNull());
    button("Edit Route Test Tuning")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="delete-tuning"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[data-testid="delete-tuning"]')?.click();
    await vi.waitFor(() => expect(button("Edit Route Test Tuning")).toBeUndefined());
  });

  test("completes wait-mode piano sight reading from on-screen expected notes", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    button("Learn")?.click();
    button("Start Sight-Reading")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    button("Start count-in")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Expected notes"));
    expect(document.querySelector('[data-testid="score-hand-hint"]')?.textContent).toContain(
      "Right hand",
    );
    expect(document.querySelector('[data-notation-cursor="current-group"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-active-note="true"]').length).toBeGreaterThan(0);

    for (let index = 0; index < 32 && button("Finish phrase")?.disabled; index += 1) {
      const targets = [
        ...document.querySelectorAll<HTMLButtonElement>('[data-testid="score-expected-note"]'),
      ];
      for (const target of targets) target.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Expected notes"));
    }

    button("Finish phrase")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("100% accuracy"));
    expect(button("Slow down")).not.toBeUndefined();
    button("Slow down")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("80 BPM"));
    expect(new URLSearchParams(window.location.search).get("bpm")).toBe("80");
  });

  test("starts guitar performance sight reading with timing controls", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#reading-tempo")).not.toBeNull(),
    );
    button("Guitar")?.click();
    button("Assess")?.click();
    setInput(document.querySelector<HTMLInputElement>("#reading-tempo")!, "120");
    button("Strict")?.click();
    button("Compound")?.click();
    button("Start Sight-Reading")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    expect(document.body.textContent).toContain("Standard");
    expect(document.body.textContent).toContain("120 BPM");
    expect(document.body.textContent).toContain("Strict timing");

    // Opt-in fretboard reveal: hidden by default, shows the phrase as VexFlow tab.
    expect(document.querySelector('[aria-label="Guitar tab"]')).toBeNull();
    button("Show tab")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Guitar tab"] svg')).not.toBeNull(),
    );

    button("Start count-in")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Timing feedback"));
  });

  test("restarts sight reading with only missed groups from the summary", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() => expect(button("Start Sight-Reading")?.disabled).toBe(false));
    button("Assess")?.click();
    button("Start Sight-Reading")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    button("Start count-in")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Expected notes"));
    document.querySelector<HTMLButtonElement>('[data-testid="score-expected-note"]')?.click();

    await vi.waitFor(() => expect(button("Finish phrase")?.disabled).toBe(false));
    button("Finish phrase")?.click();
    await vi.waitFor(() => expect(button("Practice missed groups")).not.toBeUndefined());

    button("Practice missed groups")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    expect(document.body.textContent).toContain("Sight-reading phrase");
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

function setInput(element: HTMLInputElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
