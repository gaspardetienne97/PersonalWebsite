import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { Take } from "@repo/music-core/engines/recording";

import MidiTakeReviewPanel from "./MidiTakeReviewPanel.svelte";

const takes: Take[] = [
  {
    id: "take-2",
    name: "Chorus 2",
    source: "midi",
    durationMs: 4_000,
    notes: [
      { midi: 60, atMs: 0, velocity: 0.8 },
      { midi: 64, atMs: 1_000, velocity: 0.8 },
      { midi: 67, atMs: 2_000, velocity: 0.8 },
    ],
  },
  {
    id: "take-1",
    name: "Chorus 1",
    source: "onscreen",
    durationMs: 2_000,
    notes: [{ midi: 62, atMs: 0, velocity: 0.8 }],
  },
];

describe("MidiTakeReviewPanel", () => {
  test("shows take cards, selected take metrics, and a density timeline", () => {
    render(MidiTakeReviewPanel, { takes });

    expect(document.body.textContent).toContain("MIDI takes");
    expect(document.body.textContent).toContain("Chorus 2");
    expect(document.body.textContent).toContain("3 notes");
    expect(document.body.textContent).toContain("C4-G4");
    expect(document.querySelectorAll("[data-density-bucket]")).toHaveLength(16);
  });

  test("exposes take actions", () => {
    const onPlayTake = vi.fn();
    const onDeleteTake = vi.fn();
    const onPracticeTake = vi.fn();
    const onOpenInPianoRoll = vi.fn();

    render(MidiTakeReviewPanel, {
      takes,
      onPlayTake,
      onDeleteTake,
      onPracticeTake,
      onOpenInPianoRoll,
    });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Play take"))
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Practice idea"))
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Open in Piano Roll"))
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.getAttribute("aria-label") === "Delete MIDI take")
      ?.click();

    expect(onPlayTake).toHaveBeenCalledWith(takes[0]);
    expect(onPracticeTake).toHaveBeenCalledWith(takes[0]);
    expect(onOpenInPianoRoll).toHaveBeenCalledWith(takes[0]);
    expect(onDeleteTake).toHaveBeenCalledWith(takes[0]);
  });
});
