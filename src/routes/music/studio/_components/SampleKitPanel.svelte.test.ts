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

    await vi.waitFor(() => expect(padButton(/Pad 1,.*Kick/i)).not.toBeUndefined());
    expect(padButton(/Pad 3,.*Snare/i)).not.toBeUndefined();
    expect(padButton(/Pad 7,.*Closed Hat/i)).not.toBeUndefined();
    // 16 Bank A pads rendered
    expect(document.querySelectorAll('[aria-label^="Pad "]').length).toBe(16);
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

    await vi.waitFor(() => expect(padButton(/Pad 1,.*Kick/i)).not.toBeUndefined());
    padButton(/Pad 1,.*Kick/i)!.click();
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
