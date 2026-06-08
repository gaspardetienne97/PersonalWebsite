import type { InputSource, NoteEvent } from "@repo/music-core/domain";

export interface TakeNote {
  midi: number;
  /** Milliseconds from the start of the take. */
  atMs: number;
  velocity: number;
}

export interface Take {
  id: string;
  name: string;
  source: InputSource;
  notes: TakeNote[];
  durationMs: number;
}

export interface TakeComparison {
  total: number;
  matched: number;
  accuracy: number;
}

/**
 * In-session MIDI/on-screen take recorder. Captures note-on events with
 * timing relative to the take start; supports listing, removal, and take-vs-take
 * pitch comparison for self-review. No audio is recorded (Phase 2).
 */
export class RecordingSession {
  #takes: Take[] = [];
  #recording = false;
  #buffer: TakeNote[] = [];
  #startMs = 0;
  #source: InputSource = "midi";
  #counter = 0;

  get recording(): boolean {
    return this.#recording;
  }

  start(atMs: number): void {
    this.#recording = true;
    this.#buffer = [];
    this.#startMs = atMs;
  }

  capture(event: NoteEvent): void {
    if (!this.#recording || event.type !== "noteOn") return;
    this.#source = event.source;
    this.#buffer.push({
      midi: event.midiNote,
      atMs: Math.max(0, Number(event.timestamp) - this.#startMs),
      velocity: event.velocity,
    });
  }

  stop(atMs: number, name?: string): Take {
    this.#recording = false;
    this.#counter += 1;
    const take: Take = {
      id: `take-${this.#counter}`,
      name: name ?? `Take ${this.#counter}`,
      source: this.#source,
      notes: [...this.#buffer],
      durationMs: Math.max(0, atMs - this.#startMs),
    };
    this.#takes = [take, ...this.#takes];
    this.#buffer = [];
    return take;
  }

  takes(): Take[] {
    return this.#takes.map((take) => ({ ...take, notes: [...take.notes] }));
  }

  take(id: string): Take | undefined {
    const found = this.#takes.find((take) => take.id === id);
    return found ? { ...found, notes: [...found.notes] } : undefined;
  }

  remove(id: string): void {
    this.#takes = this.#takes.filter((take) => take.id !== id);
  }

  compare(aId: string, bId: string): TakeComparison {
    const a = this.#takes.find((take) => take.id === aId);
    const b = this.#takes.find((take) => take.id === bId);
    if (!a || !b) return { total: 0, matched: 0, accuracy: 0 };

    const total = Math.max(a.notes.length, b.notes.length);
    const overlap = Math.min(a.notes.length, b.notes.length);
    let matched = 0;
    for (let i = 0; i < overlap; i += 1) {
      if (a.notes[i]!.midi === b.notes[i]!.midi) matched += 1;
    }
    return { total, matched, accuracy: total === 0 ? 0 : matched / total };
  }
}
