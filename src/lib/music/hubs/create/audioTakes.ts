// Audio takes (db.audioTakes, bytes in OPFS at music-take-<id>). Pure helpers.
import { m } from "@repo/i18n/messages.js";
export const GAIN_RANGE = { min: -12, max: 18 } as const;
/** Peak level at which playback starts to clip (catalog: clipping at -1 dB). */
export const CLIP_DB = -1;

export const takeKey = (id: string) => `music-take-${id}`;

/** Waveform resolution for new takes (older takes are redrawn at this on first play). */
export const ENVELOPE_BUCKETS = 400;
export const BOOST_RANGE = { min: 0, max: 24 } as const;

/** Peak per bucket, 0..1, for a waveform envelope. */
export function envelope(samples: Float32Array, buckets = ENVELOPE_BUCKETS): number[] {
  const out: number[] = [];
  const size = Math.max(1, Math.floor(samples.length / buckets));
  for (let b = 0; b < buckets; b++) {
    let p = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) p = Math.max(p, Math.abs(samples[i]));
    out.push(Math.round(p * 1000) / 1000);
  }
  return out;
}

export const peakDbOf = (env: readonly number[]) => {
  const p = Math.max(0, ...env);
  return p > 0 ? 20 * Math.log10(p) : -Infinity;
};

/** A sentence when `gainDb` would push the take's loudest moment past -1 dB, else null. */
export function clipWarning(peakDb: number, gainDb: number): string | null {
  if (!Number.isFinite(peakDb) || peakDb + gainDb < CLIP_DB) return null;
  const safe = Math.floor(CLIP_DB - peakDb);
  const gain = signedDb(gainDb);
  const peak = Math.round(peakDb);
  return safe > GAIN_RANGE.min
    ? m.music_hubs_audio_clip_safe({ gain, peak, safe: signedDb(Math.max(GAIN_RANGE.min, safe)) })
    : m.music_hubs_audio_clip({ gain, peak });
}

export const signedDb = (db: number) =>
  `${db > 0 ? "+" : db < 0 ? "−" : ""}${Math.abs(Math.round(db))} dB`;

export function extensionFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("wav")) return "wav";
  return "audio";
}

/**
 * The playback gain a new take starts with: lift its loudest moment to -3 dB
 * (never cut, at most the top of the gain range). The file is untouched.
 */
export function autoGainDb(peakDb: number): number {
  if (!Number.isFinite(peakDb)) return 0;
  return Math.max(0, Math.min(GAIN_RANGE.max, Math.round(-3 - peakDb)));
}

/** Recording boost that would bring a held peak near -12 dB, leaving headroom. */
export function suggestedBoost(heldPeakDb: number, currentBoost: number): number {
  const raw = heldPeakDb - currentBoost;
  return Math.max(BOOST_RANGE.min, Math.min(BOOST_RANGE.max, Math.round(-12 - raw)));
}

/** The takes heading's count: saved takes only, so a take still recording never reads as one of them. */
export const savedTakesLabel = (saved: number) =>
  saved ? m.music_hubs_takes_saved({ count: saved }) : m.music_hubs_takes_none_saved();
