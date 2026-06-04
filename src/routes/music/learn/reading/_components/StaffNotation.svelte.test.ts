import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NotationView } from "@repo/music-core/engines/notation";

import StaffNotation from "./StaffNotation.svelte";

describe("StaffNotation", () => {
  test("renders a notation view as an accessible VexFlow SVG", async () => {
    const onError = vi.fn();
    render(StaffNotation, {
      view: notationFixture(),
      activeEventIds: ["note:right-hand:0:1"],
      onError,
    });

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );
    expect(document.querySelector('[data-event-id="note:right-hand:0:1"]')).not.toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

function notationFixture(): NotationView {
  return {
    keySignature: "C major",
    timeSignature: { numerator: 4, denominator: 4 },
    staves: [{ id: "treble", clef: "treble", voiceIds: ["right-hand"] }],
    measures: [
      {
        index: 0,
        startBeat: 0,
        durationBeats: 4,
        ties: [],
        tuplets: [],
        events: [
          {
            id: "note:right-hand:0:1",
            kind: "note",
            voiceId: "right-hand",
            staff: "treble",
            startBeat: 0,
            durationBeats: 1,
            duration: "q",
            dots: 0,
            pitches: [{ step: "C", octave: 4 }],
          },
        ],
      },
    ],
  };
}
