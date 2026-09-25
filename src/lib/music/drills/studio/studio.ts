// Song Studio: which beats a run covers, the follower groups for it, and the
// mapping between a run's own clock and the score's beats (so the one cursor
// and the group marks land on the right notes in every view).
import type { Score, ScoreGroup, ScoreSection } from "@repo/music-core";
import { scoreGroups } from "@repo/music-core/scoring/follower";
import type { GroupVerdict } from "@repo/music-core/scoring/follower";
import type { BeatRange } from "$lib/music/notation/groups";
import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";

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
