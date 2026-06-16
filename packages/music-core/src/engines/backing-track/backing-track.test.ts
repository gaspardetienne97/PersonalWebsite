import { describe, expect, test, vi } from "vitest";

import { unixMs } from "@repo/music-core/domain";
import { JAM_PROGRESSIONS } from "@repo/music-core/engines/jam";
import type { ImportedBackingTrackRow } from "@repo/music-core/engines/store";

import { BackingTrackEngine, projectProgression, type BackingTrackPlaybackAdapter } from "./index";

function backing(overrides: Partial<ImportedBackingTrackRow> = {}): ImportedBackingTrackRow {
  return {
    id: "backing-1",
    name: "Practice Track.wav",
    mimeType: "audio/wav",
    size: 1_024,
    durationMs: 60_000,
    createdAt: unixMs(Date.UTC(2026, 5, 16)),
    ...overrides,
  };
}

function createAdapter(): BackingTrackPlaybackAdapter {
  return {
    playGenerated: vi.fn(async () => undefined),
    stopGenerated: vi.fn(),
    loadImported: vi.fn(async () => 45_000),
    playImported: vi.fn(async () => undefined),
    pauseImported: vi.fn(),
    stopImported: vi.fn(),
    seekImported: vi.fn(),
    setImportedLoop: vi.fn(),
    setImportedVolume: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("music-core/backing-track", () => {
  test("plays and stops a generated progression through the adapter", async () => {
    const adapter = createAdapter();
    const engine = new BackingTrackEngine(adapter);

    engine.selectGenerated({ kind: "generated", progressionId: "ii-v-i", bpm: 96, loop: true });
    await engine.play();

    expect(adapter.playGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ progressionId: "ii-v-i", bpm: 96, loop: true }),
    );
    expect(engine.state.status).toBe("playing");
    expect(engine.state.durationMs).toBe(20_000);

    engine.stop();
    expect(adapter.stopGenerated).toHaveBeenCalled();
    expect(engine.state.status).toBe("stopped");
    expect(engine.state.positionMs).toBe(0);
  });

  test("loads, seeks, loops, and changes volume for imported backing tracks", async () => {
    const adapter = createAdapter();
    const engine = new BackingTrackEngine(adapter);
    const track = backing();

    engine.selectImported(track, { loop: true });
    await engine.play();
    await engine.seek(1_250);
    engine.setVolume(0.4);
    engine.setLoop(false);

    expect(adapter.loadImported).toHaveBeenCalledWith(track);
    expect(adapter.playImported).toHaveBeenCalled();
    expect(adapter.seekImported).toHaveBeenCalledWith(1_250);
    expect(adapter.setImportedVolume).toHaveBeenLastCalledWith(0.4);
    expect(adapter.setImportedLoop).toHaveBeenLastCalledWith(false);
    expect(engine.state).toMatchObject({
      status: "playing",
      durationMs: 45_000,
      positionMs: 1_250,
      volume: 0.4,
    });
  });

  test("notifies subscribers with immutable state snapshots", () => {
    const adapter = createAdapter();
    const engine = new BackingTrackEngine(adapter);
    const states = vi.fn();

    const unsubscribe = engine.subscribe(states);
    engine.selectImported(backing({ name: "First.wav" }));
    const snapshot = states.mock.calls.at(-1)?.[0];
    if (snapshot?.selection.kind === "imported") snapshot.selection.track.name = "Mutated.wav";
    engine.setVolume(2);
    unsubscribe();
    engine.setVolume(0);

    expect(states).toHaveBeenCalledTimes(3);
    const current = engine.state;
    expect(current.volume).toBe(0);
    expect(current.selection.kind).toBe("imported");
    if (current.selection.kind === "imported") {
      expect(current.selection.track.name).toBe("First.wav");
    }
  });

  test("records playback errors in state and rethrows them", async () => {
    const adapter = createAdapter();
    vi.mocked(adapter.playGenerated).mockRejectedValueOnce(new Error("audio denied"));
    const engine = new BackingTrackEngine(adapter);

    engine.selectGenerated({ kind: "generated", progressionId: "ii-v-i", bpm: 96, loop: true });

    await expect(engine.play()).rejects.toThrow("audio denied");
    expect(engine.state).toMatchObject({ status: "error", message: "audio denied" });
  });

  test("projects jam progressions into deterministic chord steps", () => {
    const pattern = projectProgression(JAM_PROGRESSIONS[0]!, 96);

    expect(pattern).toEqual({
      progressionId: "ii-v-i",
      durationSec: 20,
      steps: [
        { midiNotes: [50, 53, 57, 60], offsetSeconds: 0, durationSeconds: 5 },
        { midiNotes: [55, 59, 62, 65], offsetSeconds: 5, durationSeconds: 5 },
        { midiNotes: [48, 52, 55, 59], offsetSeconds: 10, durationSeconds: 5 },
        { midiNotes: [57, 61, 64, 67], offsetSeconds: 15, durationSeconds: 5 },
      ],
    });
    expect(() => projectProgression(JAM_PROGRESSIONS[0]!, 0)).toThrow(/bpm/i);
  });
});
