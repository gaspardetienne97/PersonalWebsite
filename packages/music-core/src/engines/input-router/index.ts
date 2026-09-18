import type { InputSource, InstrumentId, NoteEvent } from "@repo/music-core/domain";

/** Tap-along offset calibration (pure math; the UI drives the run). */
export * from "./calibration";

type Listener = (event: NoteEvent) => void;
type StateListener = (state: InputRouterState) => void;
type MidiActivityKey = InstrumentId | "generic";

export interface InputRouterState {
  activeSource: InputSource;
  confidence: number;
  activeInstrument?: InstrumentId;
}

export interface InputRouterOptions {
  midiActivityWindowMs?: number;
  now?: () => number;
}

/**
 * Saved latency offsets, in ms, positive meaning the input arrives late. The
 * router subtracts them from incoming timestamps once, here, so every scorer
 * downstream grades against the corrected time without knowing about them.
 */
export interface InputOffsets {
  /** Applied to `audio` events. */
  audioMs?: number;
  /** Applied to `midi` events with no per-device offset. */
  midiMs?: number;
  /** Per-MIDI-device offset, keyed by device id; overrides `midiMs`. */
  midiByDeviceId?: Record<string, number>;
}

export class InputRouter {
  #events: NoteEvent[] = [];
  #listeners = new Set<Listener>();
  #stateListeners = new Set<StateListener>();
  #activeSource: InputSource = "onscreen";
  #confidence = confidenceFor("onscreen");
  #activeInstrument?: InstrumentId;
  #activeChannel?: number;
  #lastMidiActivity = new Map<MidiActivityKey, number>();
  #midiActivityWindowMs: number;
  #now: () => number;
  #offsets: InputOffsets = {};

  constructor(options: InputRouterOptions = {}) {
    this.#midiActivityWindowMs = options.midiActivityWindowMs ?? 1_500;
    this.#now = options.now ?? performanceNow;
  }

  get activeSource(): InputSource {
    return this.#activeSource;
  }

  get confidence(): number {
    return this.#confidence;
  }

  get events(): NoteEvent[] {
    return [...this.#events];
  }

  get state(): InputRouterState {
    return {
      activeSource: this.#activeSource,
      confidence: this.#confidence,
      ...(this.#activeInstrument !== undefined ? { activeInstrument: this.#activeInstrument } : {}),
    };
  }

  /** Restrict accepted MIDI to a single channel (1-16); undefined accepts all. */
  setActiveChannel(channel?: number): void {
    this.#activeChannel = channel;
  }

  get activeChannel(): number | undefined {
    return this.#activeChannel;
  }

  /** Saved calibration offsets to subtract from incoming timestamps. */
  setInputOffsets(offsets: InputOffsets): void {
    this.#offsets = offsets;
  }

  setActiveInstrument(instrument?: InstrumentId): void {
    const previous = this.state;
    this.#activeInstrument = instrument;

    if (this.#activeSource === "midi" && !this.#hasRecentMidi()) {
      this.#activeSource = "onscreen";
      this.#confidence = confidenceFor("onscreen");
    }

    this.#notifyStateIfChanged(previous);
  }

  push(incoming: NoteEvent): boolean {
    if (!this.#accepts(incoming)) return false;

    const event = this.#correctTimestamp(incoming);
    const previous = this.state;
    this.#events.push(event);

    // A release never activates a source: a stale MIDI noteOff must not steal
    // the visible source back from an already accepted on-screen owner.
    if (event.source !== "click" && event.type !== "noteOff") {
      this.#activeSource = event.source;
      this.#confidence = confidenceFor(event.source, event.confidence);
    }

    for (const listener of this.#listeners) listener(event);
    this.#notifyStateIfChanged(previous);
    return true;
  }

  noteOn(
    midiNote: number,
    source: InputSource = "onscreen",
    instrument?: InstrumentId,
    position?: {
      inputProfileId: string;
      fretPosition: { stringNumber: number; fretNumber: number };
    },
  ): NoteEvent {
    const event: NoteEvent = {
      type: "noteOn",
      ...position,
      midiNote,
      velocity: 1,
      source,
      timestamp: this.#now() as import("@repo/music-core/domain").MonotonicMs,
      clock: "performance",
      ...(instrument !== undefined ? { instrument } : {}),
    };
    this.push(event);
    return event;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  subscribeState(listener: StateListener): () => void {
    this.#stateListeners.add(listener);
    listener(this.state);
    return () => this.#stateListeners.delete(listener);
  }

  /** Pull a late-arriving event back to when it was actually played. */
  #correctTimestamp(event: NoteEvent): NoteEvent {
    const offset =
      event.source === "midi"
        ? ((event.deviceId === undefined
            ? undefined
            : this.#offsets.midiByDeviceId?.[event.deviceId]) ?? this.#offsets.midiMs)
        : event.source === "audio"
          ? this.#offsets.audioMs
          : undefined;
    if (!offset) return event;
    return { ...event, timestamp: (event.timestamp - offset) as NoteEvent["timestamp"] };
  }

  #accepts(event: NoteEvent): boolean {
    if (event.source === "click") return true;

    if (event.source === "midi") {
      if (
        this.#activeInstrument !== undefined &&
        event.instrument !== undefined &&
        event.instrument !== this.#activeInstrument
      ) {
        return false;
      }

      const channel = "channel" in event ? event.channel : undefined;
      if (
        this.#activeChannel !== undefined &&
        channel !== undefined &&
        channel !== this.#activeChannel
      ) {
        return false;
      }

      // Only attacks/evidence refresh the arbitration window; releases are
      // delivered but leave recency untouched.
      if (event.type !== "noteOff") {
        this.#lastMidiActivity.set(event.instrument ?? "generic", this.#now());
      }
      return true;
    }

    // A paired release is always deliverable so the owning source can let go.
    return event.type === "noteOff" || !this.#hasRecentMidi();
  }

  #hasRecentMidi(): boolean {
    const now = this.#now();
    const isRecent = (lastActivity?: number) =>
      lastActivity !== undefined && now - lastActivity <= this.#midiActivityWindowMs;

    if (this.#activeInstrument !== undefined) {
      return (
        isRecent(this.#lastMidiActivity.get("generic")) ||
        isRecent(this.#lastMidiActivity.get(this.#activeInstrument))
      );
    }

    return [...this.#lastMidiActivity.values()].some(isRecent);
  }

  #notifyStateIfChanged(previous: InputRouterState): void {
    const next = this.state;
    if (
      previous.activeSource === next.activeSource &&
      previous.confidence === next.confidence &&
      previous.activeInstrument === next.activeInstrument
    ) {
      return;
    }

    for (const listener of this.#stateListeners) listener(next);
  }
}

function confidenceFor(source: InputSource, confidence?: number): number {
  if (source === "midi") return 1;
  if (source === "audio") return Math.min(1, Math.max(0, confidence ?? 0.7));
  if (source === "onscreen") return 0.8;
  return 0.6;
}

function performanceNow() {
  return (globalThis.performance?.now() ??
    Date.now()) as number as import("@repo/music-core/domain").MonotonicMs;
}
