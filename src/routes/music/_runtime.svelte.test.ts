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
});
