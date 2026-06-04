import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

describe("/music/learn/reading/+page.svelte", () => {
  test("shows flashcard and sight-reading setup", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Note Reading");
    expect(document.body.textContent).toContain("Flashcards");
    expect(document.body.textContent).toContain("Sight-Reading");
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
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
    button("Wait")?.click();
    button("Start Sight-Reading")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    button("Start count-in")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Expected notes"));

    for (let index = 0; index < 32 && button("Finish phrase")?.disabled; index += 1) {
      const targets = [
        ...document.querySelectorAll<HTMLButtonElement>('[data-testid="expected-note"]'),
      ];
      for (const target of targets) target.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Expected notes"));
    }

    button("Finish phrase")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("100% accuracy"));
  });

  test("starts guitar performance sight reading with timing controls", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start Flashcards")?.disabled).toBe(false));
    button("Sight-Reading")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#reading-tempo")).not.toBeNull(),
    );
    button("Guitar")?.click();
    button("Performance")?.click();
    setInput(document.querySelector<HTMLInputElement>("#reading-tempo")!, "120");
    button("Strict")?.click();
    button("Compound")?.click();
    button("Start Sight-Reading")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Count-in ready"));
    expect(document.body.textContent).toContain("Standard");
    expect(document.body.textContent).toContain("120 BPM");
    expect(document.body.textContent).toContain("Strict timing");
    button("Start count-in")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Timing feedback"));
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
