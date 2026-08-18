import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { Score } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { notationView } from "@repo/music-core/engines/notation";
import { expectedGroups } from "@repo/music-core/engines/score-follower";

import ScoreFollowerStage from "./ScoreFollowerStage.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("ScoreFollowerStage", () => {
  test("renders the current score group and selects expected notes", async () => {
    const score = scoreFixture();
    const groups = expectedGroups(score);
    const onExpectedNoteSelected = vi.fn();

    render(ScoreFollowerStage, {
      score,
      view: notationView(score),
      groups,
      currentGroupIndex: 1,
      instrument: "piano",
      router: new InputRouter(),
      inputEnabled: true,
      activeMidiNotes: [],
      wrongMidiNotes: [60],
      pianoHandHint: "Right hand",
      suggestedFingerings: { 62: 2 },
      onExpectedNoteSelected,
    });

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    expect(document.querySelector('[data-notation-cursor="current-group"]')).not.toBeNull();
    expect(document.querySelector('[data-active-note="true"]')).not.toBeNull();
    expect(document.querySelector("[data-testid='score-current-notes']")?.textContent).toContain(
      "D4",
    );
    expect(document.querySelector("[data-testid='score-hand-hint']")?.textContent).toContain(
      "Right hand",
    );
    expect(document.querySelector("[data-testid='finger-62']")).not.toBeNull();
    // The shared surface carries the hand from projectScoreToPiano, and wrong
    // notes still outrank the target highlight.
    expect(pianoKey("D4")?.getAttribute("data-state")).toBe("target-right");
    expect(pianoKey("C4")?.getAttribute("data-state")).toBe("wrong");

    document.querySelector<HTMLButtonElement>("[data-testid='score-expected-note']")?.click();

    expect(onExpectedNoteSelected).toHaveBeenCalledWith(62);
  });
});

function pianoKey(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[aria-label="Piano input"] [data-note="${name}"]`);
}

function scoreFixture(): Score {
  return {
    id: "score-follower-stage-test",
    title: "Score follower stage test",
    origin: "generated",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 80 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "right-hand", name: "Right hand", role: "melody" }],
    notes: [
      {
        voiceId: "right-hand",
        midiNote: 60,
        writtenPitch: { step: "C", octave: 4 },
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      },
      {
        voiceId: "right-hand",
        midiNote: 62,
        writtenPitch: { step: "D", octave: 4 },
        startBeat: 1,
        durationBeats: 1,
        velocity: 0.8,
      },
    ],
    chords: [],
    sections: [{ id: "full", name: "Full", startBeat: 0, endBeat: 2 }],
    markers: [],
  };
}
