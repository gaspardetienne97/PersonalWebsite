// Timing primitives shared by every grader (scoring rules 6-9).
// Sign convention everywhere: errorMs = hit - expected, positive is late.
import type { Strictness } from "../types";
import { clamp } from "../theory/notes";

const WINDOW_MULTIPLIER: Record<Strictness, number> = { relaxed: 0.24, normal: 0.16, strict: 0.1 };

/** Tempo- and duration-aware match window, always 35..300 ms. */
export function matchWindowMs(
  beatMs: number,
  durationBeats: number,
  strictness: Strictness,
): number {
  const raw = beatMs * WINDOW_MULTIPLIER[strictness] * Math.sqrt(Math.max(0.25, durationBeats));
  return Math.round(clamp(raw, 35, 300));
}

export type TimingVerdict = "early" | "pocket" | "late";

/** The tuner reads the same bucketing as flat / in-tune / sharp. */
export function timingVerdict(errorMs: number, pocketMs = 15): TimingVerdict {
  return errorMs < -pocketMs ? "early" : errorMs > pocketMs ? "late" : "pocket";
}

/** Linear timing credit inside a window: 1 at zero error, 0 at the edge. */
export const timingCredit = (errorMs: number, windowMs: number) =>
  Math.max(0, 1 - Math.abs(errorMs) / windowMs);

export interface Target {
  at: number;
  /** A late-side tolerance: a hit in [at, at + slackMs] has zero error (swing). */
  slackMs?: number;
}

export interface Claim {
  /** Index into the hits array. */
  hit: number;
  errorMs: number;
}

export interface ClaimResult {
  /** One entry per target, null when missed. */
  claims: (Claim | null)[];
  /** Indices of hits no target claimed, in time order. */
  extras: number[];
}

/**
 * The one matcher. Every target claims the nearest unused hit inside its window
 * (nearest pairs first, globally), so a missed note never shifts later hits onto
 * the wrong slot and a double onset cannot answer the same target twice.
 */
export function claim<T extends Target, H extends { at: number }>(
  targets: readonly T[],
  hits: readonly H[],
  windowMs: number | ((target: T, index: number) => number),
  accepts?: (target: T, hit: H) => boolean,
): ClaimResult {
  const order = hits.map((_, i) => i).sort((a, b) => hits[a].at - hits[b].at);
  const candidates: [target: number, hit: number, error: number][] = [];
  targets.forEach((t, ti) => {
    const w = typeof windowMs === "number" ? windowMs : windowMs(t, ti);
    const slack = t.slackMs ?? 0;
    // first hit at or after t.at - w
    let lo = 0;
    let hi = order.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (hits[order[mid]].at < t.at - w) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < order.length && hits[order[k]].at <= t.at + slack + w; k++) {
      const h = order[k];
      const d = hits[h].at - t.at;
      const error = d < 0 ? d : Math.max(0, d - slack);
      if (Math.abs(error) <= w && (!accepts || accepts(t, hits[h])))
        candidates.push([ti, h, error]);
    }
  });
  candidates.sort((a, b) => Math.abs(a[2]) - Math.abs(b[2]) || a[0] - b[0]);
  const claims: (Claim | null)[] = targets.map(() => null);
  const used = new Set<number>();
  for (const [ti, h, error] of candidates) {
    if (claims[ti] || used.has(h)) continue;
    claims[ti] = { hit: h, errorMs: error };
    used.add(h);
  }
  return { claims, extras: order.filter((h) => !used.has(h)) };
}

/** Where evenness reaches zero. */
export const EVENNESS_ZERO_MS = 180;

/**
 * Evenness over inter-onset spacings: mean |actual spacing - expected spacing|
 * between consecutive points. With no spacings the error is the full target
 * spacing, so an empty run cannot score well.
 */
export function evenness(
  points: readonly { expected: number; actual: number }[],
  targetSpacingMs: number,
): { score: number; errorMs: number } {
  const sorted = [...points].sort((a, b) => a.expected - b.expected);
  const errors: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const actual = sorted[i].actual - sorted[i - 1].actual;
    const expected = sorted[i].expected - sorted[i - 1].expected;
    errors.push(Math.abs(actual - expected));
  }
  const errorMs = errors.length
    ? errors.reduce((a, b) => a + b, 0) / errors.length
    : targetSpacingMs;
  return { score: Math.max(0, 1 - errorMs / EVENNESS_ZERO_MS), errorMs };
}

export const TOGETHER_MS = 40;

export interface TogetherBeat {
  /** Earliest onset of the beat (the per-beat onset evenness uses). */
  at: number;
  left?: number;
  right?: number;
  together: boolean;
}

/**
 * Pair the hands' onsets into beats. A beat is a chunk of onsets starting within
 * half a beat of the chunk's first onset (chunking by gap, so a dropped note costs
 * only its own beat); it is "together" when both hands struck within 40 ms.
 */
export function togetherBeats(
  left: readonly number[],
  right: readonly number[],
  beatMs: number,
): { beats: TogetherBeat[]; together: number } {
  const onsets = [
    ...left.map((at) => ({ at, hand: "left" as const })),
    ...right.map((at) => ({ at, hand: "right" as const })),
  ].sort((a, b) => a.at - b.at);
  const beats: TogetherBeat[] = [];
  for (const o of onsets) {
    let beat = beats[beats.length - 1];
    if (!beat || o.at - beat.at > beatMs / 2) {
      beat = { at: o.at, together: false };
      beats.push(beat);
    }
    beat[o.hand] ??= o.at;
  }
  for (const b of beats)
    b.together =
      b.left !== undefined && b.right !== undefined && Math.abs(b.left - b.right) <= TOGETHER_MS;
  return { beats, together: beats.filter((b) => b.together).length };
}

/** A gap longer than this starts the next strum cluster (scoring rules 9). */
export const CHANGE_GAP_MS = 350;

export interface NoteCluster {
  start: number;
  end: number;
  midis: number[];
}

/** Split notes into clusters by silence (a gap > gapMs from the previous note). */
export function clusterByGap(
  notes: readonly { midi: number; at: number }[],
  gapMs = CHANGE_GAP_MS,
): NoteCluster[] {
  const clusters: NoteCluster[] = [];
  for (const n of [...notes].sort((a, b) => a.at - b.at)) {
    const last = clusters[clusters.length - 1];
    if (last && n.at - last.end <= gapMs) {
      last.end = n.at;
      last.midis.push(n.midi);
    } else clusters.push({ start: n.at, end: n.at, midis: [n.midi] });
  }
  return clusters;
}

export interface ClusterSlot {
  /** Index of the cluster this slot grades. */
  cluster: number;
  /** Which of the alternating pair it grades against (0 = from, 1 = to). */
  target: 0 | 1;
  /** Timed mode only: the grading window's index and the cluster's offset from its beat. */
  slot?: number;
  errorMs?: number;
}

/**
 * Assign change clusters to targets. Untimed: alternate from/to, cycling.
 * Timed: every window owns a beat (`periodMs` apart from `anchorAt`, or from the
 * first cluster), each cluster goes to its nearest window, and a window keeps only
 * its nearest cluster; the rest are returned as `unassigned`.
 */
export function alignChangeClusters(
  clusters: readonly NoteCluster[],
  clock?: { periodMs: number; anchorAt?: number },
): { slots: ClusterSlot[]; unassigned: number[] } {
  if (!clock)
    return {
      slots: clusters.map((_, i) => ({ cluster: i, target: (i % 2) as 0 | 1 })),
      unassigned: [],
    };
  const anchor = clock.anchorAt ?? clusters[0]?.start ?? 0;
  const bySlot = new Map<number, ClusterSlot>();
  const unassigned: number[] = [];
  clusters.forEach((c, i) => {
    const slot = Math.max(0, Math.round((c.start - anchor) / clock.periodMs));
    const errorMs = c.start - (anchor + slot * clock.periodMs);
    const prev = bySlot.get(slot);
    if (prev && Math.abs(prev.errorMs!) <= Math.abs(errorMs)) return void unassigned.push(i);
    if (prev) unassigned.push(prev.cluster);
    bySlot.set(slot, { cluster: i, target: (slot % 2) as 0 | 1, slot, errorMs });
  });
  const slots = [...bySlot.values()].sort((a, b) => a.slot! - b.slot!);
  return { slots, unassigned: unassigned.sort((a, b) => a - b) };
}
