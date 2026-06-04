import type { InputSource, InstrumentId, NoteEvent } from "@repo/music-core/domain";

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

export class InputRouter {
  #events: NoteEvent[] = [];
  #listeners = new Set<Listener>();
  #stateListeners = new Set<StateListener>();
  #activeSource: InputSource = "onscreen";
  #confidence = confidenceFor("onscreen");
  #activeInstrument?: InstrumentId;
  #lastMidiActivity = new Map<MidiActivityKey, number>();
  #midiActivityWindowMs: number;
  #now: () => number;

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

  setActiveInstrument(instrument?: InstrumentId): void {
    const previous = this.state;
    this.#activeInstrument = instrument;

    if (this.#activeSource === "midi" && !this.#hasRecentMidi()) {
      this.#activeSource = "onscreen";
      this.#confidence = confidenceFor("onscreen");
    }

    this.#notifyStateIfChanged(previous);
  }

  push(event: NoteEvent): boolean {
    if (!this.#accepts(event)) return false;

    const previous = this.state;
    this.#events.push(event);

    if (event.source !== "click") {
      this.#activeSource = event.source;
      this.#confidence = confidenceFor(event.source, event.confidence);
    }

    for (const listener of this.#listeners) listener(event);
    this.#notifyStateIfChanged(previous);
    return true;
  }

  noteOn(midiNote: number, source: InputSource = "onscreen", instrument?: InstrumentId): NoteEvent {
    const event: NoteEvent = {
      type: "noteOn",
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

      this.#lastMidiActivity.set(event.instrument ?? "generic", this.#now());
      return true;
    }

    return !this.#hasRecentMidi();
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
