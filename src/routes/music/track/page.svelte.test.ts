import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

describe("/music/track/+page.svelte", () => {
  test("shows practice journal rollups", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Practice Journal");
    expect(document.body.textContent).toContain("This week");
    expect(document.body.textContent).toContain("Last week");
    await vi.waitFor(() => expect(button("Save journal entry")).not.toBeUndefined());
  });

  test("saves a free-text journal entry into session history", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Save journal entry")).not.toBeUndefined());

    const note = `Route journal ${crypto.randomUUID()}`;
    setTextarea(textarea("Journal note")!, note);
    await vi.waitFor(() => expect(button("Save journal entry")?.disabled).toBe(false));
    button("Save journal entry")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(note));
    expect(document.body.textContent).toContain("free-practice");
  });

  test("edits an existing journal entry", async () => {
    render(Page);
    const note = await saveEntry();

    button("Edit")?.click();
    await vi.waitFor(() => expect(textarea("Edit note")).not.toBeNull());
    const edited = `Edited ${crypto.randomUUID()}`;
    setTextarea(textarea("Edit note")!, edited);
    button("Save changes")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(edited));
    expect(document.body.textContent).not.toContain(note);
  });

  test("removes a journal entry", async () => {
    render(Page);
    const note = await saveEntry();

    button("Delete")?.click();

    await vi.waitFor(() => expect(document.body.textContent).not.toContain(note));
  });
});

async function saveEntry(): Promise<string> {
  await vi.waitFor(() => expect(button("Save journal entry")).not.toBeUndefined());
  const note = `Entry ${crypto.randomUUID()}`;
  setTextarea(textarea("Journal note")!, note);
  await vi.waitFor(() => expect(button("Save journal entry")?.disabled).toBe(false));
  button("Save journal entry")?.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain(note));
  return note;
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function textarea(label: string): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(`[aria-label="${label}"]`);
}

function setTextarea(element: HTMLTextAreaElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
