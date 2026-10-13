// Microphone capture (hardware notes 4, 5). getUserMedia with every processing
// stage off, an AudioWorklet following whichever of two input channels has
// the signal and running the 40 Hz high-pass and posting 2048-sample
// frames plus a rolling 4096-sample wide window, analysis on the main thread,
// notes and onsets pushed into the shared router.
//
// Test hooks:
// - `mic.startSynthetic(t => 0.5 * Math.sin(2 * Math.PI * 110 * t))` renders the
//   function into a looping buffer and feeds it through a MediaStream into the
//   same pipeline (Vitest browser tests use this).
// - `mic.start({ stream })` accepts any MediaStream. In Playwright, replace
//   getUserMedia before the app loads so the real `start()` path runs:
//     await page.addInitScript(() => {
//       navigator.mediaDevices.getUserMedia = async () => {
//         const ctx = new AudioContext(); const osc = ctx.createOscillator();
//         osc.frequency.value = 110; const dest = ctx.createMediaStreamDestination();
//         osc.connect(dest); osc.start(); return dest.stream;
//       };
//     });
//   (or launch Chromium with --use-fake-ui-for-media-stream
//   --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=take.wav).
import { browser } from "$app/environment";
import { createHighPass } from "@repo/music-core/signal/biquad";
import { analyzePitch, TUNER_CLARITY_FLOOR } from "@repo/music-core/signal/pitch";
import { createOnsetDetector } from "@repo/music-core/signal/onset";
import { rmsDb, peakDb, levelAdvice, LEVEL_FLOOR_DB } from "@repo/music-core/signal/level";
import { clamp } from "@repo/music-core";
import { settings } from "./settings.svelte";
import { input } from "./input.svelte";

export type MicState = "off" | "starting" | "on" | "denied" | "error";
export interface MicPitch {
  midi: number;
  cents: number;
  hz: number;
  clarity: number;
}
export interface MicFrame {
  frame: Float32Array;
  wide: Float32Array;
  sampleRate: number;
  /** performance.now() time of the frame's first sample. */
  at: number;
  pitch: MicPitch | null;
  db: number;
}

const FRAME = 2048;
const WIDE = 4096;
const STABLE_FRAMES = 2;
const SILENT_FRAMES = 2; // ponytail: hysteresis knob; one dropped frame should not end a note

// The worklet is a Blob of self-contained JS, so dev and `vp build` behave the same.
const WORKLET = `
const createHighPass = ${createHighPass.toString()};
class WoodshedCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.hp = createHighPass(sampleRate, 40);
    this.frame = new Float32Array(${FRAME});
    this.prev = new Float32Array(${FRAME});
    this.n = 0;
    this.chan = 0;
    this.energy = [0, 0];
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    // Interfaces put a guitar on input 2 as often as input 1: follow the channel
    // carrying the signal (energy over about half a second, a 6 dB margin to switch).
    if (input.length > 1) {
      for (let c = 0; c < 2; c++) {
        const x = input[c];
        let e = 0;
        for (let i = 0; i < x.length; i++) e += x[i] * x[i];
        this.energy[c] = this.energy[c] * 0.995 + e;
      }
      const other = 1 - this.chan;
      if (this.energy[other] > this.energy[this.chan] * 4) this.chan = other;
    }
    const ch = input[Math.min(this.chan, input.length - 1)];
    for (let i = 0; i < ch.length; i++) {
      this.frame[this.n++] = this.hp.process(ch[i]);
      if (this.n === ${FRAME}) {
        const frame = this.frame.slice();
        const wide = new Float32Array(${WIDE});
        wide.set(this.prev, 0);
        wide.set(frame, ${FRAME});
        this.prev = frame.slice();
        this.port.postMessage({ frame, wide, end: currentTime + (i + 1) / sampleRate }, [frame.buffer, wide.buffer]);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("woodshed-capture", WoodshedCapture);
`;

let state = $state<MicState>("off");
let error = $state("");
let level = $state(LEVEL_FLOOR_DB);
let peak = $state(LEVEL_FLOOR_DB);
let advice = $state.raw<ReturnType<typeof levelAdvice> | undefined>();
let pitch = $state.raw<MicPitch | null>(null);
let devices = $state.raw<{ deviceId: string; label: string }[]>([]);

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: AudioWorkletNode | null = null;
let ownsStream = false;
let synthCtx: AudioContext | null = null;
const frameListeners = new Set<(f: MicFrame) => void>();

// Note tracking
let candidate: number | undefined;
let candidateAt = 0;
let candidateRun = 0;
let silentRun = 0;
let sounding: number | undefined;
let onsets: ReturnType<typeof createOnsetDetector> | null = null;

function noteOff(at: number) {
  if (sounding === undefined) return;
  input.router.push({
    kind: "noteoff",
    midi: sounding,
    velocity: 0,
    at,
    source: "audio",
    confidence: 0.7,
  });
  sounding = undefined;
}

function onFrame(msg: { frame: Float32Array; wide: Float32Array; end: number }) {
  if (!ctx) return;
  const sr = ctx.sampleRate;
  // Project the frame onto the performance clock (hardware notes 6).
  const at = performance.now() - (ctx.currentTime - msg.end) * 1000 - (FRAME / sr) * 1000;
  const db = rmsDb(msg.frame);
  level = db;
  peak = peakDb(msg.frame);
  advice = levelAdvice(peak); // the -1 / -6 dB bands are peak bands
  const p = analyzePitch(msg.frame, sr, msg.wide, settings.value.a4Hz);
  const heard = p && p.clarity >= TUNER_CLARITY_FLOOR ? p : null;
  pitch = heard && { midi: heard.midi, cents: heard.cents, hz: heard.hz, clarity: heard.clarity };

  const onset = onsets?.push(msg.frame, at);
  if (onset)
    input.router.push({
      kind: "onset",
      at: onset.at,
      source: "audio",
      strength: onset.strength,
      midi: heard?.midi,
    });

  if (heard) {
    silentRun = 0;
    if (heard.midi === candidate) candidateRun++;
    else {
      candidate = heard.midi;
      candidateAt = at;
      candidateRun = 1;
    }
    if (candidateRun >= STABLE_FRAMES && sounding !== heard.midi) {
      noteOff(candidateAt);
      sounding = heard.midi;
      input.router.push({
        kind: "noteon",
        midi: heard.midi,
        velocity: clamp((db + 60) / 60, 0, 1),
        at: candidateAt,
        source: "audio",
        confidence: clamp(heard.clarity, 0, 1),
        cents: heard.cents,
        velocityMeasured: false,
      });
    }
  } else {
    candidate = undefined;
    candidateRun = 0;
    if (++silentRun >= SILENT_FRAMES) noteOff(at);
  }

  if (frameListeners.size) {
    const f: MicFrame = { frame: msg.frame, wide: msg.wide, sampleRate: sr, at, pitch, db };
    for (const l of frameListeners) l(f);
  }
}

async function refreshDevices() {
  if (!browser || !navigator.mediaDevices?.enumerateDevices) return;
  const all = await navigator.mediaDevices.enumerateDevices();
  devices = all
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

/** Only call from a user action. `stream` injects a MediaStream (tests, Playwright). */
async function start(opts: { deviceId?: string; stream?: MediaStream } = {}): Promise<boolean> {
  if (!browser) return false;
  if (state === "on" || state === "starting") stop();
  state = "starting";
  error = "";
  try {
    if (opts.stream) {
      stream = opts.stream;
      ownsStream = false;
    } else {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("This browser has no microphone access.");
      const deviceId = opts.deviceId ?? settings.value.audioInputDeviceId;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: settings.value.echoCancellation,
          autoGainControl: false,
          noiseSuppression: false,
          // Both inputs of a two-input interface; the capture follows the live one.
          channelCount: { ideal: 2 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      ownsStream = true;
    }
    ctx = new AudioContext();
    await ctx.resume();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    node = new AudioWorkletNode(ctx, "woodshed-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = (e) => onFrame(e.data);
    onsets = createOnsetDetector(ctx.sampleRate);
    // To the worklet only, never to the destination: that is feedback.
    ctx.createMediaStreamSource(stream).connect(node);
    state = "on";
    refreshDevices().catch(() => {});
    return true;
  } catch (e) {
    const err = e as DOMException;
    stop();
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      state = "denied";
      error =
        "Microphone access is blocked. Allow the microphone for this site (the icon in the address bar), then try again.";
    } else {
      state = "error";
      error =
        err.name === "NotFoundError" || err.name === "OverconstrainedError"
          ? "No microphone was found. Plug one in or pick another input in Settings."
          : `The microphone could not start: ${err.message}`;
    }
    return false;
  }
}

function stop() {
  noteOff(performance.now());
  if (node) {
    node.port.onmessage = null;
    node.disconnect();
  }
  if (ownsStream) stream?.getTracks().forEach((t) => t.stop());
  ctx?.close().catch(() => {});
  synthCtx?.close().catch(() => {});
  ctx = null;
  synthCtx = null;
  node = null;
  stream = null;
  onsets = null;
  candidate = undefined;
  candidateRun = silentRun = 0;
  pitch = null;
  level = peak = LEVEL_FLOOR_DB;
  if (state !== "denied" && state !== "error") state = "off";
}

/** Drive the mic pipeline from a generated signal `source(tSeconds) -> sample`. */
async function startSynthetic(source: (t: number) => number, seconds = 4): Promise<boolean> {
  const gen = new AudioContext();
  await gen.resume();
  const buf = gen.createBuffer(1, Math.round(gen.sampleRate * seconds), gen.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = source(i / gen.sampleRate);
  const src = gen.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const dest = gen.createMediaStreamDestination();
  src.connect(dest);
  src.start();
  const ok = await start({ stream: dest.stream });
  synthCtx = gen;
  return ok;
}

/** Record the live mic stream (audio takes). */
/**
 * Record what the microphone hears, optionally boosted by `boostDb` before the
 * encoder (laptop mics are quiet with auto gain off, which pitch detection
 * needs). The boost only affects the recording, never pitch detection.
 */
function record(boostDb = 0): { stop(): Promise<Blob>; setBoost(db: number): void } {
  if (!stream || !ctx || state !== "on") throw new Error("Start the microphone before recording.");
  const src = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain();
  gain.gain.value = 10 ** (boostDb / 20);
  const dest = ctx.createMediaStreamDestination();
  src.connect(gain).connect(dest);
  const rec = new MediaRecorder(dest.stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const done = () => {
    src.disconnect();
    gain.disconnect();
    return new Blob(chunks, { type: rec.mimeType });
  };
  return {
    setBoost: (db) => gain.gain.setTargetAtTime(10 ** (db / 20), ctx!.currentTime, 0.02),
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(done());
        if (rec.state === "inactive") resolve(done());
        else rec.stop();
      }),
  };
}

if (browser)
  navigator.mediaDevices?.addEventListener?.("devicechange", () =>
    refreshDevices().catch(() => {}),
  );

export const mic = {
  get state() {
    return state;
  },
  get error() {
    return error;
  },
  /** RMS level of the last frame, dBFS (floor -60). */
  get level() {
    return level;
  },
  /** Peak level of the last frame, dBFS; `advice` is based on it. */
  get peak() {
    return peak;
  },
  get advice() {
    return advice;
  },
  get pitch() {
    return pitch;
  },
  get devices() {
    return devices;
  },
  get sampleRate() {
    return ctx?.sampleRate;
  },
  start,
  startSynthetic,
  stop,
  record,
  refreshDevices,
  /** Every analysed frame (tuner, chroma). */
  subscribeFrames(fn: (f: MicFrame) => void) {
    frameListeners.add(fn);
    return () => frameListeners.delete(fn);
  },
};
