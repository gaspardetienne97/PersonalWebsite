import { monotonicMs, type InstrumentId, type NoteEvent } from "@repo/music-core/domain";

export type MidiPortType = "input" | "output";

export interface MidiDeviceSummary {
  id: string;
  name: string;
  manufacturer?: string;
  state?: string;
  type: MidiPortType;
  profileId?: string;
  instrument?: InstrumentId;
}

export interface MidiCapabilities {
  supported: boolean;
  reason?: string;
}

export type MpcPadBank = "A" | "B" | "C" | "D";

export const MPC_PAD_BANKS: Record<MpcPadBank, readonly number[]> = {
  A: Array.from({ length: 16 }, (_, pad) => 36 + pad),
  B: Array.from({ length: 16 }, (_, pad) => 52 + pad),
  C: Array.from({ length: 16 }, (_, pad) => 68 + pad),
  D: Array.from({ length: 16 }, (_, pad) => 84 + pad),
};

export interface MidiDeviceProfile {
  id: string;
  label: string;
  instrument: InstrumentId;
  breathController?: number;
  biteMessage?: "pitchBend";
  padBanks?: Record<MpcPadBank, readonly number[]>;
}

export interface WebMidiPort {
  id: string;
  name: string;
  manufacturer?: string;
  state?: string;
  type: string;
}

export interface WebMidiMessage {
  rawData: ArrayLike<number>;
  timestamp: number;
  port: WebMidiInput;
}

export interface WebMidiInput extends WebMidiPort {
  addListener(event: "midimessage", listener: (event: WebMidiMessage) => void): unknown;
  removeListener(event: "midimessage", listener: (event: WebMidiMessage) => void): void;
}

export type WebMidiPortEventName = "connected" | "disconnected" | "portschanged";
export type WebMidiPortListener = (event: { port?: MidiDeviceSummary }) => void;

export interface WebMidiFacade {
  enabled: boolean;
  inputs: WebMidiInput[];
  outputs: WebMidiPort[];
  enable(options: { sysex: boolean }): Promise<unknown>;
  disable(): Promise<unknown>;
  addListener(event: WebMidiPortEventName, listener: WebMidiPortListener): unknown;
  removeListener(event: WebMidiPortEventName, listener: WebMidiPortListener): void;
}

export interface MidiEngineState {
  supported: boolean;
  enabled: boolean;
  error?: string;
  inputs: MidiDeviceSummary[];
  outputs: MidiDeviceSummary[];
}

interface MidiEngineOptions {
  capabilityTarget?: Pick<Navigator, "requestMIDIAccess"> | object;
  loadWebMidi?: () => Promise<WebMidiFacade>;
}

type MidiListener = (event: NoteEvent) => void;
type MidiStateListener = (state: MidiEngineState) => void;

const AEROPHONE_PROFILE: MidiDeviceProfile = {
  id: "roland-aerophone",
  label: "Roland Aerophone",
  instrument: "aerophone",
  breathController: 2,
  biteMessage: "pitchBend",
};

const MPC_PROFILE: MidiDeviceProfile = {
  id: "akai-mpc",
  label: "Akai MPC",
  instrument: "mpc",
  padBanks: MPC_PAD_BANKS,
};

const loadWebMidiFacade = async (): Promise<WebMidiFacade> => {
  const { WebMidi } = await import("webmidi");
  return WebMidi as unknown as WebMidiFacade;
};

export function webMidiSupported(
  target: Pick<Navigator, "requestMIDIAccess"> | object = globalThis.navigator ?? {},
): boolean {
  return "requestMIDIAccess" in target && typeof target.requestMIDIAccess === "function";
}

export function midiCapabilities(
  target?: Pick<Navigator, "requestMIDIAccess"> | object,
): MidiCapabilities {
  return webMidiSupported(target)
    ? { supported: true }
    : {
        supported: false,
        reason: "Web MIDI is unavailable in this browser. Use Chromium or on-screen input.",
      };
}

export function detectMidiDeviceProfile(
  device: Pick<MidiDeviceSummary, "name" | "manufacturer">,
): MidiDeviceProfile | undefined {
  const identity = `${device.manufacturer ?? ""} ${device.name}`.toLowerCase();
  if (
    identity.includes("aerophone") ||
    (identity.includes("roland") && /\bae-\d+/.test(identity))
  ) {
    return AEROPHONE_PROFILE;
  }
  if (identity.includes("mpc") || (identity.includes("akai") && identity.includes("pad"))) {
    return MPC_PROFILE;
  }
  return undefined;
}

export function normalizeMidiMessage(
  data: ArrayLike<number>,
  timestamp: number,
  deviceId?: string,
  profile?: MidiDeviceProfile,
): NoteEvent | undefined {
  const status = data[0] ?? 0;
  const data1 = data[1] ?? 0;
  const data2 = data[2] ?? 0;
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const base = {
    source: "midi" as const,
    timestamp: monotonicMs(timestamp),
    clock: "midi" as const,
    ...(deviceId !== undefined ? { deviceId } : {}),
    ...(profile ? { inputProfileId: profile.id, instrument: profile.instrument } : {}),
    raw: { midiStatus: status, midiData1: data1, midiData2: data2 },
    channel,
  };

  if (command === 0x90 && data2 > 0) {
    return { ...base, type: "noteOn", midiNote: data1, velocity: data2 / 127 };
  }
  if (command === 0x80 || command === 0x90) {
    return { ...base, type: "noteOff", midiNote: data1 };
  }
  if (command === 0xb0) {
    return { ...base, type: "cc", controller: data1, value: data2 / 127 };
  }
  if (command === 0xe0) {
    const value14 = data1 + data2 * 128;
    return { ...base, type: "pitchBend", bend: (value14 - 8192) / 8192 };
  }
  if (command === 0xd0) {
    return { ...base, type: "aftertouch", pressure: data1 / 127 };
  }
  if (command === 0xa0) {
    return { ...base, type: "aftertouch", midiNote: data1, pressure: data2 / 127 };
  }

  return undefined;
}

export class MidiEngine {
  readonly state: MidiEngineState;

  #capabilityTarget: Pick<Navigator, "requestMIDIAccess"> | object;
  #loadWebMidi: () => Promise<WebMidiFacade>;
  #webMidi: WebMidiFacade | undefined;
  #listeners = new Set<MidiListener>();
  #stateListeners = new Set<MidiStateListener>();
  #inputListeners = new Map<WebMidiInput, (event: WebMidiMessage) => void>();
  #handlePortsChanged = () => this.#refreshDevices();

  constructor(options: MidiEngineOptions = {}) {
    this.#capabilityTarget = options.capabilityTarget ?? globalThis.navigator ?? {};
    this.#loadWebMidi = options.loadWebMidi ?? loadWebMidiFacade;
    const capability = midiCapabilities(this.#capabilityTarget);
    this.state = {
      supported: capability.supported,
      enabled: false,
      ...(capability.reason ? { error: capability.reason } : {}),
      inputs: [],
      outputs: [],
    };
  }

  get inputs(): MidiDeviceSummary[] {
    return this.state.inputs;
  }

  get outputs(): MidiDeviceSummary[] {
    return this.state.outputs;
  }

  get devices(): MidiDeviceSummary[] {
    return [...this.state.inputs, ...this.state.outputs];
  }

  subscribe(listener: MidiListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  subscribeState(listener: MidiStateListener): () => void {
    this.#stateListeners.add(listener);
    listener(this.state);
    return () => this.#stateListeners.delete(listener);
  }

  async enable(): Promise<boolean> {
    if (this.state.enabled) return true;

    const capability = midiCapabilities(this.#capabilityTarget);
    if (!capability.supported) {
      this.#updateState({ supported: false, enabled: false, error: capability.reason });
      return false;
    }

    try {
      this.#webMidi = await this.#loadWebMidi();
      await this.#webMidi.enable({ sysex: false });
      this.#webMidi.addListener("connected", this.#handlePortsChanged);
      this.#webMidi.addListener("disconnected", this.#handlePortsChanged);
      this.#webMidi.addListener("portschanged", this.#handlePortsChanged);
      this.#refreshDevices();
      this.#updateState({ supported: true, enabled: true, error: undefined });
      return true;
    } catch (error) {
      this.#updateState({
        supported: true,
        enabled: false,
        error: error instanceof Error ? error.message : "MIDI access was denied.",
      });
      return false;
    }
  }

  async disable(): Promise<void> {
    this.#unbindInputs();
    if (this.#webMidi) {
      this.#webMidi.removeListener("connected", this.#handlePortsChanged);
      this.#webMidi.removeListener("disconnected", this.#handlePortsChanged);
      this.#webMidi.removeListener("portschanged", this.#handlePortsChanged);
      await this.#webMidi.disable();
    }
    this.#webMidi = undefined;
    this.#updateState({ enabled: false, inputs: [], outputs: [] });
  }

  #refreshDevices(): void {
    if (!this.#webMidi) return;

    const activeInputs = new Set(this.#webMidi.inputs);
    this.#inputListeners.forEach((listener, input) => {
      if (!activeInputs.has(input)) {
        input.removeListener("midimessage", listener);
        this.#inputListeners.delete(input);
      }
    });
    this.#webMidi.inputs.forEach((input) => this.#bindInput(input));

    this.#updateState({
      inputs: this.#webMidi.inputs.map((input) => summarizeMidiDevice(input, "input")),
      outputs: this.#webMidi.outputs.map((output) => summarizeMidiDevice(output, "output")),
    });
  }

  #bindInput(input: WebMidiInput): void {
    if (this.#inputListeners.has(input)) return;
    const listener = (message: WebMidiMessage) => {
      const summary = summarizeMidiDevice(input, "input");
      const event = normalizeMidiMessage(
        message.rawData,
        message.timestamp,
        input.id,
        detectMidiDeviceProfile(summary),
      );
      if (event) this.#listeners.forEach((subscriber) => subscriber(event));
    };
    input.addListener("midimessage", listener);
    this.#inputListeners.set(input, listener);
  }

  #unbindInputs(): void {
    this.#inputListeners.forEach((listener, input) => {
      input.removeListener("midimessage", listener);
    });
    this.#inputListeners.clear();
  }

  #updateState(patch: Partial<MidiEngineState>): void {
    Object.assign(this.state, patch);
    if ("error" in patch && patch.error === undefined) delete this.state.error;
    this.#stateListeners.forEach((listener) => listener(this.state));
  }
}

function summarizeMidiDevice(port: WebMidiPort, type: MidiPortType): MidiDeviceSummary {
  const summary: MidiDeviceSummary = {
    id: port.id,
    name: port.name || "Unknown MIDI device",
    ...(port.manufacturer ? { manufacturer: port.manufacturer } : {}),
    ...(port.state ? { state: port.state } : {}),
    type,
  };
  const profile = detectMidiDeviceProfile(summary);
  if (profile) {
    summary.profileId = profile.id;
    summary.instrument = profile.instrument;
  }
  return summary;
}
