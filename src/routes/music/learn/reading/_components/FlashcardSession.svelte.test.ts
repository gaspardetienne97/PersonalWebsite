import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { InputRouter } from "@repo/music-core/engines/input-router";
import type { ReadingSessionState } from "@repo/music-core/engines/reading-session";
import { createNoteReadingExercise } from "@repo/music-core/exercises/note-reading";

import FlashcardSession from "./FlashcardSession.svelte";

afterEach(() => document.body.replaceChildren());

describe("FlashcardSession", () => {
  test("keeps independent play neutral until Help reveals the target", async () => {
    const prompt = createNoteReadingExercise({
      random: () => 0,
      options: {
        instrument: "piano",
        clefs: ["treble"],
        keys: ["C major"],
        range: { lowestMidi: 60, highestMidi: 72 },
        promptKind: "single-note",
      },
    }).generate({ targetSkillIds: [], difficulty: 0.4 }).payload;
    const router = new InputRouter();
    const onHint = vi.fn();
    const view = render(FlashcardSession, {
      state: flashcardState(prompt),
      answerMode: "play",
      router,
      sessionXp: 0,
      onChoice: vi.fn(),
      onAccepted: vi.fn(),
      onContinue: vi.fn(),
      onHint,
      range: { lowestMidi: 60, highestMidi: 72 },
    });

    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('[aria-label="Piano input"] button[data-note]').length,
      ).toBeGreaterThan(1),
    );
    expect(document.querySelector('[aria-label*="target"]')).toBeNull();

    button("Help")?.click();
    expect(onHint).toHaveBeenCalledOnce();
    await view.rerender({ state: { ...flashcardState(prompt), hintUsed: true } });
    await vi.waitFor(() => expect(document.querySelector('[aria-label*="target"]')).not.toBeNull());
  });

  test.each([
    { answer: "D", answerMode: "choice" as const, correction: "You chose D" },
    { answer: [62], answerMode: "play" as const, correction: "You played D4" },
  ])(
    "renders the stored $answerMode correction while waiting for Continue",
    ({ answer, answerMode, correction }) => {
      const prompt = createNoteReadingExercise({
        random: () => 0,
        options: {
          instrument: "piano",
          clefs: ["treble"],
          keys: ["C major"],
          range: { lowestMidi: 60, highestMidi: 72 },
          promptKind: "single-note",
        },
      }).generate({ targetSkillIds: [], difficulty: 0.4 }).payload;
      const onContinue = vi.fn();
      render(FlashcardSession, {
        state: {
          ...flashcardState(prompt),
          awaitingContinue: true,
          feedback: {
            targetSkillId: "reading.treble.stepwise",
            prompt,
            result: {
              correct: false,
              score: 0,
              metrics: [],
              feedback: [],
              target: { label: "C4", midiNotes: prompt.midiNotes, choice: "C" },
              answer,
              input: [],
            },
            event: {} as never,
            xp: 0,
          },
        },
        answerMode,
        router: new InputRouter(),
        sessionXp: 0,
        onChoice: vi.fn(),
        onAccepted: vi.fn(),
        onContinue,
        onHint: vi.fn(),
        range: { lowestMidi: 60, highestMidi: 72 },
      });

      expect(document.body.textContent).toContain("Expected C");
      expect(document.body.textContent).toContain(correction);
      if (answerMode === "choice")
        expect(document.querySelector('[aria-label="Answer choices"] button')).toBeDisabled();
      button("Continue")?.click();
      expect(onContinue).toHaveBeenCalledOnce();
    },
  );
});

function flashcardState(
  prompt: ReturnType<ReturnType<typeof createNoteReadingExercise>["generate"]>["payload"],
): ReadingSessionState {
  return { status: "flashcard", currentPrompt: prompt, currentIndex: 0, total: 2, results: [] };
}

function button(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
}
