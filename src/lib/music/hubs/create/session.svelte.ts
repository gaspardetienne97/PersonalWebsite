// One Create session: the beat and the piano roll play together on one loop,
// at one tempo, so you can build a backing track and jam over it. Songs (beat,
// voices and tempo together) and single voices can be saved and brought back.
import { audio, getSetting, putSetting, settings, type SequenceHandle } from "$lib/music/runtime";
import { barsOf, beatNotes, DRAFT_KEY, STEPS, type BeatPattern } from "./pattern";
import {
  BAR_BEATS,
  emptyDoc,
  ROLL_KEY,
  rollNotes,
  soundOf,
  type RollDoc,
  type RollVoice,
} from "./roll";

export const SONGS_KEY = "music.create-songs";
export const VOICES_KEY = "music.roll-voices";
const META_KEY = "music.create-draft-meta";

export interface CreateSong {
  id: string;
  name: string;
  bpm: number;
  pattern: BeatPattern;
  doc: RollDoc;
  beatMuted: boolean;
  updatedAt: number;
}

export interface SavedVoice {
  id: string;
  name: string;
  sound: RollVoice["sound"];
  lengthBeats: number;
  notes: RollVoice["notes"];
  updatedAt: number;
}

const starterPattern = (bpm: number): BeatPattern => ({
  id: crypto.randomUUID(),
  name: "Pattern 1",
  bpm,
  bars: 1,
  steps: { 36: [0, 7, 10], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
  updatedAt: Date.now(),
});

class CreateSession {
  pattern = $state<BeatPattern>(starterPattern(90));
  doc = $state<RollDoc>(emptyDoc(crypto.randomUUID()));
  beatMuted = $state(false);
  songName = $state("Untitled song");
  songId = $state<string>(crypto.randomUUID());
  songs = $state<CreateSong[]>([]);
  voices = $state<SavedVoice[]>([]);

  playing = $state(false);
  /** Performance-clock start of the current pass, and its length (ms). */
  passAt = $state(0);
  passMs = $state(0);
  now = $state(0);
  #handle: SequenceHandle | null = null;
  #raf = 0;

  ready = typeof window === "undefined" ? Promise.resolve() : this.#load();

  /** Loaded once per visit; the drafts then autosave, so a reload lands on the same song. */
  async #load() {
    const [songs, voices, draft, doc, meta] = await Promise.all([
      getSetting<CreateSong[]>(SONGS_KEY, []),
      getSetting<SavedVoice[]>(VOICES_KEY, []),
      getSetting<BeatPattern | null>(DRAFT_KEY, null),
      getSetting<RollDoc | null>(ROLL_KEY, null),
      getSetting<{ id: string; name: string; beatMuted: boolean } | null>(META_KEY, null),
    ]);
    this.songs = Array.isArray(songs) ? songs : [];
    this.voices = Array.isArray(voices) ? voices : [];
    if (draft?.steps) this.pattern = draft;
    else this.pattern.bpm = Math.min(200, Math.max(40, settings.value.bpm || 90));
    if (doc?.voices?.length) this.doc = doc;
    this.doc.bpm = this.pattern.bpm;
    if (meta) {
      this.songId = meta.id;
      this.songName = meta.name;
      this.beatMuted = meta.beatMuted;
    }
    $effect.root(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      $effect(() => {
        const snap = {
          pattern: $state.snapshot(this.pattern),
          doc: $state.snapshot(this.doc),
          meta: { id: this.songId, name: this.songName, beatMuted: this.beatMuted },
        };
        clearTimeout(timer);
        timer = setTimeout(() => {
          void putSetting(DRAFT_KEY, snap.pattern);
          void putSetting(ROLL_KEY, snap.doc);
          void putSetting(META_KEY, snap.meta);
        }, 400);
      });
    });
  }

  get bpm() {
    return this.pattern.bpm;
  }
  setBpm(v: number) {
    if (!Number.isFinite(v)) return;
    const bpm = Math.round(Math.min(200, Math.max(40, v)));
    this.pattern = { ...this.pattern, bpm };
    this.doc = { ...this.doc, bpm };
  }

  /** The loop is as long as the longer of the beat and the melodies. */
  get loopBars() {
    return Math.max(barsOf(this.pattern), this.doc.lengthBeats / BAR_BEATS);
  }

  #notes() {
    const bars = this.loopBars;
    return [
      ...(this.beatMuted ? [] : beatNotes(this.pattern, this.bpm, bars)),
      ...rollNotes(this.doc, this.bpm, bars),
    ];
  }

  async toggle() {
    if (this.playing) return this.stop();
    await audio.unlock();
    if (!audio.unlocked) return false;
    this.playing = true;
    this.#handle = audio.playLoop({
      notes: () => this.#notes(),
      lengthSec: () => (this.loopBars * BAR_BEATS * 60) / this.bpm,
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
    if (b < 0) return -1;
    return Math.floor(b * 4) % (barsOf(this.pattern) * STEPS); // four sixteenths a beat
  }

  /** The roll's playhead in beats, wrapped to the roll's own length. */
  get rollBeat() {
    const b = this.beat;
    return b < 0 ? -1 : b % this.doc.lengthBeats;
  }

  // Songs ------------------------------------------------------------------

  async saveSong(name = this.songName) {
    const song: CreateSong = {
      id: this.songId,
      name: name.trim() || "Untitled song",
      bpm: this.bpm,
      pattern: $state.snapshot(this.pattern),
      doc: $state.snapshot(this.doc),
      beatMuted: this.beatMuted,
      updatedAt: Date.now(),
    };
    this.songName = song.name;
    this.songs = [...this.songs.filter((x) => x.id !== song.id), song].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    await putSetting(SONGS_KEY, $state.snapshot(this.songs));
    return song;
  }

  openSong(id: string) {
    const song = this.songs.find((x) => x.id === id);
    if (!song) return null;
    const s = structuredClone($state.snapshot(song));
    this.songId = s.id;
    this.songName = s.name;
    this.pattern = { ...s.pattern, bpm: s.bpm };
    this.doc = { ...s.doc, bpm: s.bpm };
    this.beatMuted = s.beatMuted;
    return s;
  }

  newSong() {
    this.songId = crypto.randomUUID();
    this.songName = "Untitled song";
    this.pattern = { ...starterPattern(this.bpm), steps: {} };
    this.doc = { ...emptyDoc(crypto.randomUUID()), bpm: this.bpm };
    this.beatMuted = false;
  }

  async deleteSong(id: string) {
    this.songs = this.songs.filter((x) => x.id !== id);
    await putSetting(SONGS_KEY, $state.snapshot(this.songs));
  }

  // Single voices ------------------------------------------------------------

  async saveVoice(v: RollVoice) {
    const saved: SavedVoice = {
      id: crypto.randomUUID(),
      name: v.name,
      sound: soundOf(v),
      lengthBeats: this.doc.lengthBeats,
      notes: $state.snapshot(v.notes),
      updatedAt: Date.now(),
    };
    const others = this.voices.filter((x) => x.name !== saved.name);
    this.voices = [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
    await putSetting(VOICES_KEY, $state.snapshot(this.voices));
    return saved;
  }

  /** Add a saved voice to the roll as a new voice; the roll grows to fit it. */
  addSavedVoice(id: string): RollVoice | null {
    const saved = this.voices.find((x) => x.id === id);
    if (!saved) return null;
    const v: RollVoice = {
      id: crypto.randomUUID(),
      name: saved.name,
      velocity: 0.8,
      sound: saved.sound,
      notes: structuredClone($state.snapshot(saved.notes)),
    };
    this.doc = {
      ...this.doc,
      lengthBeats: Math.max(this.doc.lengthBeats, saved.lengthBeats),
      voices: [...this.doc.voices, v],
    };
    return v;
  }

  async deleteVoice(id: string) {
    this.voices = this.voices.filter((x) => x.id !== id);
    await putSetting(VOICES_KEY, $state.snapshot(this.voices));
  }
}

export const session = new CreateSession();
