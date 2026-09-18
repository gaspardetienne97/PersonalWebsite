import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { DexieRepository, PracticeStore } from "@repo/music-core/engines/store";
import { unixMs } from "@repo/music-core/domain";

afterEach(() => {
  document.body.replaceChildren();
});

describe("/music/track/+page.svelte", () => {
  test("shows recorded assistance and source without inventing historical provenance", async () => {
    const store = new PracticeStore();
    const id = crypto.randomUUID();
    const base = {
      sessionId: id,
      exerciseId: "reading.flashcard",
      skillIds: [],
      capabilities: [],
      at: unixMs(Date.now()),
      correct: true,
      partialCredit: 1,
      difficulty: 0.5,
      metrics: [],
    };
    await store.sessions.put({
      id,
      startTime: unixMs(Date.now()),
      source: "free-practice",
      runs: [],
      xpEarned: 24,
      tags: ["reading", "v1:reading:piano", "comparison:bpm:96"],
      scoringEvents: [
        {
          ...base,
          id: `${id}-hinted`,
          assistance: "hinted",
          source: "onscreen",
          instrument: "piano",
        },
        { ...base, id: `${id}-legacy` },
      ],
    });
    try {
      render(Page);
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("Hinted · On-screen · piano"),
      );
      expect(document.body.textContent).toContain("Assistance not recorded · Not observed");
      expect(document.body.textContent).not.toContain("comparison:bpm:");
      expect(document.body.textContent).not.toContain("v1:reading:");
    } finally {
      await store.sessions.delete(id);
    }
  });
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

  test("saves Next time, keeps it on Cancel and allows clearing it", async () => {
    render(Page);
    const note = await saveEntry();
    const store = new PracticeStore();
    const saved = (await store.sessions.all()).find((session) => session.notes === note)!;
    const edit = () =>
      document.querySelector<HTMLButtonElement>(`[aria-label="Edit entry ${saved.id}"]`)!.click();
    const input = () =>
      document.querySelector<HTMLInputElement>('[aria-label="Next time (optional)"]')!;
    try {
      edit();
      await vi.waitFor(() => expect(input()).not.toBeNull());
      input().value = "  Slow down the left hand  ";
      input().dispatchEvent(new Event("input", { bubbles: true }));
      button("Save changes")!.click();
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("Next time: Slow down the left hand"),
      );
      expect(await store.sessions.get(saved.id)).toHaveProperty(
        "nextTime",
        "Slow down the left hand",
      );
      edit();
      await vi.waitFor(() => expect(input()?.value).toBe("Slow down the left hand"));
      input().value = "Discard this edit";
      input().dispatchEvent(new Event("input", { bubbles: true }));
      button("Cancel")!.click();
      await vi.waitFor(() => expect(input()).toBeNull());
      expect(await store.sessions.get(saved.id)).toHaveProperty(
        "nextTime",
        "Slow down the left hand",
      );
      edit();
      await vi.waitFor(() => expect(input()).not.toBeNull());
      input().value = "";
      input().dispatchEvent(new Event("input", { bubbles: true }));
      button("Save changes")!.click();
      await vi.waitFor(() => expect(input()).toBeNull());
      expect(await store.sessions.get(saved.id)).not.toHaveProperty("nextTime");
    } finally {
      await store.sessions.delete(saved.id);
    }
  });

  test("keeps the Next time editor open when persistence fails and permits retry", async () => {
    render(Page);
    const note = await saveEntry();
    const store = new PracticeStore();
    const saved = (await store.sessions.all()).find((session) => session.notes === note)!;
    document.querySelector<HTMLButtonElement>(`[aria-label="Edit entry ${saved.id}"]`)!.click();
    const input = () =>
      document.querySelector<HTMLInputElement>('[aria-label="Next time (optional)"]')!;
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Retry this reflection";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    const put = vi
      .spyOn(DexieRepository.prototype, "put")
      .mockRejectedValueOnce(new Error("Storage full"));
    try {
      button("Save changes")!.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Storage full"));
      expect(input()?.value).toBe("Retry this reflection");
      expect(await store.sessions.get(saved.id)).not.toHaveProperty("nextTime");
      button("Save changes")!.click();
      await vi.waitFor(() => expect(input()).toBeNull());
      expect(await store.sessions.get(saved.id)).toHaveProperty(
        "nextTime",
        "Retry this reflection",
      );
    } finally {
      put.mockRestore();
      await store.sessions.delete(saved.id);
    }
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
