import { describe, expect, test, vi } from "vitest";

import { SoundEngine, type ToneSoundModule } from "./index";

function createToneMock() {
  const synthTrigger = vi.fn();
  const metronomeTrigger = vi.fn();
  const samplerTrigger = vi.fn();
  const playerStart = vi.fn();
  const start = vi.fn(async () => undefined);
  const loaded = vi.fn(async () => undefined);
  const dispose = vi.fn();

  class DestinationNode {
    toDestination() {
      return this;
    }

    dispose() {
      dispose();
    }
  }

  class PolySynth extends DestinationNode {
    triggerAttackRelease = synthTrigger;
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
  } as unknown as ToneSoundModule;

  return { tone, start, loaded, synthTrigger, metronomeTrigger, samplerTrigger, playerStart };
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
