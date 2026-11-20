// One Create session: a song is a beat plus melody tracks on one loop at one
// tempo, so a backing track can be built and jammed over. What is open is a
// working copy (it survives a reload); it joins the songs list only on Save.
// The library keeps beats and melodies to reuse in any song.
import {
  audio,
  getSetting,
  putSetting,
  settings,
  type SequenceHandle,
} from "#lib/music/runtime/index.ts";
import {
  addBar,
  barsOf,
  beatNotes,
  hitCount,
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
  pickVoice,
  ROLL_KEY,
  rollNotes,
  setLength,
  soundOf,
  type RollDoc,
  type RollVoice,
} from "./roll";

export const SONGS_KEY = "music.create-songs";
export const VOICES_KEY = "music.roll-voices";
/** The open song, saved or not, with the id of the saved song it came from. */
const WORK_KEY = "music.create-work";
/** Where the previous version kept the open song's id. */
const CURRENT_KEY = "music.create-current-song";
export const MAX_SONG_BARS = 32;

export interface CreateSong {
  id: string;
  name: string;
  bpm: number;
  pattern: BeatPattern;
  doc: RollDoc;
  beatMuted: boolean;
  /** The beat's level, 0..1 (older songs: full). */
  beatVolume?: number;
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

/** A track: the beat, or a melody's id. */
export type TrackId = "beat" | (string & {});
/** What plays alone: one track, or "melodies" for the melodies picked in the roll. */
export type PlayTarget = TrackId | "melodies";

/** A song as it opens: one tempo throughout, and at least as long as its beat. */
const normal = (s: CreateSong): CreateSong => ({
  ...s,
  pattern: { ...s.pattern, bpm: s.bpm },
  doc: {
    ...s.doc,
    bpm: s.bpm,
    lengthBeats: Math.max(s.doc.lengthBeats, barsOf(s.pattern) * BAR_BEATS),
  },
});

/** What a song is, without the fields that change on every edit. */
const contentOf = (s: CreateSong) =>
  JSON.stringify([
    s.name,
    s.bpm,
    { ...s.pattern, updatedAt: 0 },
    s.doc,
    s.beatMuted,
    s.beatVolume ?? 1,
  ]);

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
    beatVolume: 1,
    updatedAt: Date.now(),
  };
}

class CreateSession {
  songId = $state("");
  songName = $state("Untitled song");
  pattern = $state<BeatPattern>(blankSong("", 90).pattern);
  doc = $state<RollDoc>(emptyDoc(crypto.randomUUID()));
  beatMuted = $state(false);
  beatVolume = $state(1);
  /** The melody the piano roll edits. */
  selected = $state("");
  /** The melodies picked in the roll: shown there, and what "Play melodies" plays. */
  picked = $state<string[]>([]);
  /** Whether the open song is in the songs list, and what it was when saved. */
  saved = $state(false);
  #savedContent = $state("");

  songs = $state<CreateSong[]>([]);
  beats = $state<BeatPattern[]>([]);
  voices = $state<SavedVoice[]>([]);

  playing = $state(false);
  /** The one track playing on its own, or null when everything plays. */
  only = $state<PlayTarget | null>(null);
  /** Performance-clock start of the current pass, and its length (ms). */
  passAt = $state(0);
  passMs = $state(0);
  now = $state(0);
  #handle: SequenceHandle | null = null;
  #raf = 0;

  ready = typeof window === "undefined" ? Promise.resolve() : this.#load();

  async #load() {
    const [songs, work, current, beats, voices] = await Promise.all([
      getSetting<CreateSong[]>(SONGS_KEY, []),
      getSetting<{ song: CreateSong; saved: boolean } | null>(WORK_KEY, null),
      getSetting<string | null>(CURRENT_KEY, null),
      getSetting<BeatPattern[]>(PATTERNS_KEY, []),
      getSetting<SavedVoice[]>(VOICES_KEY, []),
    ]);
    this.songs = Array.isArray(songs) ? songs : [];
    this.beats = Array.isArray(beats) ? beats : [];
    this.voices = Array.isArray(voices) ? voices : [];
    const listed = this.songs.find((s) => s.id === (work?.song.id ?? current));
    if (work?.song) this.#show(work.song, listed);
    else if (listed) this.#show(listed, listed);
    else this.#show(await this.#fromDrafts());

    // The working copy is kept as you go, so a reload loses nothing; it is
    // not a saved song until Save.
    $effect.root(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      $effect(() => {
        const work = { song: this.#snapshot(), saved: this.saved };
        clearTimeout(timer);
        timer = setTimeout(() => void putSetting(WORK_KEY, work), 400);
      });
    });
  }

  /** A first song: the beat and roll drafts earlier versions kept, or a starter. */
  async #fromDrafts(): Promise<CreateSong> {
    const [draft, doc] = await Promise.all([
      getSetting<BeatPattern | null>(DRAFT_KEY, null),
      getSetting<RollDoc | null>(ROLL_KEY, null),
    ]);
    const bpm = Math.min(200, Math.max(40, draft?.bpm ?? (settings.value.bpm || 90)));
    const song = blankSong("Untitled song", bpm, true);
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
      beatVolume: this.beatVolume,
      updatedAt: Date.now(),
    };
  }

  /** Open `song`; `listed` is its saved version, when it has one. */
  #show(song: CreateSong, listed?: CreateSong) {
    const s = normal(structuredClone($state.snapshot(song)));
    this.songId = s.id;
    this.songName = s.name;
    this.pattern = s.pattern;
    this.doc = s.doc;
    this.beatMuted = s.beatMuted;
    this.beatVolume = s.beatVolume ?? 1;
    this.selected = s.doc.voices[0]?.id ?? "";
    this.picked = s.doc.voices.map((v) => v.id);
    this.saved = !!listed;
    this.#savedContent = listed ? contentOf(normal(listed)) : "";
  }

  /** Saved, and changed since. */
  get changed() {
    return !this.saved || contentOf(this.#snapshot()) !== this.#savedContent;
  }
  /** Anything worth keeping: a saved song with changes, or an unsaved one with notes. */
  get unsaved() {
    if (this.saved) return this.changed;
    return hitCount(this.pattern) > 0 || this.doc.voices.some((v) => v.notes.length > 0);
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

  /** Everything that sounds in one pass: every unmuted track, or the one playing alone. */
  notes() {
    const bars = this.loopBars;
    const only = this.only;
    const beat = only ? only === "beat" : !this.beatMuted;
    const alone = (v: RollVoice) =>
      only === "melodies" ? this.picked.includes(v.id) : v.id === only;
    const doc = only
      ? {
          ...this.doc,
          voices: this.doc.voices.filter(alone).map((v) => ({ ...v, muted: false })),
        }
      : this.doc;
    return [
      ...(beat
        ? beatNotes(this.pattern, this.bpm, bars).map((n) => ({ ...n, track: "beat" }))
        : []),
      ...rollNotes(doc, this.bpm, bars),
    ];
  }
  /** A track's level: the beat's, or a melody's (0..1). */
  volumeOf(track: string | undefined) {
    if (track === "beat") return this.beatVolume;
    return this.doc.voices.find((v) => v.id === track)?.volume ?? 1;
  }
  /** The notes with each track's level baked into the velocity (for rendering). */
  mixedNotes() {
    return this.notes()
      .map((n) => ({ ...n, velocity: (n.velocity ?? 0.8) * this.volumeOf(n.track) }))
      .filter((n) => n.velocity > 0);
  }
  get passSec() {
    return (this.loopBars * BAR_BEATS * 60) / this.bpm;
  }

  /** Play everything (null) or one track alone; the same again stops. */
  async play(only: PlayTarget | null = null) {
    if (this.playing && this.only === only) return this.stop();
    if (this.playing) this.stop(); // switch straight away, not at the end of the pass
    this.only = only;
    return this.#start();
  }
  // The piano roll's host: it plays the picked melodies.
  get pickedPlaying() {
    return this.playing && this.only === "melodies";
  }
  playPicked() {
    return this.play("melodies");
  }

  toggle() {
    return this.playing ? this.stop() : this.play(null);
  }

  async #start() {
    await audio.unlock();
    if (!audio.unlocked) return false;
    this.playing = true;
    this.#handle = audio.playLoop({
      notes: () => this.notes(),
      gain: (track) => this.volumeOf(track),
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
    this.only = null;
    cancelAnimationFrame(this.#raf);
    return true;
  }

  /** Beats into the current pass, or -1 when stopped or before the first note. */
  get beat() {
    if (!this.playing || !this.passMs) return -1;
    const t = this.now - this.passAt;
    return t < 0 ? -1 : (t / 1000) * (this.bpm / 60);
  }
  /** The beat grid's playing step, wrapped to the pattern's own length; -1 when the beat is not what plays. */
  get beatStep() {
    const b = this.only === null || this.only === "beat" ? this.beat : -1;
    return b < 0 ? -1 : Math.floor(b * 4) % (barsOf(this.pattern) * STEPS); // four sixteenths a beat
  }
  /** The roll's playhead in beats; -1 when only the beat plays. */
  get rollBeat() {
    const b = this.only === "beat" ? -1 : this.beat;
    return b < 0 ? -1 : b % this.doc.lengthBeats;
  }

  // Songs --------------------------------------------------------------------

  #writeSongs() {
    return putSetting(SONGS_KEY, $state.snapshot(this.songs));
  }

  /** Save the open song into the songs list (in place when it is already there). */
  async save() {
    const song = { ...this.#snapshot(), name: this.songName.trim() || "Untitled song" };
    this.songName = song.name;
    this.songs = this.songs.some((s) => s.id === song.id)
      ? this.songs.map((s) => (s.id === song.id ? song : s))
      : [...this.songs, song];
    await this.#writeSongs();
    this.saved = true;
    this.#savedContent = contentOf(song);
    return song;
  }

  /** Save as a new song, which is then the open one. */
  async saveCopy() {
    this.songId = crypto.randomUUID();
    this.songName = `${this.songName} copy`;
    this.saved = false;
    return this.save();
  }

  /** A blank song, not saved until Save. The open one is dropped as it is. */
  newSong() {
    this.#show(blankSong("Untitled song", this.bpm));
  }

  openSong(id: string) {
    const song = this.songs.find((s) => s.id === id);
    if (song) this.#show(song, song);
    return song;
  }

  /** Take the open song out of the songs list; it stays open, unsaved. */
  async deleteSong() {
    this.songs = this.songs.filter((s) => s.id !== this.songId);
    await this.#writeSongs();
    this.saved = false;
    this.#savedContent = "";
  }

  // Tracks -------------------------------------------------------------------

  addMelody(): RollVoice {
    const v = newVoice(this.doc.voices.length + 1, crypto.randomUUID());
    this.doc = { ...this.doc, voices: [...this.doc.voices, v] };
    this.selected = v.id;
    this.picked = [...this.picked, v.id];
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
    this.picked = [...this.picked, v.id];
  }

  /** A tap on a melody in the roll (see pickVoice). */
  pick(id: string) {
    const r = pickVoice(this.picked, this.selected, id);
    this.picked = r.picked;
    this.selected = r.selected;
    return r.result;
  }

  updateVoice(id: string, fn: (v: RollVoice) => RollVoice) {
    this.doc = mapVoice(this.doc, id, fn);
  }

  deleteMelody(id: string) {
    const i = this.doc.voices.findIndex((v) => v.id === id);
    if (i < 0) return;
    this.doc = { ...this.doc, voices: this.doc.voices.filter((v) => v.id !== id) };
    this.picked = this.picked.filter((x) => x !== id);
    if (this.selected === id)
      this.selected = this.picked[0] ?? this.doc.voices[Math.max(0, i - 1)]?.id ?? "";
    if (this.selected && !this.picked.includes(this.selected))
      this.picked = [...this.picked, this.selected];
    if (this.only === id) this.stop();
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
