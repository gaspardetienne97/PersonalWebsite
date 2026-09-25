// Audio takes (db.audioTakes, bytes in OPFS at music-take-<id>). Pure helpers.
export const GAIN_RANGE = { min: -12, max: 18 } as const;
/** Peak level at which playback starts to clip (catalog: clipping at -1 dB). */
export const CLIP_DB = -1;

export const takeKey = (id: string) => `music-take-${id}`;

/** Peak per bucket, 0..1, for a waveform envelope. */
export function envelope(samples: Float32Array, buckets = 96): number[] {
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
  return `At ${signedDb(gainDb)} the loudest moment would clip (the take peaks at ${Math.round(peakDb)} dB). ${safe > GAIN_RANGE.min ? `${signedDb(Math.max(GAIN_RANGE.min, safe))} or less stays clean.` : ""}`.trim();
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
