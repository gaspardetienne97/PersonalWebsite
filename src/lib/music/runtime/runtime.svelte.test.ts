import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vitest/browser";
import { heartbeatFrame, initFrames } from "@repo/music-core/io/mpc-sysex";
import { PAD_PRESETS } from "@repo/music-core/io/devices";
import type { InputEvent, NoteEvent } from "@repo/music-core";
// Direct imports (not ./index) so this file does not depend on the audio engine.
import { db, plain, getSetting, putSetting } from "./db.svelte";
import { midi } from "./midi.svelte";
import { input } from "./input.svelte";
import { settings } from "./settings.svelte";
import { mic } from "./mic.svelte";
import { audio } from "./audio.svelte";
import { putBinary, getBinary, deleteBinary } from "./opfs";

// A fake Web MIDI implementation, the same shape a Playwright init script would install.
type FakePort = {
  id: string;
  name: string;
  manufacturer: string;
  state: "connected";
  onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null;
  sent: number[][];
  send(data: number[]): void;
};
const port = (id: string, name: string, manufacturer: string): FakePort => ({
  id,
  name,
  manufacturer,
  state: "connected",
  onmidimessage: null,
  sent: [],
  send(data) {
    this.sent.push([...data]);
  },
});

function installFakeMidi({ allowSysex }: { allowSysex: boolean }) {
  const inputs = new Map([
    ["in-keys", port("in-keys", "Digital Piano", "Roland")],
    ["in-pads", port("in-pads", "MPC One+ Public", "Akai")],
    ["in-ctrl", port("in-ctrl", "MPC One+ Private", "Akai")],
  ]);
  const outputs = new Map([["out-mpc", port("out-mpc", "MPC One+ Private", "Akai")]]);
  const requests: { sysex?: boolean }[] = [];
  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    value: async (opts: { sysex?: boolean } = {}) => {
      requests.push(opts);
      if (opts.sysex && !allowSysex) throw new DOMException("SysEx denied", "NotAllowedError");
      return { inputs, outputs, sysexEnabled: !!opts.sysex, onstatechange: null };
    },
  });
  const fire = (id: string, bytes: number[]) =>
    inputs.get(id)!.onmidimessage!({ data: new Uint8Array(bytes), timeStamp: performance.now() });
  return { inputs, outputs, requests, fire };
}

afterEach(() => {
  vi.useRealTimers();
  midi.disable();
});

// Runs first: the router suppresses on-screen taps for 1.5 s after any MIDI note.
describe("on-screen input", () => {
  it("QWERTY piano presses, repeat guard, and release on blur", () => {
    const seen: NoteEvent[] = [];
    const off = input.subscribe(
      (e) => e.kind !== "onset" && "midi" in e && seen.push(e as NoteEvent),
    );
    input.setKeyboardMode("piano");
    const key = (type: string, code: string, repeat = false) =>
      window.dispatchEvent(new KeyboardEvent(type, { code, repeat }));
    key("keydown", "KeyA");
    key("keydown", "KeyA", true);
    key("keydown", "KeyW");
    expect(seen.map((e) => [e.kind, e.midi, e.source, e.confidence])).toEqual([
      ["noteon", 60, "onscreen", 0.8],
      ["noteon", 61, "onscreen", 0.8],
    ]);
    expect([...input.held].sort()).toEqual([60, 61]);
    window.dispatchEvent(new Event("blur"));
    expect(input.held.size).toBe(0);

    input.setKeyboardMode("pads");
    key("keydown", "KeyZ");
    key("keyup", "KeyZ");
    key("keydown", "Digit4");
    expect(seen.slice(-3).map((e) => [e.kind, e.midi])).toEqual([
      ["noteon", 36],
      ["noteoff", 36],
      ["noteon", 51],
    ]);
    input.setKeyboardMode("off");
    expect(input.held.size).toBe(0);
    off();
  });
});

describe("on-screen sound", () => {
  it("sustains on-screen notes while held, plays pads on the kit, and never leaves a note stuck", async () => {
    await settings.ready;
    const on = vi.spyOn(audio, "noteOn").mockImplementation(() => {});
    const off = vi.spyOn(audio, "noteOff").mockImplementation(() => {});
    const pad = vi.spyOn(audio, "playKitPad").mockImplementation(() => {});
    // Past the router's 1.5 s MIDI window from earlier tests.
    await new Promise((r) => setTimeout(r, 1600));

    input.setKeyboardMode("piano");
    input.tap(64, true);
    input.tap(64, false);
    expect(on).toHaveBeenCalledWith(64, 0.8);
    expect(off).toHaveBeenCalledWith(64);

    input.setKeyboardMode("pads");
    input.tap(38, true);
    input.tap(38, false);
    expect(pad).toHaveBeenCalledWith(38, 0.8);

    // Switched off mid-note: nothing new sounds, but the held note still stops.
    input.setKeyboardMode("piano");
    input.tap(67, true);
    await settings.update({ onscreenSound: false });
    input.tap(67, false);
    input.tap(69, true);
    input.tap(69, false);
    expect(off).toHaveBeenCalledWith(67);
    expect(on).not.toHaveBeenCalledWith(69, 0.8);

    await settings.update({ onscreenSound: true });
    input.setKeyboardMode("off");
    on.mockRestore();
    off.mockRestore();
    pad.mockRestore();
  });
});

describe("playback handles", () => {
  it("stay === themselves when a page keeps them in $state, so ended playback resets its button", () => {
    const handle = audio.playSequence([{ midi: 60, time: 0, duration: 0.1 }]);
    let stored = $state<typeof handle | null>(null);
    stored = handle;
    expect(stored === handle).toBe(true);
    handle.stop();
  });
});

describe("storage", () => {
  it("persists a $state proxy through plain() and through the Dexie choke point", async () => {
    const take = $state({
      id: "take-1",
      createdAt: 1,
      notes: [{ midi: 60, startBeat: 0, durationBeats: 1 }],
      meta: { bpm: 90 },
    });
    expect(() => structuredClone(take)).toThrow(); // what broke the old app
    expect(structuredClone(plain(take))).toEqual({ ...take, notes: [...take.notes] });

    take.notes.push({ midi: 64, startBeat: 1, durationBeats: 0.5 });
    await db.midiTakes.put(take); // raw proxy: the middleware snapshots it
    const back = await db.midiTakes.get("take-1");
    expect(back?.notes).toEqual([
      { midi: 60, startBeat: 0, durationBeats: 1 },
      { midi: 64, startBeat: 1, durationBeats: 0.5 },
    ]);

    await putSetting("test.key", take.meta);
    expect(await getSetting("test.key", null)).toEqual({ bpm: 90 });
    expect(await getSetting("test.missing", 7)).toBe(7);
  });

  it("stores binaries in OPFS under nested keys and prunes empty folders", async () => {
    const key = "music.sample-kits/kit-1/s1-kick.wav";
    await putBinary(key, new Blob(["RIFF"], { type: "audio/wav" }));
    expect(await (await getBinary(key))?.text()).toBe("RIFF");
    await deleteBinary(key);
    expect(await getBinary(key)).toBeUndefined();
    const root = await navigator.storage.getDirectory();
    await expect(root.getDirectoryHandle("music.sample-kits")).rejects.toThrow();
  });

  it("settings update persists and toggles reduce motion", async () => {
    await settings.ready;
    await settings.update({ reduceMotion: true, bpm: 101 });
    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(true);
    expect(await getSetting<{ bpm: number }>("music.settings", { bpm: 0 })).toMatchObject({
      bpm: 101,
    });
    await settings.update({ reduceMotion: false });
    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(false);
  });
});

describe("midi runtime", () => {
  it("routes, ignores, rewrites pad maps and keeps the MPC link alive app-wide", async () => {
    const fake = installFakeMidi({ allowSysex: true });
    expect(await midi.enable()).toBe(true);
    expect(midi.sysexEnabled).toBe(true);
    expect(fake.requests[0]).toEqual({ sysex: true });
    expect(midi.inputs.map((p) => p.id)).toEqual(["in-keys", "in-pads", "in-ctrl"]);
    expect(settings.value.midiEnabledBefore).toBe(true);

    const seen: InputEvent[] = [];
    const off = input.subscribe((e) => seen.push(e));

    fake.fire("in-keys", [0x90, 60, 100]);
    expect(seen.at(-1)).toMatchObject({
      kind: "noteon",
      midi: 60,
      source: "midi",
      instrument: "piano",
    });
    expect(input.held.has(60)).toBe(true);
    fake.fire("in-keys", [0x80, 60, 0]);
    expect(input.held.has(60)).toBe(false);

    // Ignore the flood port: raw log still shows it, drills do not.
    await midi.saveProfile({ id: "in-ctrl", ignored: true });
    const before = seen.length;
    fake.fire("in-ctrl", [0x90, 40, 100]);
    expect(seen.length).toBe(before);
    expect(midi.rawLog[0]).toMatchObject({
      portId: "in-ctrl",
      port: "MPC One+ Private",
      hex: "90 28 64",
    });

    // Akai Classic pad map: hardware 37 (A01) becomes canonical 36.
    await midi.saveProfile({ id: "in-pads", padNotes: [...PAD_PRESETS["akai-classic"].notes] });
    fake.fire("in-pads", [0x99, 37, 127]);
    expect(seen.at(-1)).toMatchObject({ kind: "noteon", midi: 36, instrument: "mpc", channel: 10 });
    fake.fire("in-pads", [0x89, 37, 0]);

    // Profiles survive a reload with `ignored` intact (the old sanitize bug).
    const stored = await getSetting<{ id: string; ignored?: boolean }[]>(
      "music.device-profiles",
      [],
    );
    expect(stored.find((p) => p.id === "in-ctrl")?.ignored).toBe(true);

    // Pad learning captures the next 16 distinct hardware notes, before the map.
    const progress: number[] = [];
    const learn = midi.learnPads("in-pads", (n) => progress.push(n.length));
    for (const n of [37, 37, 36, 42, 82, 40, 38, 46, 44, 48, 47, 45, 43, 49, 55, 51, 53]) {
      fake.fire("in-pads", [0x99, n, 100]);
      fake.fire("in-pads", [0x89, n, 0]);
    }
    expect(await learn.promise).toEqual([...PAD_PRESETS["akai-classic"].notes]);
    expect(progress.at(-1)).toBe(16);

    // Controller link: handshake now, heartbeat every second, all-off on unlink.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const out = fake.outputs.get("out-mpc")!;
    midi.linkMpc("out-mpc");
    expect(midi.mpcLink).toEqual({ state: "linked", outputId: "out-mpc" });
    expect(out.sent).toEqual(initFrames());
    vi.advanceTimersByTime(3000);
    expect(out.sent.length).toBe(initFrames().length + 3);
    expect(out.sent.at(-1)).toEqual(heartbeatFrame());
    expect(midi.lastOutboundFrame).toBe("F0 47 00 56 52 00 04 41 67 16 00 F7");

    midi.unlinkMpc();
    const afterUnlink = out.sent.length;
    expect(
      out.sent.slice(-16).every((f) => f[4] === 0x65 && f[8] === 0 && f[9] === 0 && f[10] === 0),
    ).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(out.sent.length).toBe(afterUnlink);
    expect(midi.mpcLink.state).toBe("off");

    off();
  });

  it("falls back to plain MIDI and refuses SysEx frames without the permission", async () => {
    const fake = installFakeMidi({ allowSysex: false });
    expect(await midi.enable()).toBe(true);
    expect(fake.requests).toEqual([{ sysex: true }, { sysex: false }]);
    expect(midi.sysexEnabled).toBe(false);
    expect(midi.error).toMatch(/SysEx was not granted/);
    expect(midi.send("out-mpc", heartbeatFrame())).toBe(false);
    expect(midi.send("out-mpc", [0x90, 60, 100])).toBe(true);
    expect(fake.outputs.get("out-mpc")!.sent).toEqual([[0x90, 60, 100]]);

    midi.linkMpc("out-mpc");
    expect(midi.mpcLink.state).toBe("no-sysex");
    expect(fake.outputs.get("out-mpc")!.sent).toHaveLength(1);
    midi.unlinkMpc();
  });

  it("init() re-enables MIDI on load when it was enabled before", async () => {
    installFakeMidi({ allowSysex: true });
    await settings.update({ midiEnabledBefore: true });
    expect(midi.enabled).toBe(false);
    await midi.init();
    expect(midi.enabled).toBe(true);
  });
});

describe("microphone (synthetic audio)", () => {
  it("hears a steady 220 Hz tone as A3 and routes note-on and note-off", async () => {
    const seen: InputEvent[] = [];
    const off = input.subscribe((e) => seen.push(e));
    // Audio contexts start only after a gesture, as for a real user: click a button.
    const button = document.body.appendChild(document.createElement("button"));
    button.textContent = "Start mic";
    let started: Promise<boolean> | undefined;
    button.onclick = () =>
      (started = mic.startSynthetic((t) => 0.4 * Math.sin(2 * Math.PI * 220 * t)));
    await userEvent.click(button);
    expect(await started).toBe(true);
    button.remove();
    expect(mic.state).toBe("on");
    await expect.poll(() => mic.pitch?.midi, { timeout: 3000 }).toBe(57);
    const cents: number[] = [];
    const unsub = mic.subscribeFrames(
      (f) => f.pitch && cents.push(Math.round(f.pitch.cents * 10) / 10),
    );
    await new Promise((r) => setTimeout(r, 600));
    unsub();
    // The first frame or two straddle the stream start; after that the reading is steady.
    expect(cents.length).toBeGreaterThan(5);
    expect(
      cents.every((c) => Math.abs(c) < 5),
      cents.join(" "),
    ).toBe(true);
    expect(mic.level).toBeGreaterThan(-20);
    expect(seen).toContainEqual(
      expect.objectContaining({ kind: "noteon", midi: 57, source: "audio" }),
    );
    mic.stop();
    expect(mic.state).toBe("off");
    expect(seen.at(-1)).toMatchObject({ kind: "noteoff", midi: 57, source: "audio" });
    off();
  });
});

/** Run `fn` inside a real click so the browser grants audio, as it would for a user. */
async function withGesture<T>(fn: () => Promise<T>): Promise<T> {
  const button = document.body.appendChild(document.createElement("button"));
  button.textContent = "Go";
  let result: Promise<T> | undefined;
  button.onclick = () => (result = fn());
  await userEvent.click(button);
  button.remove();
  return result!;
}

describe("audio engine (headless: clocks and handles only; nothing audible is verified)", () => {
  it("projects the audio start onto performance.now() and fires note callbacks on time", async () => {
    const { audio } = await import("./audio.svelte");
    expect(await withGesture(() => audio.unlock())).toBe(true);
    expect(audio.unlocked).toBe(true);

    const hits: { i: number; perfAt: number; late: number }[] = [];
    const before = performance.now();
    const seq = audio.playSequence(
      [
        { midi: 60, time: 0, duration: 0.2 },
        { midi: 64, time: 0.25, duration: 0.2 },
        { midi: 36, time: 0.5, duration: 0.1, voice: "drum" },
      ],
      { onNote: (i, perfAt) => hits.push({ i, perfAt, late: performance.now() - perfAt }) },
    );
    expect(seq.playing).toBe(true);
    expect(seq.startPerf).toBeGreaterThan(before); // Tone's look-ahead puts time 0 in the future
    await expect.poll(() => hits.length, { timeout: 3000 }).toBe(3);
    expect(hits.map((h) => h.i)).toEqual([0, 1, 2]);
    expect(hits[0].perfAt).toBeCloseTo(seq.startPerf, 6);
    expect(hits[2].perfAt - hits[0].perfAt).toBeCloseTo(500, 6);
    const late = hits.map((h) => Math.round(h.late));
    expect(
      late.every((ms) => ms >= -2 && ms < 50),
      late.join(" "),
    ).toBe(true);
    await seq.done;
    expect(seq.playing).toBe(false);

    // Starting a sequence stops the previous one: no layering.
    const a = audio.playSequence([{ midi: 60, time: 0, duration: 2 }]);
    const b = audio.playSequence([{ midi: 62, time: 0, duration: 2 }]);
    expect(a.playing).toBe(false);
    b.stop();
    await b.done;

    // Metronome: one bar of count-in at 240 BPM, bars numbered from the downbeat.
    const beats: { beat: number; bar: number; countIn: boolean; perfAt: number }[] = [];
    const m = audio.metronome.start({
      bpm: 240,
      beatsPerBar: 4,
      countInBars: 1,
      onBeat: (beat, bar, perfAt, countIn) => beats.push({ beat, bar, countIn, perfAt }),
    });
    expect(m.downbeatPerf - m.startPerf).toBeCloseTo(1000, 6);
    await expect.poll(() => beats.length, { timeout: 3000 }).toBeGreaterThanOrEqual(6);
    m.stop();
    expect(beats[0]).toMatchObject({ beat: 0, bar: -1, countIn: true });
    expect(beats[4]).toMatchObject({ beat: 0, bar: 0, countIn: false });
    expect(beats[4].perfAt).toBeCloseTo(m.downbeatPerf, 6);

    // Offline render: 16-bit stereo 44.1 kHz with the 0.5 s tail.
    const wav = await audio.renderWav([{ midi: 60, time: 0, duration: 0.3 }], 0.5);
    expect(wav.type).toBe("audio/wav");
    expect(wav.size).toBe(44 + 44100 * 2 * 2);

    // A take plays back through a handle that ends on its own.
    const take = await audio.playBlob(wav, -6);
    expect(take.playing).toBe(true);
    await take.done;

    expect(audio.latencyInfo()).toHaveProperty("outputLatencyMs");
    audio.stopAll();
  });
});
