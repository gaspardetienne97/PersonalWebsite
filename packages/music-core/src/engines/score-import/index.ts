import type { Score, ScoreVoice } from "@repo/music-core/domain";
import {
  parseMidiFile,
  type ImportedSong,
  type ImportedTrack,
} from "@repo/music-core/engines/import";

export { parseMusicXmlScore, type ParseMusicXmlScoreOptions } from "./musicxml";
export { extractCompressedMusicXml } from "./mxl";

export interface ParseMidiScoreOptions {
  id: string;
  fallbackName?: string;
}

export function parseMidiScore(data: ArrayBuffer, options: ParseMidiScoreOptions): Score {
  return scoreFromImportedSong(parseMidiFile(data, options.fallbackName ?? "Untitled"), options.id);
}

export function scoreFromImportedSong(song: ImportedSong, id: string): Score {
  const beatsPerSecond = song.bpm / 60;
  const hasBeatNativeTiming = song.tracks.some((track) =>
    track.notes.some((note) => note.startBeat !== undefined || note.durationBeats !== undefined),
  );
  const voices = song.tracks.map((track, index) => ({
    id: `voice-${index + 1}`,
    name: track.name || `Track ${index + 1}`,
    role: roleForTrack(track),
  })) satisfies ScoreVoice[];

  const notes = song.tracks.flatMap((track, trackIndex) =>
    track.notes.map((note) => ({
      midiNote: note.midi,
      startBeat: round(note.startBeat ?? note.time * beatsPerSecond),
      durationBeats: round(note.durationBeats ?? note.duration * beatsPerSecond),
      velocity: note.velocity,
      voiceId: voices[trackIndex]!.id,
    })),
  );
  const noteEndBeat = Math.max(0, ...notes.map((note) => note.startBeat + note.durationBeats));
  const fallbackEndBeat = round(song.durationSec * beatsPerSecond);

  return {
    id,
    title: song.name,
    origin: "midi",
    keySignature: song.keyEstimate,
    tempoMap: song.tempoMap?.length
      ? song.tempoMap.map(({ atBeat, bpm }) => ({ atBeat, bpm }))
      : [{ atBeat: 0, bpm: song.bpm }],
    timeSignatures: song.timeSignatures?.length
      ? song.timeSignatures.map(({ atBeat, numerator, denominator }) => ({
          atBeat,
          numerator,
          denominator,
        }))
      : [
          {
            atBeat: 0,
            numerator: song.timeSignature[0],
            denominator: song.timeSignature[1],
          },
        ],
    voices,
    notes,
    chords: [],
    sections: [
      {
        id: "full-song",
        name: "Full song",
        startBeat: 0,
        endBeat: hasBeatNativeTiming
          ? noteEndBeat || fallbackEndBeat
          : Math.max(noteEndBeat, fallbackEndBeat),
      },
    ],
    markers: [],
  };
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
