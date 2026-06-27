import type { Score } from "@repo/music-core/domain";
import { noteToMidi } from "@repo/music-core/engines/theory";

export interface TranscriptionSource {
  kind: "audio-file" | "manual";
  name: string;
  mimeType?: string;
  durationSec?: number;
}

export interface TranscriptionDraftNote {
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  confidence: number;
}

export interface ExtractedTranscriptionNote {
  midiNote: number;
  startSec: number;
  durationSec: number;
  confidence?: number;
}

export interface TranscriptionDraft {
  id: string;
  title: string;
  bpm: number;
  source?: TranscriptionSource;
  notes: TranscriptionDraftNote[];
}

export interface ParseManualTranscriptionOptions {
  id: string;
  title: string;
  bpm: number;
  source?: TranscriptionSource;
}

export function parseManualTranscription(
  text: string,
  options: ParseManualTranscriptionOptions,
): TranscriptionDraft {
  const notes = text
    .split(/\r?\n/)
    .map((line, index) => parseLine(line, index + 1))
    .filter((note): note is TranscriptionDraftNote => note !== undefined);
  return {
    id: options.id,
    title: options.title,
    bpm: options.bpm,
    ...(options.source ? { source: options.source } : {}),
    notes,
  };
}

export function extractedNotesToDraft(
  notes: ExtractedTranscriptionNote[],
  options: ParseManualTranscriptionOptions,
): TranscriptionDraft {
  const beatsPerSecond = options.bpm / 60;
  return {
    id: options.id,
    title: options.title,
    bpm: options.bpm,
    ...(options.source ? { source: options.source } : {}),
    notes: notes.map((note) => ({
      midiNote: note.midiNote,
      startBeat: round(note.startSec * beatsPerSecond),
      durationBeats: round(note.durationSec * beatsPerSecond),
      confidence: clamp01(note.confidence ?? 1),
    })),
  };
}

export function transcriptionDraftToScore(draft: TranscriptionDraft): Score {
  const notes = draft.notes
    .map((note) => ({
      midiNote: note.midiNote,
      startBeat: round(note.startBeat),
      durationBeats: round(note.durationBeats),
      velocity: note.confidence,
      voiceId: "transcribed-melody",
    }))
    .sort((left, right) => left.startBeat - right.startBeat || left.midiNote - right.midiNote);
  const endBeat = Math.max(0, ...notes.map((note) => note.startBeat + note.durationBeats));

  return {
    id: `${draft.id}-score`,
    title: draft.title,
    origin: "audio-transcription",
    tempoMap: [{ atBeat: 0, bpm: draft.bpm }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "transcribed-melody", name: "Transcribed melody", role: "melody" }],
    notes,
    chords: [],
    sections: [
      {
        id: "full-transcription",
        name: "Full transcription",
        startBeat: 0,
        endBeat,
      },
    ],
    markers: [],
  };
}

function parseLine(line: string, lineNumber: number): TranscriptionDraftNote | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  const [noteName, start, duration] = trimmed.split(/\s+/);
  if (!noteName || start === undefined || duration === undefined) {
    throw new Error(`Line ${lineNumber}: expected "NOTE START_BEAT DURATION_BEATS".`);
  }
  const startBeat = Number(start);
  const durationBeats = Number(duration);
  if (!Number.isFinite(startBeat) || !Number.isFinite(durationBeats) || durationBeats <= 0) {
    throw new Error(`Line ${lineNumber}: start and duration must be valid beats.`);
  }
  return {
    midiNote: noteToMidi(noteName),
    startBeat,
    durationBeats,
    confidence: 1,
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
