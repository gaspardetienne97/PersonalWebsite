import type { InputSource, NoteEvent, Score, ScoreNote } from "@repo/music-core/domain";

export interface TakeNote {
  midi: number;
  /** Milliseconds from the start of the take. */
  atMs: number;
  velocity: number;
  /** Gate time in milliseconds. Absent when no note-off arrived before the take ended. */
  durationMs?: number;
}

export interface Take {
  id: string;
  name: string;
  source: InputSource;
  notes: TakeNote[];
  durationMs: number;
  /** Optional one-line note the player attaches to the take. */
  note?: string;
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

/** Gate time used when a note-off never arrived before the take ended. */
export const DEFAULT_TAKE_NOTE_DURATION_BEATS = 0.5;

/**
 * In-session MIDI/on-screen take recorder. Captures note-on and note-off events
 * with timing relative to the take start; supports listing, renaming, removal,
 * and take-vs-take pitch comparison for self-review.
 */
export class RecordingSession {
  #takes: Take[] = [];
  #recording = false;
  #buffer: TakeNote[] = [];
  /** Pitch -> index in #buffer of the note-on still waiting for its note-off. */
  #open = new Map<number, number>();
  #startMs = 0;
  #source: InputSource = "midi";
  #counter = 0;

  get recording(): boolean {
    return this.#recording;
  }

  start(atMs: number): void {
    this.#recording = true;
    this.#buffer = [];
    this.#open.clear();
    this.#startMs = atMs;
  }

  capture(event: NoteEvent): void {
    if (!this.#recording) return;
    if (event.type !== "noteOn" && event.type !== "noteOff") return;
    const atMs = Math.max(0, Number(event.timestamp) - this.#startMs);

    if (event.type === "noteOff") {
      const index = this.#open.get(event.midiNote);
      const note = index === undefined ? undefined : this.#buffer[index];
      // A stray note-off contributed no note, so it cannot claim the take's source.
      if (!note) return;
      note.durationMs = Math.max(0, atMs - note.atMs);
      this.#open.delete(event.midiNote);
      return;
    }

    this.#source = event.source;
    this.#open.set(event.midiNote, this.#buffer.length);
    this.#buffer.push({ midi: event.midiNote, atMs, velocity: event.velocity });
  }

  stop(atMs: number, name?: string): Take {
    this.#recording = false;
    this.#open.clear();
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

  /** Rename a take. A blank name is ignored so a card can never lose its label. */
  renameTake(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.#patch(id, (take) => ({ ...take, name: trimmed }));
  }

  /** Attach (or, with a blank value, clear) the take's one-line note. */
  setTakeNote(id: string, note: string): void {
    const trimmed = note.trim();
    this.#patch(id, ({ note: _previous, ...take }) =>
      trimmed ? { ...take, note: trimmed } : { ...take },
    );
  }

  #patch(id: string, update: (take: Take) => Take): void {
    this.#takes = this.#takes.map((take) => (take.id === id ? update(take) : take));
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
 * given tempo; a note with no captured note-off keeps the fixed default length.
 */
export function takeToScore(take: Take, bpm: number): Score {
  const msPerBeat = 60000 / Math.max(1, bpm);
  const notes: ScoreNote[] = take.notes.map((note) => ({
    midiNote: note.midi,
    startBeat: note.atMs / msPerBeat,
    durationBeats:
      note.durationMs === undefined
        ? DEFAULT_TAKE_NOTE_DURATION_BEATS
        : Math.max(0.01, note.durationMs / msPerBeat),
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

export interface TakeRollNote {
  midi: number;
  /** Unit-box geometry: x/width across the take, y/height down from the highest pitch. */
  x: number;
  y: number;
  width: number;
  height: number;
  hand: "left" | "right";
}

export interface TakeRoll {
  notes: TakeRollNote[];
  /** Unit y of the middle-C guide line, absent when middle C is outside the take. */
  middleCY?: number;
  lowMidi: number;
  highMidi: number;
}

const MIDDLE_C = 60;
/** A note with no note-off still needs a visible sliver on the roll. */
const MIN_ROLL_NOTE_WIDTH = 0.02;
const FALLBACK_ROLL_NOTE_FRACTION = 0.04;

/**
 * Lay a take out as a mini piano roll inside a 0..1 box: x is time, y is pitch
 * with the highest note at the top, and the hand follows the register so the
 * card can colour it with the shared hand tokens.
 */
export function buildTakeRoll(take: Take): TakeRoll {
  const pitches = take.notes.map((note) => note.midi);
  const lowMidi = pitches.length > 0 ? Math.min(...pitches) : MIDDLE_C - 12;
  const highMidi = pitches.length > 0 ? Math.max(...pitches) : MIDDLE_C + 12;
  const rows = highMidi - lowMidi + 1;
  const height = 1 / rows;
  const spanMs = Math.max(
    1,
    take.durationMs,
    ...take.notes.map((note) => note.atMs + (note.durationMs ?? 0)),
  );

  const notes = take.notes.map((note) => {
    // Leave room for the minimum width: a note struck on the last millisecond still shows.
    const x = Math.min(1 - MIN_ROLL_NOTE_WIDTH, note.atMs / spanMs);
    const rawWidth = (note.durationMs ?? spanMs * FALLBACK_ROLL_NOTE_FRACTION) / spanMs;
    return {
      midi: note.midi,
      x,
      y: (highMidi - note.midi) * height,
      width: Math.min(1 - x, Math.max(MIN_ROLL_NOTE_WIDTH, rawWidth)),
      height,
      hand: note.midi < MIDDLE_C ? ("left" as const) : ("right" as const),
    };
  });

  return {
    notes,
    // Only guide the eye when middle C is really in range; pinning it to an edge would lie.
    middleCY:
      lowMidi <= MIDDLE_C && MIDDLE_C <= highMidi
        ? (highMidi - MIDDLE_C + 0.5) * height
        : undefined,
    lowMidi,
    highMidi,
  };
}
