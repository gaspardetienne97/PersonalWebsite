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
      activeMidiNotes: [60],
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
    // The shared surface carries the hand from projectScoreToPiano, and a played
    // note still outranks the target highlight.
    expect(pianoKey("D4")?.getAttribute("data-state")).toBe("target-right");
    expect(pianoKey("C4")?.getAttribute("data-state")).toBe("active");
    // One keyboard look: the input surface sits on the practice stage and names its Cs.
    expect(
      document.querySelector('[data-surface="stage"] [aria-label="Piano input"]'),
    ).not.toBeNull();
    expect(pianoKey("C4")?.querySelector("span")?.classList.contains("sr-only")).toBe(false);

    document.querySelector<HTMLButtonElement>("[data-testid='score-expected-note']")?.click();

    expect(onExpectedNoteSelected).toHaveBeenCalledWith(62);
  });

  test("marks the group being read while a wrong note is live, then clears it", async () => {
    const score = scoreFixture();
    const groups = expectedGroups(score);
    const props = {
      score,
      view: notationView(score),
      groups,
      currentGroupIndex: 1,
      instrument: "piano" as const,
      router: new InputRouter(),
      inputEnabled: true,
      wrongMidiNotes: [61],
    };

    const view = render(ScoreFollowerStage, props);
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    // The second group is the one being read, and it reads as the error, not as
    // the accent: both are plain colour classes on the same element, so the
    // error only shows while it is the only one set.
    const [first, current] = [...document.querySelectorAll<SVGGElement>(".vf-stavenote")];
    expect(current?.classList.contains("text-destructive")).toBe(true);
    expect(current?.classList.contains("text-practice-accent")).toBe(false);
    expect(current?.dataset.activeNote).toBe("false");
    expect(first?.classList.contains("text-destructive")).toBe(false);
    expect(pianoKey("C#4")?.getAttribute("data-state")).toBe("wrong");

    // Once the follower drops the live wrong note the group is simply current again.
    await view.rerender({ ...props, wrongMidiNotes: [] });

    await vi.waitFor(() =>
      expect(document.querySelector(".vf-stavenote.text-destructive")).toBeNull(),
    );
    expect(
      [...document.querySelectorAll<SVGGElement>(".vf-stavenote")][1]?.dataset.activeNote,
    ).toBe("true");
  });

  test("hides the expected targets until the route reveals them", async () => {
    const score = scoreFixture();
    const groups = expectedGroups(score);
    const props = {
      score,
      view: notationView(score),
      groups,
      currentGroupIndex: 1,
      instrument: "piano" as const,
      router: new InputRouter(),
      inputEnabled: true,
      activeMidiNotes: [60],
      suggestedFingerings: { 62: 2 },
      showTargets: false,
    };

    const view = render(ScoreFollowerStage, props);
    await vi.waitFor(() => expect(pianoKey("C4")).not.toBeNull());

    expect(document.querySelector('[aria-label="Piano input"] [data-state^="target"]')).toBeNull();
    // A finger number names the expected key just as plainly as lighting it.
    expect(document.querySelector("[data-testid='finger-62']")).toBeNull();
    expect(pianoKey("D4")?.getAttribute("aria-label")).not.toContain("finger");
    // Played notes stay visible whether or not the targets are revealed.
    expect(pianoKey("C4")?.getAttribute("data-state")).toBe("active");

    await view.rerender({ ...props, showTargets: true });
    await vi.waitFor(() => expect(pianoKey("D4")?.getAttribute("data-state")).toBe("target-right"));
    expect(document.querySelector("[data-testid='finger-62']")).not.toBeNull();
  });

  test("names a repeated note that needs a fresh attack", async () => {
    const score = scoreFixture();
    const groups = expectedGroups(score);
    // Fake a repeat: the current group asks for the same note as the last one.
    const repeated = [groups[0]!, { ...groups[1]!, midiNotes: [...groups[0]!.midiNotes] }];

    render(ScoreFollowerStage, {
      score,
      view: notationView(score),
      groups: repeated,
      currentGroupIndex: 1,
      instrument: "piano",
      router: new InputRouter(),
      inputEnabled: true,
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="score-repeat-hint"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="score-repeat-hint"]')?.textContent).toContain(
      "Play C4 again",
    );
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
