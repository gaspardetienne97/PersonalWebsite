import { describe, expect, test, vi } from "vitest";

import type { Score } from "@repo/music-core/domain";

import { SoundEngine, scoreToPattern, type ToneSoundModule } from "./index";

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

function createToneMock() {
  const synthTrigger = vi.fn();
  const metronomeTrigger = vi.fn();
  const samplerTrigger = vi.fn();
  const droneAttack = vi.fn();
  const droneRelease = vi.fn();
  const playerStart = vi.fn();
  const start = vi.fn(async () => undefined);
  const loaded = vi.fn(async () => undefined);
  const dispose = vi.fn();

  class DestinationNode {
    toDestination() {
      return this;
    }

    connect() {
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

    constructor(value = 1) {
      super();
      this.gain = { value };
      gains.push(this);
    }

    toDestination() {
      this.isMaster = true;
      return this;
    }
  }

  class PolySynth extends DestinationNode {
    triggerAttackRelease = synthTrigger;
    triggerAttack = droneAttack;
    triggerRelease = droneRelease;
  }

  class Synth extends DestinationNode {
    triggerAttackRelease = metronomeTrigger;
  }

  class Sampler extends DestinationNode {
    triggerAttackRelease = samplerTrigger;
  }

  class Players extends DestinationNode {
    constructor(public urls: Record<string, string>) {
      super();
    }

    player(name: string) {
      return {
        start: playerStart,
        volume: { value: 0 },
        name,
      };
    }
  }

  const tone = {
    start,
    loaded,
    now: () => 10,
    gainToDb: (gain: number) => gain,
    PolySynth,
    Synth,
    Sampler,
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
    playerStart,
    masterGain: () => gains.find((gain) => gain.isMaster),
    metronomeGain: () => gains.find((gain) => !gain.isMaster),
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

  test("loads Tone.Sampler and Tone.Players assets", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    await sound.loadSampler({ C4: "/samples/piano-c4.wav" });
    sound.playNote(60);
    expect(mock.samplerTrigger).toHaveBeenCalledWith("C4", 0.18, undefined, 0.8);

    await sound.loadDrumKit([
      { name: "kick", url: "/samples/kick.wav" },
      { name: "snare", url: "/samples/snare.wav" },
    ]);
    sound.playDrum("kick", 3, 0.5);

    expect(mock.loaded).toHaveBeenCalledTimes(2);
    expect(mock.playerStart).toHaveBeenCalledWith(3);
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

  test("master mute toggles output and metronome blend sets its own gain", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    expect(mock.masterGain()?.gain.value).toBe(1);
    sound.setMasterMuted(true);
    expect(sound.muted).toBe(true);
    expect(mock.masterGain()?.gain.value).toBe(0);
    sound.setMasterMuted(false);
    expect(mock.masterGain()?.gain.value).toBe(1);

    sound.setMetronomeLevel(0.3);
    expect(sound.metronomeLevel).toBe(0.3);
    expect(mock.metronomeGain()?.gain.value).toBe(0.3);
  });

  test("selects a synth preset and keeps playing through it", async () => {
    const mock = createToneMock();
    const sound = new SoundEngine(async () => mock.tone);
    await sound.enable();

    expect(sound.instrument).toBe("Synth");
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
