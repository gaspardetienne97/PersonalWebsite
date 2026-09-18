import { beforeEach, expect, vi } from "vite-plus/test";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { SoundEngine } from "@repo/music-core/engines/sound";

import { setTestUrl } from "../../../_components/test-url";
import { MusicRuntime } from "../../../_runtime.svelte";

// Shared by every /music/learn/ear/<slug> route test.

/** Real timers, mocked audio enable and a started performance clock before each test. */
export function setupEarTest(): void {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setTestUrl("/");
    vi.spyOn(SoundEngine.prototype, "enable").mockImplementation(async function () {
      this.enabled = true;
      return { enabled: true, message: "Audio enabled." };
    });
    vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(0),
    });
  });
}

export function button(label: string): HTMLButtonElement | undefined {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
  return (
    buttons.find((candidate) => candidate.textContent?.trim() === label) ??
    buttons.find((candidate) => candidate.textContent?.includes(label))
  );
}

export function answerChoiceButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    '[aria-label="Answer choices"] button, [aria-label="Scale-degree answer choices"] button',
  );
}

export function audioNote(midiNote: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "audio",
    confidence: 0.9,
    timestamp: monotonicMs(0),
    clock: "performance",
  };
}

export function repertoireScore() {
  return {
    id: "score-1",
    title: "Transfer Study",
    origin: "generated" as const,
    keySignature: "C",
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "melody", name: "Melody", role: "melody" as const }],
    notes: [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
      { midiNote: 62, startBeat: 1, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
      { midiNote: 64, startBeat: 2, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
      { midiNote: 67, startBeat: 3, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
    ],
    chords: [],
    sections: [],
    markers: [],
  };
}

/** Setup is collapsed behind its summary line; open it before touching controls. */
export async function openSetup(): Promise<void> {
  if (button("Hide setup")) return;
  await vi.waitFor(() => expect(button("Edit setup")).not.toBeUndefined());
  button("Edit setup")?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label="Feedback mode"]')).not.toBeNull(),
  );
}

export async function continueEarPractice(): Promise<void> {
  await vi.waitFor(() => expect(button("Continue")).not.toBeUndefined());
  button("Continue")?.click();
}
