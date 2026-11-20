// Raw capture for the test recordings: one getUserMedia stream per input with
// the app's own microphone constraints (every processing stage off, both
// channels of a two-input interface), an AudioContext at the input's own
// sample rate, and a worklet that meters every block and, while recording,
// hands back every channel's samples untouched. Several inputs record the same
// performance side by side; nothing here touches the app's microphone, the
// input router or any saved data.
import { LEVEL_FLOOR_DB } from "@repo/music-core/signal/level";
import { m } from "@repo/i18n/messages.js";

const CHUNK = 4096;
// A Blob of self-contained JS, as the app's own capture worklet is built.
const WORKLET = `
class WoodshedClipCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rec = false;
    this.peak = 0;
    this.seen = 0;
    this.buf = [];
    this.n = 0;
    this.port.onmessage = (e) => {
      if (e.data.rec) {
        this.buf = [];
        this.n = 0;
        this.rec = true;
      } else if (this.rec) {
        this.rec = false;
        this.flush();
        this.port.postMessage({ done: true });
      }
    };
  }
  flush() {
    if (!this.n) return;
    const audio = this.buf.map((b) => b.slice(0, this.n));
    this.port.postMessage({ audio }, audio.map((a) => a.buffer));
    this.n = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const len = input[0].length;
    let p = this.peak;
    for (let c = 0; c < input.length; c++) {
      const x = input[c];
      for (let i = 0; i < len; i++) {
        const a = x[i] < 0 ? -x[i] : x[i];
        if (a > p) p = a;
      }
    }
    this.peak = p;
    if (this.rec) {
      while (this.buf.length < input.length) this.buf.push(new Float32Array(${CHUNK}));
      for (let c = 0; c < input.length; c++) this.buf[c].set(input[c], this.n);
      this.n += len;
      if (this.n + 128 > ${CHUNK}) this.flush();
    }
    this.seen += len;
    if (this.seen >= 1024) {
      this.port.postMessage({ peak: this.peak });
      this.peak = 0;
      this.seen = 0;
    }
    return true;
  }
}
registerProcessor("woodshed-clip-capture", WoodshedClipCapture);
`;

/** The app's microphone constraints (runtime/mic.svelte.ts), for one named input. */
export const clipConstraints = (deviceId: string): MediaStreamConstraints => ({
  audio: {
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: false,
    channelCount: { ideal: 2 },
    deviceId: { exact: deviceId },
  },
});

export interface RawTake {
  /** Every channel the input delivered, untouched. */
  channels: Float32Array[];
  sampleRate: number;
  durationSec: number;
  peakDbfs: number;
}

const toDb = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
/** Peak over every channel in dBFS, one decimal; silence reads as the meter's floor. */
export function peakDbfs(channels: Float32Array[]): number {
  let p = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]));
  return Math.round(Math.max(LEVEL_FLOOR_DB, toDb(p)) * 10) / 10;
}

/** Chunks of per-channel blocks joined into one array per channel. */
export function joinChunks(chunks: Float32Array[][]): Float32Array[] {
  const count = chunks.reduce((m, c) => Math.max(m, c.length), 0);
  const frames = chunks.reduce((n, c) => n + (c[0]?.length ?? 0), 0);
  const out = Array.from({ length: count }, () => new Float32Array(frames));
  let at = 0;
  for (const chunk of chunks) {
    for (let c = 0; c < chunk.length; c++) out[c].set(chunk[c], at);
    at += chunk[0]?.length ?? 0;
  }
  return out;
}

/** Peaks at or over this are a clipped take: the input has no headroom left. */
export const CLIP_DB = -1;
const HOLD_MS = 1500;
const CLIP_SHOW_MS = 3000;

/** One audio input: its live level, and a recording of everything it delivers. */
export class ClipInput {
  readonly deviceId: string;
  readonly label: string;
  state = $state<"off" | "starting" | "on" | "error">("off");
  error = $state("");
  /** Peak of the last block, dBFS (floor -60). */
  level = $state(LEVEL_FLOOR_DB);
  /** The highest peak of the last second and a half. */
  held = $state(LEVEL_FLOOR_DB);
  /** A peak reached full scale a moment ago. */
  clipping = $state(false);
  sampleRate = $state(0);
  channels = $state(0);
  recording = $state(false);

  #stream: MediaStream | null = null;
  #ctx: AudioContext | null = null;
  #node: AudioWorkletNode | null = null;
  #chunks: Float32Array[][] = [];
  #heldAt = 0;
  #clipAt = 0;
  #done: (() => void) | null = null;
  #token = 0;

  constructor(deviceId: string, label: string) {
    this.deviceId = deviceId;
    this.label = label;
  }

  /** Call from a user action. Opens the stream and starts the meter. */
  async open(): Promise<boolean> {
    if (this.state === "on" || this.state === "starting") return true;
    const token = ++this.#token;
    this.state = "starting";
    this.error = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia(clipConstraints(this.deviceId));
      if (token !== this.#token) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      this.#stream = stream;
      const track = stream.getAudioTracks()[0];
      const got = track?.getSettings() ?? {};
      // The input's own rate, so the file holds its samples without resampling.
      let ctx: AudioContext;
      try {
        ctx = new AudioContext(got.sampleRate ? { sampleRate: got.sampleRate } : undefined);
      } catch {
        ctx = new AudioContext();
      }
      this.#ctx = ctx;
      await ctx.resume();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (token !== this.#token) return false;
      const count = Math.max(1, Math.min(got.channelCount ?? 2, 32));
      const node = new AudioWorkletNode(ctx, "woodshed-clip-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        // Exactly the input's channels: a mono mic stays one channel, never copied to two.
        channelCount: count,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
      });
      node.port.onmessage = (e) => this.#onMessage(e.data);
      // To the worklet only, never to the speakers.
      ctx.createMediaStreamSource(stream).connect(node);
      this.#node = node;
      this.sampleRate = ctx.sampleRate;
      this.channels = count;
      this.state = "on";
      track?.addEventListener("ended", () => {
        if (this.#stream === stream) {
          this.close();
          this.state = "error";
          this.error = m.music_runtime_clips_input_unplugged();
        }
      });
      return true;
    } catch (e) {
      if (token !== this.#token) return false;
      const err = e as DOMException;
      this.close();
      this.state = "error";
      this.error =
        err.name === "NotAllowedError" || err.name === "SecurityError"
          ? m.music_runtime_clips_input_blocked()
          : err.name === "NotFoundError" || err.name === "OverconstrainedError"
            ? m.music_runtime_clips_input_missing()
            : m.music_runtime_clips_input_failed({ error: err.message });
      return false;
    }
  }

  #onMessage(msg: { peak?: number; audio?: Float32Array[]; done?: boolean }) {
    if (msg.audio) this.#chunks.push(msg.audio);
    if (msg.done) this.#done?.();
    if (msg.peak === undefined) return;
    const now = performance.now();
    const db = Math.max(LEVEL_FLOOR_DB, toDb(msg.peak));
    this.level = db;
    if (db >= this.held || now - this.#heldAt > HOLD_MS) {
      this.held = db;
      this.#heldAt = now;
    }
    if (db >= CLIP_DB) this.#clipAt = now;
    this.clipping = this.#clipAt > 0 && now - this.#clipAt < CLIP_SHOW_MS;
  }

  startRecording() {
    if (this.state !== "on" || !this.#node) return;
    this.#chunks = [];
    this.recording = true;
    this.#node.port.postMessage({ rec: true });
  }

  /** Stops and returns the take, or null when the input dropped out or heard nothing. */
  async stopRecording(): Promise<RawTake | null> {
    if (!this.recording) return null;
    const node = this.#node;
    if (node) {
      await new Promise<void>((resolve) => {
        this.#done = resolve;
        node.port.postMessage({ rec: false });
        // An input unplugged mid-take never answers.
        setTimeout(resolve, 1000);
      });
      this.#done = null;
    }
    this.recording = false;
    const channels = joinChunks(this.#chunks);
    this.#chunks = [];
    const frames = channels[0]?.length ?? 0;
    if (!frames || !this.sampleRate) return null;
    return {
      channels,
      sampleRate: this.sampleRate,
      durationSec: Math.round((frames / this.sampleRate) * 1000) / 1000,
      peakDbfs: peakDbfs(channels),
    };
  }

  close() {
    this.#token++;
    if (this.#node) {
      this.#node.port.onmessage = null;
      this.#node.disconnect();
    }
    this.#stream?.getTracks().forEach((t) => t.stop());
    this.#ctx?.close().catch(() => {});
    this.#node = null;
    this.#stream = null;
    this.#ctx = null;
    this.#done?.();
    this.recording = false;
    this.level = this.held = LEVEL_FLOOR_DB;
    this.clipping = false;
    if (this.state !== "error") this.state = "off";
  }
}

/** Every audio input by its label, without the browser's "Default" and "Communications" aliases. */
export async function listInputs(): Promise<{ deviceId: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter(
      (d) =>
        d.kind === "audioinput" &&
        d.label &&
        d.deviceId !== "default" &&
        d.deviceId !== "communications",
    )
    .map((d) => ({ deviceId: d.deviceId, label: d.label }));
}
