// Saved repertoire: the db.songs row shape, file import into the canonical
// score, and the facts a song card or Song Studio shows about a score.
import { noteName, type Score, type ScoreSection } from "@repo/music-core";
import { midiToScore } from "@repo/music-core/io/midi-file";
import { parseMusicXml, parseMxl } from "@repo/music-core/io/musicxml";
import { barBeats } from "$lib/music/notation/groups";
import { db } from "$lib/music/runtime";

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
  else
    throw new Error(
      `"${name}" is not a score this app can read. Use MIDI (.mid), MusicXML (.musicxml or .xml) or compressed MusicXML (.mxl).`,
    );
  if (!score.voices.some((v) => v.notes.length)) throw new Error(`"${name}" has no notes in it.`);
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
  return `${(minor ? MINOR : MAJOR)[score.keyFifths + 7]} ${minor ? "minor" : "major"}`;
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
      ? "drums only"
      : "no notes"
    : `${noteName(f.low)} to ${noteName(f.high)}`;

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
      label: last - b === 1 ? `Bar ${b + 1}` : `Bars ${b + 1} to ${last}`,
      startBeat: b * bar,
      endBeat: last * bar,
    });
  }
  return out;
}

export const barsText = (n: number) => `${n} bar${n === 1 ? "" : "s"}`;

/** The library song saved for a shelf entry (`<path>/<song>`), if any. */
export async function shelfSong(key: string): Promise<Song | undefined> {
  const songs = (await db.songs.toArray()) as unknown as Song[];
  return songs.find((s) => s.shelf === key);
}

/** Read a shelf song's downloaded score from the server into the library, tagged for its shelf. */
export async function addShelfSong(key: string, title: string, artist?: string): Promise<Song> {
  const res = await fetch(`/api/music/scores/${key}`);
  if (!res.ok) throw new Error(`The score for ${title} has not been downloaded yet.`);
  const name =
    res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    `${key.split("/")[1]}.mxl`;
  const score = await importScoreFile(name, new Uint8Array(await res.arrayBuffer()));
  const song = {
    ...songFromScore({ ...score, title }, { composer: artist, source: name }),
    shelf: key,
  };
  await db.songs.put(song);
  return song;
}
