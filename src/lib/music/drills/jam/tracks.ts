// User-supplied backing tracks (catalog weakness 20): the audio lives in OPFS
// at music-backing-<id>, the row in db.backingTracks.
import { m } from "@repo/i18n/messages.js";
import {
  audio,
  db,
  getBinary,
  putBinary,
  type BackingTrackRow,
  type SequenceHandle,
} from "#lib/music/runtime/index.ts";

export const MAX_TRACK_BYTES = 250 * 1024 * 1024;

export interface BackingTrack extends BackingTrackRow {
  mimeType: string;
  size: number;
}

export const trackKey = (id: string) => `music-backing-${id}`;

export async function listTracks(): Promise<BackingTrack[]> {
  return (await db.backingTracks.orderBy("createdAt").reverse().toArray()) as BackingTrack[];
}

export async function importTrack(file: File): Promise<BackingTrack> {
  if (
    !file.type.startsWith("audio/") &&
    !/\.(mp3|wav|m4a|aac|ogg|oga|flac|aiff?)$/i.test(file.name)
  )
    throw new Error(m.music_drills_jam_tracks_not_audio({ name: file.name }));
  if (file.size > MAX_TRACK_BYTES)
    throw new Error(m.music_drills_jam_tracks_too_big({ name: file.name }));
  const row: BackingTrack = {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ""),
    createdAt: Date.now(),
    mimeType: file.type || "audio/mpeg",
    size: file.size,
  };
  // The file first: a row without its audio would be a track that never plays.
  await putBinary(trackKey(row.id), file);
  await db.backingTracks.put(row);
  return row;
}

export async function playTrack(id: string): Promise<SequenceHandle> {
  const blob = await getBinary(trackKey(id));
  if (!blob) throw new Error(m.music_drills_jam_tracks_missing());
  return audio.playBlob(blob);
}
