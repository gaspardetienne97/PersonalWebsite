/**
 * Semantic color mapping — pure, framework-agnostic helpers that turn domain
 * values (mastery %, timing offset, confusion counts) into *meaning* tokens.
 *
 * The actual colors live in CSS as theme-derived custom properties
 * (`--success`, `--warn`, `--info`, `--destructive`, …). Components map the
 * tone/zone/step returned here to those tokens, so no component hardcodes a hex
 * value and everything stays contrast-safe across light/dark. A future tuner
 * (Phase 2) reuses `timingZone` for sharp/flat/in-tune.
 */

/** A meaning-bearing tone backed by a CSS token (never a raw color). */
export type SemanticTone = "success" | "warn" | "error" | "info";

/**
 * Diverging classification of a signed reading against a ±tolerance window.
 * The names are read from the *value's* side, not the beat's, so the tuner can
 * rename them to flat/in-tune/sharp. Timing code wants {@link timingVerdict},
 * which speaks in early/late.
 */
export type TimingZone = "behind" | "pocket" | "ahead";

/**
 * Where a hit sat relative to the beat. Every scorer computes
 * `errorMs = hit − expected`, so a positive error means the hit arrived *late*.
 */
export type TimingVerdict = "early" | "pocket" | "late";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Map a 0–100 mastery percentage to a semantic tone (red → amber → green).
 * Used for mastery rings and capability summaries.
 */
export function masteryTone(percent: number): SemanticTone {
  const p = clamp(percent, 0, 100);
  if (p >= 67) return "success";
  if (p >= 34) return "warn";
  return "error";
}

/**
 * Map a 0–1 accuracy ratio to a semantic tone. Mirrors `masteryTone` but on a
 * unit scale for session summaries.
 */
export function accuracyTone(ratio: number): SemanticTone {
  return masteryTone(clamp(ratio, 0, 1) * 100);
}

/**
 * Bucket a signed reading against a ±`pocketMs` window: below the window,
 * inside it, above it. The tuner renames the buckets to flat/in-tune/sharp.
 * Timing callers want {@link timingVerdict} instead — with `errorMs` being
 * `hit − expected`, a positive reading is a *late* hit, not an early one.
 */
export function timingZone(offsetMs: number, pocketMs = 15): TimingZone {
  if (Math.abs(offsetMs) <= pocketMs) return "pocket";
  return offsetMs < 0 ? "behind" : "ahead";
}

/**
 * Classify a scorer's `errorMs` (`hit − expected`) for a timing meter: negative
 * is an early hit, positive a late one, within ±`pocketMs` is in the pocket.
 */
export function timingVerdict(errorMs: number, pocketMs = 15): TimingVerdict {
  if (Math.abs(errorMs) <= pocketMs) return "pocket";
  return errorMs < 0 ? "early" : "late";
}

/**
 * Bucket a value into `0..steps` for a sequential heatmap (e.g. confusion
 * intensity). `0` means "no data" (render empty); `1..steps` are increasing
 * intensity. `max` is the largest value in the set.
 */
export function intensityStep(value: number, max: number, steps = 4): number {
  if (max <= 0 || value <= 0) return 0;
  const ratio = clamp(value / max, 0, 1);
  return Math.max(1, Math.ceil(ratio * steps));
}
