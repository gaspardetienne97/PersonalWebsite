import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import FretboardInput from "./FretboardInput.svelte";

describe("FretboardInput", () => {
  test("renders conventional string numbers and emits selected fret pitches", () => {
    const router = new InputRouter({ now: () => 12 });
    const tuning = curatedTunings("guitar")[0]!;
    let accepted: NoteEvent | undefined;
    router.subscribe((event) => {
      accepted = event;
    });
    render(FretboardInput, {
      tuning,
      targetMidiNotes: [64],
      activeMidiNotes: [],
      wrongMidiNotes: [],
      router,
      visibleFrets: 5,
    });

    expect(document.querySelector('[aria-label="String 1 fret 0, E4, target"]')).not.toBeNull();
    document
      .querySelector<HTMLButtonElement>('[aria-label="String 1 fret 0, E4, target"]')
      ?.click();

    expect(accepted).toMatchObject({
      type: "noteOn",
      midiNote: 64,
      source: "onscreen",
      instrument: "guitar",
      inputProfileId: "guitar.standard",
    });
  });
});
