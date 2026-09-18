import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import "../../../../app.css";

import { SampleKitStore } from "@repo/music-core/engines/sample-kit";

import Panel from "./SampleKitPanel.svelte";

function inMemoryStore() {
  const map = new Map<string, { id: string; value: unknown }>();
  const blobs = new Map<string, Blob>();
  let counter = 0;
  return new SampleKitStore({
    repository: {
      get: async (id) => map.get(id),
      put: async (record) => {
        map.set(record.id, structuredClone(record));
      },
    },
    binaries: {
      put: async (key, blob) => {
        blobs.set(key, blob);
      },
      get: async (key) => blobs.get(key),
      delete: async (key) => {
        blobs.delete(key);
      },
    },
    createId: () => `id-${(counter += 1)}`,
    now: () => 1,
  });
}

function callbacks(overrides: Record<string, unknown> = {}) {
  return {
    onactivate: vi.fn(async () => undefined),
    onaudition: vi.fn(),
    ondirectoryexport: vi.fn(async () => undefined),
    onzipexport: vi.fn(async () => undefined),
    directoryExportAvailable: true,
    ...overrides,
  };
}

function audioFile(name: string): File {
  return new File(["audio"], name, { type: "audio/wav" });
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

function padButton(pattern: RegExp): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    pattern.test(candidate.getAttribute("aria-label") ?? ""),
  );
}

function setValue(element: HTMLInputElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function uploadFiles(input: HTMLInputElement, files: File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Drags `source` onto `target` via a shared DataTransfer, as the browser does. */
function dragOnto(source: Element, target: Element): void {
  const dataTransfer = new DataTransfer();
  const dragstart = new Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(dragstart, "dataTransfer", { value: dataTransfer });
  source.dispatchEvent(dragstart);

  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
  target.dispatchEvent(drop);
}

/** Fires one drag-lifecycle event (`dragstart`/`dragover`/`dragleave`/`drop`/`dragend`). */
function fireDrag(type: string, target: Element, dataTransfer?: DataTransfer): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  if (dataTransfer) Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  target.dispatchEvent(event);
}

describe("SampleKitPanel", () => {
  test("creates a kit, imports files, and renders deterministic pad assignments", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Live Set");
    button("Create kit")?.click();

    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("kick.wav"),
      audioFile("snare.wav"),
      audioFile("closed-hat.wav"),
    ]);

    await vi.waitFor(() => expect(padButton(/Pad A01 · 36 · Kick/i)).not.toBeUndefined());
    expect(padButton(/Pad A03 · 38 · Snare/i)).not.toBeUndefined();
    expect(padButton(/Pad A07 · 42 · Closed Hat/i)).not.toBeUndefined();
    expect(button("Bank A")).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelectorAll('button[aria-label^="Pad "]').length).toBe(16);
  });

  test("switches banks and assigns samples to Bank B pads", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Full Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      ...Array.from({ length: 17 }, (_, index) => audioFile(`sample-${index}.wav`)),
      audioFile("extra.wav"),
    ]);

    await vi.waitFor(() => expect(button("Bank B")).not.toBeUndefined());
    button("Bank B")?.click();

    await vi.waitFor(() => {
      expect(button("Bank B")).toHaveAttribute("aria-pressed", "true");
      expect(padButton(/Pad B01 · 52 · Sample 16/i)).not.toBeUndefined();
      expect(padButton(/Pad B02 · 53 · extra/i)).not.toBeUndefined();
    });

    const assign = document.querySelector<HTMLSelectElement>("#assign-52")!;
    assign.value = "id-2";
    assign.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(padButton(/Pad B01 · 52 · Sample 0/i)).not.toBeUndefined());
  });

  test("adds a hard velocity layer to an assigned pad", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Layered Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("kick-soft.wav"),
      audioFile("kick-hard.wav"),
    ]);
    await vi.waitFor(() => expect(padButton(/Pad A01 · 36 · Kick Soft/i)).not.toBeUndefined());

    const hardLayer = document.querySelector<HTMLSelectElement>("#hard-layer-36")!;
    hardLayer.value = "id-3";
    hardLayer.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Hard layer: Kick Hard");
    });
    const [kit] = await store.load();
    expect(kit?.assignments.find((entry) => entry.midiNote === 36)?.velocityLayers).toEqual([
      expect.objectContaining({ sampleId: "id-2", maxVelocity: 0.63 }),
      expect.objectContaining({ sampleId: "id-3", minVelocity: 0.64 }),
    ]);
  });

  test("sets a choke group on an assigned pad", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Choke Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("closed-hat.wav"),
      audioFile("open-hat.wav"),
    ]);
    await vi.waitFor(() => expect(padButton(/Pad A07 · 42 · Closed Hat/i)).not.toBeUndefined());

    const choke = document.querySelector<HTMLSelectElement>("#choke-group-42")!;
    choke.value = "1";
    choke.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("Choke group 1"));
    const [kit] = await store.load();
    expect(kit?.assignments.find((entry) => entry.midiNote === 42)?.chokeGroup).toBe(1);
  });

  test("renames and deletes imported samples", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Editable Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("kick.wav"),
      audioFile("snare.wav"),
    ]);
    await vi.waitFor(() => expect(padButton(/Pad A01 · 36 · Kick/i)).not.toBeUndefined());

    setValue(document.querySelector<HTMLInputElement>("#sample-name-id-2")!, "Sub Kick");
    buttonByLabel("Save sample id-2")?.click();

    await vi.waitFor(() => expect(padButton(/Pad A01 · 36 · Sub Kick/i)).not.toBeUndefined());
    buttonByLabel("Delete sample id-3")?.click();

    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Snare"));
    const [kit] = await store.load();
    expect(kit?.samples.map((sample) => sample.displayName)).toEqual(["Sub Kick"]);
    expect(kit?.assignments.map((assignment) => assignment.label)).toEqual(["Sub Kick"]);
  });

  test("auditions an assigned pad and exposes export actions", async () => {
    const store = inMemoryStore();
    const handlers = callbacks();
    render(Panel, { store, ...handlers });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("kick.wav"),
    ]);

    await vi.waitFor(() => expect(padButton(/Pad A01 · 36 · Kick/i)).not.toBeUndefined());
    padButton(/Pad A01 · 36 · Kick/i)!.click();
    expect(handlers.onaudition).toHaveBeenCalledWith(36);

    button("Activate kit")?.click();
    await vi.waitFor(() => expect(handlers.onactivate).toHaveBeenCalled());

    expect(button("Download ZIP")).not.toBeUndefined();
    expect(button("Export to drive")).not.toBeUndefined();
  });

  test("hides the directory export when the browser cannot write a folder", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks({ directoryExportAvailable: false }) });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Kit");
    button("Create kit")?.click();
    await vi.waitFor(() => expect(button("Download ZIP")).not.toBeUndefined());
    expect(button("Export to drive")).toBeUndefined();
  });

  test("assigns a sample by dragging its row onto a pad, replacing what was there", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Drag Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("kick_808_soft.wav"),
    ]);
    await vi.waitFor(() => expect(padButton(/Pad A01 · 36 · Kick 808 Soft/i)).not.toBeUndefined());

    const row = document
      .querySelector<HTMLInputElement>("#sample-name-id-2")!
      .closest('[draggable="true"]')!;
    const pad = padButton(/Pad A05 · 40 ·/i)!.parentElement!;
    dragOnto(row, pad);

    await vi.waitFor(() => expect(padButton(/Pad A05 · 40 · Kick 808 Soft/i)).not.toBeUndefined());
    expect(padButton(/Pad A01 · 36 · Empty/i)).not.toBeUndefined();
    expect(document.body.textContent).toContain("Pad A05");
  });

  test("highlights the drop target while dragging, clearing on dragleave, drop, and dragend", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Highlight Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("kick.wav"),
    ]);
    await vi.waitFor(() => expect(padButton(/Pad A01 · 36 · Kick/i)).not.toBeUndefined());

    const row = document
      .querySelector<HTMLInputElement>("#sample-name-id-2")!
      .closest('[draggable="true"]')!;
    const target = padButton(/Pad A05 · 40 ·/i)!.parentElement!;
    const other = padButton(/Pad A02 · 37 ·/i)!.parentElement!;
    const dataTransfer = new DataTransfer();

    fireDrag("dragstart", row, dataTransfer);
    fireDrag("dragover", target, dataTransfer);
    await vi.waitFor(() => expect(target.className).toContain("ring-primary"));

    fireDrag("dragleave", target);
    await vi.waitFor(() => expect(target.className).not.toContain("ring-primary"));

    // Re-enter, then drop: the highlight must not survive the drop.
    fireDrag("dragover", target, dataTransfer);
    await vi.waitFor(() => expect(target.className).toContain("ring-primary"));
    fireDrag("drop", target, dataTransfer);
    await vi.waitFor(() => expect(target.className).not.toContain("ring-primary"));

    // A different pad, dragged over then abandoned (dragend fires on the
    // source when a drag ends without a drop): the highlight must clear too.
    fireDrag("dragover", other, dataTransfer);
    await vi.waitFor(() => expect(other.className).toContain("ring-primary"));
    fireDrag("dragend", row);
    await vi.waitFor(() => expect(other.className).not.toContain("ring-primary"));
  });

  test("assigns a sample from its row via Assign to pad, with no pointer involved", async () => {
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Keyboard Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("rim_click.wav"),
    ]);
    await vi.waitFor(() => expect(padButton(/Pad A02 · 37 · Rim Click/i)).not.toBeUndefined());

    const assignButton = buttonByLabel("Assign sample id-2 to a pad")!;
    expect(assignButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    assignButton.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLSelectElement>("#assign-pad-for-id-2")).not.toBeNull(),
    );
    const pick = document.querySelector<HTMLSelectElement>("#assign-pad-for-id-2")!;
    expect(pick.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await vi.waitFor(() => expect(document.activeElement).toBe(pick));
    pick.value = "40";
    pick.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(padButton(/Pad A05 · 40 · Rim Click/i)).not.toBeUndefined());
    expect(document.body.textContent).toContain("Pad A05");
  });

  test("marks unassigned pads Empty and keeps the pad grid inside a 375px viewport", async () => {
    await page.viewport(375, 812);
    const store = inMemoryStore();
    render(Panel, { store, ...callbacks() });

    button("New kit")?.click();
    await vi.waitFor(() => expect(document.querySelector("#new-kit-name")).not.toBeNull());
    setValue(document.querySelector<HTMLInputElement>("#new-kit-name")!, "Narrow Kit");
    button("Create kit")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#import-samples")).not.toBeNull(),
    );
    uploadFiles(document.querySelector<HTMLInputElement>("#import-samples")!, [
      audioFile("kick.wav"),
    ]);
    await vi.waitFor(() => expect(padButton(/Pad A01 · 36 · Kick/i)).not.toBeUndefined());

    const emptyPad = padButton(/Pad A02 · 37 · Empty/i);
    expect(emptyPad).not.toBeUndefined();
    expect(emptyPad?.textContent).toContain("Empty");

    const pads = [...document.querySelectorAll<HTMLElement>('button[aria-label^="Pad "]')];
    expect(pads.length).toBe(16);
    for (const pad of pads) {
      const rect = pad.getBoundingClientRect();
      expect(rect.right).toBeLessThanOrEqual(375);
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  });
});
