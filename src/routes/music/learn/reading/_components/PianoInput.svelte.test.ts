import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";

import PianoInput from "./PianoInput.svelte";

describe("PianoInput", () => {
  test("marks note states and emits normalized on-screen events", async () => {
    const router = new InputRouter({ now: () => 12 });
    let accepted: NoteEvent | undefined;
    router.subscribe((event) => {
      accepted = event;
    });
    render(PianoInput, {
      midiNotes: [60, 64, 67],
      targetMidiNotes: [60],
      activeMidiNotes: [64],
      wrongMidiNotes: [67],
      suggestedFingerings: { 60: 1, 64: 3, 67: 5 },
      router,
    });

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Piano input"] svg')).not.toBeNull(),
    );
    expect(document.querySelector('[aria-label="C4, target"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="E4, active"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="G4, wrong"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="finger-60"]')?.textContent).toBe("1");
    expect(document.querySelector('[data-testid="finger-64"]')?.textContent).toBe("3");
    expect(document.querySelector('[data-testid="finger-67"]')?.textContent).toBe("5");
    document.querySelector<HTMLButtonElement>('[aria-label="E4, active"]')?.click();

    expect(accepted).toMatchObject({
      type: "noteOn",
      midiNote: 64,
      source: "onscreen",
      instrument: "piano",
    });
  });
});
