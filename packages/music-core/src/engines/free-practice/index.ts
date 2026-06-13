import type {
  InputSource,
  InstrumentId,
  MonotonicMs,
  NoteEvent,
  UnixMs,
} from "@repo/music-core/domain";

const RECENT_NOTE_LIMIT = 8;

export interface FreePracticeSessionOptions {
  id: string;
  instrument: InstrumentId;
  startedAt: UnixMs;
  startedAtMonotonic: MonotonicMs;
}

export interface FreePracticeNote {
  midiNote: number;
  velocity: number;
  source: InputSource;
  offsetMs: number;
}

export interface FreePracticeState {
  id: string;
  status: "recording" | "stopped";
  instrument: InstrumentId;
  startedAt: UnixMs;
  noteCount: number;
  distinctNoteCount: number;
  lowestMidiNote?: number;
  highestMidiNote?: number;
  recentNotes: FreePracticeNote[];
  sourceCounts: Partial<Record<InputSource, number>>;
}

export interface FreePracticeResult extends FreePracticeState {
  status: "stopped";
  endedAt: UnixMs;
  durationMs: number;
}

export class FreePracticeSession {
  readonly #id: string;
  readonly #instrument: InstrumentId;
  readonly #startedAt: UnixMs;
  readonly #startedAtMonotonic: MonotonicMs;
  readonly #distinctNotes = new Set<number>();
  readonly #sourceCounts: Partial<Record<InputSource, number>> = {};
  readonly #recentNotes = new Array<FreePracticeNote | undefined>(RECENT_NOTE_LIMIT);
  #status: FreePracticeState["status"] = "recording";
  #noteCount = 0;
  #lowestMidiNote: number | undefined;
  #highestMidiNote: number | undefined;
  #recentNoteCount = 0;
  #recentNoteStart = 0;

  constructor(options: FreePracticeSessionOptions) {
    this.#id = options.id;
    this.#instrument = options.instrument;
    this.#startedAt = options.startedAt;
    this.#startedAtMonotonic = options.startedAtMonotonic;
  }

  get state(): FreePracticeState {
    return this.#snapshot(this.#status);
  }

  accept(event: NoteEvent): void {
    this.#assertRecording();
    if (
      event.type !== "noteOn" ||
      !Number.isInteger(event.midiNote) ||
      event.midiNote < 0 ||
      event.midiNote > 127 ||
      !Number.isFinite(event.velocity) ||
      !Number.isFinite(event.timestamp) ||
      event.timestamp < this.#startedAtMonotonic
    ) {
      return;
    }

    this.#noteCount += 1;
    this.#distinctNotes.add(event.midiNote);
    this.#lowestMidiNote = Math.min(this.#lowestMidiNote ?? event.midiNote, event.midiNote);
    this.#highestMidiNote = Math.max(this.#highestMidiNote ?? event.midiNote, event.midiNote);
    this.#sourceCounts[event.source] = (this.#sourceCounts[event.source] ?? 0) + 1;
    this.#appendRecentNote({
      midiNote: event.midiNote,
      velocity: event.velocity,
      source: event.source,
      offsetMs: Number(event.timestamp) - Number(this.#startedAtMonotonic),
    });
  }

  stop(endedAt: UnixMs): FreePracticeResult {
    this.#assertRecording();
    this.#status = "stopped";
    return {
      ...this.#snapshot("stopped"),
      status: "stopped",
      endedAt,
      durationMs: Math.max(0, Number(endedAt) - Number(this.#startedAt)),
    };
  }

  #appendRecentNote(note: FreePracticeNote): void {
    if (this.#recentNoteCount < RECENT_NOTE_LIMIT) {
      const index = (this.#recentNoteStart + this.#recentNoteCount) % RECENT_NOTE_LIMIT;
      this.#recentNotes[index] = note;
      this.#recentNoteCount += 1;
      return;
    }

    this.#recentNotes[this.#recentNoteStart] = note;
    this.#recentNoteStart = (this.#recentNoteStart + 1) % RECENT_NOTE_LIMIT;
  }

  #snapshot(status: FreePracticeState["status"]): FreePracticeState {
    const recentNotes = Array.from({ length: this.#recentNoteCount }, (_, offset) => {
      const index = (this.#recentNoteStart + offset) % RECENT_NOTE_LIMIT;
      return { ...this.#recentNotes[index]! };
    });

    return {
      id: this.#id,
      status,
      instrument: this.#instrument,
      startedAt: this.#startedAt,
      noteCount: this.#noteCount,
      distinctNoteCount: this.#distinctNotes.size,
      lowestMidiNote: this.#lowestMidiNote,
      highestMidiNote: this.#highestMidiNote,
      recentNotes,
      sourceCounts: { ...this.#sourceCounts },
    };
  }

  #assertRecording(): void {
    if (this.#status === "stopped") {
      throw new Error("FreePracticeSession is already stopped");
    }
  }
}
