// One Create session: a song is a beat plus melody tracks on one loop at one
// tempo, so a backing track can be built and jammed over. Songs save
// themselves as you work; the library keeps beats and melodies to reuse.
import { audio, getSetting, putSetting, settings, type SequenceHandle } from "$lib/music/runtime";
import {
  addBar,
  barsOf,
  beatNotes,
  DRAFT_KEY,
  PATTERNS_KEY,
  removeBar,
  STEPS,
  type BeatPattern,
} from "./pattern";
import {
  BAR_BEATS,
  emptyDoc,
  mapVoice,
  newVoice,
  ROLL_KEY,
  rollNotes,
  setLength,
  soundOf,
  type RollDoc,
  type RollVoice,
} from "./roll";

export const SONGS_KEY = "music.create-songs";
export const VOICES_KEY = "music.roll-voices";
const CURRENT_KEY = "music.create-current-song";
export const MAX_SONG_BARS = 32;

export interface CreateSong {
  id: string;
  name: string;
  bpm: number;
  pattern: BeatPattern;
  doc: RollDoc;
  beatMuted: boolean;
  updatedAt: number;
}

/** A melody kept in the library. */
export interface SavedVoice {
  id: string;
  name: string;
  sound: RollVoice["sound"];
  lengthBeats: number;
  notes: RollVoice["notes"];
  updatedAt: number;
}

/** The track the editor shows: the beat, or a melody's id. */
export type TrackId = "beat" | (string & {});

function blankSong(name: string, bpm: number, starter = false): CreateSong {
  return {
    id: crypto.randomUUID(),
    name,
    bpm,
    pattern: {
      id: crypto.randomUUID(),
      name: "Beat",
      bpm,
      bars: 1,
      steps: starter ? { 36: [0, 7, 10], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14] } : {},
      updatedAt: Date.now(),
    },
    doc: { ...emptyDoc(crypto.randomUUID()), bpm, title: name },
    beatMuted: false,
    updatedAt: Date.now(),
  };
}

class CreateSession {
  songId = $state("");
  songName = $state("Untitled song");
  pattern = $state<BeatPattern>(blankSong("", 90).pattern);
  doc = $state<RollDoc>(emptyDoc(crypto.randomUUID()));
  beatMuted = $state(false);
  selected = $state<TrackId>("beat");

  songs = $state<CreateSong[]>([]);
  beats = $state<BeatPattern[]>([]);
  voices = $state<SavedVoice[]>([]);

  playing = $state(false);
  /** Performance-clock start of the current pass, and its length (ms). */
  passAt = $state(0);
  passMs = $state(0);
  now = $state(0);
  #handle: SequenceHandle | null = null;
  #raf = 0;

  ready = typeof window === "undefined" ? Promise.resolve() : this.#load();

  async #load() {
    const [songs, current, beats, voices] = await Promise.all([
      getSetting<CreateSong[]>(SONGS_KEY, []),
      getSetting<string | null>(CURRENT_KEY, null),
      getSetting<BeatPattern[]>(PATTERNS_KEY, []),
      getSetting<SavedVoice[]>(VOICES_KEY, []),
    ]);
    this.songs = Array.isArray(songs) ? songs : [];
    this.beats = Array.isArray(beats) ? beats : [];
    this.voices = Array.isArray(voices) ? voices : [];
    if (!this.songs.length) this.songs = [await this.#fromDrafts()];
    this.#show(this.songs.find((s) => s.id === current) ?? this.songs[0]);

    // Every change to the open song is written back to the songs list.
    $effect.root(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      $effect(() => {
        const song = this.#snapshot();
        clearTimeout(timer);
        timer = setTimeout(() => void this.#store(song), 400);
      });
    });
  }

  /** The first song: the beat and roll drafts earlier versions kept, or a starter. */
  async #fromDrafts(): Promise<CreateSong> {
    const [draft, doc] = await Promise.all([
      getSetting<BeatPattern | null>(DRAFT_KEY, null),
      getSetting<RollDoc | null>(ROLL_KEY, null),
    ]);
    const bpm = Math.min(200, Math.max(40, draft?.bpm ?? (settings.value.bpm || 90)));
    const song = blankSong("My first song", bpm, true);
    if (draft?.steps) song.pattern = { ...draft, bpm };
    if (doc?.voices?.length) song.doc = { ...doc, bpm };
    return song;
  }

  #snapshot(): CreateSong {
    return {
      id: this.songId,
      name: this.songName,
      bpm: this.bpm,
      pattern: $state.snapshot(this.pattern),
      doc: $state.snapshot(this.doc),
      beatMuted: this.beatMuted,
      updatedAt: Date.now(),
    };
  }

  async #store(song: CreateSong) {
    if (!song.id) return;
    this.songs = this.songs.some((s) => s.id === song.id)
      ? this.songs.map((s) => (s.id === song.id ? song : s))
      : [...this.songs, song];
    await putSetting(SONGS_KEY, $state.snapshot(this.songs));
    await putSetting(CURRENT_KEY, song.id);
  }

  #show(song: CreateSong) {
    const s = structuredClone($state.snapshot(song));
    this.songId = s.id;
    this.songName = s.name;
    this.pattern = { ...s.pattern, bpm: s.bpm };
    // The song is at least as long as its beat.
    const beats = Math.max(s.doc.lengthBeats, barsOf(s.pattern) * BAR_BEATS);
    this.doc = { ...s.doc, bpm: s.bpm, lengthBeats: beats };
    this.beatMuted = s.beatMuted;
    this.selected = "beat";
  }

  // Tempo and length ---------------------------------------------------------

  get bpm() {
    return this.pattern.bpm;
  }
  setBpm(v: number) {
    if (!Number.isFinite(v)) return;
    const bpm = Math.round(Math.min(200, Math.max(40, v)));
    this.pattern = { ...this.pattern, bpm };
    this.doc = { ...this.doc, bpm };
  }

  /** The song's length. The melodies span it; the beat repeats to fill it. */
  get bars() {
    return Math.max(1, Math.round(this.doc.lengthBeats / BAR_BEATS));
  }
  /** A shorter song drops the notes past its end, and shortens a longer beat. */
  setBars(n: number) {
    const bars = Math.max(1, Math.min(MAX_SONG_BARS, Math.round(n)));
    this.doc = setLength(this.doc, bars * BAR_BEATS);
    let p = this.pattern;
    while (barsOf(p) > bars) p = removeBar(p);
    if (p !== this.pattern) this.pattern = p;
  }

  /** Beat edits go through here; a beat that grows past the song grows the song. */
  setPattern(next: BeatPattern) {
    this.pattern = { ...next, bpm: this.bpm, updatedAt: Date.now() };
    if (barsOf(next) > this.bars) this.doc = setLength(this.doc, barsOf(next) * BAR_BEATS);
  }
  growBeat() {
    this.setPattern(addBar(this.pattern));
  }

  get loopBars() {
    return Math.max(barsOf(this.pattern), this.bars);
  }

  // Transport ----------------------------------------------------------------

  /** Everything that sounds in one pass. */
  notes() {
    const bars = this.loopBars;
    return [
      ...(this.beatMuted ? [] : beatNotes(this.pattern, this.bpm, bars)),
      ...rollNotes(this.doc, this.bpm, bars),
    ];
  }
  get passSec() {
    return (this.loopBars * BAR_BEATS * 60) / this.bpm;
  }

  async toggle() {
    if (this.playing) return this.stop();
    await audio.unlock();
    if (!audio.unlocked) return false;
    this.playing = true;
    this.#handle = audio.playLoop({
      notes: () => this.notes(),
      lengthSec: () => this.passSec,
      onLoop: (perfAt, len) => {
        this.passAt = perfAt;
        this.passMs = len * 1000;
      },
    });
    const tick = () => {
      this.now = performance.now();
      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
    return true;
  }

  stop() {
    this.#handle?.stop();
    this.#handle = null;
    this.playing = false;
    cancelAnimationFrame(this.#raf);
    return true;
  }

  /** Beats into the current pass, or -1 when stopped or before the first note. */
  get beat() {
    if (!this.playing || !this.passMs) return -1;
    const t = this.now - this.passAt;
    return t < 0 ? -1 : (t / 1000) * (this.bpm / 60);
  }
  /** The beat grid's playing step, wrapped to the pattern's own length. */
  get beatStep() {
    const b = this.beat;
    return b < 0 ? -1 : Math.floor(b * 4) % (barsOf(this.pattern) * STEPS); // four sixteenths a beat
  }
  /** The roll's playhead in beats. */
  get rollBeat() {
    const b = this.beat;
    return b < 0 ? -1 : b % this.doc.lengthBeats;
  }

  // Songs --------------------------------------------------------------------

  async #switchTo(song: CreateSong) {
    await this.#store(this.#snapshot());
    if (!this.songs.some((s) => s.id === song.id)) this.songs = [...this.songs, song];
    this.#show(song);
    await this.#store(this.#snapshot());
  }

  newSong() {
    return this.#switchTo(blankSong(`Song ${this.songs.length + 1}`, this.bpm));
  }

  async openSong(id: string) {
    const song = this.songs.find((s) => s.id === id);
    if (song && id !== this.songId) await this.#switchTo(song);
    return song;
  }

  async duplicateSong() {
    const copy = { ...this.#snapshot(), id: crypto.randomUUID(), name: `${this.songName} copy` };
    await this.#switchTo(copy);
    return copy;
  }

  /** Delete the open song and open the next one (a blank one after the last). */
  async deleteSong() {
    const rest = this.songs.filter((s) => s.id !== this.songId);
    const next = rest[0] ?? blankSong("Song 1", this.bpm);
    this.songs = rest.length ? rest : [next];
    this.#show(next);
    await this.#store(this.#snapshot());
  }

  // Tracks -------------------------------------------------------------------

  addMelody(): RollVoice {
    const v = newVoice(this.doc.voices.length + 1, crypto.randomUUID());
    this.doc = { ...this.doc, voices: [...this.doc.voices, v] };
    this.selected = v.id;
    return v;
  }

  /** A melody from outside (a Record take); the song grows to fit it. */
  addMelodyFrom(v: RollVoice) {
    const end = Math.max(0, ...v.notes.map((n) => n.startBeat + n.durationBeats));
    const beats = Math.min(MAX_SONG_BARS, Math.ceil(end / BAR_BEATS)) * BAR_BEATS;
    this.doc = {
      ...setLength(this.doc, Math.max(this.doc.lengthBeats, beats)),
      voices: [...this.doc.voices, v],
    };
    this.selected = v.id;
  }

  updateVoice(id: string, fn: (v: RollVoice) => RollVoice) {
    this.doc = mapVoice(this.doc, id, fn);
  }

  deleteMelody(id: string) {
    const i = this.doc.voices.findIndex((v) => v.id === id);
    if (i < 0) return;
    this.doc = { ...this.doc, voices: this.doc.voices.filter((v) => v.id !== id) };
    if (this.selected === id) this.selected = this.doc.voices[Math.max(0, i - 1)]?.id ?? "beat";
  }

  // Library ------------------------------------------------------------------

  async saveBeat() {
    const beat = {
      ...$state.snapshot(this.pattern),
      id: crypto.randomUUID(),
      name: this.pattern.name.trim() || "Beat",
      updatedAt: Date.now(),
    };
    this.beats = [...this.beats.filter((b) => b.name !== beat.name), beat].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    await putSetting(PATTERNS_KEY, $state.snapshot(this.beats));
    return beat;
  }

  useBeat(id: string) {
    const b = this.beats.find((x) => x.id === id);
    if (b) this.setPattern(structuredClone($state.snapshot(b)));
    this.selected = "beat";
    return b;
  }

  async saveMelody(v: RollVoice) {
    const saved: SavedVoice = {
      id: crypto.randomUUID(),
      name: v.name,
      sound: soundOf(v),
      lengthBeats: this.doc.lengthBeats,
      notes: $state.snapshot(v.notes),
      updatedAt: Date.now(),
    };
    this.voices = [...this.voices.filter((x) => x.name !== saved.name), saved].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    await putSetting(VOICES_KEY, $state.snapshot(this.voices));
    return saved;
  }

  useMelody(id: string) {
    const saved = this.voices.find((x) => x.id === id);
    if (!saved) return;
    const v: RollVoice = {
      id: crypto.randomUUID(),
      name: saved.name,
      velocity: 0.8,
      sound: saved.sound,
      notes: structuredClone($state.snapshot(saved.notes)),
    };
    this.addMelodyFrom(v);
    this.doc = setLength(this.doc, Math.max(this.doc.lengthBeats, saved.lengthBeats));
    return v;
  }
}

export const session = new CreateSession();
