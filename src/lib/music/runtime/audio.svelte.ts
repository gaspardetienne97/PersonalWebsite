// The audio engine (catalog 5.12, hardware notes 6). Tone.js is imported lazily
// because importing it creates an AudioContext; nothing here runs during SSR.
//
// Clock rules:
// - Everything audible is scheduled on the audio clock. Patterns are handed to
//   the voice 1 s ahead in 100 ms top-ups (Tone's worker-driven context timer),
//   never all at once: a sampler release stops every source it holds for a pitch.
// - Each sequence, metronome run and take gets its own bus (and its own voice),
//   so stopping it silences what was already queued and a live note played on
//   the same sound can never cut a preview off.
// - Lights follow the audio: raw audio time, scheduling time and
//   performance.now() are sampled in one call and the start is projected onto
//   the performance clock, so `startPerf` is when time 0 actually sounds.
import { browser } from "$app/env";
import { untrack } from "svelte";
import type * as ToneNS from "tone";
import type { PlaybackSound } from "@repo/music-core";
import { encodeWav } from "@repo/music-core/io/wav";
import { outputKeys } from "@repo/music-core/io/calibration";
import type { StudioChange } from "@repo/music-core/content/studio";
import { CLICK_HZ } from "@repo/music-core/signal/listen";
import { settings } from "./settings.svelte";
import { clickLog } from "./clicks";
import { getBinary } from "./opfs";
import { bench } from "../bench.svelte";

type Tone = typeof ToneNS;
type Voice = {
  triggerAttackRelease(note: number | number[], dur: number, time?: number, vel?: number): unknown;
  triggerAttack(note: number | number[], time?: number, vel?: number): unknown;
  triggerRelease(note: number | number[], time?: number): unknown;
  releaseAll(time?: number): unknown;
  connect(node: ToneNS.Gain): unknown;
  dispose(): unknown;
};

export interface SequenceNote {
  midi: number;
  /** Seconds from the start of the sequence. */
  time: number;
  /** Seconds. */
  duration: number;
  velocity?: number;
  /** "kit" plays the loaded sample kit's pad (synth drum when the pad is empty). */
  voice?: "piano" | "drum" | "click" | "kit";
  /** Pitched notes: play on this sound instead of the playback sound setting. */
  sound?: PlaybackSound;
  /** The track it belongs to, for a loop's live per-track `gain`. */
  track?: string;
}
export interface SequenceHandle {
  /** performance.now() time at which `time: 0` sounds. */
  readonly startPerf: number;
  readonly playing: boolean;
  readonly done: Promise<void>;
  stop(): void;
  /** Change the playback level while it sounds (dB). */
  setGain(db: number): void;
}
export interface MetronomeOptions {
  bpm: number;
  beatsPerBar?: number;
  countInBars?: number;
  /**
   * Clicks after the count-in; the count-in itself always sounds. A boolean
   * is read together with the strip's Metronome switch (bench.clickDuringRun)
   * on every beat, so flipping it during a run takes effect at once. A
   * function decides on its own (the strip's preview).
   */
  audible?: boolean | (() => boolean);
  /** beat 0..beatsPerBar-1; bar counts from 0 at the downbeat, negative during the count-in. */
  onBeat?: (beat: number, bar: number, perfAt: number, isCountIn: boolean) => void;
}
export interface MetronomeHandle {
  startPerf: number;
  /** First beat after the count-in. */
  downbeatPerf: number;
  stop(): void;
}
export type DroneTimbre = "sine" | "cello" | "shruti";
/** A sample kit pad: `soft` plays 0..0.63, `hard` 0.64..1; strings are OPFS paths. */
export interface KitPad {
  midi: number;
  soft?: string | Blob;
  hard?: string | Blob;
  /** MPC mute group 1..16: pads in the same group cut each other off. */
  chokeGroup?: number;
}
export interface SampleKit {
  id: string;
  name?: string;
  pads: KitPad[];
}

const SALAMANDER = "https://tonejs.github.io/audio/salamander/";
const LOOKAHEAD_S = 1;
const TOPUP_S = 0.1;
const HARD_LAYER = 0.64;

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

let T: Tone | null = null;
let toneLoading: Promise<Tone> | null = null;
const loadTone = () => (toneLoading ??= import("tone").then((m) => (T = m)));
// Warm the module so unlock() can call Tone.start() inside the gesture.
if (browser) setTimeout(() => loadTone().catch(() => {}), 300);

let unlocked = $state(false);
let sampleState = $state<"idle" | "loading" | "ready" | "error">("idle");
let sampleError = $state("");
let dronePlaying = $state(false);

let graph: { master: ToneNS.Gain; playback: ToneNS.Gain; metronome: ToneNS.Gain } | null = null;
let pianoBuffers: Record<string, ToneNS.ToneAudioBuffer> | null = null;
let live: Voice | null = null;
let liveSound = "";

/** A play call arrived before the browser let sound start (no gesture yet): the strip asks for a tap. */
let blocked = $state(false);
const ready = (): Tone | null => {
  if (unlocked && graph && T) return T;
  if (!unlocked && !blocked) blocked = true;
  return null;
};
const rawCtx = (t: Tone) => t.getContext().rawContext as unknown as BaseAudioContext;

// ---------------------------------------------------------------------------
// Backing style. "classic" keeps the earlier drum, bass and electric piano
// sounds, dry and unhumanised, to compare against. Set it with
// `?backing=classic` (or `=new`) on any music URL; it is remembered.

const BACKING_KEY = "woodshed:backing";
let classic = false;
if (browser)
  try {
    const q = new URLSearchParams(location.search).get("backing");
    if (q === "classic" || q === "new") localStorage.setItem(BACKING_KEY, q);
    classic = localStorage.getItem(BACKING_KEY) === "classic";
  } catch {
    // storage blocked: the new sounds
  }
/** True while the earlier backing sounds are chosen. */
export const classicBacking = () => classic;

/**
 * A small shared room for drums and the electric piano: a send into a short
 * generated impulse, one per audio context. Only the wet signal passes through
 * it, so it adds no delay to what is heard dry.
 */
const rooms = new WeakMap<BaseAudioContext, GainNode>();
function room(t: Tone, raw: BaseAudioContext): GainNode {
  let send = rooms.get(raw);
  if (!send) {
    send = raw.createGain();
    send.gain.value = 0.5;
    const len = Math.round(raw.sampleRate * 0.4);
    const ir = raw.createBuffer(2, len, raw.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-7 * i) / len);
    }
    const conv = raw.createConvolver();
    conv.buffer = ir;
    const lp = raw.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4500;
    send.connect(conv).connect(lp);
    const live = graph && (graph.playback.context.rawContext as unknown) === raw;
    t.connect(lp, live ? graph!.playback : t.getDestination());
    rooms.set(raw, send);
  }
  return send;
}

// ---------------------------------------------------------------------------
// Voices

function makeVoice(t: Tone, sound: PlaybackSound): Voice {
  const poly = (options: object): Voice =>
    new t.PolySynth(t.Synth, options as never) as unknown as Voice;
  switch (sound) {
    case "salamander-piano":
      if (pianoBuffers)
        return new t.Sampler({ urls: pianoBuffers, release: 1 }) as unknown as Voice;
      return makeVoice(t, "warm-synth");
    case "warm-synth":
      return poly({
        oscillator: { type: "fattriangle", count: 3, spread: 18 },
        envelope: { attack: 0.02, decay: 0.4, sustain: 0.35, release: 1.2 },
        volume: -10,
      });
    case "synth":
      return poly({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.6 },
        volume: -6,
      });
    case "e-piano":
      // A tine: a 1:1 FM pair whose brightness falls away after the attack.
      if (!classic)
        return new t.PolySynth(t.FMSynth, {
          harmonicity: 1,
          modulationIndex: 3.2,
          envelope: { attack: 0.003, decay: 1.8, sustain: 0.12, release: 0.9 },
          modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0.15, release: 0.5 },
          volume: -9,
        }) as unknown as Voice;
      return new t.PolySynth(t.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 14,
        envelope: { attack: 0.002, decay: 1.4, sustain: 0.15, release: 1 },
        modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0.1, release: 0.6 },
        volume: -12,
      }) as unknown as Voice;
    case "square":
      return poly({
        oscillator: { type: "square" },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.4 },
        volume: -18,
      });
    case "saw":
      return poly({
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.4 },
        volume: -18,
      });
    case "bass":
      // A fingered bass: few harmonics, a filter that opens on the pluck and closes fast.
      if (!classic)
        return new t.PolySynth(t.MonoSynth, {
          oscillator: { type: "sawtooth8" },
          filter: { Q: 1, type: "lowpass", rolloff: -24 },
          filterEnvelope: {
            attack: 0.002,
            decay: 0.16,
            sustain: 0.15,
            release: 0.2,
            baseFrequency: 90,
            octaves: 3.6,
          },
          envelope: { attack: 0.004, decay: 0.9, sustain: 0.35, release: 0.12 },
          volume: -11,
        } as never) as unknown as Voice;
      return new t.PolySynth(t.MonoSynth, {
        oscillator: { type: "fatsawtooth", count: 2, spread: 12 },
        filter: { Q: 2, type: "lowpass", rolloff: -24 },
        filterEnvelope: {
          attack: 0.005,
          decay: 0.25,
          sustain: 0.35,
          release: 0.3,
          baseFrequency: 110,
          octaves: 2.8,
        },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.25 },
        volume: -12,
      } as never) as unknown as Voice;
    case "pad":
      return poly({
        oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
        envelope: { attack: 0.35, decay: 0.6, sustain: 0.7, release: 1.8 },
        volume: -24,
      });
  }
}

function loadPiano(t: Tone) {
  if (sampleState === "loading" || sampleState === "ready") return;
  sampleState = "loading";
  const urls: Record<string, string> = { C8: "C8.mp3" };
  for (let oct = 0; oct <= 7; oct++)
    for (const n of ["C", "D#", "F#", "A"])
      if (oct > 0 || n === "A") urls[n + oct] = `${n.replace("#", "s")}${oct}.mp3`;
  const buffers = new t.ToneAudioBuffers({
    urls,
    baseUrl: SALAMANDER,
    onload: () => {
      pianoBuffers = Object.fromEntries(Object.keys(urls).map((k) => [k, buffers.get(k)]));
      sampleState = "ready";
    },
    onerror: (e) => {
      sampleError = `The sampled piano didn't load (${e.message}). Using Warm synth.`;
      sampleState = "error";
    },
  });
}

/** The live voice follows the setting; the piano falls back to Warm Synth until its samples land. */
function setLive(t: Tone, sound: PlaybackSound) {
  const want = sound === "salamander-piano" && !pianoBuffers ? "warm-synth" : sound;
  if (want === liveSound || !graph) return;
  const old = live;
  old?.releaseAll();
  setTimeout(() => old?.dispose(), 1500);
  live = makeVoice(t, want);
  live.connect(graph.playback);
  liveSound = want;
}

// ---------------------------------------------------------------------------
// Synthesized hits (drum fallback, clicks, chime). Plain Web Audio nodes from
// Tone's own context, so they also work inside Tone.Offline.

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(raw: BaseAudioContext) {
  let b = noiseCache.get(raw);
  if (!b) {
    b = raw.createBuffer(1, raw.sampleRate, raw.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(raw, b);
  }
  return b;
}

type Hit = { when: number; decay: number; peak: number; attack?: number; room?: boolean };

function envelope(t: Tone, raw: BaseAudioContext, out: ToneNS.Gain, h: Hit) {
  const attack = h.attack ?? 0.002;
  const g = raw.createGain();
  g.gain.setValueAtTime(0.0001, h.when);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, h.peak), h.when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, h.when + attack + h.decay);
  t.connect(g, out);
  if (h.room) g.connect(room(t, raw));
  return { g, end: h.when + attack + h.decay + 0.05 };
}

function tone(
  t: Tone,
  raw: BaseAudioContext,
  out: ToneNS.Gain,
  h: Hit & { type: OscillatorType; f0: number; f1?: number; sweep?: number },
) {
  const { g, end } = envelope(t, raw, out, h);
  const osc = raw.createOscillator();
  osc.type = h.type;
  osc.frequency.setValueAtTime(h.f0, h.when);
  if (h.f1 && h.f1 !== h.f0)
    osc.frequency.exponentialRampToValueAtTime(h.f1, h.when + (h.sweep ?? h.decay * 0.8));
  osc.connect(g);
  osc.start(h.when);
  osc.stop(end);
}

function hiss(
  t: Tone,
  raw: BaseAudioContext,
  out: ToneNS.Gain,
  h: Hit & { filter: BiquadFilterType; freq: number },
) {
  const { g, end } = envelope(t, raw, out, h);
  const src = raw.createBufferSource();
  src.buffer = noise(raw);
  const f = raw.createBiquadFilter();
  f.type = h.filter;
  f.frequency.value = h.freq;
  src.connect(f).connect(g);
  src.start(h.when);
  src.stop(end);
}

// 47 is the kit's cowbell (pad A12): GM puts it on 56, off bank A, and kompa and the Latin grooves need one.
const TOMS: Record<number, number> = { 41: 95, 43: 115, 45: 135, 48: 185, 50: 215 };

/**
 * The synth kit, layered: each drum is a pitched body with a fast pitch drop
 * plus one or two bands of noise (beater, wires, stick), sent lightly to the
 * room. Returns false for a pad it has no recipe for.
 */
function layeredHit(
  t: Tone,
  raw: BaseAudioContext,
  out: ToneNS.Gain,
  midi: number,
  v: number,
  when: number,
): boolean {
  const at = { when, room: true };
  const body = (h: Omit<Parameters<typeof tone>[3], "when" | "room">) =>
    tone(t, raw, out, { ...at, ...h });
  const air = (h: Omit<Parameters<typeof hiss>[3], "when" | "room">, dry = false) =>
    hiss(t, raw, out, { ...at, room: !dry, ...h });
  switch (midi) {
    case 35: // 808: long sub with a short knock
      body({ type: "sine", f0: 110, f1: 43, sweep: 0.07, decay: 1.1, peak: 0.9 * v });
      air({ filter: "lowpass", freq: 1800, decay: 0.012, peak: 0.25 * v }, true);
      return true;
    case 36: // kick: beater click, a drop from 160 Hz, a short low body (kept out of the room)
      tone(t, raw, out, {
        when,
        type: "sine",
        f0: 160,
        f1: 55,
        sweep: 0.06,
        decay: 0.28,
        peak: 0.85 * v,
      });
      tone(t, raw, out, {
        when,
        type: "triangle",
        f0: 90,
        f1: 55,
        sweep: 0.04,
        decay: 0.09,
        peak: 0.3 * v,
      });
      air({ filter: "bandpass", freq: 3200, decay: 0.012, peak: 0.3 * v }, true);
      return true;
    case 38:
    case 40: // snare: two shell tones, wires, a bright crack
      body({ type: "triangle", f0: 200, f1: 175, sweep: 0.03, decay: 0.09, peak: 0.4 * v });
      body({ type: "sine", f0: 335, f1: 290, sweep: 0.03, decay: 0.05, peak: 0.18 * v });
      air({ filter: "highpass", freq: 1800, decay: 0.17, peak: 0.42 * v });
      air({ filter: "bandpass", freq: 5200, decay: 0.06, peak: 0.3 * v });
      return true;
    case 39: // clap: three quick bursts, then the tail
      for (const [d, p] of [
        [0, 0.5],
        [0.011, 0.4],
        [0.022, 0.6],
      ])
        hiss(t, raw, out, {
          when: when + d,
          room: true,
          filter: "bandpass",
          freq: 1400,
          decay: d === 0.022 ? 0.18 : 0.012,
          peak: p * v,
        });
      return true;
    case 42: // closed hat: a tick and a short sizzle
      air({ filter: "highpass", freq: 9000, decay: 0.045, peak: 0.36 * v });
      air({ filter: "bandpass", freq: 6500, decay: 0.02, peak: 0.2 * v });
      return true;
    case 44: // pedal hat: darker and shorter
      air({ filter: "bandpass", freq: 6000, decay: 0.035, peak: 0.4 * v });
      return true;
    case 46: // open hat
      air({ filter: "highpass", freq: 7000, decay: 0.32, peak: 0.24 * v });
      air({ filter: "bandpass", freq: 9500, decay: 0.14, peak: 0.14 * v });
      return true;
    case 49:
    case 52:
    case 55:
    case 57: // crash
      air({ filter: "highpass", freq: 4200, decay: 1.4, peak: 0.24 * v, attack: 0.004 });
      air({ filter: "bandpass", freq: 8000, decay: 0.5, peak: 0.18 * v });
      return true;
    case 51:
    case 53:
    case 59: // ride: stick, two bell partials, a long wash
      air({ filter: "highpass", freq: 9000, decay: 0.015, peak: 0.2 * v });
      body({ type: "triangle", f0: 3100, decay: 0.3, peak: 0.035 * v });
      body({ type: "triangle", f0: 4370, decay: 0.22, peak: 0.03 * v });
      air({ filter: "bandpass", freq: 7200, decay: 0.9, peak: 0.13 * v });
      return true;
  }
  if (TOMS[midi]) {
    body({
      type: "sine",
      f0: TOMS[midi] * 1.5,
      f1: TOMS[midi],
      sweep: 0.05,
      decay: 0.34,
      peak: 0.8 * v,
    });
    air({ filter: "bandpass", freq: 2500, decay: 0.015, peak: 0.2 * v });
    return true;
  }
  return false;
}

/** GM-ish synth kit for pads without samples. */
function drumHit(
  t: Tone,
  raw: BaseAudioContext,
  out: ToneNS.Gain,
  midi: number,
  v: number,
  when: number,
) {
  if (!classic && layeredHit(t, raw, out, midi, v, when)) return;
  const at = { when };
  switch (midi) {
    case 35: // 808
      return tone(t, raw, out, { ...at, type: "sine", f0: 65, f1: 42, decay: 1.1, peak: 0.9 * v });
    case 36: // kick
      return tone(t, raw, out, { ...at, type: "sine", f0: 150, f1: 45, decay: 0.35, peak: v });
    case 37: // side stick / rim
      tone(t, raw, out, { ...at, type: "triangle", f0: 820, decay: 0.03, peak: 0.4 * v });
      return hiss(t, raw, out, {
        ...at,
        filter: "bandpass",
        freq: 3000,
        decay: 0.03,
        peak: 0.3 * v,
      });
    case 38:
    case 40: // snare
      tone(t, raw, out, { ...at, type: "triangle", f0: 210, f1: 160, decay: 0.1, peak: 0.45 * v });
      return hiss(t, raw, out, {
        ...at,
        filter: "highpass",
        freq: 1200,
        decay: 0.18,
        peak: 0.6 * v,
      });
    case 39: // clap / perc
      return hiss(t, raw, out, {
        ...at,
        filter: "bandpass",
        freq: 1500,
        decay: 0.2,
        peak: 0.7 * v,
      });
    case 42:
    case 44: // closed / pedal hat
      return hiss(t, raw, out, {
        ...at,
        filter: "highpass",
        freq: 8000,
        decay: 0.05,
        peak: 0.35 * v,
      });
    case 46: // open hat
      return hiss(t, raw, out, {
        ...at,
        filter: "highpass",
        freq: 7000,
        decay: 0.35,
        peak: 0.3 * v,
      });
    case 49:
    case 52:
    case 55:
    case 57: // crash
      return hiss(t, raw, out, {
        ...at,
        filter: "highpass",
        freq: 5000,
        decay: 1.2,
        peak: 0.3 * v,
      });
    case 47:
    case 56: // cowbell: two detuned squares, short (the drum-machine bell)
      tone(t, raw, out, { ...at, type: "square", f0: 562, decay: 0.22, peak: 0.22 * v });
      return tone(t, raw, out, { ...at, type: "square", f0: 845, decay: 0.16, peak: 0.16 * v });
    case 51:
    case 53:
    case 59: // ride
      return hiss(t, raw, out, {
        ...at,
        filter: "bandpass",
        freq: 6000,
        decay: 0.8,
        peak: 0.2 * v,
      });
  }
  if (TOMS[midi])
    return tone(t, raw, out, {
      ...at,
      type: "sine",
      f0: TOMS[midi],
      f1: TOMS[midi] * 0.7,
      decay: 0.3,
      peak: 0.8 * v,
    });
  // Anything else: triangle at pitch, 5 ms attack, 160 ms.
  tone(t, raw, out, {
    ...at,
    type: "triangle",
    f0: mtof(midi),
    attack: 0.005,
    decay: 0.16,
    peak: 0.5 * v,
  });
}

function clickAt(t: Tone, raw: BaseAudioContext, out: ToneNS.Gain, when: number, accent: boolean) {
  const f0 = accent ? CLICK_HZ.accent : CLICK_HZ.beat;
  // Tell the microphone path when this click leaves the speakers, so it is not
  // heard as playing (a live context only: an offline render has no speakers).
  if ("outputLatency" in raw) {
    const live = raw as AudioContext;
    const latency = live.outputLatency || live.baseLatency || 0;
    clickLog.add(performance.now() + (when - live.currentTime + latency) * 1000, f0);
  }
  tone(t, raw, out, {
    when,
    type: "sine",
    f0,
    attack: 0.001,
    decay: 0.04,
    peak: accent ? 1 : 0.6,
  });
}

/** A repeatable 0..1 from a number, so a part sounds the same each time it plays. */
const unit = (x: number) => {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};
const CYMBALS = new Set([42, 44, 46, 51, 53, 59]);

function trigger(
  t: Tone,
  raw: BaseAudioContext,
  voiceFor: (sound?: PlaybackSound) => Voice,
  bus: ToneNS.Gain,
  n: SequenceNote,
  when: number,
) {
  const v = n.velocity ?? 0.8;
  if (n.voice === "drum") {
    // A player's hand on a written part: each hit a little louder or softer, and
    // cymbals up to 5 ms behind. Kick, snare and toms stay exactly on the grid.
    if (classic) return drumHit(t, raw, bus, n.midi, v, when);
    const r = unit(n.time * 1000 + n.midi * 7.3);
    const late = CYMBALS.has(n.midi) ? unit(n.time * 733 + n.midi) * 0.005 : 0;
    drumHit(t, raw, bus, n.midi, Math.min(1, v * (0.9 + 0.2 * r)), when + late);
  } else if (n.voice === "kit") kitHit(t, raw, bus, n.midi, v, when);
  else if (n.voice === "click") clickAt(t, raw, bus, when, v >= 0.9);
  else voiceFor(n.sound).triggerAttackRelease(mtof(n.midi), Math.max(0.05, n.duration), when, v);
}

/** One voice per sound for the life of a run, created on first use. */
function runVoices(t: Tone, run: Run) {
  const voices = new Map<PlaybackSound, Voice>();
  run.disposers.push(() => setTimeout(() => voices.forEach((v) => v.dispose()), 2000));
  return (sound: PlaybackSound = settings.value.preferredPlaybackSound) => {
    let v = voices.get(sound);
    if (!v) {
      v = makeVoice(t, sound);
      v.connect(run.bus);
      if (!classic && sound === "e-piano") t.connect(v as never, room(t, rawCtx(t)));
      voices.set(sound, v);
    }
    return v;
  };
}

// ---------------------------------------------------------------------------
// Scheduling

/** Sample raw audio time, scheduling time and performance.now() together. */
function clock(t: Tone) {
  const ctx = t.getContext();
  const raw = ctx.currentTime;
  const perf = performance.now();
  const start = raw + ctx.lookAhead;
  const perfOf = (audioTime: number) => perf + (audioTime - raw) * 1000;
  return { start, startPerf: perfOf(start), perfOf };
}

/** Hand events 0..count-1 to `fire` once they fall within the next second of audio time. */
function lookahead(
  t: Tone,
  count: number,
  timeOf: (i: number) => number,
  fire: (i: number, when: number) => void,
) {
  const ctx = t.getContext();
  let i = 0;
  const top = () => {
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    for (; i < count && timeOf(i) <= horizon; i++) fire(i, timeOf(i));
    if (i >= count) ctx.clearInterval(id);
  };
  const id = ctx.setInterval(top, TOPUP_S);
  top();
  return () => ctx.clearInterval(id);
}

type Run = SequenceHandle & {
  bus: ToneNS.Gain;
  disposers: (() => void)[];
  later(perfAt: number, fn: () => void): void;
  stop(fadeS?: number): void;
};

/**
 * A playback handle is a class instance on purpose: Svelte's $state deep-proxies
 * plain objects, so a stored `{...}` handle stops being === to the one a page
 * compares against when playback ends, and buttons stay stuck on "Stop".
 * Class instances are never proxied.
 */
class RunHandle implements Run {
  readonly disposers: (() => void)[] = [];
  readonly done: Promise<void>;
  #playing = $state(true);
  #timers = new Set<ReturnType<typeof setTimeout>>();
  #resolve!: () => void;

  constructor(
    readonly bus: ToneNS.Gain,
    readonly startPerf: number,
  ) {
    this.done = new Promise<void>((r) => (this.#resolve = r));
  }
  get playing() {
    return this.#playing;
  }
  /** Change the level of what is sounding now (a take's playback gain). */
  setGain(db: number) {
    if (this.#playing) this.bus.gain.rampTo(10 ** (db / 20), 0.05);
  }
  later(perfAt: number, fn: () => void) {
    const id = setTimeout(
      () => {
        this.#timers.delete(id);
        fn();
      },
      Math.max(0, perfAt - performance.now()),
    );
    this.#timers.add(id);
  }
  stop(fadeS: number = 0.04) {
    if (!this.#playing) return;
    this.#playing = false;
    this.#timers.forEach(clearTimeout);
    this.#timers.clear();
    this.disposers.forEach((d) => d());
    this.bus.gain.rampTo(0, fadeS);
    setTimeout(() => this.bus.dispose(), fadeS * 1000 + 250);
    this.#resolve();
  }
}

function createRun(t: Tone, out: ToneNS.Gain, startPerf: number, gain = 1): Run {
  const bus = new t.Gain(gain);
  bus.connect(out);
  return new RunHandle(bus, startPerf);
}

class IdleHandle implements SequenceHandle {
  readonly startPerf = performance.now();
  readonly playing = false;
  readonly done = Promise.resolve();
  stop() {}
  setGain() {}
}
const idleHandle = (): SequenceHandle => new IdleHandle();

let currentSeq: Run | null = null;
let currentMet: Run | null = null;
const blobRuns = new Set<Run>();

function playSequence(
  notes: SequenceNote[],
  opts: {
    onNote?: (index: number, perfAt: number) => void;
    /** performance.now() time for `time: 0`, to line up with a clock already running (ignored when past). */
    startPerf?: number;
  } = {},
): SequenceHandle {
  currentSeq?.stop();
  currentSeq = null;
  const t = ready();
  if (!t || !graph) return idleHandle();
  const now = clock(t);
  const lead = opts.startPerf ? Math.max(0, (opts.startPerf - now.startPerf) / 1000) : 0;
  const c = { ...now, start: now.start + lead, startPerf: now.startPerf + lead * 1000 };
  const run = createRun(t, graph.playback, c.startPerf);
  currentSeq = run;
  const voiceFor = runVoices(t, run);
  const raw = rawCtx(t);
  const order = notes.map((_, i) => i).sort((a, b) => notes[a].time - notes[b].time);
  const end = notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0);
  run.disposers.push(
    lookahead(
      t,
      order.length,
      (k) => c.start + notes[order[k]].time,
      (k, when) => {
        const i = order[k];
        trigger(t, raw, voiceFor, run.bus, notes[i], when);
        if (opts.onNote) run.later(c.perfOf(when), () => opts.onNote!(i, c.perfOf(when)));
      },
    ),
  );
  // Natural end: let the tails ring out over a second.
  run.later(c.perfOf(c.start + end), () => run.stop(1));
  return run;
}

/**
 * A gapless loop on its own channel: it neither stops nor is stopped by
 * playSequence, so a beat and a melody can run together. `notes()` and
 * `lengthSec()` are read again at every loop start, so edits are heard on the
 * next pass. Notes are handed to the voices 1 s ahead, like every sequence.
 * `onLoop(perfAt, lengthSec)` fires at the performance-clock start of each pass.
 */
function playLoop(opts: {
  notes: () => SequenceNote[];
  lengthSec: () => number;
  onLoop?: (perfAt: number, lengthSec: number) => void;
  /** A track's level (0..1) read as each note is scheduled, so a fader acts within the look-ahead. */
  gain?: (track: string | undefined) => number;
}): SequenceHandle {
  const t = ready();
  if (!t || !graph) return idleHandle();
  const c = clock(t);
  const run = createRun(t, graph.playback, c.startPerf);
  const voiceFor = runVoices(t, run);
  const raw = rawCtx(t);
  const ctx = t.getContext();
  let loopStart = c.start;
  let length = Math.max(0.25, opts.lengthSec());
  let list = [...opts.notes()].sort((a, b) => a.time - b.time);
  let i = 0;
  opts.onLoop?.(c.perfOf(loopStart), length);
  const top = () => {
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    for (let guard = 0; guard < 10_000; guard++) {
      if (i >= list.length || list[i].time >= length) {
        // The next pass is fetched only once it is inside the look-ahead.
        if (loopStart + length > horizon) break;
        loopStart += length;
        length = Math.max(0.25, opts.lengthSec());
        list = [...opts.notes()].sort((a, b) => a.time - b.time);
        i = 0;
        const perfAt = c.perfOf(loopStart);
        const len = length;
        run.later(perfAt, () => opts.onLoop?.(perfAt, len));
        continue;
      }
      const when = loopStart + list[i].time;
      if (when > horizon) break;
      const n = list[i];
      const g = opts.gain?.(n.track) ?? 1;
      if (g > 0)
        trigger(
          t,
          raw,
          voiceFor,
          run.bus,
          g === 1 ? n : { ...n, velocity: (n.velocity ?? 0.8) * g },
          when,
        );
      i++;
    }
  };
  const id = ctx.setInterval(top, TOPUP_S);
  top();
  run.disposers.push(() => ctx.clearInterval(id));
  loopRuns.add(run);
  void run.done.then(() => loopRuns.delete(run));
  return run;
}
const loopRuns = new Set<Run>();

// ---------------------------------------------------------------------------
// Public surface

async function unlock(): Promise<boolean> {
  const t = T ?? (await loadTone());
  await t.start();
  if (!graph) {
    // A soft ceiling instead of hard clipping: straight below 0.8, bending to 1 above.
    // A wave shaper, not a compressor, because it adds no delay to the output.
    const ceiling = new t.WaveShaper((x) => {
      const a = Math.abs(x);
      return a < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
    }, 4096).toDestination();
    const master = new t.Gain(1).connect(ceiling);
    graph = { master, playback: new t.Gain(0.8), metronome: new t.Gain(0.7) };
    graph.playback.connect(master);
    graph.metronome.connect(master);
    setLive(t, settings.value.preferredPlaybackSound);
    $effect.root(() => {
      $effect(() => {
        const s = settings.value;
        graph!.master.gain.rampTo(s.muted ? 0 : s.masterLevel, 0.03);
        graph!.playback.gain.rampTo(s.playbackLevel, 0.03);
        graph!.metronome.gain.rampTo(s.metronomeLevel, 0.03);
      });
      $effect(() => {
        const sound = settings.value.preferredPlaybackSound;
        void sampleState; // re-run when the piano lands
        untrack(() => {
          if (sound === "salamander-piano") loadPiano(t);
          setLive(t, sound);
        });
      });
    });
  }
  unlocked = t.getContext().state === "running";
  if (unlocked) blocked = false;
  // The reported output latency settles a moment after the context starts, so read it then.
  if (unlocked) setTimeout(() => void refreshOutput(), OUTPUT_SETTLE_MS);
  return unlocked;
}

let lastDrumAt = 0;
function drum(midi: number, velocity = 0.8) {
  const t = ready();
  if (!t || !graph) return;
  let when = t.immediate();
  if (when <= lastDrumAt) when = lastDrumAt + 0.001; // same-time retrigger nudge
  lastDrumAt = when;
  drumHit(t, rawCtx(t), graph.playback, midi, velocity, when);
}

let kit = new Map<number, { soft?: AudioBuffer; hard?: AudioBuffer; chokeGroup?: number }>();
let kitSources: { src: AudioBufferSourceNode; g: GainNode; group?: number }[] = [];

/** Decode a kit's samples. Returns the pads whose samples could not be read. */
async function loadKit(k: SampleKit): Promise<{ failed: number[] }> {
  const t = T ?? (await loadTone());
  const raw = rawCtx(t);
  const failed: number[] = [];
  const decode = async (src?: string | Blob) => {
    if (!src) return undefined;
    const blob = typeof src === "string" ? await getBinary(src) : src;
    if (!blob) throw new Error("missing sample");
    return raw.decodeAudioData(await blob.arrayBuffer());
  };
  const next: typeof kit = new Map();
  await Promise.all(
    k.pads.map(async (pad) => {
      try {
        const [soft, hard] = await Promise.all([decode(pad.soft), decode(pad.hard)]);
        next.set(pad.midi, { soft, hard, chokeGroup: pad.chokeGroup });
      } catch {
        failed.push(pad.midi);
      }
    }),
  );
  kit = next;
  return { failed };
}

function playKitPad(midi: number, velocity = 0.8) {
  const t = ready();
  if (!t || !graph) return;
  kitHit(t, rawCtx(t), graph.playback, midi, velocity, t.immediate());
}

/** A kit pad at an exact audio time (sequences schedule it ahead); synth drum when the pad has no sample. */
function kitHit(
  t: Tone,
  raw: BaseAudioContext,
  out: ToneNS.Gain,
  midi: number,
  velocity: number,
  when: number,
) {
  const pad = kit.get(midi);
  const buffer = pad && (velocity >= HARD_LAYER ? (pad.hard ?? pad.soft) : (pad.soft ?? pad.hard));
  if (!pad || !buffer) return drumHit(t, raw, out, midi, velocity, when);
  if (pad.chokeGroup)
    for (const s of kitSources)
      if (s.group === pad.chokeGroup) {
        s.g.gain.setTargetAtTime(0, when, 0.005);
        try {
          s.src.stop(when + 0.05);
        } catch {
          // already stopped
        }
      }
  const src = raw.createBufferSource();
  src.buffer = buffer;
  const g = raw.createGain();
  g.gain.value = Math.max(0.05, velocity);
  src.connect(g);
  t.connect(g, out);
  src.start(when);
  const entry = { src, g, group: pad.chokeGroup };
  kitSources.push(entry);
  src.onended = () => (kitSources = kitSources.filter((e) => e !== entry));
}

let droneStop: (() => void) | null = null;

// Auditioning a note on another sound (a piano-roll voice) without changing the live voice.
const previewVoices = new Map<PlaybackSound, Voice>();
function previewNote(
  t: Tone,
  sound: PlaybackSound,
  midi: number,
  durSec: number,
  velocity: number,
) {
  let v = previewVoices.get(sound);
  if (!v) {
    v = makeVoice(t, sound);
    v.connect(graph!.playback);
    previewVoices.set(sound, v);
  }
  v.triggerAttackRelease(mtof(midi), durSec, t.immediate(), velocity);
}

let droneAnalyser: AnalyserNode | null = null;

const drone = {
  get playing() {
    return dronePlaying;
  },
  /** A tap on the drone's output for visualisations; null when silent. */
  get analyser() {
    return droneAnalyser;
  },
  start(midi: number, timbre: DroneTimbre = "sine", volume = 0.4) {
    drone.stop();
    const t = ready();
    if (!t || !graph) return;
    const f = mtof(midi);
    const out = new t.Gain(0);
    out.connect(graph.master);
    const filter = timbre === "cello" ? new t.Filter(900, "lowpass") : null;
    filter?.connect(out);
    const stack: [number, number][] =
      timbre === "shruti"
        ? [
            [f, 0.5],
            [f * 1.5, 0.3],
            [f * 2, 0.2],
          ]
        : [[f, 1]];
    const nodes = stack.map(([hz, level]) => {
      const g = new t.Gain(level);
      g.connect(filter ?? out);
      const osc =
        timbre === "cello"
          ? new t.FatOscillator(hz, "sawtooth", 12)
          : new t.Oscillator(hz, timbre === "shruti" ? "triangle" : "sine");
      osc.connect(g);
      osc.start();
      return [osc, g] as const;
    });
    const analyser = rawCtx(t).createAnalyser();
    analyser.fftSize = 2048;
    out.connect(analyser);
    droneAnalyser = analyser;
    out.gain.rampTo(volume, 0.3);
    dronePlaying = true;
    droneStop = () => {
      out.gain.rampTo(0, 0.3);
      setTimeout(() => {
        nodes.forEach(([osc, g]) => (osc.dispose(), g.dispose()));
        filter?.dispose();
        out.dispose();
      }, 450);
    };
  },
  stop() {
    droneStop?.();
    droneStop = null;
    droneAnalyser = null;
    dronePlaying = false;
  },
};

const metronome = {
  get running() {
    return !!currentMet?.playing;
  },
  start({
    bpm,
    beatsPerBar = 4,
    countInBars = 0,
    audible = true,
    onBeat,
  }: MetronomeOptions): MetronomeHandle {
    metronome.stop();
    const t = ready();
    if (!t || !graph) {
      const now = performance.now();
      return { startPerf: now, downbeatPerf: now, stop() {} };
    }
    const beat = 60 / bpm;
    const countIn = countInBars * beatsPerBar;
    const c = clock(t);
    const run = createRun(t, graph.metronome, c.startPerf);
    currentMet = run;
    const raw = rawCtx(t);
    run.disposers.push(
      lookahead(
        t,
        Infinity,
        (i) => c.start + i * beat,
        (i, when) => {
          const pos = i % beatsPerBar;
          const isCountIn = i < countIn;
          const click = typeof audible === "function" ? audible() : audible && bench.clickDuringRun;
          if (click || isCountIn) clickAt(t, raw, run.bus, when, pos === 0);
          if (onBeat)
            run.later(c.perfOf(when), () =>
              onBeat(pos, Math.floor(i / beatsPerBar) - countInBars, c.perfOf(when), isCountIn),
            );
        },
      ),
    );
    return {
      startPerf: c.startPerf,
      downbeatPerf: c.startPerf + countIn * beat * 1000,
      stop: () => run.stop(),
    };
  },
  stop() {
    currentMet?.stop();
    currentMet = null;
  },
};

async function renderWav(notes: SequenceNote[], durationSec: number): Promise<Blob> {
  const rendered = await renderNotes(notes, durationSec + 0.5); // tail so the last note rings out
  const wav = encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], 44100);
  return new Blob([wav as Uint8Array<ArrayBuffer>], { type: "audio/wav" });
}

/** Notes rendered offline to a stereo 44.1 kHz buffer, each on its own sound. */
async function renderNotes(notes: SequenceNote[], durationSec: number) {
  const t = T ?? (await loadTone());
  const sound = settings.value.preferredPlaybackSound;
  return t.Offline(
    () => {
      const bus = new t.Gain(1).toDestination();
      // Each voice's own sound, the playback sound for the rest.
      const voices = new Map<PlaybackSound, Voice>();
      const voiceFor = (x: PlaybackSound = sound) => {
        let v = voices.get(x);
        if (!v) {
          v = makeVoice(t, x);
          v.connect(bus);
          if (!classic && x === "e-piano") t.connect(v as never, room(t, rawCtx(t)));
          voices.set(x, v);
        }
        return v;
      };
      const raw = rawCtx(t);
      for (const n of notes) trigger(t, raw, voiceFor, bus, n, n.time);
    },
    durationSec,
    2,
    44100,
  );
}

// ---------------------------------------------------------------------------
// Studio ears: a loop through a bell EQ, a panner and a gain, heard flat or
// changed. Changes glide over about 50 ms (no clicks); the source sits 12 dB
// down so a +12 dB boost never clips, and nothing compresses what is judged.

export type { StudioChange };
export interface StudioLoop {
  /** What Changed applies; `trimDb` (Changed only) matches loudness when the task asks for it. */
  set(change: StudioChange, trimDb?: number): void;
  show(changed: boolean): void;
  stop(): void;
}

/** Pink noise (Paul Kellet's filter), RMS-normalised, seconds long. */
function pinkNoise(sampleRate: number, seconds = 8): AudioBuffer {
  const n = Math.round(sampleRate * seconds);
  const buf = new AudioBuffer({ length: n, sampleRate, numberOfChannels: 1 });
  const d = buf.getChannelData(0);
  let [b0, b1, b2, b3, b4, b5, b6] = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  normalise(buf);
  return buf;
}

/** Scale to an RMS of -18 dBFS, so every material plays at one level. */
function normalise(buf: AudioBuffer) {
  let sum = 0;
  let count = 0;
  for (let c = 0; c < buf.numberOfChannels; c++)
    for (const x of buf.getChannelData(c)) {
      sum += x * x;
      count++;
    }
  const k = 10 ** (-18 / 20) / Math.sqrt(sum / count || 1);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

/** Two bars of a groove at 90 BPM: kick, snare, hats; with bass and chords for "music". */
function studioNotes(kind: "drums" | "music"): { notes: SequenceNote[]; seconds: number } {
  const beat = 60 / 90;
  const drums: SequenceNote[] = [];
  for (let b = 0; b < 8; b++) {
    if (b % 4 === 0)
      drums.push({ midi: 36, time: b * beat, duration: 0.2, velocity: 0.9, voice: "drum" });
    if (b % 2 === 1)
      drums.push({ midi: 38, time: b * beat, duration: 0.2, velocity: 0.85, voice: "drum" });
    for (const h of [0, 0.5])
      drums.push({
        midi: 42,
        time: (b + h) * beat,
        duration: 0.05,
        velocity: h ? 0.45 : 0.6,
        voice: "drum",
      });
  }
  for (const b of [2.5, 6.5])
    drums.push({ midi: 36, time: b * beat, duration: 0.2, velocity: 0.8, voice: "drum" });
  if (kind === "drums") return { notes: drums, seconds: 8 * beat };
  // I - vi - IV - V in C, a bar of two chords each, bass on the roots.
  const chords = [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ];
  const band: SequenceNote[] = chords.flatMap((c, i) => [
    ...c.map((m) => ({ midi: m, time: i * 2 * beat, duration: 2 * beat * 0.95, velocity: 0.55 })),
    { midi: c[0] - 24, time: i * 2 * beat, duration: beat * 0.9, velocity: 0.8 },
    { midi: c[0] - 24, time: (i * 2 + 1.5) * beat, duration: beat * 0.4, velocity: 0.7 },
  ]);
  return { notes: [...drums, ...band], seconds: 8 * beat };
}

const studioCache = new Map<string, AudioBuffer>();
/** The loop for a material, made once per page. */
async function studioMaterial(kind: "noise" | "drums" | "music"): Promise<AudioBuffer> {
  const hit = studioCache.get(kind);
  if (hit) return hit;
  const t = ready() ?? (await loadTone());
  let buf: AudioBuffer;
  if (kind === "noise") buf = pinkNoise(rawCtx(t).sampleRate);
  else {
    const { notes, seconds } = studioNotes(kind);
    buf = (await renderNotes(notes, seconds)).get()!;
    normalise(buf);
  }
  studioCache.set(kind, buf);
  return buf;
}

/** Compressor settings: light glues, heavy squashes (fast attack, high ratio). */
const COMP = {
  light: { threshold: -20, ratio: 2.5, attack: 0.02, release: 0.2, knee: 6 },
  heavy: { threshold: -38, ratio: 12, attack: 0.002, release: 0.08, knee: 2 },
} as const;
function setComp(c: DynamicsCompressorNode, kind: "light" | "heavy") {
  const k = COMP[kind];
  c.threshold.value = k.threshold;
  c.ratio.value = k.ratio;
  c.attack.value = k.attack;
  c.release.value = k.release;
  c.knee.value = k.knee;
}

/** The loudness (RMS dB) of two seconds of `buf` through `change`, rendered offline. */
async function studioLoudness(buf: AudioBuffer, change: StudioChange): Promise<number> {
  const len = Math.min(buf.length, buf.sampleRate * 2);
  const ctx = new OfflineAudioContext(buf.numberOfChannels, len, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const eq = ctx.createBiquadFilter();
  eq.type = "peaking";
  if (change.eq) {
    eq.frequency.value = change.eq.freq;
    eq.Q.value = change.eq.q;
    eq.gain.value = change.eq.gainDb;
  }
  // The same 12 dB of headroom as the loop, so the compressor sees the level it will hear.
  const headroom = ctx.createGain();
  headroom.gain.value = 10 ** (-12 / 20);
  src.connect(headroom).connect(eq);
  if (change.comp) {
    const comp = ctx.createDynamicsCompressor();
    setComp(comp, change.comp);
    eq.connect(comp).connect(ctx.destination);
  } else eq.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  let sum = 0;
  for (let c = 0; c < out.numberOfChannels; c++)
    for (const x of out.getChannelData(c)) sum += x * x;
  return 10 * Math.log10(sum / (out.length * out.numberOfChannels) || 1e-12);
}

function studioLoop(buf: AudioBuffer): StudioLoop {
  const t = ready();
  if (!t || !graph) throw new Error("Turn on sound first: browsers only allow sound after a tap.");
  const raw = rawCtx(t) as AudioContext;
  const src = raw.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const headroom = raw.createGain();
  headroom.gain.value = 10 ** (-12 / 20);
  const eq = raw.createBiquadFilter();
  eq.type = "peaking";
  eq.gain.value = 0;
  const pan = raw.createStereoPanner();
  const level = raw.createGain();
  // Dry and compressed paths side by side, crossfaded; a delay sent from their sum.
  const dry = raw.createGain();
  const comp = raw.createDynamicsCompressor();
  const wet = raw.createGain();
  wet.gain.value = 0;
  const sum = raw.createGain();
  const delay = raw.createDelay(2);
  const feedback = raw.createGain();
  feedback.gain.value = 0.3;
  const echo = raw.createGain();
  echo.gain.value = 0;
  src.connect(headroom).connect(eq);
  eq.connect(dry).connect(sum);
  eq.connect(comp).connect(wet).connect(sum);
  sum.connect(pan).connect(level);
  sum.connect(delay).connect(feedback).connect(delay);
  delay.connect(echo).connect(pan);
  const out = new t.Gain(0);
  t.connect(level, out);
  out.connect(graph.master);
  out.gain.rampTo(1, 0.05);
  src.start();
  let change: StudioChange = {};
  let trim = 0;
  let changed = true;
  const glide = (p: AudioParam, v: number) => p.setTargetAtTime(v, raw.currentTime, 0.01);
  const apply = () => {
    if (change.eq) {
      glide(eq.frequency, change.eq.freq);
      glide(eq.Q, change.eq.q);
    }
    glide(eq.gain, changed ? (change.eq?.gainDb ?? 0) : 0);
    glide(pan.pan, changed ? (change.pan ?? 0) : 0);
    if (change.comp) setComp(comp, change.comp);
    const squash = changed && !!change.comp;
    glide(dry.gain, squash ? 0 : 1);
    glide(wet.gain, squash ? 1 : 0);
    if (change.delayMs) delay.delayTime.setValueAtTime(change.delayMs / 1000, raw.currentTime);
    glide(echo.gain, changed && change.delayMs ? 0.45 : 0);
    glide(level.gain, changed ? 10 ** (((change.levelDb ?? 0) + trim) / 20) : 1);
  };
  return {
    set(c, trimDb = 0) {
      change = c;
      trim = trimDb;
      apply();
    },
    show(on) {
      changed = on;
      apply();
    },
    stop() {
      out.gain.rampTo(0, 0.05);
      setTimeout(() => {
        src.stop();
        out.dispose();
      }, 120);
    },
  };
}

/** Learn by ear: a recording looped between two points, slowed or transposed without the other changing. */
export interface EarPlayer {
  buffer: AudioBuffer;
  readonly playing: boolean;
  /** Seconds into the recording now. */
  position(): number;
  play(from?: number): void;
  pause(): void;
  /** Move to `at` seconds, playing on if it was playing. */
  seek(at: number): void;
  /** Speed (0.5 to 1), semitones, the loop. Applied at once, from where it is. */
  set(
    opts: Partial<{ rate: number; semitones: number; a: number; b: number; loop: boolean }>,
  ): void;
  dispose(): void;
}

/**
 * At full speed and pitch a plain Player; otherwise Tone's GrainPlayer, which
 * keeps pitch when slowed (and speed when transposed), with some graininess.
 */
async function earPlayer(blob: Blob): Promise<EarPlayer> {
  const t = ready();
  if (!t || !graph) throw new Error("Turn on sound first: browsers only allow sound after a tap.");
  const tone = t;
  const buffer = await rawCtx(t).decodeAudioData(await blob.arrayBuffer());
  const toneBuffer = new t.ToneAudioBuffer(buffer);
  const out = new t.Gain(1).connect(graph.playback);
  const o = { rate: 1, semitones: 0, a: 0, b: buffer.duration, loop: false };
  let src: ToneNS.Player | ToneNS.GrainPlayer | null = null;
  let anchor = { at: 0, pos: 0 };
  const position = () => {
    if (!src) return anchor.pos;
    const p = anchor.pos + (tone.now() - anchor.at) * o.rate;
    if (o.loop && p >= o.b) return o.a + ((p - o.a) % Math.max(0.05, o.b - o.a));
    return Math.min(p, buffer.duration);
  };
  const drop = () => {
    const s = src;
    src = null;
    if (!s) return;
    s.onstop = () => {};
    s.stop();
    setTimeout(() => s.dispose(), 200);
  };
  function play(from = position()) {
    drop();
    if (o.loop && (from < o.a || from >= o.b)) from = o.a;
    if (from >= buffer.duration - 0.05) from = 0;
    const plain = o.rate === 1 && o.semitones === 0;
    const s = plain
      ? new tone.Player(toneBuffer)
      : new tone.GrainPlayer({ url: toneBuffer, grainSize: 0.1, overlap: 0.05 });
    s.playbackRate = o.rate;
    if (s instanceof tone.GrainPlayer) s.detune = o.semitones * 100;
    s.loop = o.loop;
    if (o.loop) {
      s.loopStart = o.a;
      s.loopEnd = o.b;
    }
    s.connect(out);
    s.onstop = () => {
      if (src !== s) return;
      anchor = { at: 0, pos: position() };
      src = null;
      player.playing = false;
    };
    const at = tone.now() + 0.02;
    s.start(at, from);
    src = s;
    anchor = { at, pos: from };
    player.playing = true;
  }
  const player = {
    buffer,
    playing: false,
    position,
    play,
    pause() {
      const p = position();
      drop();
      anchor = { at: 0, pos: p };
      player.playing = false;
    },
    seek(at: number) {
      const p = Math.max(0, Math.min(at, buffer.duration));
      if (src) play(p);
      else anchor = { at: 0, pos: p };
    },
    set(next: Partial<typeof o>) {
      const p = position();
      Object.assign(o, next);
      anchor = { at: 0, pos: p };
      if (src) play(p);
    },
    dispose() {
      drop();
      out.dispose();
    },
  };
  return player;
}

/** Play a recorded take or backing track. Does not stop other blobs (take over backing is normal). */
async function playBlob(blob: Blob, gainDb = 0): Promise<SequenceHandle> {
  const t = ready();
  if (!t || !graph) throw new Error("Turn on sound first: browsers only allow sound after a tap.");
  const raw = rawCtx(t);
  const buffer = await raw.decodeAudioData(await blob.arrayBuffer());
  const c = clock(t);
  const run = createRun(t, graph.playback, c.startPerf, 10 ** (gainDb / 20));
  const src = raw.createBufferSource();
  src.buffer = buffer;
  t.connect(src, run.bus);
  src.start(c.start);
  src.onended = () => run.stop();
  run.disposers.push(() => {
    try {
      src.stop(raw.currentTime + 0.06);
    } catch {
      // already ended
    }
  });
  blobRuns.add(run);
  run.done.then(() => blobRuns.delete(run));
  return run;
}

function celebrate(kind: "clean" | "best") {
  const t = ready();
  if (!t || !graph) return;
  const raw = rawCtx(t);
  const at = t.immediate() + 0.01;
  const notes = kind === "best" ? [72, 76, 79, 84, 88] : [76, 79, 84];
  notes.forEach((m, i) =>
    tone(t, raw, graph!.playback, {
      type: "triangle",
      f0: mtof(m),
      when: at + i * 0.07,
      decay: i === notes.length - 1 ? 0.9 : 0.35,
      peak: 0.22,
    }),
  );
  if (kind === "best")
    for (const [m, d] of [
      [96, 0.05],
      [100, 0.12],
    ] as const)
      tone(t, raw, graph.playback, {
        type: "sine",
        f0: mtof(m),
        when: at + notes.length * 0.07 + d,
        decay: 0.3,
        peak: 0.07,
      });
}

function stopAll() {
  currentSeq?.stop();
  currentSeq = null;
  loopRuns.forEach((r) => r.stop());
  metronome.stop();
  drone.stop();
  blobRuns.forEach((r) => r.stop());
  for (const s of kitSources)
    try {
      s.src.stop();
    } catch {
      // already ended
    }
  kitSources = [];
  live?.releaseAll();
}

/** Diagnostics only: never applied to scoring. null = the browser did not report it. */
function latencyInfo() {
  const raw = T?.getContext().rawContext as AudioContext | undefined;
  const ms = (s?: number) => (s && s > 0 ? Math.round(s * 10000) / 10 : null);
  return {
    outputLatencyMs: ms(raw?.outputLatency),
    baseLatencyMs: ms(raw?.baseLatency),
    sampleRate: raw?.sampleRate,
  };
}

// What the output answers to, for latency calibration (io/calibration outputKeys). The browser
// reports no output latency before audio runs; until then the output last seen in this browser
// stands in, so saved offsets show and apply.
const OUTPUT_KEY = "woodshed.output";
function lastOutput(): readonly string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OUTPUT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
let outputs = $state.raw<readonly string[]>(browser ? lastOutput() : []);
/** True once the output was read from the running context (not the remembered one). */
let outputMeasured = $state(false);
async function refreshOutput(): Promise<readonly string[]> {
  const raw = T?.getContext().rawContext as (AudioContext & { sinkId?: unknown }) | undefined;
  if (!raw || raw.state !== "running") return outputs;
  // The system default output's label: only shared once the browser gives out device labels.
  const device = await navigator.mediaDevices
    ?.enumerateDevices()
    .then((d) => d.find((x) => x.kind === "audiooutput" && x.deviceId === "default")?.label)
    .catch(() => undefined);
  const next = outputKeys({
    sinkId: typeof raw.sinkId === "string" ? raw.sinkId : undefined,
    device,
    latencyMs: (raw.outputLatency || raw.baseLatency || 0) * 1000,
  });
  if (next.join() !== outputs.join()) {
    outputs = next;
    try {
      localStorage.setItem(OUTPUT_KEY, JSON.stringify(next));
    } catch {
      // not remembered
    }
  }
  outputMeasured = true;
  return outputs;
}
const OUTPUT_SETTLE_MS = 1000;
if (browser)
  navigator.mediaDevices?.addEventListener?.("devicechange", () =>
    setTimeout(() => void refreshOutput(), OUTPUT_SETTLE_MS),
  );

export const audio = {
  get unlocked() {
    return unlocked;
  },
  /** The current output's calibration keys, most specific first; the last one seen until audio runs. */
  get outputs() {
    return outputs;
  },
  get outputMeasured() {
    return outputMeasured;
  },
  refreshOutput,
  /** True once a sound was asked for while audio was still locked; false again after unlock. */
  get blocked() {
    return blocked;
  },
  get sampleState() {
    return sampleState;
  },
  get sampleError() {
    return sampleError;
  },
  /** Call from a click or key handler: browsers only start audio after a gesture. */
  unlock,
  playNote(midi: number, durSec = 0.6, velocity = 0.8, sound?: PlaybackSound) {
    const t = ready();
    if (!t || !graph) return;
    if (sound && sound !== liveSound) return previewNote(t, sound, midi, durSec, velocity);
    live?.triggerAttackRelease(mtof(midi), durSec, t.immediate(), velocity);
  },
  /** Sound a note while it is held (on-screen keys); pair with noteOff. */
  noteOn(midi: number, velocity = 0.8) {
    const t = ready();
    if (t && live) live.triggerAttack(mtof(midi), t.immediate(), velocity);
  },
  noteOff(midi: number) {
    const t = ready();
    if (t && live) live.triggerRelease(mtof(midi), t.immediate());
  },
  playChord(midis: number[], durSec = 1.2, velocity = 0.8) {
    const t = ready();
    if (t && live && midis.length)
      live.triggerAttackRelease(midis.map(mtof), durSec, t.immediate(), velocity);
  },
  playSequence,
  playLoop,
  /** Stop the current sequence (route exit). */
  stopSequence() {
    currentSeq?.stop();
    currentSeq = null;
  },
  metronome,
  click(accent = false) {
    const t = ready();
    if (t && graph) clickAt(t, rawCtx(t), graph.metronome, t.immediate(), accent);
  },
  drone,
  drum,
  loadKit,
  playKitPad,
  stopAll,
  latencyInfo,
  renderWav,
  /** Switch the backing sounds (see classicBacking); voices made afterwards use it. */
  setBackingStyle(style: "classic" | "new") {
    classic = style === "classic";
    try {
      localStorage.setItem(BACKING_KEY, style);
    } catch {
      // not remembered
    }
  },
  playBlob,
  earPlayer,
  studio: { material: studioMaterial, loudness: studioLoudness, loop: studioLoop },
  celebrate,
};
