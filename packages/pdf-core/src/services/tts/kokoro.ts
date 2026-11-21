/** Kokoro-82M neural TTS, running entirely in the browser.
 *
 * The kokoro-js / transformers.js runtime and the model are dynamically
 * imported on first use only, so they never enter the SSR bundle or the default
 * Web Speech path. Synthesis returns a playable WAV object URL.
 *
 * IMPORTANT: dtype must match the device. onnxruntime-web's WebGPU backend has
 * broken int8 support, so a q8 model on WebGPU produces garbled / wrong-language
 * audio. kokoro-js pairs WebGPU with fp32 and WASM with q8 — we do the same.
 */

import { m } from "@repo/i18n/messages.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export interface KokoroVoice {
  id: string;
  /** The voice's own name ("Heart"), the same in every language. */
  name: string;
  /** Name and accent, in the interface language ("Heart (American)"). */
  readonly label: string;
  lang: string;
  /** The voice type Kokoro's own ids encode: "af_" is an American female voice, "bm_" a British male one. */
  gender: "female" | "male";
}

/** A voice whose label follows the interface language: a getter, so don't spread or clone it. */
const voice = (id: string, name: string, lang: "en-US" | "en-GB"): KokoroVoice => ({
  id,
  name,
  lang,
  gender: id[1] === "m" ? "male" : "female",
  get label() {
    const accent = lang === "en-GB" ? m.narrator_voice_british() : m.narrator_voice_american();
    return m.narrator_voice_label({ name, accent });
  },
});

/** Curated, higher-grade subset of Kokoro's voices (the full set is larger). */
export const KOKORO_VOICES: KokoroVoice[] = [
  voice("af_heart", "Heart", "en-US"),
  voice("af_bella", "Bella", "en-US"),
  voice("am_michael", "Michael", "en-US"),
  voice("am_fenrir", "Fenrir", "en-US"),
  voice("bf_emma", "Emma", "en-GB"),
  voice("bm_george", "George", "en-GB"),
];

export const DEFAULT_KOKORO_VOICE = KOKORO_VOICES[0].id;

/** Model quality presets — each maps to a *known-good* (device, dtype) pair. */
export type KokoroQuality = "recommended" | "compact";

export interface KokoroQualityOption {
  id: KokoroQuality;
  readonly label: string;
  /** Size and what it costs, in plain words. The size is the one this device would download. */
  readonly detail: string;
}

// Getters, so the text follows the interface language.
export const KOKORO_QUALITIES: KokoroQualityOption[] = [
  {
    id: "recommended",
    get label() {
      return m.narrator_quality_recommended();
    },
    get detail() {
      return m.narrator_quality_recommended_detail({ size: kokoroDownloadMb("recommended") });
    },
  },
  {
    id: "compact",
    get label() {
      return m.narrator_quality_compact();
    },
    get detail() {
      return m.narrator_quality_compact_detail({ size: kokoroDownloadMb("compact") });
    },
  },
];

export const DEFAULT_KOKORO_QUALITY: KokoroQuality = "recommended";

export interface KokoroLoadProgress {
  /** 0..1 across model file downloads. */
  fraction: number;
  /** Bytes received and expected, when the loader reports them. */
  loadedBytes?: number;
  totalBytes?: number;
}

/** One event from the loader's `progress_callback`. */
export interface KokoroProgressEvent {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

// The loader reports each file on its own. The few-KB config and tokenizer files finish
// first and would swing a bar to 100% and back, so only the files that are the download count.
const DOWNLOAD_FILE_BYTES = 1_000_000;

/** Fold the loader's per-file events into one honest download progress. */
export function downloadTracker(): (info: KokoroProgressEvent) => KokoroLoadProgress | null {
  const files = new Map<string, { loaded: number; total: number }>();
  return (info) => {
    if (info?.status !== "progress") return null;
    if (typeof info.loaded !== "number" || typeof info.total !== "number" || info.total <= 0) {
      // An older loader: a percentage only, no byte counts.
      return typeof info.progress === "number"
        ? { fraction: Math.min(1, info.progress / 100) }
        : null;
    }
    if (info.total < DOWNLOAD_FILE_BYTES) return null;
    files.set(info.file ?? "", { loaded: info.loaded, total: info.total });
    let loadedBytes = 0;
    let totalBytes = 0;
    for (const f of files.values()) {
      loadedBytes += Math.min(f.loaded, f.total);
      totalBytes += f.total;
    }
    return { fraction: loadedBytes / totalBytes, loadedBytes, totalBytes };
  };
}

export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Natural TTS needs WASM at minimum; WebGPU is a speed bonus. */
export function kokoroSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

type Device = "webgpu" | "wasm";
type Dtype = "fp32" | "q8";

/** Resolve a quality preset to a device + dtype the runtime renders correctly. */
function resolveConfig(quality: KokoroQuality): { device: Device; dtype: Dtype } {
  if (quality === "recommended" && webgpuAvailable()) {
    return { device: "webgpu", dtype: "fp32" };
  }
  // "compact", or no WebGPU: CPU with the int8 model (kokoro's documented combo).
  return { device: "wasm", dtype: "q8" };
}

/** Whether a quality preset runs on the GPU on this device. "compact" never does. */
export function kokoroUsesGpu(quality: KokoroQuality): boolean {
  return resolveConfig(quality).device === "webgpu";
}

/** Roughly what a preset downloads on this device, in megabytes (the fp32 model or the int8 one). */
export function kokoroDownloadMb(quality: KokoroQuality): number {
  return resolveConfig(quality).dtype === "fp32" ? 330 : 90;
}

// kokoro-js has no published types we import directly; keep the surface minimal.
interface RawAudioLike {
  audio: Float32Array;
  sampling_rate: number;
  toBlob(): Blob;
}
interface KokoroModel {
  generate(text: string, opts: { voice: string; speed?: number }): Promise<RawAudioLike>;
}

let loadedQuality: KokoroQuality | null = null;
let modelPromise: Promise<KokoroModel> | null = null;
let modelReady = false;
// Everyone waiting on the load in flight hears its progress, not only the first caller.
const progressListeners = new Set<(p: KokoroLoadProgress) => void>();

/** Load (and cache) the model for a quality preset. Reloads if the preset changed. */
export function loadKokoro(
  quality: KokoroQuality = DEFAULT_KOKORO_QUALITY,
  onProgress?: (p: KokoroLoadProgress) => void,
): Promise<KokoroModel> {
  if (modelPromise && loadedQuality === quality) {
    if (onProgress && !modelReady) progressListeners.add(onProgress);
    return modelPromise;
  }
  loadedQuality = quality;
  modelReady = false;
  progressListeners.clear();
  if (onProgress) progressListeners.add(onProgress);
  const { device, dtype } = resolveConfig(quality);
  const track = downloadTracker();
  const promise = (async () => {
    const { KokoroTTS } = await import("kokoro-js");
    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: (info: KokoroProgressEvent) => {
        const p = modelPromise === promise ? track(info) : null;
        if (p) for (const listener of progressListeners) listener(p);
      },
    });
    return tts as unknown as KokoroModel;
  })();
  modelPromise = promise;
  promise.then(
    () => {
      if (modelPromise !== promise) return;
      modelReady = true;
      progressListeners.clear();
    },
    // Let a failed load be retried on a later attempt.
    () => {
      if (modelPromise !== promise) return;
      modelPromise = null;
      loadedQuality = null;
      progressListeners.clear();
    },
  );
  return promise;
}

/** True once a model is loaded, or loading, in memory this session. */
export function kokoroLoaded(): boolean {
  return modelPromise !== null;
}

/** Where a preset's model stands this session: not asked for, on its way, or ready to speak. */
export function kokoroStatus(quality: KokoroQuality): "idle" | "loading" | "ready" {
  if (!modelPromise || loadedQuality !== quality) return "idle";
  return modelReady ? "ready" : "loading";
}

/** Drop the in-memory model and clear the browser's cached model/voice files. */
export async function clearKokoro(): Promise<void> {
  modelPromise = null;
  loadedQuality = null;
  modelReady = false;
  progressListeners.clear();
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => /kokoro|transformers|huggingface|hf-/i.test(n))
        .map((n) => caches.delete(n)),
    );
  } catch {
    // best effort — clearing the cache is not critical
  }
}

export interface SynthResult {
  /** Object URL for a WAV blob — assign to an <audio> element, then revoke. */
  url: string;
  /** Decoded length in seconds (from the raw samples). */
  durationSec: number;
}

/** Synthesize a span of text to a playable WAV object URL. */
export async function synthesize(
  text: string,
  voiceId: string,
  quality: KokoroQuality = DEFAULT_KOKORO_QUALITY,
  onProgress?: (p: KokoroLoadProgress) => void,
): Promise<SynthResult> {
  const tts = await loadKokoro(quality, onProgress);
  const audio = await tts.generate(text, { voice: voiceId });
  return {
    url: URL.createObjectURL(audio.toBlob()),
    durationSec: audio.sampling_rate ? audio.audio.length / audio.sampling_rate : 0,
  };
}

/** Map real audio playback time onto the model's virtual timeline for a sentence. */
export function mapAudioToPos(
  spokenStartMs: number,
  spokenEndMs: number,
  currentSec: number,
  durationSec: number,
): number {
  if (durationSec <= 0) return spokenStartMs;
  const frac = Math.min(1, Math.max(0, currentSec / durationSec));
  return spokenStartMs + frac * (spokenEndMs - spokenStartMs);
}
