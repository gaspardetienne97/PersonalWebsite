import { describe, expect, test, vi } from "vite-plus/test";

import type { NoteEvent } from "@repo/music-core/domain";

import type { MusicRuntime } from "../_runtime.svelte";
import { MAX_PERSISTED_MIDI_TAKES, MIDI_TAKES_ID, useTakeRecorder } from "./take-recorder.svelte";

function makeRuntime(): MusicRuntime {
  const local = new Map<string, unknown>();
  return {
    activeInstrument: "piano",
    audioEnabled: true,
    audioMessage: "",
    transportBpm: 96,
    mediaVolume: 1,
    media: {
      listTakes: vi.fn(async () => []),
      usage: vi.fn(async () => ({ takeBytes: 0, backingBytes: 0, totalBytes: 0 })),
      takeBlob: vi.fn(async () => undefined),
    },
    sound: { playPattern: vi.fn(), stopPattern: vi.fn() },
    ensurePlaybackVoice: vi.fn(async () => true),
    enableAudio: vi.fn(async () => true),
    readLocalState: vi.fn(async (id: string) => local.get(id)),
    writeLocalState: vi.fn(async (id: string, value: unknown) => {
      local.set(id, value);
    }),
  } as unknown as MusicRuntime;
}

function noteOn(midiNote: number, timestamp: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 100,
    timestamp,
    source: "onscreen",
  } as unknown as NoteEvent;
}

describe("useTakeRecorder", () => {
  test("returns the same instance to every consumer of one runtime", () => {
    const runtime = makeRuntime();
    expect(useTakeRecorder(runtime)).toBe(useTakeRecorder(runtime));
    expect(useTakeRecorder(makeRuntime())).not.toBe(useTakeRecorder(runtime));
  });

  test("a take recorded through one consumer is on the other consumer's list", () => {
    const runtime = makeRuntime();
    const record = useTakeRecorder(runtime);
    const play = useTakeRecorder(runtime);

    record.startMidi(0);
    record.capture(noteOn(60, 100));
    record.stopMidi(1_000, { name: "Record take" });

    expect(play.midiTakes.map((take) => take.name)).toEqual(["Record take"]);
    expect(play.midiTakes[0]?.notes).toHaveLength(1);
  });

  test("renaming on one consumer shows on the other and persists", async () => {
    const runtime = makeRuntime();
    const record = useTakeRecorder(runtime);
    const play = useTakeRecorder(runtime);

    record.startMidi(0);
    record.capture(noteOn(64, 50));
    const take = record.stopMidi(500, { name: "Take 1" })!;
    record.renameMidiTake(take, "Ballad intro");

    expect(play.midiTakes[0]?.name).toBe("Ballad intro");
    expect(runtime.writeLocalState).toHaveBeenCalledWith(MIDI_TAKES_ID, play.midiTakes);
    expect(await runtime.readLocalState<{ name: string }[]>(MIDI_TAKES_ID)).toMatchObject([
      { name: "Ballad intro" },
    ]);
  });

  test("a free-practice run with no notes discards its empty take", () => {
    const runtime = makeRuntime();
    const recorder = useTakeRecorder(runtime);

    recorder.startMidi(0);
    expect(recorder.stopMidi(1_000, { name: "Empty", discardEmpty: true })).toBeUndefined();
    expect(recorder.midiTakes).toHaveLength(0);
  });

  test("release ends an in-flight audio take and clears the shared message", async () => {
    const runtime = makeRuntime();
    const recorder = useTakeRecorder(runtime);
    const cancel = vi.spyOn(recorder.audio, "cancel").mockResolvedValue(undefined);
    recorder.micRequested = true;
    recorder.micArmed = true;
    recorder.recorderState = { status: "recording", elapsedMs: 1_200 };
    recorder.message = "MIDI take playback could not be enabled.";

    recorder.release();

    // Leaving the page must end the MediaRecorder and the getUserMedia stream,
    // not just forget about them.
    expect(cancel).toHaveBeenCalledOnce();
    expect(recorder.micArmed).toBe(false);
    expect(recorder.micRequested).toBe(false);
    // A failure raised on one destination must not greet the next one.
    expect(recorder.message).toBe("");
  });

  test("the shared list keeps only the newest MAX_PERSISTED_MIDI_TAKES takes", () => {
    const runtime = makeRuntime();
    const recorder = useTakeRecorder(runtime);

    for (let index = 0; index < MAX_PERSISTED_MIDI_TAKES + 3; index += 1) {
      recorder.startMidi(index * 1_000);
      recorder.capture(noteOn(60, index * 1_000 + 10));
      recorder.stopMidi(index * 1_000 + 500, { name: `Take ${index}` });
    }

    expect(recorder.midiTakes).toHaveLength(MAX_PERSISTED_MIDI_TAKES);
    expect(recorder.midiTakes[0]?.name).toBe(`Take ${MAX_PERSISTED_MIDI_TAKES + 2}`);
    expect(recorder.midiTakes.at(-1)?.name).toBe("Take 3");
    expect(runtime.writeLocalState).toHaveBeenLastCalledWith(MIDI_TAKES_ID, recorder.midiTakes);
  });

  test("two consumers loading in the same tick share one read", async () => {
    const runtime = makeRuntime();
    const recorder = useTakeRecorder(runtime);

    await Promise.all([recorder.loadMidi(), recorder.loadMidi()]);

    expect(runtime.readLocalState).toHaveBeenCalledTimes(1);
  });

  test("a one-line note survives on the shared take", () => {
    const runtime = makeRuntime();
    const recorder = useTakeRecorder(runtime);

    recorder.startMidi(0);
    recorder.capture(noteOn(67, 10));
    const take = recorder.stopMidi(400)!;
    recorder.noteMidiTake(take, "Recording after Two-hand independence");

    expect(recorder.midiTakes[0]?.note).toBe("Recording after Two-hand independence");
  });
});
