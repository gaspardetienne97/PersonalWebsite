// Song Studio: which beats a run covers, the follower groups for it, and the
// mapping between a run's own clock and the score's beats (so the one cursor
// and the group marks land on the right notes in every view).
import type { Score, ScoreGroup, ScoreSection } from "@repo/music-core";
import { scoreGroups } from "@repo/music-core/scoring/follower";
import type { GroupVerdict } from "@repo/music-core/scoring/follower";
import type { BeatRange } from "$lib/music/notation/groups";
import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
import { drumKey } from "@repo/music-core/content/winds-pads";

export type RangeMode = "whole" | "sections" | "custom";
export type SectionOrder = "sequence" | "per-section";

export interface Segment extends BeatRange {
  label: string;
}

/**
 * The passes a run plays. Sequence joins the chosen sections into one pass
 * (in score order); Per section gives each its own pass.
 */
export function planPasses(
  score: Score,
  sections: readonly ScoreSection[],
  opts: {
    mode: RangeMode;
    picked: readonly number[];
    order: SectionOrder;
    custom: BeatRange | null;
  },
): Segment[][] {
  const whole: Segment = { label: "Whole score", startBeat: 0, endBeat: score.lengthBeats };
  if (opts.mode === "custom" && opts.custom && opts.custom.endBeat > opts.custom.startBeat)
    return [[{ label: "Custom range", ...opts.custom }]];
  if (opts.mode === "sections") {
    const chosen = [...new Set(opts.picked)]
      .filter((i) => sections[i])
      .sort((a, b) => a - b)
      .map((i) => ({ ...sections[i] }));
    if (chosen.length) return opts.order === "per-section" ? chosen.map((s) => [s]) : [chosen];
  }
  return [[whole]];
}

export interface Pass {
  label: string;
  segments: Segment[];
  /** Follower groups on the pass's own clock (beat 0 = the pass's first beat). */
  groups: ScoreGroup[];
  /** Score beat of each group, by pass group index. */
  scoreBeat: number[];
  lengthBeats: number;
  /** Segments as sections on the pass clock, for the per-section tally. */
  sections: ScoreSection[];
}

/**
 * `inner`: the song's sections. A single-segment pass tallies them (clipped to
 * the segment); a joined pass tallies its own segments.
 */
export function buildPass(
  score: Score,
  voiceIds: readonly string[],
  segments: Segment[],
  inner: readonly ScoreSection[] = [],
): Pass {
  const groups: ScoreGroup[] = [];
  const scoreBeat: number[] = [];
  const sections: ScoreSection[] = [];
  let offset = 0;
  for (const seg of segments) {
    for (const g of scoreGroups(score, { voiceIds, range: seg })) {
      scoreBeat.push(g.startBeat);
      groups.push({ ...g, index: groups.length, startBeat: g.startBeat - seg.startBeat + offset });
    }
    const len = seg.endBeat - seg.startBeat;
    sections.push({ label: seg.label, startBeat: offset, endBeat: offset + len });
    offset += len;
  }
  if (segments.length === 1) {
    const seg = segments[0];
    const clipped = inner
      .map((s) => ({
        label: s.label,
        startBeat: Math.max(s.startBeat, seg.startBeat),
        endBeat: Math.min(s.endBeat, seg.endBeat),
      }))
      .filter((s) => s.endBeat > s.startBeat)
      .map((s) => ({
        ...s,
        startBeat: s.startBeat - seg.startBeat,
        endBeat: s.endBeat - seg.startBeat,
      }));
    if (clipped.length > 1) sections.splice(0, sections.length, ...clipped);
  }
  const label = segments.length === 1 ? segments[0].label : segments.map((s) => s.label).join(", ");
  return { label, segments, groups, scoreBeat, lengthBeats: offset, sections };
}

/** A pass-clock beat to the score beat under it (for the cursor and the waterfall). */
export function toScoreBeat(pass: Pass, beat: number): number {
  let offset = 0;
  for (const seg of pass.segments) {
    const len = seg.endBeat - seg.startBeat;
    if (beat < offset + len || seg === pass.segments.at(-1))
      return seg.startBeat + Math.min(len, Math.max(0, beat - offset));
    offset += len;
  }
  return 0;
}

/** What a group mark shows. A wrong note is a moment, so it is never a lasting state. */
export function verdictState(v: GroupVerdict): GroupState | undefined {
  if (v === "current") return "active";
  if (v === "clean" || v === "hit" || v === "with-errors") return "correct";
  if (v === "missed" || v === "partial") return "missed";
  return undefined;
}

const beatKey = (b: number) => Math.round(b * 1e4);

/** Group states keyed by score beat, for any view's own group numbering. */
export function statesByBeat(
  pass: Pass,
  verdicts: readonly GroupVerdict[],
  wrongNow: boolean,
  current: number,
): Map<number, GroupState> {
  const out = new Map<number, GroupState>();
  verdicts.forEach((v, i) => {
    const s = i === current && wrongNow ? "wrong" : verdictState(v);
    if (s) out.set(beatKey(pass.scoreBeat[i]), s);
  });
  return out;
}

export function statesFor(
  groups: readonly { index: number; startBeat: number }[],
  byBeat: Map<number, GroupState>,
): Record<number, GroupState> {
  const out: Record<number, GroupState> = {};
  for (const g of groups) {
    const s = byBeat.get(beatKey(g.startBeat));
    if (s) out[g.index] = s;
  }
  return out;
}

/** Retry at +8 / same / -8 BPM, never below 20. */
export const retryBpm = (bpm: number, delta: number) => Math.max(20, Math.round(bpm + delta));

/** MusicXML voices choose by part; MIDI voices stay individually selectable. */
export function voiceChoices(score: Score): { id: string; label: string; voiceIds: string[] }[] {
  if (score.source?.kind === "musicxml") {
    const parts = new Map<string, string[]>();
    for (const v of score.voices) {
      const key = v.partId ?? v.id;
      parts.set(key, [...(parts.get(key) ?? []), v.id]);
    }
    return [...parts].map(([id, voiceIds]) => {
      const first = score.voices.find((v) => v.id === voiceIds[0])!;
      return { id, label: first.name.replace(/ voice \d+$/, ""), voiceIds };
    });
  }
  return score.voices.map((v) => ({ id: v.id, label: v.name, voiceIds: [v.id] }));
}

/** Whether a song opens on its drums: always for drums only, on the MPC when it has both. */
export const defaultParts = (score: Score, instrument: string) =>
  score.voices.some((v) => v.drums) && (instrument === "mpc" || score.voices.every((v) => v.drums));

/**
 * Drum voices graded by drum, not pitch: each note becomes its drum's key (any
 * hat for a hat), and a drum struck twice at one onset (a pedal hat under a
 * closed hat) is one hit.
 */
export function gradedDrums(score: Score): Score {
  if (!score.voices.some((v) => v.drums)) return score;
  const seen = new Set<string>();
  const voices = score.voices.map((v) =>
    v.drums
      ? {
          ...v,
          notes: v.notes
            .map((n) => ({ ...n, midi: drumKey(n.midi) }))
            .filter((n) => {
              const k = `${n.startBeat}:${n.midi}`;
              return !seen.has(k) && !!seen.add(k);
            }),
        }
      : v,
  );
  return { ...score, voices };
}

/**
 * Move the selected voices by whole octaves into an instrument's range: the
 * shift that fits the most notes (the smallest one when tied), then any note
 * still outside folded in by octaves. `folded` counts those notes.
 */
export function fitToRange(
  score: Score,
  voiceIds: readonly string[],
  low: number,
  high: number,
): { score: Score; shift: number; folded: number } {
  const picked = (id: string) => voiceIds.includes(id);
  const notes = score.voices.filter((v) => picked(v.id)).flatMap((v) => v.notes);
  if (!notes.length || high - low < 11) return { score, shift: 0, folded: 0 };
  const fits = (k: number) => notes.filter((n) => n.midi + k >= low && n.midi + k <= high).length;
  const shift = [0, -12, 12, -24, 24, -36, 36].reduce(
    (best, k) => (fits(k) > fits(best) ? k : best),
    0,
  );
  let folded = 0;
  const fold = (midi: number) => {
    let m = midi + shift;
    if (m >= low && m <= high) return m;
    folded++;
    while (m < low) m += 12;
    while (m > high) m -= 12;
    return m;
  };
  if (!shift && fits(0) === notes.length) return { score, shift: 0, folded: 0 };
  const voices = score.voices.map((v) =>
    picked(v.id) ? { ...v, notes: v.notes.map((n) => ({ ...n, midi: fold(n.midi) })) } : v,
  );
  return { score: { ...score, voices }, shift, folded };
}

/** The lowest open string to the top fret of the highest string. */
export const tuningRange = (t: { openStrings: number[]; fretCount: number }) => ({
  low: Math.min(...t.openStrings),
  high: Math.max(...t.openStrings) + t.fretCount,
});

// ---------------------------------------------------------------------------
// Fix the trouble spot: what the best practisers do (Duke, Simmons and Cash
// 2009): find the exact place it went wrong, loop it a little slower until it
// is clean several times running, then bring the tempo back and widen it.

export const SPOT = { slower: 0.85, clean: 3, backoff: 0.95, floor: 0.5, widenBars: 1 } as const;

export interface SpotDrill {
  /** The loop, in score beats. */
  range: BeatRange;
  /** Where the loop may grow to (the pass the slip came from). */
  bounds: BeatRange;
  bpm: number;
  targetBpm: number;
  streak: number;
  stage: "slow" | "tempo" | "wide" | "done";
  takes: number;
}

/** The score beat of the first group that was not clean, or null when every one was. */
export function firstSlip(pass: Pass, clean: (i: number) => boolean): number | null {
  const i = pass.groups.findIndex((_, k) => !clean(k));
  return i === -1 ? null : pass.scoreBeat[i];
}

/** The segment of the pass holding `beat`, in score beats. */
export const segmentAt = (pass: Pass, beat: number): BeatRange =>
  pass.segments.find((s) => beat >= s.startBeat - 1e-6 && beat < s.endBeat - 1e-6) ??
  pass.segments[0];

/** The loop for a slip at `beat`: its bar and the bar before (the run-up), inside `bounds`. */
export function spotRange(beat: number, barLen: number, bounds: BeatRange): BeatRange {
  const bar = Math.floor(beat / barLen + 1e-6) * barLen;
  return {
    startBeat: Math.max(bounds.startBeat, bar - barLen),
    endBeat: Math.min(bounds.endBeat, bar + barLen),
  };
}

export const startSpot = (range: BeatRange, bounds: BeatRange, targetBpm: number): SpotDrill => ({
  range,
  bounds,
  targetBpm,
  bpm: Math.max(20, Math.round(targetBpm * SPOT.slower)),
  streak: 0,
  stage: "slow",
  takes: 0,
});

/**
 * After a take: a slip resets the streak and eases the tempo 5% (no lower than
 * half the target); three clean in a row move on: back to full tempo, then a
 * bar wider on each side, then done.
 */
export function spotAfter(s: SpotDrill, clean: boolean, barLen: number): SpotDrill {
  const takes = s.takes + 1;
  if (!clean)
    return {
      ...s,
      takes,
      streak: 0,
      bpm: Math.max(Math.round(s.targetBpm * SPOT.floor), Math.round(s.bpm * SPOT.backoff)),
    };
  const streak = s.streak + 1;
  if (streak < SPOT.clean) return { ...s, takes, streak };
  if (s.bpm < s.targetBpm) return { ...s, takes, streak: 0, bpm: s.targetBpm, stage: "tempo" };
  if (s.stage !== "wide") {
    const w = SPOT.widenBars * barLen;
    const range = {
      startBeat: Math.max(s.bounds.startBeat, s.range.startBeat - w),
      endBeat: Math.min(s.bounds.endBeat, s.range.endBeat + w),
    };
    const grew = range.startBeat < s.range.startBeat || range.endBeat > s.range.endBeat;
    if (grew) return { ...s, takes, streak: 0, range, stage: "wide" };
  }
  return { ...s, takes, streak, stage: "done" };
}
