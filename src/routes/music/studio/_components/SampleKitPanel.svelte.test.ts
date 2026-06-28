import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

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

    await vi.waitFor(() => expect(padButton(/Pad A1,.*Kick/i)).not.toBeUndefined());
    expect(padButton(/Pad A3,.*Snare/i)).not.toBeUndefined();
    expect(padButton(/Pad A7,.*Closed Hat/i)).not.toBeUndefined();
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
      expect(padButton(/Pad B1, MIDI 52, Sample 16/i)).not.toBeUndefined();
      expect(padButton(/Pad B2, MIDI 53, extra/i)).not.toBeUndefined();
    });

    const assign = document.querySelector<HTMLSelectElement>("#assign-52")!;
    assign.value = "id-2";
    assign.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(padButton(/Pad B1, MIDI 52, Sample 0/i)).not.toBeUndefined());
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
    await vi.waitFor(() => expect(padButton(/Pad A1, MIDI 36, Kick Soft/i)).not.toBeUndefined());

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
    await vi.waitFor(() => expect(padButton(/Pad A7, MIDI 42, Closed Hat/i)).not.toBeUndefined());

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
    await vi.waitFor(() => expect(padButton(/Pad A1, MIDI 36, Kick/i)).not.toBeUndefined());

    setValue(document.querySelector<HTMLInputElement>("#sample-name-id-2")!, "Sub Kick");
    buttonByLabel("Save sample id-2")?.click();

    await vi.waitFor(() => expect(padButton(/Pad A1, MIDI 36, Sub Kick/i)).not.toBeUndefined());
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

    await vi.waitFor(() => expect(padButton(/Pad A1,.*Kick/i)).not.toBeUndefined());
    padButton(/Pad A1,.*Kick/i)!.click();
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
});
