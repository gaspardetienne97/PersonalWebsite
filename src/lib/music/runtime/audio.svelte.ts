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
import { browser } from "$app/environment";
import { untrack } from "svelte";
import type * as ToneNS from "tone";
import type { PlaybackSound } from "@repo/music-core";
import { encodeWav } from "@repo/music-core/io/wav";
import { settings } from "./settings.svelte";
import { getBinary } from "./opfs";

type Tone = typeof ToneNS;
type Voice = {
  triggerAttackRelease(note: number | number[], dur: number, time?: number, vel?: number): unknown;
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
}
export interface SequenceHandle {
  /** performance.now() time at which `time: 0` sounds. */
  readonly startPerf: number;
  readonly playing: boolean;
  readonly done: Promise<void>;
  stop(): void;
}
export interface MetronomeOptions {
  bpm: number;
  beatsPerBar?: number;
  countInBars?: number;
  /** Clicks after the count-in; the count-in itself always sounds. */
  audible?: boolean;
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

const ready = (): Tone | null => (unlocked && graph && T ? T : null);
const rawCtx = (t: Tone) => t.getContext().rawContext as unknown as BaseAudioContext;

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
      sampleError = `The sampled piano could not load (${e.message}); using Warm Synth.`;
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

type Hit = { when: number; decay: number; peak: number; attack?: number };

function envelope(t: Tone, raw: BaseAudioContext, out: ToneNS.Gain, h: Hit) {
  const attack = h.attack ?? 0.002;
  const g = raw.createGain();
  g.gain.setValueAtTime(0.0001, h.when);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, h.peak), h.when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, h.when + attack + h.decay);
  t.connect(g, out);
  return { g, end: h.when + attack + h.decay + 0.05 };
}

function tone(
  t: Tone,
  raw: BaseAudioContext,
  out: ToneNS.Gain,
  h: Hit & { type: OscillatorType; f0: number; f1?: number },
) {
  const { g, end } = envelope(t, raw, out, h);
  const osc = raw.createOscillator();
  osc.type = h.type;
  osc.frequency.setValueAtTime(h.f0, h.when);
  if (h.f1 && h.f1 !== h.f0)
    osc.frequency.exponentialRampToValueAtTime(h.f1, h.when + h.decay * 0.8);
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

const TOMS: Record<number, number> = { 41: 95, 43: 115, 45: 135, 47: 155, 48: 185, 50: 215 };

/** GM-ish synth kit for pads without samples. */
function drumHit(
  t: Tone,
  raw: BaseAudioContext,
  out: ToneNS.Gain,
  midi: number,
  v: number,
  when: number,
) {
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
  tone(t, raw, out, {
    when,
    type: "sine",
    f0: accent ? 1760 : 1320,
    attack: 0.001,
    decay: 0.04,
    peak: accent ? 1 : 0.6,
  });
}

function trigger(
  t: Tone,
  raw: BaseAudioContext,
  voice: Voice,
  bus: ToneNS.Gain,
  n: SequenceNote,
  when: number,
) {
  const v = n.velocity ?? 0.8;
  if (n.voice === "drum") drumHit(t, raw, bus, n.midi, v, when);
  else if (n.voice === "kit") kitHit(t, raw, bus, n.midi, v, when);
  else if (n.voice === "click") clickAt(t, raw, bus, when, v >= 0.9);
  else voice.triggerAttackRelease(mtof(n.midi), Math.max(0.05, n.duration), when, v);
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

function createRun(t: Tone, out: ToneNS.Gain, startPerf: number, gain = 1): Run {
  const bus = new t.Gain(gain);
  bus.connect(out);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const disposers: (() => void)[] = [];
  let playing = $state(true);
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  return {
    startPerf,
    done,
    bus,
    disposers,
    get playing() {
      return playing;
    },
    later(perfAt, fn) {
      const id = setTimeout(
        () => {
          timers.delete(id);
          fn();
        },
        Math.max(0, perfAt - performance.now()),
      );
      timers.add(id);
    },
    stop(fadeS: number = 0.04) {
      if (!playing) return;
      playing = false;
      timers.forEach(clearTimeout);
      timers.clear();
      disposers.forEach((d) => d());
      bus.gain.rampTo(0, fadeS);
      setTimeout(() => bus.dispose(), fadeS * 1000 + 250);
      resolve();
    },
  };
}

const idleHandle = (): SequenceHandle => ({
  startPerf: performance.now(),
  playing: false,
  done: Promise.resolve(),
  stop() {},
});

let currentSeq: Run | null = null;
let currentMet: Run | null = null;
const blobRuns = new Set<Run>();

function playSequence(
  notes: SequenceNote[],
  opts: { onNote?: (index: number, perfAt: number) => void } = {},
): SequenceHandle {
  currentSeq?.stop();
  currentSeq = null;
  const t = ready();
  if (!t || !graph) return idleHandle();
  const c = clock(t);
  const run = createRun(t, graph.playback, c.startPerf);
  currentSeq = run;
  const voice = makeVoice(t, settings.value.preferredPlaybackSound);
  voice.connect(run.bus);
  run.disposers.push(() => setTimeout(() => voice.dispose(), 1300));
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
        trigger(t, raw, voice, run.bus, notes[i], when);
        if (opts.onNote) run.later(c.perfOf(when), () => opts.onNote!(i, c.perfOf(when)));
      },
    ),
  );
  // Natural end: let the tails ring out over a second.
  run.later(c.perfOf(c.start + end), () => run.stop(1));
  return run;
}

// ---------------------------------------------------------------------------
// Public surface

async function unlock(): Promise<boolean> {
  const t = T ?? (await loadTone());
  await t.start();
  if (!graph) {
    const master = new t.Gain(1).toDestination();
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

const drone = {
  get playing() {
    return dronePlaying;
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
          if (audible || isCountIn) clickAt(t, raw, run.bus, when, pos === 0);
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
  const t = T ?? (await loadTone());
  const sound = settings.value.preferredPlaybackSound;
  const rendered = await t.Offline(
    () => {
      const bus = new t.Gain(1).toDestination();
      const voice = makeVoice(t, sound);
      voice.connect(bus);
      const raw = rawCtx(t);
      for (const n of notes) trigger(t, raw, voice, bus, n, n.time);
    },
    durationSec + 0.5, // tail so the last note rings out
    2,
    44100,
  );
  const wav = encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], 44100);
  return new Blob([wav as Uint8Array<ArrayBuffer>], { type: "audio/wav" });
}

/** Play a recorded take or backing track. Does not stop other blobs (take over backing is normal). */
async function playBlob(blob: Blob, gainDb = 0): Promise<SequenceHandle> {
  const t = ready();
  if (!t || !graph) throw new Error("Enable audio first: browsers only allow sound after a tap.");
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

export const audio = {
  get unlocked() {
    return unlocked;
  },
  get sampleState() {
    return sampleState;
  },
  get sampleError() {
    return sampleError;
  },
  /** Call from a click or key handler: browsers only start audio after a gesture. */
  unlock,
  playNote(midi: number, durSec = 0.6, velocity = 0.8) {
    const t = ready();
    if (t && live) live.triggerAttackRelease(mtof(midi), durSec, t.immediate(), velocity);
  },
  playChord(midis: number[], durSec = 1.2, velocity = 0.8) {
    const t = ready();
    if (t && live && midis.length)
      live.triggerAttackRelease(midis.map(mtof), durSec, t.immediate(), velocity);
  },
  playSequence,
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
  playBlob,
  celebrate,
};
