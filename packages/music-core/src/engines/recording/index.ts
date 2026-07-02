import type { InputSource, NoteEvent, Score, ScoreNote } from "@repo/music-core/domain";

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

export interface TakeDensityBucket {
  index: number;
  startMs: number;
  endMs: number;
  count: number;
  intensity: number;
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

  /** Reload persisted takes (most-recent first) and keep the id counter ahead
   *  of them so newly recorded takes don't collide with restored ids. */
  restore(takes: Take[]): void {
    this.#takes = takes.map((take) => ({ ...take, notes: [...take.notes] }));
    this.#counter = takes.reduce((max, take) => {
      const n = Number(take.id.replace(/^take-/, ""));
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, this.#counter);
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

/**
 * Convert a recorded {@link Take} into a canonical {@link Score} so it can flow
 * into the MIDI/audio export engines. Millisecond timestamps become beats at the
 * given tempo.
 *
 * ponytail: note-off isn't captured, so every note gets a fixed eighth-note
 * length. Upgrade path: capture noteOff in `RecordingSession` and use the real
 * gate time if held-note fidelity matters.
 */
export function takeToScore(take: Take, bpm: number): Score {
  const msPerBeat = 60000 / Math.max(1, bpm);
  const durationBeats = 0.5;
  const notes: ScoreNote[] = take.notes.map((note) => ({
    midiNote: note.midi,
    startBeat: note.atMs / msPerBeat,
    durationBeats,
    velocity: note.velocity,
    voiceId: take.source,
  }));
  return {
    id: take.id,
    title: take.name,
    origin: "midi",
    tempoMap: [{ atBeat: 0, bpm }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: take.source, name: take.name, role: "other" }],
    notes,
    chords: [],
    sections: [],
    markers: [],
  };
}

export function buildTakeDensity(take: Take, bucketCount = 16): TakeDensityBucket[] {
  const count = Math.max(1, Math.round(bucketCount));
  const durationMs = Math.max(1, take.durationMs, ...take.notes.map((note) => note.atMs));
  const bucketMs = durationMs / count;
  const buckets = Array.from({ length: count }, (_, index) => ({
    index,
    startMs: Math.round(index * bucketMs),
    endMs: Math.round((index + 1) * bucketMs),
    count: 0,
    intensity: 0,
  }));

  for (const note of take.notes) {
    const index = Math.min(count - 1, Math.max(0, Math.floor(note.atMs / bucketMs)));
    buckets[index]!.count += 1;
  }

  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return buckets.map((bucket) => ({
    ...bucket,
    intensity: bucket.count / maxCount,
  }));
}
