/** Kokoro-82M neural TTS, running entirely in the browser.
 *
 * The model (~90 MB quantized) and the kokoro-js / transformers.js runtime are
 * dynamically imported on first use only, so they never enter the SSR bundle
 * or the default Web Speech path. Synthesis returns a playable WAV object URL.
 */

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export interface KokoroVoice {
  id: string;
  label: string;
  lang: string;
}

/** Curated high-grade subset of Kokoro's voices (the full set is larger). */
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: "af_heart", label: "Heart — American", lang: "en-US" },
  { id: "af_bella", label: "Bella — American", lang: "en-US" },
  { id: "am_michael", label: "Michael — American", lang: "en-US" },
  { id: "am_fenrir", label: "Fenrir — American", lang: "en-US" },
  { id: "bf_emma", label: "Emma — British", lang: "en-GB" },
  { id: "bm_george", label: "George — British", lang: "en-GB" },
];

export const DEFAULT_KOKORO_VOICE = KOKORO_VOICES[0].id;

export interface KokoroLoadProgress {
  /** 0..1 across model file downloads. */
  fraction: number;
}

/** WebGPU is preferred for speed; WASM works everywhere as a fallback. */
export function kokoroSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
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

let modelPromise: Promise<KokoroModel> | null = null;

/** Load (and cache) the model. Safe to call repeatedly; the work happens once. */
export function loadKokoro(onProgress?: (p: KokoroLoadProgress) => void): Promise<KokoroModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      const device = typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
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
      modelPromise = null;
    });
  }
  return modelPromise;
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
  onProgress?: (p: KokoroLoadProgress) => void,
): Promise<SynthResult> {
  const tts = await loadKokoro(onProgress);
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
