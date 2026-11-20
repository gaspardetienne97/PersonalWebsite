// A beat clock for the piano drills: the beat lane's playhead and the keys that
// light during a demo both read `beat`, and a demo starts it from the audio
// sequence's own start time, so what you see is what you hear (O06).
import { page } from "$app/state";
import type { DrillMode } from "#lib/music/components/DrillShell.svelte";
import { audio, settings } from "#lib/music/runtime/index.ts";

export interface TimedNote {
  midi: number;
  /** Beats from the start. */
  beat: number;
  /** Beats. */
  dur: number;
  hand?: "left" | "right";
  velocity?: number;
  finger?: number;
}

export class Transport {
  /** Beats since the start (fractional), null when idle. */
  beat = $state<number | null>(null);
  playing = $state(false);
  #raf = 0;
  #stopDemo: (() => void) | null = null;

  /** Run the playhead from `t0` (performance.now() of beat 0). */
  follow(t0: number, beatMs: number, endBeat = Infinity) {
    cancelAnimationFrame(this.#raf);
    const tick = () => {
      const b = (performance.now() - t0) / beatMs;
      this.beat = b;
      if (b > endBeat) return this.stop();
      this.#raf = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Play notes at `bpm` (times `speed`) with the playhead in step. Never scored. */
  async demo(notes: TimedNote[], bpm: number, speed = 1) {
    this.stop();
    await audio.unlock();
    const beatS = 60 / (bpm * speed);
    const handle = audio.playSequence(
      notes.map((n) => ({
        midi: n.midi,
        time: n.beat * beatS,
        duration: Math.max(0.08, n.dur * beatS * 0.92),
        velocity: n.velocity,
      })),
    );
    const end = notes.reduce((m, n) => Math.max(m, n.beat + n.dur), 0);
    const stop = () => handle.stop();
    this.playing = true;
    this.#stopDemo = stop;
    this.follow(handle.startPerf, beatS * 1000, end + 0.25);
    await handle.done;
    if (this.#stopDemo === stop) this.stop();
  }

  stop() {
    cancelAnimationFrame(this.#raf);
    const s = this.#stopDemo;
    this.#stopDemo = null;
    s?.();
    this.beat = null;
    this.playing = false;
  }
}

/** Timed notes as a written line (LineNotation), hands kept for the grand staff. */
export const toWritten = (notes: readonly TimedNote[]) =>
  notes.map((n) => ({ midi: n.midi, startBeat: n.beat, durationBeats: n.dur, hand: n.hand }));

/** Notes sounding at `beat` (a short gap before each next note keeps repeats visible). */
export const sounding = <N extends TimedNote>(notes: readonly N[], beat: number | null) =>
  beat === null
    ? []
    : notes.filter((n) => beat >= n.beat && beat < n.beat + Math.max(0.2, n.dur * 0.9));

/**
 * Path links carry the bench setup (`bpm`, `instrument`) and the mode; apply them
 * once on load. Returns the mode to open in.
 */
export function benchFromUrl(tempo: { min: number; max: number }): DrillMode {
  const q = page.url.searchParams;
  const bpm = Number(q.get("bpm"));
  const instrument = q.get("instrument");
  const patch: Parameters<typeof settings.update>[0] = {};
  if (bpm) patch.bpm = Math.min(tempo.max, Math.max(tempo.min, Math.round(bpm)));
  if (
    instrument === "piano" ||
    instrument === "guitar" ||
    instrument === "ukulele" ||
    instrument === "aerophone"
  )
    patch.activeInstrument = instrument;
  if (Object.keys(patch).length) void settings.update(patch);
  return q.get("mode") === "check" ? "check" : "practice";
}

/** The keyboard span for a set of notes, snapped out to whole octaves from C. */
export function spanOf(midis: readonly number[], pad = 2): { low: number; high: number } {
  if (!midis.length) return { low: 48, high: 84 };
  return {
    low: Math.floor((Math.min(...midis) - pad) / 12) * 12,
    high: Math.ceil((Math.max(...midis) + pad) / 12) * 12,
  };
}

/** Swung eighths: an off-beat eighth lands two thirds of the way through the beat. */
export const swingBeat = (beat: number) =>
  Math.abs((beat % 1) - 0.5) < 1e-6 ? Math.floor(beat) + 2 / 3 : beat;

export const FINGERING_NOTE =
  "Finger numbers on the keys are suggestions. They are never graded: MIDI cannot see fingers.";
