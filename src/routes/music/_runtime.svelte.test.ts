import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Capability,
  unixMs,
  type ExerciseRunRecord,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { buildDailyRoutinePlan } from "@repo/music-core/engines/daily-routine";
import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";
import type { TransportEngine, TransportEvent } from "@repo/music-core/engines/transport";

import { MusicRuntime, type PracticeCaptureEntry } from "./_runtime.svelte";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`runtime-journal-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

function createFakeTransport() {
  const listeners = new Set<(event: TransportEvent) => void>();
  const state = { running: false };
  return {
    state,
    setBpm: vi.fn(),
    setCountInBars: vi.fn(),
    start: vi.fn(() => {
      state.running = true;
    }),
    stop: vi.fn(() => {
      state.running = false;
    }),
    subscribe(listener: (event: TransportEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event: TransportEvent) {
      listeners.forEach((listener) => listener(event));
    },
  } as unknown as TransportEngine & { emit(event: TransportEvent): void };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("MusicRuntime shared UI state", () => {
  it("defaults active instrument to piano", () => {
    const rt = new MusicRuntime();
    expect(rt.activeInstrument).toBe("piano");
    rt.dispose();
  });

  it("updates active instrument via setter", () => {
    const rt = new MusicRuntime();
    rt.setActiveInstrument("guitar");
    expect(rt.activeInstrument).toBe("guitar");
    rt.dispose();
  });

  it("mirrors router active source reactively", () => {
    const rt = new MusicRuntime();
    expect(rt.activeSource).toBe("onscreen"); // router default
    rt.router.noteOn(60, "midi");
    expect(rt.activeSource).toBe("midi");
    rt.dispose();
  });

  it("updates shared transport bpm", () => {
    const rt = new MusicRuntime();
    expect(rt.transportBpm).toBe(96);
    rt.setTransportBpm(132);
    expect(rt.transportBpm).toBe(132);
    expect(rt.metronomeRunning).toBe(false);
    rt.dispose();
  });

  it("tracks a configurable count-in", () => {
    const rt = new MusicRuntime();
    expect(rt.countInBars).toBe(1);
    rt.setCountIn(2);
    expect(rt.countInBars).toBe(2);
    rt.setCountIn(0);
    expect(rt.countInBars).toBe(0);
    rt.dispose();
  });

  it("attaches a shared media library", async () => {
    const store = createStore();
    const rt = new MusicRuntime();

    rt.attachMedia(store);

    expect(rt.media).toBeDefined();
    await expect(rt.media?.listTakes()).resolves.toEqual([]);
    rt.dispose();
  });

  it("runs a count-in through an injected transport", async () => {
    const transport = createFakeTransport();
    const rt = new MusicRuntime({ createTransport: async () => transport });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);

    rt.setCountIn(1);
    const ready = rt.runCountIn();
    await flushAsync();
    expect(transport.start).toHaveBeenCalledOnce();
    transport.emit({
      kind: "beat",
      atSeconds: 0,
      beat: 3,
      subdivision: 0,
      accented: false,
      countingIn: true,
    });
    transport.emit({
      kind: "beat",
      atSeconds: 0.5,
      beat: 0,
      subdivision: 0,
      accented: true,
      countingIn: false,
    });

    await expect(ready).resolves.toBeUndefined();
    expect(transport.setBpm).toHaveBeenCalledWith(rt.transportBpm);
    expect(transport.setCountInBars).toHaveBeenCalledWith(1);
    expect(transport.start).toHaveBeenCalledOnce();
    expect(rt.activeBeat).toBe(0);
    rt.dispose();
  });

  it("forwards channel + midi-instrument selection to the router", () => {
    const rt = new MusicRuntime();
    rt.setActiveChannel(10);
    expect(rt.activeChannel).toBe(10);
    expect(rt.router.activeChannel).toBe(10);

    rt.setActiveMidiInstrument("mpc", 9);
    expect(rt.activeInstrument).toBe("mpc");
    expect(rt.router.activeChannel).toBe(9);
    rt.dispose();
  });

  it("loads MIDI-preferred instruments from device profiles", async () => {
    const map = new Map<string, { id: string; value: unknown }>();
    const repo = {
      get: async (id: string) => map.get(id),
      put: async (record: { id: string; value: unknown }) => {
        map.set(record.id, record);
      },
    };
    await repo.put({
      id: "music.device-profiles",
      value: {
        profiles: [{ id: "d1", instrument: "piano", channel: 1 }],
        preferences: { piano: "midi", guitar: "audio" },
      },
    });

    const rt = new MusicRuntime();
    await rt.attachStorage(repo);
    expect(rt.midiInstruments.map((option) => option.instrument)).toEqual(["piano"]);
    expect(rt.midiInstruments[0]?.channel).toBe(1);
    rt.dispose();
  });

  it("plays a registered playback source instead of the metronome", async () => {
    const rt = new MusicRuntime();
    // Pretend audio is already enabled so togglePlayback proceeds to play().
    rt.audioEnabled = true;
    let played = 0;
    rt.setPlaybackSource({ label: "Take 1", durationSec: 0.4, play: () => (played += 1) });
    await rt.togglePlayback();
    expect(played).toBe(1);
    expect(rt.playbackPlaying).toBe(true);
    expect(rt.metronomeRunning).toBe(false); // metronome untouched
    rt.dispose();
  });

  it("captures a completed practice activity into the journal", async () => {
    const store = createStore();
    const rt = new MusicRuntime();
    rt.attachJournal(store);

    await rt.recordPractice({
      source: "drill",
      instrument: "piano",
      tags: ["reading"],
      xpEarned: 30,
      note: "Note reading · 8/10 correct (80%)",
    });

    const journal = new PracticeSessionStore(store);
    await journal.load();
    const sessions = journal.all();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      source: "drill",
      instrument: "piano",
      xpEarned: 30,
      tags: ["reading"],
    });
    expect(sessions[0]?.notes).toContain("Note reading");
    rt.dispose();
  });

  it("aggregates active routine drills into one daily-routine journal entry", async () => {
    const store = createStore();
    const rt = new MusicRuntime();
    rt.attachJournal(store);
    rt.startDailyRoutine(buildDailyRoutinePlan([]).slice(0, 2), unixMs(1_000));

    await rt.recordPractice({
      source: "drill",
      tags: ["ear"],
      scoringEvents: [routineEvent("routine-ear", 0.75)],
      xpEarned: 12,
      note: "Ear training complete",
      startedAt: unixMs(1_200),
      endedAt: unixMs(2_000),
    });

    let journal = new PracticeSessionStore(store);
    await journal.load();
    expect(journal.all()).toHaveLength(0);
    expect(rt.dailyRoutine?.currentStep?.id).toBe("reading");

    await rt.recordPractice({
      source: "drill",
      tags: ["reading"],
      scoringEvents: [routineEvent("routine-reading", 1)],
      xpEarned: 18,
      note: "Reading complete",
      startedAt: unixMs(2_500),
      endedAt: unixMs(4_000),
    });

    journal = new PracticeSessionStore(store);
    await journal.load();
    expect(journal.all()).toHaveLength(1);
    expect(journal.all()[0]).toMatchObject({
      source: "daily-routine",
      xpEarned: 30,
      tags: ["daily-routine", "ear", "reading"],
    });
    expect(journal.all()[0]?.scoringEvents).toHaveLength(2);
    expect(rt.dailyRoutine?.status).toBe("summary");
    rt.dispose();
  });

  it("does not advance a routine when a different drill is completed", async () => {
    const store = createStore();
    const rt = new MusicRuntime();
    rt.attachJournal(store);
    rt.startDailyRoutine(buildDailyRoutinePlan([]).slice(0, 2), unixMs(1_000));

    await rt.recordPractice({
      source: "drill",
      tags: ["reading"],
      scoringEvents: [routineEvent("outside-routine-reading", 1)],
      xpEarned: 10,
      startedAt: unixMs(1_200),
      endedAt: unixMs(2_000),
    });

    const journal = new PracticeSessionStore(store);
    await journal.load();
    expect(journal.all()).toHaveLength(1);
    expect(journal.all()[0]?.source).toBe("drill");
    expect(rt.dailyRoutine?.currentStep?.id).toBe("ear");
    rt.dispose();
  });

  it("preserves explicit capture id and timestamps", async () => {
    const store = createStore();
    const rt = new MusicRuntime();
    rt.attachJournal(store);
    const run: ExerciseRunRecord = {
      id: "run-fixed",
      exerciseId: "reading.fixed",
      startedAt: unixMs(1_250),
      endedAt: unixMs(4_000),
      promptIds: ["prompt-1"],
      targetSkillIds: ["reading.treble.landmarks"],
      instrument: "piano",
      difficulty: 0.6,
      params: { tempo: 84 },
    };
    const scoringEvent: ScoringEvent = {
      id: "event-fixed",
      sessionId: "practice-fixed",
      exerciseId: run.exerciseId,
      runId: run.id,
      skillIds: run.targetSkillIds,
      capabilities: [Capability.Reading],
      at: unixMs(3_000),
      correct: true,
      partialCredit: 1,
      difficulty: run.difficulty,
      metrics: [{ kind: "pitch", expectedMidi: 60, actualMidi: 60, cents: 0 }],
    };

    await rt.recordPractice({
      id: "practice-fixed",
      source: "drill",
      instrument: "piano",
      startedAt: unixMs(1_000),
      endedAt: unixMs(4_500),
      tags: ["practice-lab", "piano"],
      runs: [run],
      scoringEvents: [scoringEvent],
      xpEarned: 24,
      note: "Timed reading capture",
    });

    const journal = new PracticeSessionStore(store);
    await journal.load();
    expect(journal.all()[0]).toMatchObject({
      id: "practice-fixed",
      startTime: 1_000,
      endTime: 4_500,
      source: "drill",
      instrument: "piano",
      tags: ["practice-lab", "piano"],
      runs: [run],
      scoringEvents: [scoringEvent],
      xpEarned: 24,
      notes: "Timed reading capture",
    });
    rt.dispose();
  });

  it("retries a stable id without duplicating the journal row", async () => {
    const store = createStore();
    const rt = new MusicRuntime();
    rt.attachJournal(store);
    const { entry, run, scoringEvent } = createStableCapture("practice-retry");

    await rt.recordPractice(entry);
    await rt.recordPractice(entry);

    const journal = new PracticeSessionStore(store);
    await journal.load();
    const matches = journal.all().filter(({ id }) => id === entry.id);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: entry.id,
      startTime: entry.startedAt,
      endTime: entry.endedAt,
      source: entry.source,
      instrument: entry.instrument,
      tags: entry.tags,
      runs: [run],
      scoringEvents: [scoringEvent],
      xpEarned: entry.xpEarned,
      notes: entry.note,
    });
    expect(matches[0]?.runs).toHaveLength(1);
    expect(matches[0]?.scoringEvents).toHaveLength(1);
    rt.dispose();
  });

  it("retries a stable capture after a failed journal write", async () => {
    const store = createStore();
    vi.spyOn(store.sessions, "put").mockRejectedValueOnce(new Error("Persistence unavailable"));
    const rt = new MusicRuntime();
    rt.attachJournal(store);
    const { entry, run, scoringEvent } = createStableCapture("practice-fail-once");

    await expect(rt.recordPractice(entry)).rejects.toThrow("Persistence unavailable");
    await expect(rt.recordPractice(entry)).resolves.toBeUndefined();

    const journal = new PracticeSessionStore(store);
    await journal.load();
    const matches = journal.all().filter(({ id }) => id === entry.id);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: entry.id,
      startTime: entry.startedAt,
      endTime: entry.endedAt,
      source: entry.source,
      instrument: entry.instrument,
      tags: entry.tags,
      runs: [run],
      scoringEvents: [scoringEvent],
      xpEarned: entry.xpEarned,
      notes: entry.note,
    });
    expect(matches[0]?.runs).toHaveLength(1);
    expect(matches[0]?.scoringEvents).toHaveLength(1);
    rt.dispose();
  });

  it("rejects a practice capture ending before it starts", async () => {
    const store = createStore();
    const rt = new MusicRuntime();
    rt.attachJournal(store);

    await expect(
      rt.recordPractice({
        id: "practice-invalid-duration",
        source: "free-practice",
        startedAt: unixMs(4_500),
        endedAt: unixMs(1_000),
        xpEarned: 0,
      }),
    ).rejects.toThrow("Practice capture endedAt must not be before startedAt");

    const journal = new PracticeSessionStore(store);
    await journal.load();
    expect(journal.all()).toHaveLength(0);
    rt.dispose();
  });

  it("rejects an invalid practice range without an attached journal", async () => {
    const rt = new MusicRuntime();

    await expect(
      rt.recordPractice({
        source: "free-practice",
        startedAt: unixMs(4_500),
        endedAt: unixMs(1_000),
        xpEarned: 0,
      }),
    ).rejects.toThrow("Practice capture endedAt must not be before startedAt");

    rt.dispose();
  });

  it("recordPractice is a no-op without an attached journal", async () => {
    const rt = new MusicRuntime();
    await expect(rt.recordPractice({ source: "drill", xpEarned: 10 })).resolves.toBeUndefined();
    rt.dispose();
  });

  it("toggles master mute and clamps the metronome blend", () => {
    const rt = new MusicRuntime();
    expect(rt.masterMuted).toBe(false);
    rt.toggleMute();
    expect(rt.masterMuted).toBe(true);
    expect(rt.sound.muted).toBe(true);

    rt.setMetronomeLevel(1.4);
    expect(rt.metronomeLevel).toBe(1);
    rt.setMetronomeLevel(-1);
    expect(rt.metronomeLevel).toBe(0);
    rt.dispose();
  });
});

function createStableCapture(id: string): {
  entry: PracticeCaptureEntry;
  run: ExerciseRunRecord;
  scoringEvent: ScoringEvent;
} {
  const run: ExerciseRunRecord = {
    id: `${id}-run`,
    exerciseId: "reading.stable",
    startedAt: unixMs(2_100),
    endedAt: unixMs(2_800),
    promptIds: ["prompt-1", "prompt-2"],
    targetSkillIds: ["reading.treble.landmarks"],
    instrument: "piano",
    difficulty: 0.7,
    params: { tempo: 88 },
  };
  const scoringEvent: ScoringEvent = {
    id: `${id}-event`,
    sessionId: id,
    exerciseId: run.exerciseId,
    runId: run.id,
    skillIds: run.targetSkillIds,
    capabilities: [Capability.Reading],
    at: unixMs(2_600),
    correct: true,
    partialCredit: 1,
    difficulty: run.difficulty,
    metrics: [{ kind: "pitch", expectedMidi: 64, actualMidi: 64, cents: 0 }],
  };
  const entry: PracticeCaptureEntry = {
    id,
    source: "drill",
    instrument: "piano",
    startedAt: unixMs(2_000),
    endedAt: unixMs(3_000),
    tags: ["practice-lab", "retry"],
    runs: [run],
    scoringEvents: [scoringEvent],
    xpEarned: 28,
    note: "Stable capture payload",
  };

  return { entry, run, scoringEvent };
}

function routineEvent(id: string, partialCredit: number): ScoringEvent {
  return {
    id,
    sessionId: "routine-drill",
    exerciseId: "routine.exercise",
    skillIds: ["pitch.interval.m6"],
    capabilities: [Capability.EarTraining],
    at: unixMs(1_500),
    correct: partialCredit === 1,
    partialCredit,
    difficulty: 0.5,
    metrics: [],
  };
}
