// Saved repertoire: the db.songs row shape, file import into the canonical
// score, and the facts a song card or Song Studio shows about a score.
import { m } from "@repo/i18n/messages.js";
import { noteName, type Score, type ScoreSection } from "@repo/music-core";
import { midiToScore } from "@repo/music-core/io/midi-file";
import { parseMusicXml, parseMxl } from "@repo/music-core/io/musicxml";
import { barBeats } from "#lib/music/notation/groups.ts";
import { db } from "#lib/music/runtime/index.ts";

export type Song = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  score: Score;
  composer?: string;
  /** The file it came from, or "transcribed" / "typed". */
  source?: string;
  /** The path shelf entry this song is for (`<path>/<song id>`), so its performances count there. */
  shelf?: string;
};

export const SCORE_ACCEPT = ".mid,.midi,.musicxml,.xml,.mxl";

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").trim() || "Untitled";

/** Read a MIDI, MusicXML or .mxl file into the canonical score. Throws a plain sentence. */
export async function importScoreFile(name: string, bytes: Uint8Array): Promise<Score> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  let score: Score;
  if (ext === "mid" || ext === "midi") score = midiToScore(bytes, baseName(name));
  else if (ext === "musicxml" || ext === "xml")
    score = parseMusicXml(new TextDecoder().decode(bytes));
  else if (ext === "mxl") score = await parseMxl(bytes);
  else throw new Error(m.music_hubs_songs_not_score({ name }));
  if (!score.voices.some((v) => v.notes.length))
    throw new Error(m.music_hubs_songs_no_notes({ name }));
  if (!score.title?.trim() || /^untitled/i.test(score.title))
    score = { ...score, title: baseName(name) };
  return score;
}

export function songFromScore(
  score: Score,
  meta: { composer?: string; source?: string } = {},
  now = Date.now(),
): Song {
  return {
    id: score.id || crypto.randomUUID(),
    title: score.title,
    createdAt: now,
    updatedAt: now,
    score,
    composer: meta.composer || score.composer || undefined,
    source: meta.source,
  };
}

const MAJOR = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];

export function keyName(score: Pick<Score, "keyFifths" | "keyMode">): string | null {
  if (score.keyFifths === undefined) return null;
  const minor = score.keyMode === "minor";
  const tonic = (minor ? MINOR : MAJOR)[score.keyFifths + 7];
  return minor ? m.music_hubs_songs_key_minor({ tonic }) : m.music_hubs_songs_key_major({ tonic });
}

export interface ScoreFacts {
  voices: number;
  bars: number;
  notes: number;
  low: number | null;
  high: number | null;
  seconds: number;
  key: string | null;
  meter: string;
}

export function scoreFacts(score: Score): ScoreFacts {
  const notes = score.voices.flatMap((v) => v.notes.filter((n) => !n.tieFrom));
  // Drum notes name drums, so the range is the pitched parts'.
  const midis = score.voices.filter((v) => !v.drums).flatMap((v) => v.notes.map((n) => n.midi));
  return {
    voices: score.voices.length,
    bars: Math.max(1, Math.ceil(score.lengthBeats / barBeats(score.meter) - 1e-6)),
    notes: notes.length,
    low: midis.length ? Math.min(...midis) : null,
    high: midis.length ? Math.max(...midis) : null,
    seconds: Math.round((score.lengthBeats * 60) / score.bpm),
    // A drum part has no key.
    key: score.voices.every((v) => v.drums) ? null : keyName(score),
    meter: `${score.meter.beats}/${score.meter.beatUnit}`,
  };
}

export const rangeText = (f: ScoreFacts) =>
  f.low === null || f.high === null
    ? f.notes
      ? m.music_hubs_songs_drums_only()
      : m.music_hubs_songs_no_notes_range()
    : m.music_hubs_songs_range({ low: noteName(f.low), high: noteName(f.high) });

export const durationText = (s: number) =>
  s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;

/**
 * The score's own sections, or four-bar phrases when it has none, so the
 * Sections range always has something to pick.
 */
export function songSections(score: Score): ScoreSection[] {
  if (score.sections?.length) return score.sections;
  const bar = barBeats(score.meter);
  const bars = Math.max(1, Math.ceil(score.lengthBeats / bar - 1e-6));
  const out: ScoreSection[] = [];
  for (let b = 0; b < bars; b += 4) {
    const last = Math.min(bars, b + 4);
    out.push({
      // English on purpose: Song Studio builds its stored setup keys from these labels.
      label: last - b === 1 ? `Bar ${b + 1}` : `Bars ${b + 1} to ${last}`,
      startBeat: b * bar,
      endBeat: last * bar,
    });
  }
  return out;
}

export const barsText = (n: number) => m.music_hubs_songs_bars({ count: n });

/** The library song saved for a shelf entry (`<path>/<song>`), if any. */
export async function shelfSong(key: string): Promise<Song | undefined> {
  const songs = (await db.songs.toArray()) as unknown as Song[];
  return songs.find((s) => s.shelf === key);
}

/** A shelf song's downloaded score, read from the server (not saved anywhere). */
export async function shelfScore(
  key: string,
  title: string,
): Promise<{ score: Score; name: string }> {
  const res = await fetch(`/api/music/scores/${key}`);
  if (!res.ok) throw new Error(m.music_hubs_songs_not_downloaded({ title }));
  const name =
    res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    `${key.split("/")[1]}.mxl`;
  return { score: await importScoreFile(name, new Uint8Array(await res.arrayBuffer())), name };
}

/** Read a shelf song's downloaded score from the server into the library, tagged for its shelf. */
export async function addShelfSong(key: string, title: string, artist?: string): Promise<Song> {
  const { score, name } = await shelfScore(key, title);
  const song = {
    ...songFromScore({ ...score, title }, { composer: artist, source: name }),
    shelf: key,
  };
  await db.songs.put(song);
  return song;
}

/**
 * A song's Song Studio history for its card: the best scored run, the last time it was
 * played, and how many runs. Runs that wrote no score (nothing heard) count as played only.
 */
export function songHistory(
  runs: readonly {
    exerciseId: string;
    params: Record<string, string | number | boolean>;
    endedAt: number;
    score?: number;
  }[],
  song: Pick<Song, "id" | "shelf">,
): { runs: number; best: number | null; lastAt: number | null } {
  let n = 0;
  let best: number | null = null;
  let lastAt: number | null = null;
  for (const r of runs) {
    if (r.exerciseId !== "song.studio") continue;
    if (r.params.song !== song.id && !(song.shelf && r.params.shelf === song.shelf)) continue;
    n++;
    if (r.score !== undefined && (best === null || r.score > best)) best = r.score;
    if (lastAt === null || r.endedAt > lastAt) lastAt = r.endedAt;
  }
  return { runs: n, best, lastAt };
}

/** A shelf song's own facts as card tags: its key, its tempo and how hard it is. */
export function shelfTags(song: { detail?: string; bpm?: number; diff?: number }): string[] {
  const key = /^([A-G][#b]?(?: (?:minor|major|dorian|mixolydian))?)(?=[,( ]|$)/.exec(
    song.detail ?? "",
  )?.[1];
  const level =
    song.diff === undefined
      ? undefined
      : song.diff <= 1
        ? m.music_hubs_songs_easier()
        : song.diff === 2
          ? m.music_hubs_songs_medium()
          : m.music_hubs_songs_harder();
  return [key && m.music_hubs_songs_key_of({ key }), song.bpm && `${song.bpm} BPM`, level].filter(
    (t): t is string => !!t,
  );
}

/** Shelf shorthand said plainly: RH and LH become right hand and left hand. */
/** A shelf song's "teaches" note in plain words, sentence case. */
export const plainTeaches = (t: string) =>
  t
    .replace(/\bRH\b/g, "right hand")
    .replace(/\bLH\b/g, "left hand")
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
