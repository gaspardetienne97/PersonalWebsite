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

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export interface KokoroVoice {
  id: string;
  label: string;
  lang: string;
}

/** Curated, higher-grade subset of Kokoro's voices (the full set is larger). */
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: "af_heart", label: "Heart — American", lang: "en-US" },
  { id: "af_bella", label: "Bella — American", lang: "en-US" },
  { id: "am_michael", label: "Michael — American", lang: "en-US" },
  { id: "am_fenrir", label: "Fenrir — American", lang: "en-US" },
  { id: "bf_emma", label: "Emma — British", lang: "en-GB" },
  { id: "bm_george", label: "George — British", lang: "en-GB" },
];

export const DEFAULT_KOKORO_VOICE = KOKORO_VOICES[0].id;

/** Model quality presets — each maps to a *known-good* (device, dtype) pair. */
export type KokoroQuality = "recommended" | "compact";

export interface KokoroQualityOption {
  id: KokoroQuality;
  label: string;
  detail: string;
}

export const KOKORO_QUALITIES: KokoroQualityOption[] = [
  {
    id: "recommended",
    label: "Recommended",
    detail: "Best quality. Uses your GPU when available (~330 MB), otherwise CPU (~90 MB).",
  },
  {
    id: "compact",
    label: "Smaller",
    detail: "CPU only, smaller download (~90 MB). Slower to synthesize.",
  },
];

export const DEFAULT_KOKORO_QUALITY: KokoroQuality = "recommended";

export interface KokoroLoadProgress {
  /** 0..1 across model file downloads. */
  fraction: number;
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

/** Load (and cache) the model for a quality preset. Reloads if the preset changed. */
export function loadKokoro(
  quality: KokoroQuality = DEFAULT_KOKORO_QUALITY,
  onProgress?: (p: KokoroLoadProgress) => void,
): Promise<KokoroModel> {
  if (modelPromise && loadedQuality === quality) return modelPromise;
  loadedQuality = quality;
  const { device, dtype } = resolveConfig(quality);
  modelPromise = (async () => {
    const { KokoroTTS } = await import("kokoro-js");
    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: (info: { status?: string; progress?: number }) => {
        if (info?.status === "progress" && typeof info.progress === "number") {
          onProgress?.({ fraction: Math.min(1, info.progress / 100) });
        }
      },
    });
    return tts as unknown as KokoroModel;
  })();
  // Let a failed load be retried on a later attempt.
  modelPromise.catch(() => {
    if (loadedQuality === quality) {
      modelPromise = null;
      loadedQuality = null;
    }
  });
  return modelPromise;
}

/** True once a model is loaded in memory this session. */
export function kokoroLoaded(): boolean {
  return modelPromise !== null;
}

/** Drop the in-memory model and clear the browser's cached model/voice files. */
export async function clearKokoro(): Promise<void> {
  modelPromise = null;
  loadedQuality = null;
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
