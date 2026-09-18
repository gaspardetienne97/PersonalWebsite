import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";
import type { ReadingSessionState } from "@repo/music-core/engines/reading-session";
import {
  createSightReadingExercise,
  type SightReadingPrompt,
} from "@repo/music-core/exercises/sight-reading";

import SightReadingSession from "./SightReadingSession.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

describe("SightReadingSession", () => {
  test("clears wait-mode on-screen holds on a foreign attack and on group change", async () => {
    const prompt = waitPrompt();
    const router = new InputRouter();
    const view = render(SightReadingSession, sessionProps(prompt, 0, router));

    await vi.waitFor(() => expect(pianoKey()).not.toBeNull());
    // Keyboard/assistive activation latches, so the note stays held.
    const key = pianoKey()!;
    key.focus();
    key.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() => expect(clearHeldNotes()).not.toBeUndefined());
    expect(pianoKey()?.getAttribute("aria-pressed")).toBe("true");

    // Advancing the follower resets the surface: leftovers cannot complete the
    // next group.
    await view.rerender(sessionProps(prompt, 1, router));

    await vi.waitFor(() => expect(clearHeldNotes()).toBeUndefined());
    expect(pianoKey()?.getAttribute("aria-pressed")).toBe("false");

    // Latch again, then hand the group to MIDI. An accepted foreign attack
    // takes over, so the local latch goes with the follower's prior owner.
    pianoKey()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(clearHeldNotes()).not.toBeUndefined());

    router.push({
      type: "noteOn",
      midiNote: prompt.groups[1]!.midiNotes[0]!,
      velocity: 1,
      source: "midi",
      timestamp: monotonicMs(10),
      clock: "performance",
      instrument: "piano",
    });

    await vi.waitFor(() => expect(clearHeldNotes()).toBeUndefined());
    expect(pianoKey()?.getAttribute("aria-pressed")).toBe("false");
  });

  test("lights the current group's targets only after the hint, then resets per group", async () => {
    const prompt = waitPrompt();
    const router = new InputRouter();
    const onHint = vi.fn();
    const view = render(SightReadingSession, { ...sessionProps(prompt, 0, router), onHint });

    await vi.waitFor(() => expect(pianoKey()).not.toBeNull());
    expect(targetKey()).toBeNull();

    const hint = button("Show a hint")!;
    hint.focus();
    hint.click();

    expect(onHint).toHaveBeenCalledOnce();

    // The route records the hint on the session; the stage then lights the
    // group it was spent on.
    await view.rerender({ ...sessionProps(prompt, 0, router, true), onHint });

    await vi.waitFor(() => expect(targetKey()).not.toBeNull());
    // A spent hint must not take the focus out of a keyboard user's hands.
    expect(document.activeElement).toBe(button("Hint shown for this group"));
    expect(button("Hint shown for this group")?.getAttribute("aria-disabled")).toBe("true");
    button("Hint shown for this group")?.click();
    expect(onHint).toHaveBeenCalledOnce();

    // The hint is spent on its own group; the next one is read unaided again,
    // although the phrase stays recorded as hinted.
    await view.rerender({ ...sessionProps(prompt, 1, router, true), onHint });

    await vi.waitFor(() => expect(targetKey()).toBeNull());
    expect(button("Show a hint")).not.toBeUndefined();
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function targetKey(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[aria-label="Piano input"] [data-state^="target"]');
}

function sessionProps(
  prompt: SightReadingPrompt,
  currentGroupIndex: number,
  router: InputRouter,
  hintUsed = false,
) {
  const state: ReadingSessionState = {
    status: "sight-reading",
    currentPrompt: prompt,
    currentIndex: 0,
    total: 1,
    countIn: "playing",
    hintUsed,
    results: [],
    live: {
      progress: 0,
      runningScore: 0,
      feedback: [],
      currentGroupIndex,
      expectedMidiNotes: prompt.groups[currentGroupIndex]?.midiNotes ?? [],
      heldMidiNotes: [],
      wrongMidiNotes: [],
    },
  };

  return {
    sessionState: state,
    router,
    bpm: prompt.options.bpm,
    sessionXp: 0,
    onAccepted: () => undefined,
    onHint: () => undefined,
    onStart: async () => undefined,
    onFinish: async () => undefined,
    onAbandon: () => undefined,
  };
}

function waitPrompt(): SightReadingPrompt {
  return createSightReadingExercise({
    random: () => 0.5,
    options: {
      instrument: "piano",
      keySignature: "C major",
      clefs: ["treble"],
      measures: 2,
      bpm: 80,
      timeSignature: { numerator: 4, denominator: 4 },
      mode: "wait",
      strictness: "normal",
      difficulty: 0.4,
    },
  }).generate({ targetSkillIds: [], difficulty: 0.4 }).payload;
}

function pianoKey(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[aria-label="Piano input"] button[data-note]');
}

function clearHeldNotes(): HTMLButtonElement | undefined {
  return [
    ...document.querySelectorAll<HTMLButtonElement>('[aria-label="Piano input"] button'),
  ].find((candidate) => candidate.textContent?.trim() === "Clear held notes");
}
