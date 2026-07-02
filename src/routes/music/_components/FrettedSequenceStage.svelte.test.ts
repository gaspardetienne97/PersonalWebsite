import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import FrettedSequenceStage from "./FrettedSequenceStage.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

describe("FrettedSequenceStage", () => {
  test("renders a fretted target path and routes on-screen fret input", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const router = new InputRouter({ now: () => 24 });
    const events: NoteEvent[] = [];
    router.subscribe((event) => events.push(event));

    render(FrettedSequenceStage, {
      instrument: "guitar",
      label: "Guitar string 6 · frets 5-8",
      tuning,
      router,
      steps: [
        { id: "s6-f5", label: "Fret 5", midiNote: 45 },
        { id: "s6-f6", label: "Fret 6", midiNote: 46 },
        { id: "s6-f7", label: "Fret 7", midiNote: 47 },
        { id: "s6-f8", label: "Fret 8", midiNote: 48 },
      ],
      completedCount: 2,
      currentIndex: 2,
      visibleStrings: [6],
      visibleFrets: 12,
    });

    expect(document.querySelector("[data-testid='fretted-sequence-label']")?.textContent).toContain(
      "Guitar string 6",
    );
    expect(document.querySelector("[data-testid='fretted-sequence-step-s6-f5']")).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(document.querySelector("[data-testid='fretted-sequence-step-s6-f7']")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(document.querySelector("[data-testid='fretted-sequence-step-s6-f8']")).toHaveAttribute(
      "data-state",
      "upcoming",
    );

    document.querySelector<HTMLButtonElement>('[aria-label^="String 6 fret 7,"]')?.click();
    expect(events.at(-1)).toMatchObject({
      type: "noteOn",
      midiNote: 47,
      source: "onscreen",
      instrument: "guitar",
      inputProfileId: "guitar.standard",
    });
  });
});
