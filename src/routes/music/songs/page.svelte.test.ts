import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { Score } from "@repo/music-core/domain";
import type { SongRow } from "@repo/music-core/engines/store";

import { MusicRuntime } from "../_runtime.svelte";
import Page from "./+page.svelte";

describe("/music/songs/+page.svelte", () => {
  test("lists saved songs, plays the selected score, and logs song practice", async () => {
    const library = {
      list: vi.fn(async () => [songRow("song-1", "Autumn Leaves")]),
      get: vi.fn(async (id: string) => songRow(id, "Autumn Leaves")),
    };
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern").mockImplementation(() => {});
    const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();

    render(Page, { runtime, library });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));
    document.querySelector<HTMLButtonElement>('button[aria-label="Open Autumn Leaves"]')?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("3 notes"));
    expect(document.querySelector('a[href="/music/songs/song-1"]')).not.toBeNull();

    const play = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Play preview"),
    );
    play?.click();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());

    const log = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Log practice"),
    );
    log?.click();
    await vi.waitFor(() =>
      expect(recordPractice).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "song",
          tags: ["song", "song-1"],
          xpEarned: 10,
        }),
      ),
    );
    await vi.waitFor(() => expect(document.body.textContent).toContain("Song practice logged."));
    runtime.dispose();
  });
});

function songRow(id: string, title: string): SongRow {
  return {
    id,
    title,
    createdAt: 1_000,
    updatedAt: 2_000,
    score: score(id, title),
  };
}

function score(id: string, title: string): Score {
  return {
    id,
    title,
    origin: "midi",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "voice-1", name: "Piano", role: "other" }],
    notes: [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
      { midiNote: 64, startBeat: 1, durationBeats: 1, velocity: 0.7, voiceId: "voice-1" },
      { midiNote: 67, startBeat: 2, durationBeats: 2, velocity: 0.9, voiceId: "voice-1" },
    ],
    chords: [],
    sections: [{ id: "full", name: "Full song", startBeat: 0, endBeat: 4 }],
    markers: [],
  };
}
