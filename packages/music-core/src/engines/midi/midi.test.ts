import { describe, expect, test, vi } from "vitest";

import {
  detectMidiDeviceProfile,
  MidiEngine,
  midiCapabilities,
  normalizeMidiMessage,
  webMidiSupported,
  type MidiDeviceSummary,
  type WebMidiFacade,
  type WebMidiInput,
  type WebMidiMessage,
} from "./index";

class FakeInput implements WebMidiInput {
  id: string;
  name: string;
  manufacturer: string;
  state = "connected";
  type = "input" as const;
  #listeners = new Set<(event: WebMidiMessage) => void>();

  constructor(id: string, name: string, manufacturer: string) {
    this.id = id;
    this.name = name;
    this.manufacturer = manufacturer;
  }

  addListener(_event: "midimessage", listener: (event: WebMidiMessage) => void): unknown {
    this.#listeners.add(listener);
    return listener;
  }

  removeListener(_event: "midimessage", listener: (event: WebMidiMessage) => void): void {
    this.#listeners.delete(listener);
  }

  emit(data: number[], timestamp: number): void {
    const message = {
      rawData: Uint8Array.from(data),
      timestamp,
      port: this,
    };
    this.#listeners.forEach((listener) => listener(message));
  }
}

function createWebMidiMock() {
  const listeners = new Map<string, Set<(event: { port?: MidiDeviceSummary }) => void>>();
  const facade: WebMidiFacade = {
    enabled: false,
    inputs: [],
    outputs: [],
    enable: vi.fn(async () => {
      facade.enabled = true;
    }),
    disable: vi.fn(async () => {
      facade.enabled = false;
    }),
    addListener: vi.fn((event, listener) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return listener;
    }),
    removeListener: vi.fn((event, listener) => {
      listeners.get(event)?.delete(listener);
    }),
  };

  return {
    facade,
    emit(event: "connected" | "disconnected" | "portschanged", port?: MidiDeviceSummary) {
      listeners.get(event)?.forEach((listener) => listener({ port }));
    },
  };
}

describe("music-core/midi", () => {
  test("normalizes note on, note off, CC, pitch bend, and aftertouch", () => {
    expect(normalizeMidiMessage([0x90, 60, 100], 12, "dev-1")).toMatchObject({
      type: "noteOn",
      midiNote: 60,
      velocity: 100 / 127,
      channel: 1,
      source: "midi",
      deviceId: "dev-1",
    });
    expect(normalizeMidiMessage([0x90, 60, 0], 12, "dev-1")).toMatchObject({
      type: "noteOff",
      midiNote: 60,
    });
    expect(normalizeMidiMessage([0xb2, 2, 64], 12, "dev-1")).toMatchObject({
      type: "cc",
      controller: 2,
      value: 64 / 127,
      channel: 3,
    });
    expect(normalizeMidiMessage([0xe0, 0, 64], 12, "dev-1")).toMatchObject({
      type: "pitchBend",
      bend: 0,
    });
    expect(normalizeMidiMessage([0xd0, 80], 12, "dev-1")).toMatchObject({
      type: "aftertouch",
      pressure: 80 / 127,
    });
    expect(normalizeMidiMessage([0xf8], 12, "dev-1")).toBeUndefined();
  });

  test("applies Aerophone and MPC device profiles to normalized events", () => {
    const aerophone = detectMidiDeviceProfile({
      name: "Roland Aerophone AE-20",
      manufacturer: "Roland",
    });
    const mpc = detectMidiDeviceProfile({
      name: "MPC Live II",
      manufacturer: "Akai",
    });

    expect(aerophone).toMatchObject({
      id: "roland-aerophone",
      instrument: "aerophone",
      breathController: 2,
      biteMessage: "pitchBend",
    });
    expect(mpc).toMatchObject({ id: "akai-mpc", instrument: "mpc" });
    expect(normalizeMidiMessage([0xb0, 2, 127], 20, "aero", aerophone)).toMatchObject({
      type: "cc",
      controller: 2,
      value: 1,
      instrument: "aerophone",
      inputProfileId: "roland-aerophone",
    });
    expect(normalizeMidiMessage([0x90, 36, 100], 20, "mpc", mpc)).toMatchObject({
      type: "noteOn",
      instrument: "mpc",
      inputProfileId: "akai-mpc",
    });
  });

  test("requests permission, enumerates devices, hot-plugs, and emits normalized input", async () => {
    const mock = createWebMidiMock();
    const keyboard = new FakeInput("keys-1", "KeyLab 61", "Arturia");
    mock.facade.inputs.push(keyboard);
    const outSend = vi.fn();
    mock.facade.outputs.push({
      id: "out-1",
      name: "KeyLab MIDI Out",
      manufacturer: "Arturia",
      state: "connected",
      type: "output",
      send: outSend,
    });
    const engine = new MidiEngine({
      capabilityTarget: { requestMIDIAccess: vi.fn() },
      loadWebMidi: async () => mock.facade,
    });
    const events: unknown[] = [];
    const rawEvents: unknown[] = [];
    engine.subscribe((event) => events.push(event));
    engine.subscribeRaw((event) => rawEvents.push(event));

    await expect(engine.enable()).resolves.toBe(true);
    await expect(engine.enable()).resolves.toBe(true);
    expect(mock.facade.enable).toHaveBeenCalledWith({ sysex: true });
    expect(mock.facade.enable).toHaveBeenCalledOnce();
    expect(engine.state.sysexEnabled).toBe(true);
    expect(engine.devices).toHaveLength(2);

    // Raw MIDI/SysEx output to a port by id.
    expect(engine.send("out-1", [0xf0, 0x47, 0xf7])).toBe(true);
    expect(outSend).toHaveBeenCalledWith([0xf0, 0x47, 0xf7]);
    expect(engine.send("missing", [0x90, 60, 100])).toBe(false);

    keyboard.emit([0x90, 64, 127], 42);
    expect(events.at(-1)).toMatchObject({
      type: "noteOn",
      midiNote: 64,
      deviceId: "keys-1",
      timestamp: 42,
    });

    const aerophone = new FakeInput("aero-1", "Aerophone AE-20", "Roland");
    mock.facade.inputs.push(aerophone);
    mock.emit("connected", aerophone);
    expect(engine.inputs.map((input) => input.id)).toEqual(["keys-1", "aero-1"]);

    aerophone.emit([0xb0, 2, 64], 50);
    expect(events.at(-1)).toMatchObject({
      type: "cc",
      controller: 2,
      instrument: "aerophone",
    });

    keyboard.emit([0xf0, 0x47, 0x00, 0x3b, 0x01, 0xf7], 60);
    expect(rawEvents.at(-1)).toEqual({
      data: [0xf0, 0x47, 0x00, 0x3b, 0x01, 0xf7],
      timestamp: 60,
      deviceId: "keys-1",
    });
  });

  test("ignored inputs drop note events but still emit raw for diagnostics", async () => {
    const mock = createWebMidiMock();
    const control = new FakeInput("mpc-private", "MPC One+ Private", "Akai");
    mock.facade.inputs.push(control);
    const engine = new MidiEngine({
      capabilityTarget: { requestMIDIAccess: vi.fn() },
      loadWebMidi: async () => mock.facade,
    });
    const notes: unknown[] = [];
    const raw: unknown[] = [];
    engine.subscribe((event) => notes.push(event));
    engine.subscribeRaw((event) => raw.push(event));

    await engine.enable();
    engine.setIgnoredInputs(["mpc-private"]);
    expect(engine.isInputIgnored("mpc-private")).toBe(true);

    control.emit([0x90, 38, 100], 10);
    expect(notes).toHaveLength(0); // note suppressed
    expect(raw).toHaveLength(1); // raw still flows

    // Un-ignoring restores note input.
    engine.setIgnoredInputs([]);
    control.emit([0x90, 40, 100], 20);
    expect(notes).toHaveLength(1);
    expect(notes.at(-1)).toMatchObject({ type: "noteOn", midiNote: 40, deviceId: "mpc-private" });
  });

  test("falls back to ordinary MIDI when SysEx permission is denied", async () => {
    const mock = createWebMidiMock();
    const outSend = vi.fn();
    mock.facade.outputs.push({
      id: "out-1",
      name: "MPC One+ Public",
      manufacturer: "Akai Professional",
      state: "connected",
      type: "output",
      send: outSend,
    });
    vi.mocked(mock.facade.enable)
      .mockRejectedValueOnce(new Error("SysEx permission denied"))
      .mockResolvedValueOnce(undefined);
    const engine = new MidiEngine({
      capabilityTarget: { requestMIDIAccess: vi.fn() },
      loadWebMidi: async () => mock.facade,
    });

    await expect(engine.enable()).resolves.toBe(true);
    expect(mock.facade.enable).toHaveBeenNthCalledWith(1, { sysex: true });
    expect(mock.facade.enable).toHaveBeenNthCalledWith(2, { sysex: false });
    expect(engine.state).toMatchObject({
      enabled: true,
      sysexEnabled: false,
      sysexError: "SysEx permission denied",
    });
    expect(engine.send("out-1", [0x90, 36, 100])).toBe(true);
    expect(engine.send("out-1", [0xf0, 0x47, 0xf7])).toBe(false);
    expect(outSend).toHaveBeenCalledOnce();
  });

  test("does not send before MIDI has been enabled", () => {
    const mock = createWebMidiMock();
    const outSend = vi.fn();
    mock.facade.outputs.push({
      id: "out-1",
      name: "MPC One+ Public",
      manufacturer: "Akai Professional",
      state: "connected",
      type: "output",
      send: outSend,
    });
    const engine = new MidiEngine({
      capabilityTarget: { requestMIDIAccess: vi.fn() },
      loadWebMidi: async () => mock.facade,
    });

    expect(engine.send("out-1", [0x90, 36, 100])).toBe(false);
    expect(outSend).not.toHaveBeenCalled();
  });

  test("reports missing Web MIDI support under an unsupported browser stub", async () => {
    expect(webMidiSupported({})).toBe(false);
    expect(webMidiSupported({ requestMIDIAccess: () => undefined })).toBe(true);
    expect(midiCapabilities({})).toMatchObject({ supported: false });

    const engine = new MidiEngine({
      capabilityTarget: {},
      loadWebMidi: async () => createWebMidiMock().facade,
    });
    await expect(engine.enable()).resolves.toBe(false);
    expect(engine.state).toMatchObject({
      supported: false,
      enabled: false,
      error: expect.stringContaining("unavailable"),
    });
  });

  test("reports a denied MIDI permission request without enabling the engine", async () => {
    const mock = createWebMidiMock();
    vi.mocked(mock.facade.enable).mockRejectedValue(new Error("Permission denied"));
    const engine = new MidiEngine({
      capabilityTarget: { requestMIDIAccess: vi.fn() },
      loadWebMidi: async () => mock.facade,
    });

    await expect(engine.enable()).resolves.toBe(false);
    expect(engine.state).toMatchObject({
      supported: true,
      enabled: false,
      error: "Permission denied",
    });
  });
});
