import { describe, expect, it } from "vitest";

import { MusicRuntime } from "./_runtime.svelte";

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
