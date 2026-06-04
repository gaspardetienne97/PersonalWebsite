import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { curatedTunings, type TuningProfile } from "@repo/music-core/engines/tunings";

import TuningEditor from "./TuningEditor.svelte";

describe("TuningEditor", () => {
  test("blocks invalid profiles and saves a valid custom tuning", async () => {
    const onSave = vi.fn<(profile: TuningProfile) => void>();
    render(TuningEditor, { instrument: "ukulele", onSave });

    document.querySelector<HTMLButtonElement>("button")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Tuning name"]')).not.toBeNull(),
    );

    const name = document.querySelector<HTMLInputElement>('[aria-label="Tuning name"]')!;
    name.value = "";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-testid="save-tuning"]')?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Tuning name is required"));
    expect(onSave).not.toHaveBeenCalled();

    name.value = "My Uke";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-testid="save-tuning"]')?.click();

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      id: "custom.ukulele.my-uke",
      instrument: "ukulele",
      name: "My Uke",
      source: "custom",
    });
  });

  test("exposes deletion only for custom profiles", async () => {
    const onDelete = vi.fn<(id: string) => void>();
    const custom: TuningProfile = {
      ...curatedTunings("guitar")[0]!,
      id: "custom.guitar.stage",
      name: "Stage",
      source: "custom",
    };
    const { unmount } = render(TuningEditor, { instrument: "guitar", profile: custom, onDelete });
    document.querySelector<HTMLButtonElement>("button")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="delete-tuning"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[data-testid="delete-tuning"]')?.click();
    expect(onDelete).toHaveBeenCalledWith(custom.id);
    unmount();

    render(TuningEditor, {
      instrument: "guitar",
      profile: curatedTunings("guitar")[0]!,
      onDelete,
    });
    document.querySelector<HTMLButtonElement>("button")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Tuning name"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="delete-tuning"]')).toBeNull();
  });
});
