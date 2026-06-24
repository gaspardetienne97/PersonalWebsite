import type { Score, UnixMs } from "@repo/music-core/domain";
import { unixMs } from "@repo/music-core/domain";
import type { ImportedSong } from "@repo/music-core/engines/import";
import { scoreFromImportedSong } from "@repo/music-core/engines/score-import";
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
      score: scoreFromImportedSong(song, id),
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

export function scorePlaybackPattern(score: Score): SoundPatternStep[] {
  return [...score.notes]
    .sort((left, right) => left.startBeat - right.startBeat)
    .map((note) => {
      const offsetSeconds = secondsAtBeat(note.startBeat, score.tempoMap);
      const endSeconds = secondsAtBeat(note.startBeat + note.durationBeats, score.tempoMap);
      return {
        midiNotes: [note.midiNote],
        offsetSeconds: round(offsetSeconds),
        durationSeconds: round(endSeconds - offsetSeconds),
      };
    });
}

function secondsAtBeat(beat: number, tempoMap: Score["tempoMap"]): number {
  const markers = [...tempoMap].sort((left, right) => left.atBeat - right.atBeat);
  let currentBeat = 0;
  let bpm = markers[0]?.bpm ?? 120;
  let seconds = 0;

  for (const marker of markers) {
    if (marker.atBeat <= currentBeat) {
      bpm = marker.bpm;
      continue;
    }
    const segmentEnd = Math.min(beat, marker.atBeat);
    seconds += ((segmentEnd - currentBeat) * 60) / bpm;
    if (beat <= marker.atBeat) return seconds;
    currentBeat = marker.atBeat;
    bpm = marker.bpm;
  }

  return seconds + ((beat - currentBeat) * 60) / bpm;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
