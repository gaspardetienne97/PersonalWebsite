// A score opened in the piano roll to fix its notes: a transcription draft,
// or any saved song. It plays the picked parts on its own clock and hands
// back the score with only the notes changed (parts, key, sections and the
// rest stay as they were).
import type { Score } from "@repo/music-core";
import { audio, type SequenceHandle } from "$lib/music/runtime";
import { barBeats, mergeTies } from "$lib/music/notation/groups";
import {
  mapVoice,
  pickVoice,
  rollNotes,
  setLength,
  type RollDoc,
  type RollVoice,
} from "$lib/music/hubs/create/roll";
import type { RollHost } from "$lib/music/hubs/create/PianoRoll.svelte";

export class ScoreEditor implements RollHost {
  doc = $state<RollDoc>({ title: "", bpm: 90, lengthBeats: 4, voices: [] });
  selected = $state("");
  picked = $state<string[]>([]);
  playing = $state(false);
  readonly barBeats: number;
  #base: Score;
  #initial: string;
  #handle: SequenceHandle | null = null;
  #startPerf = 0;
  #now = $state(0);
  #raf = 0;

  constructor(score: Score) {
    this.#base = score;
    this.barBeats = barBeats(score.meter);
    const bars = Math.max(1, Math.ceil(score.lengthBeats / this.barBeats - 1e-6));
    const voices: RollVoice[] = score.voices.map((v) => ({
      id: v.id,
      name: v.name,
      velocity: 0.8,
      // One note per attack: the roll has no ties, and the staff re-splits at bar lines.
      notes: mergeTies(v.notes).map((n) => ({
        midi: n.midi,
        startBeat: n.startBeat,
        durationBeats: n.durationBeats,
        velocity: n.velocity,
      })),
    }));
    this.doc = {
      title: score.title,
      bpm: score.bpm,
      lengthBeats: bars * this.barBeats,
      voices: voices.length ? voices : [{ id: "melody", name: "Melody", velocity: 0.8, notes: [] }],
    };
    this.picked = this.doc.voices.map((v) => v.id);
    this.selected = this.picked[0];
    this.#initial = JSON.stringify(this.doc);
  }

  get changed() {
    return JSON.stringify(this.doc) !== this.#initial;
  }
  get noteCount() {
    return this.doc.voices.reduce((n, v) => n + v.notes.length, 0);
  }

  pick(id: string) {
    const r = pickVoice(this.picked, this.selected, id);
    this.picked = r.picked;
    this.selected = r.selected;
    return r.result;
  }
  updateVoice(id: string, fn: (v: RollVoice) => RollVoice) {
    this.doc = mapVoice(this.doc, id, fn);
  }
  setBars(n: number) {
    this.doc = setLength(this.doc, Math.max(1, Math.round(n)) * this.barBeats);
  }

  get rollBeat() {
    return this.playing
      ? Math.max(0, ((this.#now - this.#startPerf) / 1000) * (this.doc.bpm / 60))
      : -1;
  }
  get pickedPlaying() {
    return this.playing;
  }

  async playPicked() {
    if (this.playing) return this.stop();
    await audio.unlock();
    if (!audio.unlocked) return false;
    const doc = { ...this.doc, voices: this.doc.voices.filter((v) => this.picked.includes(v.id)) };
    const h = audio.playSequence(rollNotes(doc, doc.bpm));
    this.#handle = h;
    this.#startPerf = h.startPerf;
    this.playing = true;
    const tick = () => {
      this.#now = performance.now();
      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
    void h.done.then(() => this.#handle === h && this.stop());
    return true;
  }

  stop() {
    this.#handle?.stop();
    this.#handle = null;
    this.playing = false;
    cancelAnimationFrame(this.#raf);
    return true;
  }

  /** The score with the roll's notes (and length) in place of the old ones. */
  toScore(): Score {
    const byId = new Map(this.doc.voices.map((v) => [v.id, v]));
    const strip = (v: RollVoice) =>
      v.notes.map((n) => ({
        midi: n.midi,
        startBeat: n.startBeat,
        durationBeats: n.durationBeats,
        velocity: n.velocity,
      }));
    const kept = this.#base.voices
      .filter((v) => byId.has(v.id))
      .map((v) => ({ ...v, notes: strip(byId.get(v.id)!) }));
    const added = this.doc.voices
      .filter((v) => !this.#base.voices.some((b) => b.id === v.id))
      .map((v) => ({ id: v.id, name: v.name, notes: strip(v) }));
    return {
      ...this.#base,
      title: this.doc.title || this.#base.title,
      bpm: this.doc.bpm,
      voices: [...kept, ...added],
      lengthBeats: this.doc.lengthBeats,
    };
  }
}
