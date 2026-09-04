import { describe, expect, test, vi } from "vitest";

import type { Score } from "@repo/music-core/domain";

import { SoundEngine, scoreToPattern, type ToneSoundModule } from "./index";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    id: "s1",
    origin: "generated",
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [],
    voices: [],
    notes: [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "v1" },
      { midiNote: 64, startBeat: 1, durationBeats: 2, velocity: 0.8, voiceId: "v1" },
    ],
    chords: [],
    sections: [],
    markers: [],
    ...overrides,
  };
}

describe("scoreToPattern", () => {
  test("converts score beats to seconds using the score tempo", () => {
    const { steps, durationSec } = scoreToPattern(makeScore());
    // 120 bpm -> 0.5s/beat
    expect(steps).toEqual([
      { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.5 },
      { midiNotes: [64], offsetSeconds: 0.5, durationSeconds: 1 },
    ]);
    // last note ends at beat 3 -> 1.5s
    expect(durationSec).toBe(1.5);
  });

  test("honours a bpm override and an empty score", () => {
    const { steps } = scoreToPattern(makeScore(), { bpm: 60 });
    expect(steps[1]).toEqual({ midiNotes: [64], offsetSeconds: 1, durationSeconds: 2 });
    const empty = scoreToPattern(makeScore({ notes: [] }));
    expect(empty.steps).toEqual([]);
    expect(empty.durationSec).toBe(0);
  });
});

function createToneMock(
  options: { onGainCreated?: () => void; now?: () => number; immediate?: () => number } = {},
) {
  const synthTrigger = vi.fn();
  const metronomeTrigger = vi.fn();
  const samplerTrigger = vi.fn();
  const droneAttack = vi.fn();
  const droneRelease = vi.fn();
  const start = vi.fn(async () => undefined);
  const loaded = vi.fn(async () => undefined);
  const dispose = vi.fn();
  const releaseAll = vi.fn();

  class DestinationNode {
    destination: unknown;

    toDestination() {
      return this;
    }

    connect(destination: unknown) {
      this.destination = destination;
      return this;
    }

    dispose() {
      dispose();
    }
  }

  const gains: GainNode[] = [];

  class GainNode extends DestinationNode {
    gain: { value: number };
    isMaster = false;
    disposeSpy = vi.fn();

    constructor(value = 1) {
      super();
      this.gain = { value };
      gains.push(this);
      options.onGainCreated?.();
    }

    toDestination() {
      this.isMaster = true;
      return this;
    }

    dispose() {
      this.disposeSpy();
      dispose();
    }
  }

  const polySynthInstances: PolySynth[] = [];

  class PolySynth extends DestinationNode {
    triggerAttackRelease = synthTrigger;
    triggerAttack = droneAttack;
    triggerRelease = droneRelease;
    releaseAll = releaseAll;
    disposeSpy = vi.fn();

    constructor(..._args: unknown[]) {
      super();
      polySynthInstances.push(this);
    }

    dispose() {
      this.disposeSpy();
      dispose();
    }
  }

  const synthInstances: Synth[] = [];

  class Synth extends DestinationNode {
    triggerAttackRelease = metronomeTrigger;

    constructor(..._args: unknown[]) {
      super();
      synthInstances.push(this);
    }
  }

  class Sampler extends DestinationNode {
    triggerAttackRelease = samplerTrigger;
    releaseAll = releaseAll;
    disposeSpy = vi.fn();

    dispose() {
      this.disposeSpy();
      dispose();
    }
  }

  const samplerInstances: Sampler[] = [];
  const SamplerConstructor = class extends Sampler {
    constructor(..._args: unknown[]) {
      super();
      samplerInstances.push(this);
    }
  };

  interface MockPlayer {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    volume: { value: number };
  }

  const playersInstances: Players[] = [];

  class Players extends DestinationNode {
    pads = new Map<string, MockPlayer>();
    disposeSpy = vi.fn();

    constructor(public urls: Record<string, string>) {
      super();
      for (const padId of Object.keys(urls)) {
        this.pads.set(padId, { start: vi.fn(), stop: vi.fn(), volume: { value: 0 } });
      }
      playersInstances.push(this);
    }

    player(name: string): MockPlayer {
      let pad = this.pads.get(name);
      if (!pad) {
        pad = { start: vi.fn(), stop: vi.fn(), volume: { value: 0 } };
        this.pads.set(name, pad);
      }
      return pad;
    }

    dispose() {
      this.disposeSpy();
      dispose();
    }
  }

  const tone = {
    start,
    loaded,
    now: options.now ?? (() => 10),
    // Tone schedules at now() = immediate() + look-ahead; the default mock has
    // no look-ahead, so existing scheduling expectations are unchanged.
    immediate: options.immediate ?? (() => 10),
    gainToDb: (gain: number) => gain,
    PolySynth,
    Synth,
    Sampler: SamplerConstructor,
    Players,
    Gain: GainNode,
  } as unknown as ToneSoundModule;

  return {
    tone,
    start,
    loaded,
    synthTrigger,
    metronomeTrigger,
    samplerTrigger,
    droneAttack,
    droneRelease,
    dispose,
    releaseAll,
    playersInstances,
    samplerInstances,
    polySynthInstances,
    synthInstances,
    gains,
    playerFor: (padId: string) => playersInstances.at(-1)!.player(padId),
    masterGain: () => gains.find((gain) => gain.isMaster),
    playbackGain: () => gains.filter((gain) => !gain.isMaster)[0],
    metronomeGain: () => gains.filter((gain) => !gain.isMaster)[1],
    droneGain: () => gains.filter((gain) => !gain.isMaster).at(-1),
  };
}

describe("music-core/sound", () => {
  test("gates audio behind Tone.start and plays notes and chords through a synth", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);

    sound.playNote(60);
    expect(mock.synthTrigger).not.toHaveBeenCalled();

    await expect(sound.enable()).resolves.toEqual({ enabled: true, message: "Audio enabled." });
    expect(mock.start).toHaveBeenCalledOnce();

    sound.playNote(60, 0.2, 1.25, 0.8);
    sound.playChord([60, 64, 67], 0.5, 2);

    expect(mock.synthTrigger).toHaveBeenNthCalledWith(1, "C4", 0.2, 1.25, 0.8);
    expect(mock.synthTrigger).toHaveBeenNthCalledWith(2, ["C4", "E4", "G4"], 0.5, 2, 0.8);
  });

  test("coalesces concurrent enable calls into one Tone load and start", async () => {
    const mock = createToneMock();
    const loading = deferred<ToneSoundModule>();
    const starting = deferred<undefined>();
    mock.start.mockReturnValueOnce(starting.promise);
    const loader = vi.fn(() => loading.promise);
    const sound = new SoundEngine(loader);

    const first = sound.enable();
    const second = sound.enable();

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledOnce();
    loading.resolve(mock.tone);
    await Promise.resolve();
    expect(mock.start).toHaveBeenCalledOnce();

    starting.resolve(undefined);
    await expect(first).resolves.toEqual({ enabled: true, message: "Audio enabled." });
    await expect(second).resolves.toEqual({ enabled: true, message: "Audio enabled." });
    expect(mock.gains).toHaveLength(3);
  });

  test("does not create or publish a graph when disposed during deferred audio start", async () => {
    const mock = createToneMock();
    const starting = deferred<undefined>();
    mock.start.mockReturnValueOnce(starting.promise);
    const sound = new SoundEngine(async () => mock.tone);

    const enabling = sound.enable();
    await Promise.resolve();
    sound.dispose();
    starting.resolve(undefined);

    await expect(enabling).resolves.toEqual({
      enabled: false,
      message: "Audio enablement was cancelled.",
    });
    expect(sound.enabled).toBe(false);
    expect(mock.gains).toHaveLength(0);
  });

  test("disposes locally created nodes when graph creation is invalidated", async () => {
    let sound!: SoundEngine;
    let invalidate = false;
    const mock = createToneMock({
      onGainCreated: () => {
        if (invalidate) sound.dispose();
      },
    });
    sound = new SoundEngine(async () => mock.tone);
    invalidate = true;

    await expect(sound.enable()).resolves.toEqual({
      enabled: false,
      message: "Audio enablement was cancelled.",
    });
    expect(sound.enabled).toBe(false);
    expect(mock.gains).toHaveLength(1);
    expect(mock.gains[0]!.disposeSpy).toHaveBeenCalledOnce();
  });

  test("loads Tone.Sampler and Tone.Players assets", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    await sound.loadSampler({ C4: "/samples/piano-c4.wav" });
    sound.playNote(60);
    expect(mock.samplerTrigger).toHaveBeenCalledWith("C4", 0.18, undefined, 0.8);

    await sound.loadDrumKit([
      { padId: "kick", midiNote: 36, url: "/samples/kick.wav" },
      { padId: "snare", midiNote: 38, url: "/samples/snare.wav" },
    ]);
    sound.playDrum("kick", 3, 0.5);

    expect(mock.loaded).toHaveBeenCalledTimes(2);
    expect(mock.playerFor("kick").start).toHaveBeenCalledWith(3);
  });

  test("nudges a same-time retrigger of one pad strictly after its previous start", async () => {
    // Tone.Player throws "Start time must be strictly greater than previous start
    // time" when one pad is started twice at the same audio time. A pad audition
    // and the pattern loop can both resolve to the same now() under load.
    const mock = createToneMock({ now: () => 10 });
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();
    await sound.loadDrumKit([
      { padId: "kick", midiNote: 36, url: "/samples/kick.wav" },
      { padId: "snare", midiNote: 38, url: "/samples/snare.wav" },
    ]);

    sound.playDrum("kick"); // audition: resolves to now() = 10
    sound.playDrum("kick", 10); // pattern step 0 scheduled at the same time
    sound.playDrum("snare", 10); // another pad at that time is untouched

    const kickStarts = mock.playerFor("kick").start.mock.calls.map(([time]) => time as number);
    expect(kickStarts[0]).toBe(10);
    expect(kickStarts[1]).toBeGreaterThan(10);
    expect(mock.playerFor("snare").start).toHaveBeenCalledWith(10);
  });

  test("routes synth, sampler, drums, and drone through playback while clicks use metronome", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    expect(mock.polySynthInstances[0]!.destination).toBe(mock.playbackGain());
    expect(mock.synthInstances[0]!.destination).toBe(mock.metronomeGain());
    await sound.loadSampler({ C4: "/samples/piano.mp3" });
    expect(mock.samplerInstances[0]!.destination).toBe(mock.playbackGain());
    await sound.loadDrumKit([{ padId: "kick", midiNote: 36, url: "/samples/kick.mp3" }]);
    expect(mock.playersInstances[0]!.destination).toBe(mock.playbackGain());
    sound.startDrone(60);
    expect(mock.droneGain()?.destination).toBe(mock.playbackGain());
  });

  test("keeps the working sampler until its replacement loads", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();
    await sound.loadSampler({ C4: "/samples/first.mp3" });
    const first = mock.samplerInstances[0]!;

    mock.loaded.mockRejectedValueOnce(new Error("decode failed"));
    await expect(sound.loadSampler({ C4: "/samples/bad.mp3" })).rejects.toThrow("decode failed");

    expect(first.disposeSpy).not.toHaveBeenCalled();
    expect(mock.samplerInstances[1]!.disposeSpy).toHaveBeenCalledOnce();
    sound.playNote(60);
    expect(mock.samplerTrigger).toHaveBeenCalledWith("C4", 0.18, undefined, 0.8);

    await sound.loadSampler({ C4: "/samples/replacement.mp3" });
    expect(first.disposeSpy).toHaveBeenCalledOnce();
  });

  test("does not activate a sampler that finishes after a synth selection", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();
    const loading = deferred<undefined>();
    mock.loaded.mockReturnValueOnce(loading.promise);

    const sampler = sound.loadSampler({ C4: "/samples/piano.mp3" });
    sound.setPlaybackSound("warm-synth");
    loading.resolve(undefined);

    await expect(sampler).resolves.toBe(false);
    expect(sound.playbackSound).toBe("warm-synth");
    expect(mock.samplerInstances[0]!.disposeSpy).toHaveBeenCalledOnce();
  });

  test("does not activate a sampler that finishes after disposal", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();
    const loading = deferred<undefined>();
    mock.loaded.mockReturnValueOnce(loading.promise);

    const sampler = sound.loadSampler({ C4: "/samples/piano.mp3" });
    sound.dispose();
    loading.resolve(undefined);

    await expect(sampler).resolves.toBe(false);
    expect(mock.samplerInstances[0]!.disposeSpy).toHaveBeenCalledOnce();
    expect(sound.enabled).toBe(false);
  });

  test("selecting a synth disposes an active sampler", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();
    await sound.loadSampler({ C4: "/samples/piano.mp3" });
    const sampler = mock.samplerInstances[0]!;

    sound.setPlaybackSound("e-piano");

    expect(sound.playbackSound).toBe("e-piano");
    expect(sampler.disposeSpy).toHaveBeenCalledOnce();
  });

  test("loads pad IDs, applies velocity, and disposes replaced players", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    await sound.loadDrumKit([{ padId: "pad-36", midiNote: 36, url: "blob:kick" }]);
    const firstPlayers = mock.playersInstances.at(-1)!;
    sound.playDrum("pad-36", 12, 0.4);
    sound.stopDrum("pad-36", 13);
    expect(mock.playerFor("pad-36").volume.value).toBe(0.4);
    expect(mock.playerFor("pad-36").start).toHaveBeenCalledWith(12);
    expect(mock.playerFor("pad-36").stop).toHaveBeenCalledWith(13);

    await sound.loadDrumKit([{ padId: "pad-38", midiNote: 38, url: "blob:snare" }]);
    expect(firstPlayers.disposeSpy).toHaveBeenCalledOnce();
  });

  test("keeps the working drum kit when a replacement fails to load", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    await sound.loadDrumKit([{ padId: "pad-36", midiNote: 36, url: "blob:kick" }]);
    const firstPlayers = mock.playersInstances.at(-1)!;
    mock.loaded.mockRejectedValueOnce(new Error("decode failed"));
    await expect(
      sound.loadDrumKit([{ padId: "pad-38", midiNote: 38, url: "blob:bad" }]),
    ).rejects.toThrow("decode failed");

    // the failed replacement is disposed; the original kit survives
    expect(mock.playersInstances.at(-1)!.disposeSpy).toHaveBeenCalledOnce();
    expect(firstPlayers.disposeSpy).not.toHaveBeenCalled();
    sound.playDrum("pad-36", 1, 0.8);
    expect(firstPlayers.player("pad-36").start).toHaveBeenCalledWith(1);
  });

  test("publishes only the latest drum kit when loads resolve in reverse order", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();
    const firstLoad = deferred<undefined>();
    const secondLoad = deferred<undefined>();
    mock.loaded.mockReturnValueOnce(firstLoad.promise).mockReturnValueOnce(secondLoad.promise);

    const first = sound.loadDrumKit([{ padId: "pad-36", midiNote: 36, url: "blob:kick" }]);
    const second = sound.loadDrumKit([{ padId: "pad-38", midiNote: 38, url: "blob:snare" }]);
    const firstPlayers = mock.playersInstances[0]!;
    const secondPlayers = mock.playersInstances[1]!;

    secondLoad.resolve(undefined);
    await second;
    firstLoad.resolve(undefined);
    await first;
    sound.playDrum("pad-38", 1, 0.8);

    expect(firstPlayers.disposeSpy).toHaveBeenCalledOnce();
    expect(secondPlayers.disposeSpy).not.toHaveBeenCalled();
    expect(secondPlayers.player("pad-38").start).toHaveBeenCalledWith(1);
  });

  test("disposes drum players that finish loading after engine disposal", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();
    const loading = deferred<undefined>();
    mock.loaded.mockReturnValueOnce(loading.promise);

    const load = sound.loadDrumKit([{ padId: "pad-36", midiNote: 36, url: "blob:kick" }]);
    const players = mock.playersInstances[0]!;
    sound.dispose();
    loading.resolve(undefined);
    await load;

    expect(players.disposeSpy).toHaveBeenCalledOnce();
    expect(sound.enabled).toBe(false);
  });

  test("schedules one drum-loop start time per step and replaces the prior timer", async () => {
    vi.useFakeTimers();
    try {
      const mock = createToneMock();
      const sound = new SoundEngine(async () => mock.tone);
      await sound.enable();
      await sound.loadDrumKit([
        { padId: "pad-36", midiNote: 36, url: "blob:kick" },
        { padId: "pad-38", midiNote: 38, url: "blob:snare" },
      ]);

      sound.startDrumPatternLoop(
        [
          { padIds: ["pad-36"], offsetSeconds: 0 },
          { padIds: ["pad-38"], offsetSeconds: 0.5 },
        ],
        1,
      );
      expect(mock.playerFor("pad-36").start).toHaveBeenCalledWith(10);
      expect(mock.playerFor("pad-38").start).toHaveBeenCalledWith(10.5);

      sound.startDrumPatternLoop([{ padIds: ["pad-36"], offsetSeconds: 0 }], 2);
      vi.advanceTimersByTime(1_000);
      // the prior 1s timer was replaced, so pad-36 fired twice (initial + new loop)
      expect(mock.playerFor("pad-36").start).toHaveBeenCalledTimes(2);

      sound.stopDrumPatternLoop();
      vi.advanceTimersByTime(2_000);
      expect(mock.playerFor("pad-36").start).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects an invalid drum loop duration and stops the loop on dispose", async () => {
    vi.useFakeTimers();
    try {
      const mock = createToneMock();
      const sound = new SoundEngine(async () => mock.tone);
      await sound.enable();
      await sound.loadDrumKit([{ padId: "pad-36", midiNote: 36, url: "blob:kick" }]);

      expect(() =>
        sound.startDrumPatternLoop([{ padIds: ["pad-36"], offsetSeconds: 0 }], 0),
      ).toThrow("Drum loop duration must be finite and greater than zero.");

      sound.startDrumPatternLoop([{ padIds: ["pad-36"], offsetSeconds: 0 }], 1);
      expect(mock.playerFor("pad-36").start).toHaveBeenCalledTimes(1);
      sound.dispose();
      vi.advanceTimersByTime(2_000);
      expect(mock.playerFor("pad-36").start).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("schedules a multi-step prompt pattern after audio is enabled", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    const pattern = [
      { midiNotes: [60, 64, 67], offsetSeconds: 0, durationSeconds: 0.6 },
      { midiNotes: [71], offsetSeconds: 0.8, durationSeconds: 0.5 },
    ];

    sound.playPattern(pattern);
    expect(mock.synthTrigger).not.toHaveBeenCalled();

    await sound.enable();
    sound.playPattern(pattern);

    expect(mock.synthTrigger).toHaveBeenNthCalledWith(1, ["C4", "E4", "G4"], 0.6, 10, 0.8);
    expect(mock.synthTrigger).toHaveBeenNthCalledWith(2, ["B4"], 0.5, 10.8, 0.8);
  });

  test("reports the scheduled start on the performance clock, look-ahead included", async () => {
    // Three independent clocks: audio time, Tone's look-ahead, and performance.
    let audioSeconds = 4.2;
    const lookAheadSeconds = 0.13;
    const mock = createToneMock({
      immediate: () => audioSeconds,
      now: () => audioSeconds + lookAheadSeconds,
    });
    const sound = new SoundEngine(async () => mock.tone);
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(9_000);

    expect(
      sound.playPattern([{ midiNotes: [60], offsetSeconds: 0, durationSeconds: 1 }]),
    ).toBeUndefined();

    await sound.enable();
    const epoch = sound.playPattern([{ midiNotes: [60], offsetSeconds: 0, durationSeconds: 1 }]);

    expect(epoch).toEqual({ clock: "performance", startedAt: 9_130 });
    // The audio schedule itself is untouched by the projection.
    expect(mock.synthTrigger).toHaveBeenLastCalledWith(["C4"], 1, 4.33, 0.8);

    // A later call re-samples both clocks rather than reusing the first epoch.
    audioSeconds = 6.2;
    performanceNow.mockReturnValue(11_000);
    expect(sound.playPattern([{ midiNotes: [62], offsetSeconds: 0, durationSeconds: 1 }])).toEqual({
      clock: "performance",
      startedAt: 11_130,
    });
    performanceNow.mockRestore();
  });

  test("replaces scheduled pattern playback instead of overlapping it", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    sound.playPattern([{ midiNotes: [60], offsetSeconds: 0, durationSeconds: 2 }]);
    const firstPatternVoice = mock.polySynthInstances.at(-1)!;
    sound.playPattern([{ midiNotes: [67], offsetSeconds: 0, durationSeconds: 1 }]);

    expect(mock.releaseAll).toHaveBeenCalledOnce();
    expect(firstPatternVoice.disposeSpy).toHaveBeenCalledOnce();
    expect(mock.synthTrigger).toHaveBeenNthCalledWith(1, ["C4"], 2, 10, 0.8);
    expect(mock.synthTrigger).toHaveBeenNthCalledWith(2, ["G4"], 1, 10, 0.8);
  });

  test("stop releases active notes and disposes the synth to cancel future events", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    sound.playPattern([
      { midiNotes: [60], offsetSeconds: 0, durationSeconds: 2 },
      { midiNotes: [64], offsetSeconds: 5, durationSeconds: 2 },
    ]);
    const patternVoice = mock.polySynthInstances.at(-1)!;
    sound.stopPattern();

    expect(mock.releaseAll).toHaveBeenCalledOnce();
    expect(patternVoice.disposeSpy).toHaveBeenCalledOnce();
  });

  test("patterns use the sampled effective voice and cancel its scheduled sources", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();
    await sound.loadSampler({ C4: "/samples/piano.mp3" });

    sound.playPattern([
      { midiNotes: [60], offsetSeconds: 0, durationSeconds: 1 },
      { midiNotes: [64], offsetSeconds: 1, durationSeconds: 1 },
    ]);
    expect(mock.samplerTrigger).toHaveBeenCalledTimes(2);
    sound.stopPattern();

    expect(mock.releaseAll).toHaveBeenCalled();
  });

  test("starts and stops a generated pattern loop", async () => {
    vi.useFakeTimers();
    try {
      const mock = createToneMock();
      const sound = new SoundEngine(async () => mock.tone);
      await sound.enable();

      sound.startPatternLoop(
        [{ midiNotes: [60, 64, 67], offsetSeconds: 0, durationSeconds: 0.4 }],
        1,
      );

      expect(mock.synthTrigger).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1_000);
      expect(mock.synthTrigger).toHaveBeenCalledTimes(2);

      sound.stopPatternLoop();
      vi.advanceTimersByTime(1_000);
      expect(mock.synthTrigger).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("replaces the previous generated pattern loop and stops it on dispose", async () => {
    vi.useFakeTimers();
    try {
      const mock = createToneMock();
      const sound = new SoundEngine(async () => mock.tone);
      await sound.enable();

      sound.startPatternLoop([{ midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.2 }], 1);
      sound.startPatternLoop([{ midiNotes: [67], offsetSeconds: 0, durationSeconds: 0.2 }], 2);
      vi.advanceTimersByTime(1_000);
      expect(mock.synthTrigger).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(1_000);
      expect(mock.synthTrigger).toHaveBeenCalledTimes(3);

      sound.dispose();
      vi.advanceTimersByTime(2_000);
      expect(mock.synthTrigger).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects invalid generated pattern loop durations", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    expect(() => sound.startPatternLoop([], 0)).toThrow(/duration/i);
    expect(() => sound.startPatternLoop([], Number.POSITIVE_INFINITY)).toThrow(/duration/i);
  });

  test("keeps playback and metronome buses independent beneath master", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    expect(mock.masterGain()?.gain.value).toBe(1);
    sound.setPlaybackLevel(0.4);
    expect(mock.playbackGain()?.gain.value).toBe(0.4);
    sound.setMasterMuted(true);
    expect(sound.muted).toBe(true);
    expect(mock.masterGain()?.gain.value).toBe(0);
    sound.setMasterMuted(false);
    expect(mock.masterGain()?.gain.value).toBe(1);
    sound.setMasterVolume(0.6);
    expect(mock.masterGain()?.gain.value).toBe(0.6);

    sound.setMetronomeLevel(0.3);
    expect(sound.metronomeLevel).toBe(0.3);
    expect(mock.metronomeGain()?.gain.value).toBe(0.3);
  });

  test("selects a synth preset and keeps playing through it", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    expect(sound.instrument).toBe("Warm Synth");
    sound.setInstrument("Saw");
    expect(sound.instrument).toBe("Saw");
    sound.setInstrument("does-not-exist");
    expect(sound.instrument).toBe("Saw");

    sound.playNote(60);
    expect(mock.synthTrigger).toHaveBeenCalled();
  });

  test("plays, restacks, retunes and stops a sustained drone", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);

    sound.startDrone(57); // ignored before audio is enabled
    expect(mock.droneAttack).not.toHaveBeenCalled();

    await sound.enable();
    expect(sound.droneActive).toBe(false);

    sound.startDrone(57); // A3, default Sine timbre → tonic only
    expect(sound.droneActive).toBe(true);
    expect(mock.droneAttack).toHaveBeenLastCalledWith(["A3"]);

    sound.setDroneTimbre("Shruti"); // tonic + fifth + octave
    expect(mock.droneRelease).toHaveBeenLastCalledWith(["A3"]);
    expect(mock.droneAttack).toHaveBeenLastCalledWith(["A3", "E4", "A4"]);

    sound.setDroneNote(60); // C4
    expect(mock.droneRelease).toHaveBeenLastCalledWith(["A3", "E4", "A4"]);
    expect(mock.droneAttack).toHaveBeenLastCalledWith(["C4", "G4", "C5"]);

    sound.setDroneLevel(0.25);
    expect(mock.droneGain()?.gain.value).toBe(0.25);

    sound.stopDrone();
    expect(sound.droneActive).toBe(false);
    expect(mock.droneRelease).toHaveBeenLastCalledWith(["C4", "G4", "C5"]);
  });

  test("ignores an unknown drone timbre and retune while stopped", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    sound.setDroneNote(60); // not active → no-op
    expect(mock.droneAttack).not.toHaveBeenCalled();

    sound.startDrone(60);
    sound.setDroneTimbre("nope");
    expect(sound.droneTimbre).toBe("Sine");
  });

  test("schedules an accented count-in and returns the phrase delay", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    const schedule = sound.playCountIn({ bpm: 120, beats: 4, beatsPerMeasure: 4 });

    expect(schedule).toEqual({ startAudioSeconds: 10, delayMs: 2_000 });
    expect(mock.metronomeTrigger).toHaveBeenNthCalledWith(1, 1200, "32n", 10, 0.7);
    expect(mock.metronomeTrigger).toHaveBeenNthCalledWith(2, 800, "32n", 10.5, 0.45);
    expect(mock.metronomeTrigger).toHaveBeenNthCalledWith(3, 800, "32n", 11, 0.45);
    expect(mock.metronomeTrigger).toHaveBeenNthCalledWith(4, 800, "32n", 11.5, 0.45);
  });
});
