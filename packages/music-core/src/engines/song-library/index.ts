import type { Score, ScoreVoice, UnixMs } from "@repo/music-core/domain";
import { unixMs } from "@repo/music-core/domain";
import type { ImportedSong, ImportedTrack } from "@repo/music-core/engines/import";
import type { SoundPatternStep } from "@repo/music-core/engines/sound";
import type { PracticeStore, SongRow } from "@repo/music-core/engines/store";

export interface SongLibraryOptions {
  now?: () => UnixMs;
  makeId?: () => string;
}

export class SongLibrary {
  readonly #now: () => UnixMs;
  readonly #makeId: () => string;

  constructor(
    private readonly store: PracticeStore,
    options: SongLibraryOptions = {},
  ) {
    this.#now = options.now ?? (() => unixMs(Date.now()));
    this.#makeId = options.makeId ?? (() => `song-${crypto.randomUUID()}`);
  }

  async saveImportedSong(song: ImportedSong): Promise<SongRow> {
    const now = this.#now();
    const id = this.#makeId();
    const row: SongRow = {
      id,
      title: song.name,
      score: importedSongToScore(song, id),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.songs.put(row);
    return structuredClone(row);
  }

  async list(): Promise<SongRow[]> {
    const rows = await this.store.songs.all();
    return rows.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  }

  async get(id: string): Promise<SongRow | undefined> {
    return this.store.songs.get(id);
  }

  async delete(id: string): Promise<void> {
    await this.store.songs.delete(id);
  }
}

export function importedSongToScore(song: ImportedSong, id: string): Score {
  const beatsPerSecond = song.bpm / 60;
  const voices = song.tracks.map((track, index) => ({
    id: `voice-${index + 1}`,
    name: track.name || `Track ${index + 1}`,
    role: roleForTrack(track),
  })) satisfies ScoreVoice[];

  const notes = song.tracks.flatMap((track, trackIndex) =>
    track.notes.map((note) => ({
      midiNote: note.midi,
      startBeat: round(note.time * beatsPerSecond),
      durationBeats: round(note.duration * beatsPerSecond),
      velocity: note.velocity,
      voiceId: voices[trackIndex]!.id,
    })),
  );

  return {
    id,
    title: song.name,
    origin: "midi",
    keySignature: song.keyEstimate,
    tempoMap: [{ atBeat: 0, bpm: song.bpm }],
    timeSignatures: [
      { atBeat: 0, numerator: song.timeSignature[0], denominator: song.timeSignature[1] },
    ],
    voices,
    notes,
    chords: [],
    sections: [
      {
        id: "full-song",
        name: "Full song",
        startBeat: 0,
        endBeat: round(song.durationSec * beatsPerSecond),
      },
    ],
    markers: [],
  };
}

export function scorePlaybackPattern(score: Score): SoundPatternStep[] {
  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const secondsPerBeat = 60 / bpm;
  return [...score.notes]
    .sort((left, right) => left.startBeat - right.startBeat)
    .map((note) => ({
      midiNotes: [note.midiNote],
      offsetSeconds: round(note.startBeat * secondsPerBeat),
      durationSeconds: round(note.durationBeats * secondsPerBeat),
    }));
}

function roleForTrack(track: ImportedTrack): ScoreVoice["role"] {
  const name = track.name.toLowerCase();
  if (name.includes("bass")) return "bass";
  if (name.includes("drum") || name.includes("perc")) return "drums";
  if (name.includes("melody") || name.includes("lead")) return "melody";
  return "other";
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
