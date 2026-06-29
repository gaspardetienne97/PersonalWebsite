import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { MusicRuntime } from "../../_runtime.svelte";
import Panel from "./PianoRollPanel.svelte";

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function cell(label: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

describe("PianoRollPanel", () => {
  test("renders the grid and the three tracks", () => {
    render(Panel);
    expect(document.body.textContent).toContain("Piano Roll");
    expect(button("Lead")).not.toBeUndefined();
    expect(button("Keys")).not.toBeUndefined();
    expect(button("Bass")).not.toBeUndefined();
    // The seeded arpeggio places C4 at the first beat.
    expect(cell("C4 step 1")).toHaveAttribute("aria-pressed", "true");
    expect(cell("C4 step 5")).toHaveAttribute("aria-pressed", "false");
  });

  test("places a note on an empty cell", async () => {
    render(Panel);
    const empty = cell("C4 step 5");
    empty?.click();
    await vi.waitFor(() => expect(cell("C4 step 5")).toHaveAttribute("aria-pressed", "true"));
  });

  test("shows a velocity lane and applies the selected velocity to the active track", async () => {
    render(Panel);
    expect(document.querySelector('[aria-label="Velocity lane"]')).not.toBeNull();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Note velocity"]')!;
    input.value = "0.42";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    button("Apply velocity")?.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Set Lead velocity to 42%."),
    );
  });

  test("supports horizontal grid zoom without changing the score", async () => {
    render(Panel);

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Horizontal zoom"]')!;
    input.value = "2";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("2.00x"));
    expect(cell("C4 step 1")).toHaveAttribute("aria-pressed", "true");
  });

  test("adds another bar and allows notes beyond the initial two-bar grid", async () => {
    render(Panel);

    expect(cell("C4 step 33")).toBeNull();
    button("Add bar")?.click();

    await vi.waitFor(() => expect(cell("C4 step 33")).not.toBeNull());
    cell("C4 step 33")?.click();
    await vi.waitFor(() => expect(cell("C4 step 33")).toHaveAttribute("aria-pressed", "true"));
    expect(document.body.textContent).toContain("3 bars");
  });

  test("resizes a note end by dragging in resize mode", async () => {
    render(Panel);
    expect(button("Resize notes")).not.toBeUndefined();

    button("Resize notes")!.click();
    cell("C4 step 1")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    cell("C4 step 8")?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    await vi.waitFor(() => expect(cell("C4 step 8")).toHaveAttribute("aria-pressed", "true"));
    expect(cell("C4 step 9")).toHaveAttribute("aria-pressed", "false");
  });

  test("adds and removes tracks", async () => {
    render(Panel);

    button("Add track")?.click();
    await vi.waitFor(() => expect(button("Track")).not.toBeUndefined());

    button("Track")?.click();
    button("Remove track")?.click();
    await vi.waitFor(() => expect(button("Track")).toBeUndefined());
    expect(button("Lead")).not.toBeUndefined();
  });

  test("exports the score as a MIDI download", () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:midi");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(Panel);

    button("Export MIDI")!.click();
    const blob = createSpy.mock.calls.at(-1)?.[0] as Blob;
    expect(blob.type).toBe("audio/midi");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("exports the score as a WAV download", async () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:wav");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(Panel);

    button("Export WAV")!.click();
    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const blob = createSpy.mock.calls.at(-1)?.[0] as Blob;
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBeGreaterThan(44);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("registers a loop with the shared transport and plays audible voices", async () => {
    const sources: Array<{ play: () => Promise<void> | void; stop?: () => void }> = [];
    const sound = {
      startPatternLoop: vi.fn(),
      stopPatternLoop: vi.fn(),
    };
    const runtime = {
      transportBpm: 100,
      media: undefined,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => undefined),
      writeLocalState: vi.fn(async () => undefined),
      setPlaybackSource: vi.fn((source) => {
        if (source) sources.push(source);
      }),
      sound,
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });
    await vi.waitFor(() => expect(sources).toHaveLength(1));

    await sources.at(-1)!.play();
    expect(runtime.enableAudio).toHaveBeenCalled();
    const [steps, durationSec] = sound.startPatternLoop.mock.calls[0]!;
    expect(steps.length).toBeGreaterThan(0); // seeded arpeggio
    expect(durationSec).toBeGreaterThan(0);

    sources.at(-1)!.stop?.();
    expect(sound.stopPatternLoop).toHaveBeenCalled();
  });
});
