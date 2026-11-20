// Microphone capture (hardware notes 4, 5). getUserMedia with every processing
// stage off, an AudioWorklet following whichever of two input channels has
// the signal, running the input filter (a 60 Hz high-pass and the two mains
// notches) and posting 2048-sample frames. Analysis is on the main thread, in
// the listener from music-core (signal/listen.ts): the app's own metronome
// taken out, the level gate, pitch, onsets and the note tracker. Notes and
// onsets are pushed into the shared router.
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
import { browser } from "$app/env";
import { createInputFilter } from "@repo/music-core/signal/biquad";
import { createListener } from "@repo/music-core/signal/listen";
import { CLICK_EARLY_MS, CLICK_LATE_MS } from "@repo/music-core/signal/click";
import type { TrackedNote } from "@repo/music-core/signal/tracker";
import { rmsDb, peakDb, levelAdvice, LEVEL_FLOOR_DB } from "@repo/music-core/signal/level";
import { clamp } from "@repo/music-core";
import { settings } from "./settings.svelte";
import { input } from "./input.svelte";
import { clickLog } from "./clicks";

export type MicState = "off" | "starting" | "on" | "denied" | "error";
export interface MicPitch {
  midi: number;
  cents: number;
  hz: number;
  clarity: number;
}
export interface MicFrame {
  /** The newest 2048 samples and the newest 4096, with the app's own metronome click taken out. */
  frame: Float32Array;
  wide: Float32Array;
  sampleRate: number;
  /** performance.now() time of the frame's first sample. */
  at: number;
  pitch: MicPitch | null;
  db: number;
}

const FRAME = 2048;

// The worklet is a Blob of self-contained JS, so dev and `vp build` behave the same.
const WORKLET = `
const createInputFilter = ${createInputFilter.toString()};
class WoodshedCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.hp = createInputFilter(sampleRate);
    this.frame = new Float32Array(${FRAME});
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
        this.port.postMessage({ frame, end: currentTime + (i + 1) / sampleRate }, [frame.buffer]);
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
let pinned = $state(false);
let startToken = 0;
let liveDevice: string | undefined | null = null;
let devices = $state.raw<{ deviceId: string; label: string }[]>([]);

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: AudioWorkletNode | null = null;
let ownsStream = false;
let synthCtx: AudioContext | null = null;
const frameListeners = new Set<(f: MicFrame) => void>();

let listener: ReturnType<typeof createListener> | null = null;

/** The tracker's note-ons and note-offs, into the router. `db` is the level of the frame they came from. */
function pushNotes(notes: TrackedNote[], db: number) {
  for (const n of notes)
    if (n.kind === "noteon")
      input.router.push({
        kind: "noteon",
        midi: n.midi,
        velocity: clamp((db + 60) / 60, 0, 1),
        at: n.at,
        source: "audio",
        confidence: clamp(n.clarity, 0, 1),
        cents: n.cents,
        velocityMeasured: false,
      });
    else
      input.router.push({
        kind: "noteoff",
        midi: n.midi,
        velocity: 0,
        at: n.at,
        source: "audio",
        confidence: 0.7,
      });
}

function onFrame(msg: { frame: Float32Array; end: number }) {
  if (!ctx || !listener) return;
  const sr = ctx.sampleRate;
  const frameMs = (FRAME / sr) * 1000;
  // Project the frame onto the performance clock (hardware notes 6).
  const at = performance.now() - (ctx.currentTime - msg.end) * 1000 - frameMs;
  level = rmsDb(msg.frame);
  peak = peakDb(msg.frame);
  advice = levelAdvice(peak); // the -1 / -6 dB bands are peak bands
  // The app's own clicks due around this frame: the listener takes them out.
  // Usually one frame comes back; around a click it is the frame before this one.
  const heard = listener.push(msg.frame, at, {
    a4: settings.value.a4Hz,
    clicks: clickLog.between(at - CLICK_LATE_MS - frameMs, at + CLICK_EARLY_MS + 2 * frameMs),
  });
  for (const h of heard) {
    const p = h.pitch;
    pitch = p && { midi: p.midi, cents: p.cents, hz: p.hz, clarity: p.clarity };
    const db = rmsDb(h.frame);
    if (h.onset)
      input.router.push({
        kind: "onset",
        at: h.onset.at,
        source: "audio",
        strength: h.onset.strength,
        midi: p?.midi,
      });
    pushNotes(h.notes, db);
    if (frameListeners.size) {
      const f: MicFrame = { frame: h.frame, wide: h.wide, sampleRate: sr, at: h.at, pitch, db };
      for (const l of frameListeners) l(f);
    }
  }
}

async function refreshDevices() {
  if (!browser || !navigator.mediaDevices?.enumerateDevices) return;
  const all = await navigator.mediaDevices.enumerateDevices();
  devices = all
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

/**
 * Only call from a user action. `stream` injects a MediaStream (tests, Playwright).
 * `pin` keeps it on for every page (the practice strip's switch): a drill's own
 * stop() leaves it running, only stop({ unpin: true }) turns it off.
 */
async function start(
  opts: { deviceId?: string; stream?: MediaStream; pin?: boolean } = {},
): Promise<boolean> {
  if (!browser) return false;
  const wanted = opts.deviceId ?? settings.value.audioInputDeviceId;
  // Already on for the strip with this input: nothing to restart.
  if (pinned && state === "on" && !opts.stream && wanted === liveDevice) return true;
  if (state === "on" || state === "starting") halt();
  // A newer start (or a stop) while this one awaits wins: this one backs out
  // without touching the newer pipeline, so two never run at once.
  const token = ++startToken;
  const stale = () => token !== startToken;
  state = "starting";
  error = "";
  try {
    if (opts.stream) {
      stream = opts.stream;
      ownsStream = false;
    } else {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("This browser has no microphone access.");
      const deviceId = wanted;
      const got = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: settings.value.echoCancellation,
          autoGainControl: false,
          noiseSuppression: false,
          // Both inputs of a two-input interface; the capture follows the live one.
          channelCount: { ideal: 2 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (stale()) {
        got.getTracks().forEach((t) => t.stop());
        return false;
      }
      stream = got;
      ownsStream = true;
    }
    const own = new AudioContext();
    ctx = own;
    await own.resume();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    try {
      await own.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (stale()) return false;
    node = new AudioWorkletNode(own, "woodshed-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = (e) => onFrame(e.data);
    listener = createListener(own.sampleRate);
    // To the worklet only, never to the destination: that is feedback.
    own.createMediaStreamSource(stream!).connect(node);
    state = "on";
    liveDevice = opts.stream ? null : wanted;
    if (opts.pin) pinned = true;
    refreshDevices().catch(() => {});
    return true;
  } catch (e) {
    if (stale()) return false;
    const err = e as DOMException;
    pinned = false;
    halt();
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      state = "denied";
      error =
        "Microphone access is blocked. Allow the microphone for this site (the icon in the address bar), then try again.";
    } else {
      state = "error";
      error =
        err.name === "NotFoundError" || err.name === "OverconstrainedError"
          ? "No microphone found. Plug one in, or pick another input on Connect."
          : `The microphone didn't start: ${err.message}`;
    }
    return false;
  }
}

function stop(opts: { unpin?: boolean } = {}) {
  if (pinned && !opts.unpin) return;
  pinned = false;
  halt();
}

function halt() {
  startToken++;
  if (listener) pushNotes(listener.stop(performance.now()), LEVEL_FLOOR_DB);
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
  listener = null;
  pitch = null;
  level = peak = LEVEL_FLOOR_DB;
  if (state !== "denied" && state !== "error") state = "off";
}

/** Drive the mic pipeline from a generated signal `source(tSeconds) -> sample`. */
async function startSynthetic(
  source: (t: number) => number,
  seconds = 4,
  pin = false,
): Promise<boolean> {
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
  const ok = await start({ stream: dest.stream, pin });
  if (ok) synthCtx = gen;
  else gen.close().catch(() => {});
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
  /** Turned on from the practice strip: stays on across drills until turned off there. */
  get pinned() {
    return pinned;
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
