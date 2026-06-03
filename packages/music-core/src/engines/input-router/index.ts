import type { InputSource, InstrumentId, NoteEvent } from "@repo/music-core/domain";

type Listener = (event: NoteEvent) => void;

export class InputRouter {
  #events: NoteEvent[] = [];
  #listeners = new Set<Listener>();
  #activeSource: InputSource = "onscreen";
  #confidence = 0;

  get activeSource(): InputSource {
    return this.#activeSource;
  }

  get confidence(): number {
    return this.#confidence;
  }

  get events(): NoteEvent[] {
    return [...this.#events];
  }

  push(event: NoteEvent): void {
    this.#events.push(event);
    this.#activeSource = chooseSource(this.#activeSource, event.source);
    this.#confidence = confidenceFor(this.#activeSource);
    for (const listener of this.#listeners) listener(event);
  }

  noteOn(midiNote: number, source: InputSource = "onscreen", instrument?: InstrumentId): NoteEvent {
    const event: NoteEvent = {
      type: "noteOn",
      midiNote,
      velocity: 1,
      source,
      timestamp: performanceNow(),
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
}

function chooseSource(current: InputSource, incoming: InputSource): InputSource {
  const rank: Record<InputSource, number> = { midi: 4, audio: 3, onscreen: 2, click: 1 };
  return rank[incoming] >= rank[current] ? incoming : current;
}

function confidenceFor(source: InputSource): number {
  if (source === "midi") return 1;
  if (source === "audio") return 0.7;
  if (source === "onscreen") return 0.8;
  return 0.6;
}

function performanceNow() {
  return (globalThis.performance?.now() ??
    Date.now()) as number as import("@repo/music-core/domain").MonotonicMs;
}
