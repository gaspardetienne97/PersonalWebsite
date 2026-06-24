import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { Score } from "@repo/music-core/domain";
import type { SongRow } from "@repo/music-core/engines/store";

import { MusicRuntime } from "../../_runtime.svelte";
import Page from "./+page.svelte";

describe("/music/songs/[id]/+page.svelte", () => {
  test("loads a score and completes wait-mode follow-along from shared input", async () => {
    const library = {
      get: vi.fn(async () => songRow()),
    };
    const runtime = new MusicRuntime();
    const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();

    render(Page, { songId: "song-1", runtime, library });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    button("Start follow-along")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play C4"));

    runtime.router.noteOn(60, "onscreen", "piano");
    runtime.router.noteOn(64, "onscreen", "piano");
    runtime.router.noteOn(67, "onscreen", "piano");

    await vi.waitFor(() => expect(document.body.textContent).toContain("Score complete"));
    expect(recordPractice).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "song",
        tags: ["song", "song-1", "score-following"],
      }),
    );
    runtime.dispose();
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function songRow(): SongRow {
  return {
    id: "song-1",
    title: "Autumn Leaves",
    createdAt: 1_000,
    updatedAt: 2_000,
    score: score(),
  };
}

function score(): Score {
  return {
    id: "song-1",
    title: "Autumn Leaves",
    origin: "midi",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "voice-1", name: "Melody", role: "melody" }],
    notes: [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
      { midiNote: 64, startBeat: 1, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
      { midiNote: 67, startBeat: 2, durationBeats: 2, velocity: 0.8, voiceId: "voice-1" },
    ],
    chords: [],
    sections: [{ id: "full", name: "Full song", startBeat: 0, endBeat: 4 }],
    markers: [],
  };
}
