// MPC pads: rudiments and grooves (scoring rules 10, catalog 4.7).
import type { Metric, NoteEvent } from "../types";
import { clamp01 } from "../theory/notes";
import { blend, type Graded, mean, noteOns, stdev, velocityMeasured } from "./grade";
import { claim } from "./timing";

const TIMING_ZERO_MS = 180;
const MAX_MEAN_ERROR_MS = 90;

const timingMetric = (expectedMs: number, actualMs: number): Metric => ({
  kind: "timing",
  expectedMs,
  actualMs,
  errorMs: actualMs - expectedMs,
});

// ---------------------------------------------------------------------------
// Rudiments.

/** Velocity bands (normalized) where a rudiment writes them. */
export const RUDIMENT_BANDS = { accent: [0.75, 1], tap: [0.25, 0.7] } as const;

export interface RudimentResult extends Graded {
  pad: number;
  timing: number;
  meanAbsErrorMs: number;
  /** Null when not measured (on-screen pads). */
  velocity: number | null;
  completion: number;
  matched: number;
  total: number;
  extra: number;
  /** Per stroke: the claimed hit's error (positive late) and whether it was the right pad; null when missed. */
  perStroke: ({ errorMs: number; rightPad: boolean } | null)[];
}

/**
 * `strokes` are offsets from the anchor: the count-in downbeat when given, else
 * the first hit (so a run with no anchor grades its own spacing). Each stroke
 * claims the nearest hit within half a grid step, right pad first, then any pad.
 * score = pad x 0.45 + timing x 0.3 + velocity x 0.15 + completion x 0.1, where
 * timing = 1 - meanAbsErr/180 and velocity is the in-band fraction with bands,
 * else consistency 1 - 2 x stdev(velocity). Banded patterns need varying MIDI velocity,
 * or velocity is not measured.
 */
export function gradeRudiment(input: {
  strokes: readonly { pad: number; offsetMs: number; band?: keyof typeof RUDIMENT_BANDS }[];
  stepMs: number;
  anchorAt?: number;
  hits: readonly NoteEvent[];
}): RudimentResult {
  const hits = noteOns(input.hits);
  const anchor = input.anchorAt ?? (hits[0]?.at ?? 0) - (input.strokes[0]?.offsetMs ?? 0);
  const targets = input.strokes.map((s) => ({ ...s, at: anchor + s.offsetMs }));
  const window = input.stepMs / 2;
  const right = claim(targets, hits, window, (t, h) => t.pad === h.midi);
  const restIdx = targets.flatMap((_, i) => (right.claims[i] ? [] : [i]));
  const rest = claim(
    restIdx.map((i) => targets[i]),
    right.extras.map((h) => hits[h]),
    window,
  );
  const matchedHits = targets.map((t, i) => {
    const c = right.claims[i];
    if (c) return hits[c.hit];
    const k = restIdx.indexOf(i);
    const r = rest.claims[k];
    return r ? hits[right.extras[r.hit]] : null;
  });
  const total = targets.length;
  const matched = matchedHits.filter(Boolean).length;
  const errors = targets.flatMap((t, i) => (matchedHits[i] ? [matchedHits[i]!.at - t.at] : []));
  const meanAbsErrorMs = mean(errors.map(Math.abs));
  const timing = errors.length ? Math.max(0, 1 - meanAbsErrorMs / TIMING_ZERO_MS) : 0;
  const pad = total ? right.claims.filter(Boolean).length / total : 0;
  const completion = total ? matched / total : 0;
  const banded = input.strokes.some((s) => s.band);
  // Accents are graded only when MIDI velocity varies: a pad on Full Level sends
  // one value for every hit, which says nothing about accents.
  const measured =
    velocityMeasured(hits) &&
    (!banded || new Set(hits.map((h) => Math.round(h.velocity * 127))).size > 1);
  const played = targets.flatMap((t, i) =>
    matchedHits[i] ? [{ t, v: matchedHits[i]!.velocity }] : [],
  );
  const velocity = !measured
    ? null
    : !played.length
      ? 0
      : banded
        ? played.filter(
            ({ t, v }) =>
              !t.band || (v >= RUDIMENT_BANDS[t.band][0] && v <= RUDIMENT_BANDS[t.band][1]),
          ).length / played.length
        : clamp01(1 - 2 * stdev(played.map((p) => p.v)));
  const score = hits.length
    ? blend([
        [0.45, pad],
        [0.3, timing],
        [0.15, velocity],
        [0.1, completion],
      ])
    : 0;
  return {
    score,
    correct:
      completion === 1 &&
      pad >= 0.875 &&
      meanAbsErrorMs <= MAX_MEAN_ERROR_MS &&
      (velocity === null || velocity >= (banded ? 0.875 : 0.65)),
    metrics: targets.flatMap((t, i) => {
      const h = matchedHits[i];
      if (!h) return [];
      const m: Metric[] = [timingMetric(t.at, h.at)];
      if (measured && t.band)
        m.push({ kind: "velocity", expected: RUDIMENT_BANDS[t.band][0], actual: h.velocity });
      return m;
    }),
    notMeasured: measured ? [] : ["velocity"],
    pad,
    timing,
    meanAbsErrorMs,
    velocity,
    completion,
    matched,
    total,
    extra: rest.extras.length,
    perStroke: targets.map((t, i) =>
      matchedHits[i] ? { errorMs: matchedHits[i]!.at - t.at, rightPad: !!right.claims[i] } : null,
    ),
  };
}

// ---------------------------------------------------------------------------
// Grooves.

export type Accent = "accent" | "normal" | "ghost";

/** MIDI velocity bands: accent 90..127, normal 50..89, ghost 1..49. */
export function inAccentBand(accent: Accent, velocity: number): boolean {
  const v = Math.round(velocity * 127);
  return accent === "accent"
    ? v >= 90
    : accent === "ghost"
      ? v >= 1 && v <= 49
      : v >= 50 && v <= 89;
}

/** Path check (M-I3): ghosts under 40% of the accent velocity. */
export const GHOST_RATIO = 0.4;

export interface GrooveInput {
  targets: readonly { voice: string; beat: number; accent: Accent }[];
  voicePads: Readonly<Record<string, number>>;
  /** One label per bar ("groove", "fill"); a target past the last bar belongs to it. */
  sectionLabels: readonly string[];
  beatsPerBar: number;
  beatMs: number;
  startAt: number;
  hits: readonly NoteEvent[];
  /** When the response window closes; capture stays open at least to the last beat + window. */
  responseEnd?: number;
}

interface Tally {
  matched: number;
  missed: number;
  extra: number;
  meanAbsErrorMs: number;
}

export interface GrooveResult extends Graded {
  windowMs: number;
  captureEnd: number;
  accuracy: number;
  matched: number;
  missed: number;
  extra: number;
  meanAbsErrorMs: number;
  /** Targets whose hit velocity sat in the marked band; null when accents are not assessable. */
  inBand: number | null;
  /** Mean normal-marked velocity over mean accent-marked velocity; null when not assessable. */
  ghostRatio: number | null;
  perVoice: (Tally & { voice: string; pad: number; inBand: number | null })[];
  perSection: (Tally & { label: string })[];
  /** Per target, in input order: the claimed hit's error (positive late), null when missed. */
  perTarget: (number | null)[];
}

/** Every groove voice must map to a distinct pad 0..127, or the drill refuses to start. */
export function grooveVoiceError(
  voices: readonly string[],
  voicePads: Readonly<Record<string, number>>,
): string | null {
  const seen = new Map<number, string>();
  for (const v of new Set(voices)) {
    const pad = voicePads[v];
    if (pad === undefined) return `No pad is mapped to ${v}.`;
    if (!Number.isInteger(pad) || pad < 0 || pad > 127)
      return `${v} is mapped to ${pad}, outside 0 to 127.`;
    if (seen.has(pad)) return `${seen.get(pad)} and ${v} share pad ${pad}.`;
    seen.set(pad, v);
  }
  return null;
}

export const grooveWindowMs = (beatMs: number) => Math.min(180, beatMs / 8);

export const grooveCaptureEnd = (lastTargetAt: number, beatMs: number, responseEnd = -Infinity) =>
  Math.max(responseEnd, lastTargetAt + grooveWindowMs(beatMs));

/**
 * Per-voice claim inside min(180, beat/8). accuracy = matched / (targets + extras);
 * with assessable accents (measured, varying MIDI velocity) score = accuracy x 0.85
 * + inBand/targets x 0.15. Correct: no misses, no extras, mean timing <= 90 ms.
 */
export function gradeGroove(input: GrooveInput): GrooveResult | { error: string } {
  const error = grooveVoiceError(
    input.targets.map((t) => t.voice),
    input.voicePads,
  );
  if (error) return { error };
  const { beatMs, startAt, beatsPerBar, sectionLabels } = input;
  const windowMs = grooveWindowMs(beatMs);
  const targets = input.targets.map((t) => ({ ...t, at: startAt + t.beat * beatMs }));
  const lastAt = Math.max(...targets.map((t) => t.at), startAt);
  const captureEnd = grooveCaptureEnd(lastAt, beatMs, input.responseEnd);
  const hits = noteOns(input.hits).filter((h) => h.at >= startAt - windowMs && h.at <= captureEnd);
  const { claims, extras } = claim(
    targets,
    hits,
    windowMs,
    (t, h) => input.voicePads[t.voice] === h.midi,
  );

  const assessable =
    velocityMeasured(hits) && new Set(hits.map((h) => Math.round(h.velocity * 127))).size > 1;
  const inBandAt = (i: number) =>
    !!claims[i] && inAccentBand(targets[i].accent, hits[claims[i]!.hit].velocity);
  const matched = claims.filter(Boolean).length;
  const accuracy = targets.length + extras.length ? matched / (targets.length + extras.length) : 0;
  const inBand = assessable ? targets.filter((_, i) => inBandAt(i)).length : null;
  const score = !hits.length
    ? 0
    : inBand === null
      ? accuracy
      : accuracy * 0.85 + (inBand / targets.length) * 0.15;
  const errorsWhere = (keep: (i: number) => boolean) =>
    claims.flatMap((c, i) => (c && keep(i) ? [Math.abs(c.errorMs)] : []));
  const meanAbsErrorMs = mean(errorsWhere(() => true));

  const velOf = (accent: Accent) =>
    claims.flatMap((c, i) => (c && targets[i].accent === accent ? [hits[c.hit].velocity] : []));
  const accents = velOf("accent");
  // Marked ghosts when the groove has them, else its normal notes (the table's grooves).
  const ghosts = velOf("ghost").length ? velOf("ghost") : velOf("normal");
  const ghostRatio =
    assessable && accents.length && ghosts.length ? mean(ghosts) / mean(accents) : null;

  const barOf = (at: number) =>
    Math.max(
      0,
      Math.min(
        sectionLabels.length - 1,
        Math.floor((at - startAt) / (beatMs * beatsPerBar) + 1e-9),
      ),
    );
  const tally = (
    keepTarget: (i: number) => boolean,
    keepExtra: (h: NoteEvent) => boolean,
  ): Tally => ({
    matched: claims.filter((c, i) => c && keepTarget(i)).length,
    missed: claims.filter((c, i) => !c && keepTarget(i)).length,
    extra: extras.filter((h) => keepExtra(hits[h])).length,
    meanAbsErrorMs: mean(errorsWhere(keepTarget)),
  });
  const voices = [...new Set(input.targets.map((t) => t.voice))];
  return {
    score,
    correct:
      hits.length > 0 &&
      matched === targets.length &&
      extras.length === 0 &&
      meanAbsErrorMs <= MAX_MEAN_ERROR_MS,
    metrics: claims.flatMap((c, i): Metric[] =>
      c
        ? [
            timingMetric(targets[i].at, hits[c.hit].at),
            ...(assessable
              ? [
                  {
                    kind: "velocity" as const,
                    expected:
                      targets[i].accent === "accent"
                        ? 90 / 127
                        : targets[i].accent === "ghost"
                          ? 30 / 127
                          : 50 / 127,
                    actual: hits[c.hit].velocity,
                  },
                ]
              : []),
          ]
        : [],
    ),
    notMeasured: assessable ? [] : ["velocity"],
    windowMs,
    captureEnd,
    accuracy,
    matched,
    missed: targets.length - matched,
    extra: extras.length,
    meanAbsErrorMs,
    inBand,
    ghostRatio,
    perVoice: voices.map((voice) => {
      const pad = input.voicePads[voice];
      const mine = (i: number) => targets[i].voice === voice;
      return {
        voice,
        pad,
        ...tally(mine, (h) => h.midi === pad),
        inBand: assessable ? targets.filter((_, i) => mine(i) && inBandAt(i)).length : null,
      };
    }),
    perTarget: claims.map((c) => (c ? c.errorMs : null)),
    perSection: [...new Set(sectionLabels)].map((label) => ({
      label,
      ...tally(
        (i) => sectionLabels[barOf(targets[i].at)] === label,
        (h) => sectionLabels[barOf(h.at)] === label,
      ),
    })),
  };
}

/**
 * How the tempo held once the click stopped (from `fromBeat`): a straight
 * line through the raw hits against the grid. The grid matches cannot be
 * used, since a player who rushes steadily leaves the match window within a
 * bar or two; instead each target claims the hit nearest where the line so
 * far predicts it, and the line is refitted as it goes, so it follows a
 * steady drift. Its slope is the tempo played (rushing makes it steeper
 * than 1 in tempo, dragging shallower); the last bar's mean error is how
 * far off the grid the player ended. Null with fewer than four hits to go on.
 */
export function tempoDrift(
  targets: readonly { beat: number; pad: number }[],
  hits: readonly NoteEvent[],
  beatMs: number,
  startAt: number,
  fromBeat: number,
): { bpmPlayed: number; driftBpm: number; endOffsetMs: number } | null {
  const grid = targets.filter((t) => t.beat >= fromBeat - 1e-6).sort((a, b) => a.beat - b.beat);
  const ons = noteOns(hits)
    .filter((h) => h.at >= startAt + (fromBeat - 0.5) * beatMs)
    .sort((a, b) => a.at - b.at);
  const window = grooveWindowMs(beatMs);
  const used = new Set<number>();
  const pts: { x: number; y: number; beat: number }[] = [];
  let slope = 1;
  let intercept = 0;
  const fit = () => {
    const mx = mean(pts.map((p) => p.x));
    const my = mean(pts.map((p) => p.y));
    const cov = pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0);
    const varx = pts.reduce((t, p) => t + (p.x - mx) ** 2, 0);
    // ponytail: the slope is clamped to a fifth either way so two close points cannot throw the prediction.
    slope = varx ? Math.min(1.25, Math.max(0.8, cov / varx)) : 1;
    intercept = my - slope * mx;
  };
  for (const t of grid) {
    const x = t.beat * beatMs;
    const predicted = slope * x + intercept;
    let best = -1;
    let err = Infinity;
    ons.forEach((h, i) => {
      if (used.has(i) || h.midi !== t.pad) return;
      const d = h.at - startAt - predicted;
      if (Math.abs(d) <= window && Math.abs(d) < Math.abs(err)) [best, err] = [i, d];
    });
    if (best < 0) continue;
    used.add(best);
    pts.push({ x, y: ons[best].at - startAt, beat: t.beat });
    if (pts.length >= 2 && x - pts[0].x >= beatMs) fit();
  }
  if (pts.length < 4) return null;
  const bpm = 60000 / beatMs;
  const bpmPlayed = bpm / slope;
  const lastBar = Math.floor(Math.max(...pts.map((p) => p.beat)) / 4);
  const tail = pts.filter((p) => Math.floor(p.beat / 4) === lastBar);
  return { bpmPlayed, driftBpm: bpmPlayed - bpm, endOffsetMs: mean(tail.map((p) => p.y - p.x)) };
}
