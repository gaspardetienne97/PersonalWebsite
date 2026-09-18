import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Capability,
  monotonicMs,
  unixMs,
  type ExerciseRunRecord,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { buildDailyRoutinePlan } from "@repo/music-core/engines/daily-routine";
import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";
import type {
  QuantizationGrid,
  TransportEngine,
  TransportEngineOptions,
  TransportEvent,
} from "@repo/music-core/engines/transport";

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
  const state = { running: false, numerator: 4, denominator: 4, countInBars: 0 };
  return {
    state,
    setBpm: vi.fn(),
    setTimeSignature: vi.fn((numerator: number, denominator: number) => {
      state.numerator = numerator;
      state.denominator = denominator;
    }),
    setCountInBars: vi.fn((bars: number) => {
      state.countInBars = bars;
    }),
    setQuantizationGrid: vi.fn((_grid: QuantizationGrid) => {}),
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
    listenerCount() {
      return listeners.size;
    },
  } as unknown as TransportEngine & {
    emit(event: TransportEvent): void;
    listenerCount(): number;
  };
}

function transportEvent(overrides: Partial<TransportEvent> = {}): TransportEvent {
  return {
    kind: "beat",
    atSeconds: 0,
    atMonotonicMs: monotonicMs(1_000),
    beat: 0,
    absoluteBeat: 0,
    subdivision: 0,
    accented: true,
    countingIn: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
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

  it("attaches a sample-kit store that persists to music.sample-kits", async () => {
    const map = new Map<string, { id: string; value: unknown }>();
    const repo = {
      get: async (id: string) => map.get(id),
      put: async (record: { id: string; value: unknown }) => {
        map.set(record.id, record);
      },
    };

    const rt = new MusicRuntime();
    await rt.attachStorage(repo);
    const kit = await rt.sampleKits!.create("Runtime Kit");
    expect(kit.name).toBe("Runtime Kit");
    expect(map.get("music.sample-kits")?.value).toEqual([
      expect.objectContaining({ name: "Runtime Kit" }),
    ]);
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

  it("hydrates audio levels and exposes derived media volume", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage({
      get: async () => ({
        id: "music.settings",
        value: { playbackLevel: 0.5, metronomeLevel: 0.25, masterLevel: 0.8, muted: false },
      }),
      put: async () => {},
    });

    expect(rt.playbackLevel).toBe(0.5);
    expect(rt.metronomeLevel).toBe(0.25);
    expect(rt.masterLevel).toBe(0.8);
    expect(rt.mediaVolume).toBe(0.4);
    await rt.updateMusicSettings({ muted: true });
    expect(rt.mediaVolume).toBe(0);
    rt.dispose();
  });

  it("keeps the transitional sound picker synchronized with runtime settings", async () => {
    const map = new Map<string, { id: string; value: unknown }>();
    const rt = new MusicRuntime();
    await rt.attachStorage({
      get: async (id) => map.get(id),
      put: async (record) => {
        map.set(record.id, record);
      },
    });

    rt.setInstrument("Saw");
    await vi.waitFor(() => expect(rt.preferredPlaybackSound).toBe("saw"));

    expect(rt.effectivePlaybackSound).toBe("saw");
    expect(rt.getMusicSettings()?.preferredPlaybackSound).toBe("saw");
    rt.dispose();
  });

  it("keeps sampled piano preferred when its session voice falls back", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage({
      get: async () => ({
        id: "music.settings",
        value: { preferredPlaybackSound: "salamander-piano" },
      }),
      put: async () => {},
    });
    vi.spyOn(rt.sound, "enable").mockResolvedValue({ enabled: true, message: "Audio enabled." });
    vi.spyOn(rt.sound, "loadSampler").mockRejectedValue(new Error("decode failed"));
    const warm = vi.spyOn(rt.sound, "setPlaybackSound");

    await expect(rt.ensurePlaybackVoice()).resolves.toBe(true);

    expect(rt.preferredPlaybackSound).toBe("salamander-piano");
    expect(rt.getMusicSettings()?.preferredPlaybackSound).toBe("salamander-piano");
    expect(rt.effectivePlaybackSound).toBe("warm-synth");
    expect(rt.playbackFallback).toMatch(/could not load/i);
    expect(warm).toHaveBeenCalledWith("warm-synth");
    rt.dispose();
  });

  it("tests audio through the effective sampled voice", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage({
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {},
    });
    vi.spyOn(rt.sound, "enable").mockResolvedValue({ enabled: true, message: "Audio enabled." });
    vi.spyOn(rt.sound, "loadSampler").mockResolvedValue(true);
    const chord = vi.spyOn(rt.sound, "playChord").mockImplementation(() => {});

    await expect(rt.testAudio()).resolves.toBe(true);
    expect(rt.effectivePlaybackSound).toBe("salamander-piano");
    expect(chord).toHaveBeenCalledWith([60, 64, 67], 0.5);
    rt.dispose();
  });

  it("keeps voice pending while the current flight outlives a stale flight", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage({
      get: async () => ({
        id: "music.settings",
        value: { preferredPlaybackSound: "warm-synth" },
      }),
      put: async () => {},
    });
    const audio = deferred<{ enabled: boolean; message: string }>();
    const sampler = deferred<boolean>();
    vi.spyOn(rt.sound, "enable").mockReturnValue(audio.promise);
    vi.spyOn(rt.sound, "loadSampler").mockReturnValue(sampler.promise);

    const stale = rt.ensurePlaybackVoice();
    await rt.updateMusicSettings({ preferredPlaybackSound: "salamander-piano" });
    const current = rt.ensurePlaybackVoice();
    audio.resolve({ enabled: true, message: "Audio enabled." });

    await expect(stale).resolves.toBe(true);
    expect(rt.playbackVoicePending).toBe(true);
    sampler.resolve(true);
    await expect(current).resolves.toBe(true);
    expect(rt.playbackVoicePending).toBe(false);
    rt.dispose();
  });
});

describe("shared performance lifecycle", () => {
  it("starts an idle preview on the first click when the hydrated preference is already on", async () => {
    const map = new Map<string, { id: string; value: unknown }>();
    map.set("music.settings", {
      id: "music.settings",
      value: { metronomeEnabled: true },
    });
    const repo = {
      get: async (id: string) => map.get(id),
      put: async (record: { id: string; value: unknown }) => {
        map.set(record.id, record);
      },
    };
    const transport = createFakeTransport();
    const rt = new MusicRuntime({ createTransport: async () => transport });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);

    await rt.attachStorage(repo);
    expect(rt.metronomeEnabled).toBe(true);
    expect(rt.metronomeRunning).toBe(false);

    await rt.toggleMetronome();

    expect(rt.metronomeEnabled).toBe(true);
    expect(rt.metronomeRunning).toBe(true);
    expect(transport.start).toHaveBeenCalledOnce();
    expect(map.get("music.settings")?.value).toMatchObject({ metronomeEnabled: true });

    await rt.toggleMetronome();
    expect(rt.metronomeEnabled).toBe(false);
    expect(rt.metronomeRunning).toBe(false);
    rt.dispose();
  });

  it("hydrates and persists metronome preference separately from transport state", async () => {
    const map = new Map<string, { id: string; value: unknown }>();
    map.set("music.settings", {
      id: "music.settings",
      value: { metronomeEnabled: false },
    });
    const repo = {
      get: async (id: string) => map.get(id),
      put: async (record: { id: string; value: unknown }) => {
        map.set(record.id, record);
      },
    };
    const transport = createFakeTransport();
    const rt = new MusicRuntime({ createTransport: async () => transport });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);

    await rt.attachStorage(repo);
    expect(rt.metronomeEnabled).toBe(false);
    expect(rt.metronomeRunning).toBe(false);

    await rt.toggleMetronome();
    expect(rt.metronomeEnabled).toBe(true);
    expect(rt.metronomeRunning).toBe(true);
    await vi.waitFor(() => {
      expect(map.get("music.settings")?.value).toMatchObject({ metronomeEnabled: true });
    });

    await rt.toggleMetronome();
    expect(rt.metronomeEnabled).toBe(false);
    expect(rt.metronomeRunning).toBe(false);
    await vi.waitFor(() => {
      expect(map.get("music.settings")?.value).toMatchObject({ metronomeEnabled: false });
    });
    rt.dispose();
  });

  it("returns the same in-flight promise and cancels once during audio enable", async () => {
    const audio = deferred<boolean>();
    const createTransport = vi.fn();
    const rt = new MusicRuntime({ createTransport });
    vi.spyOn(rt, "enableAudio").mockReturnValue(audio.promise);

    const first = rt.beginPerformance();
    const duplicate = rt.beginPerformance();
    expect(duplicate).toBe(first);
    expect(rt.performancePending).toBe(true);

    rt.endPerformance();
    rt.endPerformance();
    expect(rt.performancePending).toBe(false);
    audio.resolve(true);

    await expect(first).resolves.toEqual({ status: "cancelled" });
    expect(createTransport).not.toHaveBeenCalled();
    expect(rt.practicePhase).toBe("idle");
    rt.dispose();
  });

  it("returns a typed failure when audio cannot be enabled", async () => {
    const rt = new MusicRuntime();
    rt.audioMessage = "Audio permission denied";
    vi.spyOn(rt, "enableAudio").mockResolvedValue(false);

    const result = rt.beginPerformance();
    expect(rt.performancePending).toBe(true);
    await expect(result).resolves.toEqual({
      status: "failed",
      message: "Audio permission denied",
    });
    expect(rt.performancePending).toBe(false);
    expect(rt.practicePhase).toBe("idle");
    rt.dispose();
  });

  it("cancels transport creation without starting the stale clock", async () => {
    const pendingTransport = deferred<TransportEngine>();
    const transport = createFakeTransport();
    const rt = new MusicRuntime({ createTransport: () => pendingTransport.promise });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);

    const result = rt.beginPerformance();
    await flushAsync();
    rt.endPerformance();
    pendingTransport.resolve(transport);

    await expect(result).resolves.toEqual({ status: "cancelled" });
    expect(transport.start).not.toHaveBeenCalled();
    expect(transport.listenerCount()).toBe(1);
    rt.dispose();
  });

  it("shares one transport creation flight between performance and metronome callers", async () => {
    const audio = deferred<boolean>();
    const pendingTransport = deferred<TransportEngine>();
    const transport = createFakeTransport();
    const createTransport = vi.fn(() => pendingTransport.promise);
    const rt = new MusicRuntime({ createTransport });
    vi.spyOn(rt, "enableAudio").mockReturnValue(audio.promise);

    const performance = rt.beginPerformance();
    const metronome = rt.toggleMetronome();
    audio.resolve(true);
    await flushAsync();

    expect(createTransport).toHaveBeenCalledOnce();
    pendingTransport.resolve(transport);
    await metronome;
    rt.endPerformance();
    await expect(performance).resolves.toEqual({ status: "cancelled" });
    rt.dispose();
  });

  it("stops a transport that resolves after runtime disposal without subscribing or starting", async () => {
    const pendingTransport = deferred<TransportEngine>();
    const transport = createFakeTransport();
    const createTransport = vi.fn(() => pendingTransport.promise);
    const rt = new MusicRuntime({ createTransport });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);

    const metronome = rt.toggleMetronome();
    await flushAsync();
    expect(createTransport).toHaveBeenCalledOnce();

    rt.dispose();
    pendingTransport.resolve(transport);
    await metronome;

    expect(transport.stop).toHaveBeenCalledOnce();
    expect(transport.start).not.toHaveBeenCalled();
    expect(transport.listenerCount()).toBe(0);
  });

  it("starts immediately without a private clock when count-in and click are off", async () => {
    const transport = createFakeTransport();
    const rt = new MusicRuntime({
      createTransport: async () => transport,
      monotonicNowMs: () => monotonicMs(1_234),
    });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    rt.countInBars = 0;
    rt.metronomeEnabled = false;

    await expect(rt.beginPerformance()).resolves.toEqual({
      status: "started",
      downbeat: 1_234,
    });
    expect(transport.start).not.toHaveBeenCalled();
    expect(rt.metronomeRunning).toBe(false);
    expect(rt.practicePhase).toBe("running");

    rt.endPerformance();
    expect(rt.practicePhase).toBe("idle");
    rt.dispose();
  });

  it("configures literal meter pulses and stops after a count-in-only downbeat", async () => {
    const transport = createFakeTransport();
    let options: TransportEngineOptions | undefined;
    const rt = new MusicRuntime({
      createTransport: async (next) => {
        options = next;
        return transport;
      },
    });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    const click = vi.spyOn(rt.sound, "playMetronomeClick").mockImplementation(() => {});
    await rt.registerPracticeContext({
      owner: "six-eight",
      variantKey: "six-eight",
      defaultBpm: 90,
      meter: { numerator: 6, denominator: 8 },
    });
    rt.countInBars = 1;
    rt.metronomeEnabled = false;

    const result = rt.beginPerformance();
    await flushAsync();
    expect(rt.practicePhase).toBe("count-in");
    expect(transport.setTimeSignature).toHaveBeenCalledWith(6, 8);
    expect(transport.setQuantizationGrid).toHaveBeenCalledWith("8n");
    expect(transport.setBpm).toHaveBeenCalledWith(90);

    const countIn = transportEvent({ countingIn: true, beat: 5, accented: false });
    options?.onMetronomeClick?.(countIn);
    transport.emit(countIn);
    expect(click).toHaveBeenCalledOnce();

    const downbeat = transportEvent({ atMonotonicMs: monotonicMs(2_000) });
    options?.onMetronomeClick?.(downbeat);
    transport.emit(downbeat);

    await expect(result).resolves.toEqual({ status: "started", downbeat: 2_000 });
    expect(click).toHaveBeenCalledOnce();
    expect(transport.stop).toHaveBeenCalledOnce();
    expect(transport.listenerCount()).toBe(1);
    expect(rt.practicePhase).toBe("running");
    rt.dispose();
  });

  it("keeps continued clicks running and gates them without stopping the practice clock", async () => {
    const transport = createFakeTransport();
    let options: TransportEngineOptions | undefined;
    const rt = new MusicRuntime({
      createTransport: async (next) => {
        options = next;
        return transport;
      },
    });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    const click = vi.spyOn(rt.sound, "playMetronomeClick").mockImplementation(() => {});
    rt.countInBars = 1;
    rt.metronomeEnabled = true;

    const result = rt.beginPerformance();
    await flushAsync();
    const countIn = transportEvent({ countingIn: true });
    options?.onMetronomeClick?.(countIn);
    transport.emit(countIn);

    await rt.toggleMetronome();
    expect(rt.metronomeEnabled).toBe(false);
    expect(transport.stop).not.toHaveBeenCalled();

    const downbeat = transportEvent({ atMonotonicMs: monotonicMs(2_500) });
    options?.onMetronomeClick?.(downbeat);
    transport.emit(downbeat);
    await expect(result).resolves.toEqual({ status: "started", downbeat: 2_500 });
    expect(click).toHaveBeenCalledOnce();
    expect(transport.stop).toHaveBeenCalledOnce();

    rt.metronomeEnabled = true;
    const runningBeat = transportEvent({ beat: 1, accented: false });
    options?.onMetronomeClick?.(runningBeat);
    expect(click).toHaveBeenCalledTimes(2);
    rt.dispose();
  });

  it("gates clicks during a running performance without stopping its clock", async () => {
    const transport = createFakeTransport();
    let options: TransportEngineOptions | undefined;
    const rt = new MusicRuntime({
      createTransport: async (next) => {
        options = next;
        return transport;
      },
    });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    const click = vi.spyOn(rt.sound, "playMetronomeClick").mockImplementation(() => {});
    rt.countInBars = 0;
    rt.metronomeEnabled = true;

    const result = rt.beginPerformance();
    await flushAsync();
    const downbeat = transportEvent({ atMonotonicMs: monotonicMs(3_000) });
    options?.onMetronomeClick?.(downbeat);
    transport.emit(downbeat);
    await expect(result).resolves.toEqual({ status: "started", downbeat: 3_000 });
    expect(transport.stop).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();

    await rt.toggleMetronome();
    const mutedBeat = transportEvent({ beat: 1, accented: false });
    options?.onMetronomeClick?.(mutedBeat);
    expect(click).toHaveBeenCalledOnce();
    expect(transport.stop).not.toHaveBeenCalled();

    await rt.toggleMetronome();
    options?.onMetronomeClick?.(mutedBeat);
    expect(click).toHaveBeenCalledTimes(2);
    expect(transport.start).toHaveBeenCalledOnce();
    rt.dispose();
  });

  it("always clicks the count-in and applies the active running-beat gate", async () => {
    const transport = createFakeTransport();
    let options: TransportEngineOptions | undefined;
    const rt = new MusicRuntime({
      createTransport: async (next) => {
        options = next;
        return transport;
      },
    });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    const click = vi.spyOn(rt.sound, "playMetronomeClick").mockImplementation(() => {});
    await rt.registerPracticeContext({
      owner: "gated",
      variantKey: "gated",
      defaultBpm: 100,
      shouldPlayMetronome: (event) => event.absoluteBeat % 8 < 4,
    });
    rt.countInBars = 1;
    rt.metronomeEnabled = true;

    void rt.beginPerformance();
    await flushAsync();
    options?.onMetronomeClick?.(
      transportEvent({ absoluteBeat: 3, countingIn: true, beat: 3, accented: false }),
    );
    options?.onMetronomeClick?.(transportEvent({ absoluteBeat: 4, countingIn: false }));
    options?.onMetronomeClick?.(transportEvent({ absoluteBeat: 8, countingIn: false, beat: 0 }));

    expect(click).toHaveBeenCalledTimes(2);
    rt.dispose();
  });

  it("cancels re-entry after downbeat without touching the running transport", async () => {
    const transport = createFakeTransport();
    const rt = new MusicRuntime({ createTransport: async () => transport });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    rt.countInBars = 0;
    rt.metronomeEnabled = true;

    const first = rt.beginPerformance();
    await flushAsync();
    transport.emit(transportEvent({ atMonotonicMs: monotonicMs(4_000) }));
    await expect(first).resolves.toEqual({ status: "started", downbeat: 4_000 });

    const calls = {
      start: vi.mocked(transport.start).mock.calls.length,
      stop: vi.mocked(transport.stop).mock.calls.length,
      bpm: vi.mocked(transport.setBpm).mock.calls.length,
      meter: vi.mocked(transport.setTimeSignature).mock.calls.length,
      grid: vi.mocked(transport.setQuantizationGrid).mock.calls.length,
      countIn: vi.mocked(transport.setCountInBars).mock.calls.length,
    };

    await expect(rt.beginPerformance()).resolves.toEqual({ status: "cancelled" });
    expect(vi.mocked(transport.start)).toHaveBeenCalledTimes(calls.start);
    expect(vi.mocked(transport.stop)).toHaveBeenCalledTimes(calls.stop);
    expect(vi.mocked(transport.setBpm)).toHaveBeenCalledTimes(calls.bpm);
    expect(vi.mocked(transport.setTimeSignature)).toHaveBeenCalledTimes(calls.meter);
    expect(vi.mocked(transport.setQuantizationGrid)).toHaveBeenCalledTimes(calls.grid);
    expect(vi.mocked(transport.setCountInBars)).toHaveBeenCalledTimes(calls.countIn);
    rt.dispose();
  });

  it("cancels a pending count-in when its context is replaced", async () => {
    const transport = createFakeTransport();
    const rt = new MusicRuntime({ createTransport: async () => transport });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    await rt.registerPracticeContext({ owner: "old", variantKey: "old", defaultBpm: 80 });

    const result = rt.beginPerformance();
    await flushAsync();
    await rt.registerPracticeContext({ owner: "new", variantKey: "new", defaultBpm: 100 });

    await expect(result).resolves.toEqual({ status: "cancelled" });
    expect(transport.stop).toHaveBeenCalledOnce();
    expect(transport.listenerCount()).toBe(1);
    expect(rt.practicePhase).toBe("idle");
    rt.dispose();
  });

  it("cannot start after cancellation from the downbeat click callback", async () => {
    const transport = createFakeTransport();
    let options: TransportEngineOptions | undefined;
    const rt = new MusicRuntime({
      createTransport: async (next) => {
        options = next;
        return transport;
      },
    });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    vi.spyOn(rt.sound, "playMetronomeClick").mockImplementation(() => rt.endPerformance());
    rt.countInBars = 1;
    rt.metronomeEnabled = true;

    const result = rt.beginPerformance();
    await flushAsync();
    const downbeat = transportEvent();
    options?.onMetronomeClick?.(downbeat);
    transport.emit(downbeat);

    await expect(result).resolves.toEqual({ status: "cancelled" });
    expect(rt.practicePhase).toBe("idle");
    expect(transport.listenerCount()).toBe(1);
    rt.dispose();
  });
});

describe("practice context registration", () => {
  function repoWithSettings(overrides: Partial<Record<string, unknown>> = {}) {
    const map = new Map<string, { id: string; value: unknown }>();
    map.set("music.settings", {
      id: "music.settings",
      value: { activeInstrument: "guitar", tempoByVariant: {}, ...overrides },
    });
    return {
      get: async (id: string) => map.get(id),
      put: async (record: { id: string; value: unknown }) => {
        map.set(record.id, record);
      },
    };
  }

  it("awaits settings hydration concurrently with storage attachment", async () => {
    const rt = new MusicRuntime();
    // registerPracticeContext starts before attachStorage finishes
    const attachPromise = rt.attachStorage(repoWithSettings());
    const [cleanup] = await Promise.all([
      rt.registerPracticeContext({
        owner: "test",
        variantKey: "scales:piano:major",
        defaultBpm: 72,
      }),
      attachPromise,
    ]);
    // Context BPM (72) won over the field default (96) even though
    // registerPracticeContext raced with attachStorage's post-load sequence
    expect(rt.practiceBpm).toBe(72);
    cleanup();
    rt.dispose();
  });

  it("persisted active instrument reaches InputRouter after hydration", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage(repoWithSettings());
    expect(rt.router.state.activeInstrument).toBe("guitar");
    expect(rt.activeInstrument).toBe("guitar");
    rt.dispose();
  });

  it.each(["mpc", "piano", "aerophone"] as const)(
    "keeps an early %s pin after storage hydration and restores the saved preference on exit",
    async (instrument) => {
      const rt = new MusicRuntime();
      const cleanup = await rt.registerPracticeContext({
        owner: "early-pin",
        variantKey: "test",
        defaultBpm: 96,
        pinnedInstrument: instrument,
      });
      await rt.attachStorage(repoWithSettings({ activeInstrument: "guitar" }));

      expect(rt.activeInstrument).toBe(instrument);
      expect(rt.router.state.activeInstrument).toBe(instrument);
      expect(rt.getMusicSettings()?.activeInstrument).toBe("guitar");
      cleanup();
      expect(rt.activeInstrument).toBe("guitar");
      expect(rt.router.state.activeInstrument).toBe("guitar");
      rt.dispose();
    },
  );

  it("pinned instrument overrides allowed list and active instrument", async () => {
    const rt = new MusicRuntime();
    rt.setActiveInstrument("piano");
    const cleanup = await rt.registerPracticeContext({
      owner: "pin-test",
      variantKey: "test",
      defaultBpm: 60,
      pinnedInstrument: "ukulele",
      allowedInstruments: ["guitar", "ukulele"],
    });
    expect(rt.activeInstrument).toBe("ukulele");
    rt.setActiveInstrument("guitar");
    expect(rt.activeInstrument).toBe("ukulele"); // pinned wins
    expect(rt.practiceInstrumentPinned).toBe(true);
    expect(rt.practiceInstrumentOptions).toEqual(["ukulele"]);
    cleanup();
    rt.dispose();
  });

  it("updates the active variant BPM from the floating control", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage(repoWithSettings());
    const cleanup = await rt.registerPracticeContext({
      owner: "tempo-test",
      variantKey: "v1:test:piano",
      defaultBpm: 72,
      meter: { numerator: 3, denominator: 4 },
    });

    rt.setPracticeBpm(108);

    expect(rt.practiceBpm).toBe(108);
    expect(rt.practiceMeter).toEqual({ numerator: 3, denominator: 4 });
    expect(rt.getMusicSettings()?.tempoByVariant["v1:test:piano"]).toBe(108);
    cleanup();
    rt.dispose();
  });

  it("allowed list filters out instruments not in the list", async () => {
    const rt = new MusicRuntime();
    const writes: Array<{ id: string; value: unknown }> = [];
    const repo = repoWithSettings({ activeInstrument: "aerophone" });
    const put = repo.put;
    repo.put = async (record) => {
      writes.push(record);
      await put(record);
    };
    await rt.attachStorage(repo);
    const onInstrumentChange = vi.fn(() => {
      expect(rt.activeInstrument).toBe("guitar");
      expect(rt.router.state.activeInstrument).toBe("guitar");
    });
    const cleanup = await rt.registerPracticeContext({
      owner: "allowed-test",
      variantKey: "test",
      defaultBpm: 60,
      allowedInstruments: ["guitar", "piano"],
      onInstrumentChange,
    });
    expect(rt.activeInstrument).toBe("guitar");
    expect(rt.router.state.activeInstrument).toBe("guitar");
    expect(onInstrumentChange).toHaveBeenCalledWith("guitar");
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.value).toMatchObject({ activeInstrument: "guitar" });
    cleanup();
    rt.dispose();
  });

  it("pinned reconciliation updates runtime and router without callback or persistence", async () => {
    const rt = new MusicRuntime();
    const writes: Array<{ id: string; value: unknown }> = [];
    const repo = repoWithSettings();
    const put = repo.put;
    repo.put = async (record) => {
      writes.push(record);
      await put(record);
    };
    await rt.attachStorage(repo);
    const onInstrumentChange = vi.fn();

    const cleanup = await rt.registerPracticeContext({
      owner: "pinned-reconcile",
      variantKey: "test",
      defaultBpm: 60,
      pinnedInstrument: "ukulele",
      onInstrumentChange,
    });

    expect(rt.activeInstrument).toBe("ukulele");
    expect(rt.router.state.activeInstrument).toBe("ukulele");
    expect(onInstrumentChange).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    cleanup();
    rt.dispose();
  });

  it("allowed instrument passes through when in the list", async () => {
    const rt = new MusicRuntime();
    rt.setActiveInstrument("guitar");
    const cleanup = await rt.registerPracticeContext({
      owner: "allowed-pass",
      variantKey: "test",
      defaultBpm: 60,
      allowedInstruments: ["guitar", "piano"],
    });
    expect(rt.activeInstrument).toBe("guitar");
    cleanup();
    rt.dispose();
  });

  it("stale same-owner cleanup cannot clear newer registration", async () => {
    const rt = new MusicRuntime();
    const cleanup1 = await rt.registerPracticeContext({
      owner: "drill",
      variantKey: "v1",
      defaultBpm: 60,
    });
    const cleanup2 = await rt.registerPracticeContext({
      owner: "drill", // same owner – variant update
      variantKey: "v2",
      defaultBpm: 80,
    });
    // cleanup1 should be a no-op because it's stale
    cleanup1();
    expect(rt.practiceBpm).toBe(80);
    cleanup2();
    expect(rt.practiceBpm).toBe(80); // after cleanup2, context is cleared
    // but cleanup2 also restores stored instrument, so BPM stays
    rt.dispose();
  });

  it("initial URL BPM applies once; same-owner re-registration uses default", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage(repoWithSettings());
    // Activation: consumes initialUrlBpm
    const cleanup1 = await rt.registerPracticeContext({
      owner: "drill",
      variantKey: "v1:scales:piano:major",
      defaultBpm: 100,
      initialUrlBpm: 140,
    });
    expect(rt.practiceBpm).toBe(140);
    // Variant update: same owner, skips initialUrlBpm, uses default
    const cleanup2 = await rt.registerPracticeContext({
      owner: "drill",
      variantKey: "scales:guitar:dorian",
      defaultBpm: 72,
      initialUrlBpm: 200,
    });
    expect(rt.practiceBpm).toBe(72);
    cleanup1();
    cleanup2();
    rt.dispose();
  });

  it("current cleanup lets a later visit to the same owner consume a new URL BPM", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage(repoWithSettings());
    const cleanup1 = await rt.registerPracticeContext({
      owner: "drill",
      variantKey: "scales:piano:major",
      defaultBpm: 100,
      initialUrlBpm: 140,
    });
    cleanup1();

    const cleanup2 = await rt.registerPracticeContext({
      owner: "drill",
      variantKey: "scales:guitar:dorian",
      defaultBpm: 72,
      initialUrlBpm: 180,
    });

    expect(rt.practiceBpm).toBe(180);
    cleanup1();
    expect(rt.practiceBpm).toBe(180);
    cleanup2();
    rt.dispose();
  });

  it("applies each external navigation BPM once without treating runtime output as activation", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage(repoWithSettings());
    const onBpmChange = vi.fn();
    const cleanup = await rt.registerPracticeContext({
      owner: "drill",
      variantKey: "scales:piano:major",
      defaultBpm: 100,
      onBpmChange,
    });

    rt.activatePracticeNavigation(1, 140);
    expect(rt.practiceBpm).toBe(140);
    await vi.waitFor(() =>
      expect(rt.getMusicSettings()?.tempoByVariant["v1:scales:piano:major"]).toBe(140),
    );

    rt.activatePracticeNavigation(1, 180);
    expect(rt.practiceBpm).toBe(140);

    rt.setPracticeBpm(150);
    expect(rt.practiceBpm).toBe(150);
    rt.activatePracticeNavigation(2, 132);
    expect(rt.practiceBpm).toBe(132);
    expect(onBpmChange.mock.calls.map(([bpm]) => bpm)).toEqual([100, 140, 150, 132]);

    cleanup();
    rt.dispose();
  });

  it("applies only the latest external BPM after the winning deferred context registers", async () => {
    const hydration = deferred<{ id: string; value: unknown } | undefined>();
    const repo = {
      get: async (id: string) =>
        id === "music.settings" ? hydration.promise : Promise.resolve(undefined),
      put: async () => {},
    };
    const rt = new MusicRuntime();
    const attaching = rt.attachStorage(repo);
    const staleBpm = vi.fn();
    const winningBpm = vi.fn();
    const staleRegistration = rt.registerPracticeContext({
      owner: "stale",
      variantKey: "v1:stale",
      defaultBpm: 80,
      initialUrlBpm: 90,
      onBpmChange: staleBpm,
    });
    const winningRegistration = rt.registerPracticeContext({
      owner: "winner",
      variantKey: "v1:winner",
      defaultBpm: 100,
      initialUrlBpm: 110,
      onBpmChange: winningBpm,
    });

    rt.activatePracticeNavigation(1, 120);
    rt.activatePracticeNavigation(2, 132);
    rt.activatePracticeNavigation(2, 180);
    hydration.resolve({
      id: "music.settings",
      value: { tempoByVariant: { "v1:winner": 104 } },
    });

    await attaching;
    const [cleanupStale, cleanupWinner] = await Promise.all([
      staleRegistration,
      winningRegistration,
    ]);
    expect(staleBpm).not.toHaveBeenCalled();
    expect(winningBpm).toHaveBeenCalledTimes(1);
    expect(winningBpm).toHaveBeenCalledWith(132);
    expect(rt.practiceBpm).toBe(132);

    rt.activatePracticeNavigation(2, 160);
    expect(winningBpm).toHaveBeenCalledTimes(1);
    cleanupStale();
    cleanupWinner();
    rt.dispose();
  });
});

describe("BPM resolution", () => {
  it("resolves to default BPM when no URL or persisted value exists", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage({
      get: async () => ({
        id: "music.settings",
        value: { tempoByVariant: {} },
      }),
      put: async () => {},
    });
    const cleanup = await rt.registerPracticeContext({
      owner: "bpm-test",
      variantKey: "scales:piano:major",
      defaultBpm: 100,
    });
    expect(rt.practiceBpm).toBe(100);
    cleanup();
    rt.dispose();
  });
});

describe("persistence failure propagation", () => {
  it("stays ready with the merged snapshot after an early queued write fails", async () => {
    const hydration = deferred<{ id: string; value: unknown } | undefined>();
    let rejectNext = true;
    const repo = {
      get: async (id: string) =>
        id === "music.settings" ? hydration.promise : Promise.resolve(undefined),
      put: async () => {
        if (rejectNext) {
          rejectNext = false;
          throw new Error("Storage full");
        }
      },
    };
    const rt = new MusicRuntime();
    const attaching = rt.attachStorage(repo);
    await rt.updateMusicSettings({ playbackLevel: 0.35, muted: true });

    hydration.resolve({
      id: "music.settings",
      value: { playbackLevel: 0.9, muted: false },
    });

    await expect(attaching).resolves.toBeUndefined();
    expect(rt.settingsReady).toBe(true);
    expect(rt.playbackLevel).toBe(0.35);
    expect(rt.masterMuted).toBe(true);
    expect(rt.settingsError).toBe("Storage full");

    const cleanup = await rt.registerPracticeContext({
      owner: "recovered-settings",
      variantKey: "v1:recovered-settings",
      defaultBpm: 96,
    });
    await expect(rt.updateMusicSettings({ masterLevel: 0.6 })).resolves.toBeUndefined();
    expect(rt.settingsError).toBeUndefined();
    expect(rt.getMusicSettings()).toMatchObject({
      playbackLevel: 0.35,
      masterLevel: 0.6,
      muted: true,
    });
    cleanup();
    rt.dispose();
  });

  it("applies audio settings before a deferred rejected write settles", async () => {
    const write = deferred<void>();
    const rt = new MusicRuntime();
    await rt.attachStorage({
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => write.promise,
    });

    const update = rt.updateMusicSettings({
      playbackLevel: 0.25,
      masterLevel: 0.4,
      muted: true,
      preferredPlaybackSound: "saw",
    });

    expect(rt.playbackLevel).toBe(0.25);
    expect(rt.masterLevel).toBe(0.4);
    expect(rt.masterMuted).toBe(true);
    expect(rt.mediaVolume).toBe(0);
    expect(rt.preferredPlaybackSound).toBe("saw");
    expect(rt.effectivePlaybackSound).toBe("saw");
    expect(rt.sound.playbackLevel).toBe(0.25);
    expect(rt.sound.muted).toBe(true);

    write.reject(new Error("Storage full"));
    await expect(update).rejects.toThrow("Storage full");
    expect(rt.settingsError).toBe("Storage full");
    expect(rt.playbackLevel).toBe(0.25);
    expect(rt.masterMuted).toBe(true);
    expect(rt.effectivePlaybackSound).toBe("saw");
    rt.dispose();
  });

  it("updateMusicSettings throws on persist error", async () => {
    const repo = {
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {
        throw new Error("Storage full");
      },
    };
    const rt = new MusicRuntime();
    await rt.attachStorage(repo);
    await expect(rt.updateMusicSettings({ instrumentColorCoding: false })).rejects.toThrow(
      "Storage full",
    );
    rt.dispose();
  });

  it("keeps audio session state when persistence fails", async () => {
    const rt = new MusicRuntime();
    await rt.attachStorage({
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {
        throw new Error("Storage full");
      },
    });

    await expect(
      rt.updateMusicSettings({ playbackLevel: 0.35, masterLevel: 0.7, muted: true }),
    ).rejects.toThrow("Storage full");
    expect(rt.playbackLevel).toBe(0.35);
    expect(rt.masterLevel).toBe(0.7);
    expect(rt.masterMuted).toBe(true);
    expect(rt.settingsError).toBe("Storage full");
    rt.dispose();
  });

  it("persists an active-instrument settings update once", async () => {
    let writes = 0;
    const repo = {
      get: async () => ({ id: "music.settings", value: {} }),
      put: async () => {
        writes += 1;
      },
    };
    const rt = new MusicRuntime();
    await rt.attachStorage(repo);

    await rt.updateMusicSettings({ activeInstrument: "ukulele" });

    expect(writes).toBe(1);
    expect(rt.activeInstrument).toBe("ukulele");
    expect(rt.router.state.activeInstrument).toBe("ukulele");
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

describe("MPC shared-clock preparation", () => {
  it.each([0, 2])(
    "plays one reference bar and one forced count-in with saved preference %s",
    async (preference) => {
      const transport = createFakeTransport();
      let options!: TransportEngineOptions;
      const rt = new MusicRuntime({
        createTransport: async (value) => {
          options = value;
          return transport;
        },
      });
      vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
      const click = vi.spyOn(rt.sound, "playMetronomeClick").mockImplementation(() => {});
      rt.setCountIn(preference);
      rt.metronomeEnabled = false;
      const onStart = vi.fn();
      const started = rt.beginPerformance({ countInBars: 1, leadIn: { bars: 1, onStart } });
      await flushAsync();
      expect(transport.state.countInBars).toBe(2);
      for (let absoluteBeat = 0; absoluteBeat <= 8; absoluteBeat++) {
        const event = transportEvent({
          absoluteBeat,
          beat: absoluteBeat % 4,
          countingIn: absoluteBeat < 8,
          atSeconds: absoluteBeat,
          atMonotonicMs: monotonicMs(1000 + absoluteBeat * 500),
        });
        options.onMetronomeClick?.(event);
        transport.emit(event);
      }
      await expect(started).resolves.toEqual({ status: "started", downbeat: 5000 });
      expect(onStart).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledTimes(4);
      expect(rt.countInBars).toBe(preference);
      rt.dispose();
    },
  );
  it("settles cancellation from the reference callback and removes the listener", async () => {
    const transport = createFakeTransport();
    const rt = new MusicRuntime({ createTransport: async () => transport });
    vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
    const started = rt.beginPerformance({
      countInBars: 1,
      leadIn: { bars: 1, onStart: () => rt.endPerformance() },
    });
    await flushAsync();
    transport.emit(transportEvent({ countingIn: true }));
    await expect(started).resolves.toEqual({ status: "cancelled" });
    expect(rt.practicePhase).toBe("idle");
    expect(transport.listenerCount()).toBe(1);
    rt.dispose();
  });
});

it("rejects invalid preparation counts before audio and preserves ordinary clicks after cancelled lead-in", async () => {
  let options!: TransportEngineOptions;
  const transport = createFakeTransport();
  const rt = new MusicRuntime({
    createTransport: async (value) => {
      options = value;
      return transport;
    },
  });
  const enable = vi.spyOn(rt, "enableAudio").mockResolvedValue(true);
  await expect(
    rt.beginPerformance({ leadIn: { bars: NaN, onStart: vi.fn() } }),
  ).resolves.toMatchObject({ status: "failed" });
  expect(enable).not.toHaveBeenCalled();
  const preparation = rt.beginPerformance({
    countInBars: 1,
    leadIn: {
      bars: 1,
      onStart: () => {
        throw new Error("Reference failed");
      },
    },
  });
  await flushAsync();
  transport.emit(transportEvent({ countingIn: true }));
  await expect(preparation).resolves.toEqual({ status: "failed", message: "Reference failed" });
  expect(rt.practicePhase).toBe("idle");
  const click = vi.spyOn(rt.sound, "playMetronomeClick").mockImplementation(() => {});
  const ordinary = rt.beginPerformance();
  await flushAsync();
  options.onMetronomeClick?.(transportEvent({ countingIn: true }));
  expect(click).toHaveBeenCalledOnce();
  rt.endPerformance();
  await ordinary;
  rt.dispose();
});

describe("MIDI comes back on a fresh load", () => {
  function repo(entries: Record<string, unknown> = {}) {
    const map = new Map<string, { id: string; value: unknown }>();
    map.set("music.settings", {
      id: "music.settings",
      value: { activeInstrument: "mpc", tempoByVariant: {} },
    });
    for (const [id, value] of Object.entries(entries)) map.set(id, { id, value });
    return {
      get: async (id: string) => map.get(id),
      put: async (record: { id: string; value: unknown }) => {
        map.set(record.id, record);
      },
      map,
    };
  }

  it("re-enables MIDI when it was enabled here before and the browser already granted it", async () => {
    const rt = new MusicRuntime();
    const enable = vi.spyOn(rt.midi, "enable").mockResolvedValue(true);
    const query = vi
      .spyOn(navigator.permissions, "query")
      .mockResolvedValue({ state: "granted" } as PermissionStatus);
    await rt.attachStorage(repo({ "music.midi.wanted": true }));
    await vi.waitFor(() => expect(enable).toHaveBeenCalledOnce());
    query.mockRestore();
    rt.dispose();
  });

  it("stays quiet when MIDI was never enabled here or the browser has denied it", async () => {
    const never = new MusicRuntime();
    const enableNever = vi.spyOn(never.midi, "enable").mockResolvedValue(true);
    await never.attachStorage(repo());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(enableNever).not.toHaveBeenCalled();
    never.dispose();

    const denied = new MusicRuntime();
    const enableDenied = vi.spyOn(denied.midi, "enable").mockResolvedValue(true);
    const query = vi
      .spyOn(navigator.permissions, "query")
      .mockResolvedValue({ state: "denied" } as PermissionStatus);
    await denied.attachStorage(repo({ "music.midi.wanted": true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(enableDenied).not.toHaveBeenCalled();
    query.mockRestore();
    denied.dispose();
  });
});

describe("MPC controller link", () => {
  function repo(profiles: unknown[]) {
    const map = new Map<string, { id: string; value: unknown }>();
    map.set("music.settings", {
      id: "music.settings",
      value: { activeInstrument: "mpc", tempoByVariant: {} },
    });
    map.set("music.device-profiles", {
      id: "music.device-profiles",
      value: { profiles, preferences: {}, surfaces: {} },
    });
    return {
      get: async (id: string) => map.get(id),
      put: async (record: { id: string; value: unknown }) => {
        map.set(record.id, record);
      },
    };
  }

  it("replays the init handshake and heartbeats on the linked output while MIDI is on", async () => {
    vi.useFakeTimers();
    try {
      const rt = new MusicRuntime();
      const send = vi.spyOn(rt.midi, "send").mockReturnValue(true);
      Object.assign(rt.midi.state, {
        enabled: true,
        sysexEnabled: true,
        outputs: [{ id: "mpc-out", name: "MPC One+ Private", type: "output" }],
      });
      await rt.attachStorage(repo([{ id: "mpc-out", controllerLink: true }]));

      // Identity request opens the captured handshake.
      expect(send).toHaveBeenCalledWith("mpc-out", [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]);
      expect(rt.mpcLink).toEqual({ outputName: "MPC One+ Private" });
      const afterInit = send.mock.calls.length;
      vi.advanceTimersByTime(2_050);
      expect(send.mock.calls.length).toBe(afterInit + 2);
      expect(send).toHaveBeenLastCalledWith(
        "mpc-out",
        [0xf0, 0x47, 0x00, 0x56, 0x52, 0x00, 0x04, 0x41, 0x67, 0x16, 0x00, 0xf7],
      );

      // Dispose stops the heartbeat.
      rt.dispose();
      const afterDispose = send.mock.calls.length;
      vi.advanceTimersByTime(3_000);
      expect(send.mock.calls.length).toBe(afterDispose);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing without SysEx or without a linked profile", async () => {
    const rt = new MusicRuntime();
    const send = vi.spyOn(rt.midi, "send").mockReturnValue(true);
    Object.assign(rt.midi.state, {
      enabled: true,
      sysexEnabled: false,
      outputs: [{ id: "mpc-out", name: "MPC One+ Private", type: "output" }],
    });
    await rt.attachStorage(repo([{ id: "mpc-out", controllerLink: true }]));
    expect(send).not.toHaveBeenCalled();
    expect(rt.mpcLink).toBeUndefined();
    rt.dispose();

    const unlinked = new MusicRuntime();
    const sendUnlinked = vi.spyOn(unlinked.midi, "send").mockReturnValue(true);
    Object.assign(unlinked.midi.state, {
      enabled: true,
      sysexEnabled: true,
      outputs: [{ id: "mpc-out", name: "MPC One+ Private", type: "output" }],
    });
    await unlinked.attachStorage(repo([{ id: "mpc-out", alias: "Pads" }]));
    expect(sendUnlinked).not.toHaveBeenCalled();
    unlinked.dispose();
  });
});
