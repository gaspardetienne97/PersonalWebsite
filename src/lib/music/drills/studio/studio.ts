// Song Studio: which beats a run covers, the follower groups for it, and the
// mapping between a run's own clock and the score's beats (so the one cursor
// and the group marks land on the right notes in every view).
import type { ControlEvent, NoteEvent, Score, ScoreGroup, ScoreSection } from "@repo/music-core";
import { bendWobble } from "@repo/music-core/content/aero-skills";
import { scoreGroups } from "@repo/music-core/scoring/follower";
import type { GroupVerdict } from "@repo/music-core/scoring/follower";
import type { BeatRange } from "#lib/music/notation/groups.ts";
import type { GroupState } from "#lib/music/notation/NotationFrame.svelte";
import { drumKey, scoreDrumPad } from "@repo/music-core/content/winds-pads";
import { m } from "@repo/i18n/messages.js";

export type RangeMode = "whole" | "sections" | "custom";
export type SectionOrder = "sequence" | "per-section";

export interface Segment extends BeatRange {
  label: string;
}

// The two built-in ranges keep English labels inside a run (run keys and prompt ids are stored);
// segmentLabel translates them where they are shown. A section's own name shows as it is.
const WHOLE_SONG = "Whole song";
const CUSTOM_RANGE = "Custom range";

/** A segment or pass label as shown. */
export const segmentLabel = (label: string): string =>
  label === WHOLE_SONG
    ? m.music_drills_studio_whole_song()
    : label === CUSTOM_RANGE
      ? m.music_drills_studio_custom_range()
      : label;

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
  const whole: Segment = { label: WHOLE_SONG, startBeat: 0, endBeat: score.lengthBeats };
  if (opts.mode === "custom" && opts.custom && opts.custom.endBeat > opts.custom.startBeat)
    return [[{ label: CUSTOM_RANGE, ...opts.custom }]];
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

// ---------------------------------------------------------------------------
// No-stop runs: keep going through mistakes. Continuity is the share of bars
// with something expected in which something was played; a slip is a stretch
// of expected groups with nothing played at all.

export interface Continuity {
  /** Bars played in, of the bars with notes, 0..1. */
  share: number;
  bars: number;
  barsPlayed: number;
  /** The longest stretch of expected notes with nothing played, in beats. */
  longestGapBeats: number;
  /** Where that stretch starts, on the pass clock (null with none). */
  gapAt: number | null;
}

/** `ats`: onset times (ms) of everything played; `startAt` is the pass's beat 0. */
export function continuity(
  pass: Pass,
  ats: readonly number[],
  startAt: number,
  beatMs: number,
  barLen: number,
): Continuity {
  const beats = ats.map((t) => (t - startAt) / beatMs);
  // A group is covered by anything played from a little before it until a little before its end
  // (so the next note played a hair early does not cover it).
  const covered = pass.groups.map((g) =>
    beats.some(
      (b) => b >= g.startBeat - 0.4 && b < g.startBeat + Math.max(g.durationBeats, 0.5) - 0.4,
    ),
  );
  const barOf = (b: number) => Math.floor(b / barLen + 1e-6);
  const expected = new Set(pass.groups.map((g) => barOf(g.startBeat)));
  const played = new Set([...expected].filter((bar) => beats.some((b) => barOf(b + 0.25) === bar)));
  let longest = 0;
  let gapAt: number | null = null;
  for (let i = 0; i < covered.length;) {
    if (covered[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < covered.length && !covered[j]) j++;
    const end = j < covered.length ? pass.groups[j].startBeat : pass.lengthBeats;
    const len = end - pass.groups[i].startBeat;
    if (len > longest) [longest, gapAt] = [len, pass.groups[i].startBeat];
    i = j;
  }
  return {
    share: expected.size ? played.size / expected.size : 0,
    bars: expected.size,
    barsPlayed: played.size,
    longestGapBeats: longest,
    gapAt,
  };
}

/** A no-stop take: the performance score scaled by continuity; kept going when every bar was played and no slip ran past a beat. */
export const noStopVerdict = (score: number, c: Continuity) => ({
  score: score * c.share,
  kept: c.share === 1 && c.longestGapBeats <= 1 + 1e-6,
});

// ---------------------------------------------------------------------------
// Memory: hide the notes after a first look, or bar by bar from the start.

/** The score with every note before `beat` taken out (those bars are played from memory). */
export function hideBefore(score: Score, beat: number): Score {
  if (beat <= 0) return score;
  return {
    ...score,
    voices: score.voices.map((v) => ({
      ...v,
      notes: v.notes.filter((n) => n.startBeat >= beat - 1e-6),
    })),
  };
}

// ---------------------------------------------------------------------------
// Dynamics, hairpins and breath marks, graded loosely: a louder mark should
// come out louder than the one before (by any device's curve), a hairpin
// should move the right way, and a marked breath should be a break.

/** Rough loudness of each dynamic, only for telling louder from softer. */
export const DYNAMIC_LEVEL: Record<string, number> = {
  ppp: 0.1,
  pp: 0.2,
  p: 0.33,
  mp: 0.45,
  mf: 0.55,
  f: 0.7,
  ff: 0.82,
  fff: 0.92,
  sf: 0.75,
  sfz: 0.75,
  fp: 0.6,
  rf: 0.7,
  rfz: 0.7,
  fz: 0.75,
};
/** A move counts when the level changes this much the right way. */
export const DYNAMIC_MARGIN = 0.04;

export interface Played {
  at: number;
  /** 0..1 from breath (CC 2) or measured velocity. */
  level: number;
}

/**
 * Each played note's loudness: the median breath (CC 2) over its first 300 ms
 * when breath arrives, else its MIDI velocity when measured; null when the
 * input carries neither (the on-screen keys, the microphone).
 */
export function playedLevels(
  notes: readonly NoteEvent[],
  controls: readonly ControlEvent[],
): Played[] | null {
  const ons = notes.filter((n) => n.kind === "noteon").sort((a, b) => a.at - b.at);
  const breath = controls.filter((c) => c.kind === "cc" && c.controller === 2);
  if (breath.length) {
    const out: Played[] = [];
    for (const n of ons) {
      const v = breath
        .filter((c) => c.at >= n.at - 20 && c.at <= n.at + 300)
        .map((c) => c.value)
        .sort((a, b) => a - b);
      if (v.length) out.push({ at: n.at, level: v[Math.floor(v.length / 2)] });
    }
    return out;
  }
  if (ons.length && ons.every((n) => n.velocityMeasured))
    return ons.map((n) => ({ at: n.at, level: n.velocity }));
  return null;
}

export interface ExpressionMarks {
  /** On the pass clock (beats). */
  dynamics: { beat: number; mark: string }[];
  hairpins: { start: number; end: number; kind: "crescendo" | "diminuendo" }[];
  breaths: number[];
}

/** The score's marks inside the pass, moved onto its clock. */
export function passMarks(score: Score, pass: Pass): ExpressionMarks {
  const at = (beat: number) => {
    let offset = 0;
    for (const seg of pass.segments) {
      if (beat >= seg.startBeat - 1e-6 && beat <= seg.endBeat + 1e-6)
        return beat - seg.startBeat + offset;
      offset += seg.endBeat - seg.startBeat;
    }
    return null;
  };
  // A dynamic before the pass still sets its level: it moves to the pass's start.
  const first = pass.segments[0]?.startBeat ?? 0;
  const before = (score.dynamics ?? []).filter((d) => d.startBeat < first).at(-1);
  return {
    dynamics: [
      ...(before ? [{ beat: 0, mark: before.mark }] : []),
      ...(score.dynamics ?? []).flatMap((d) => {
        const b = at(d.startBeat);
        return b === null ? [] : [{ beat: b, mark: d.mark }];
      }),
    ],
    hairpins: (score.hairpins ?? []).flatMap((h) => {
      const s = at(h.startBeat);
      const e = at(h.endBeat);
      return s === null || e === null || e <= s ? [] : [{ start: s, end: e, kind: h.kind }];
    }),
    breaths: (score.breaths ?? []).flatMap((b) => {
      const p = at(b);
      return p === null || p <= 0 || p >= pass.lengthBeats - 1e-6 ? [] : [p];
    }),
  };
}

export interface ExpressionResult {
  /** Right moves of the checks made, 0..1; null when nothing could be judged. */
  score: number | null;
  dynamics: { right: number; total: number };
  breaths: { right: number; total: number };
  /** Why the loudness could not be read, when it could not. */
  unmeasured: string | null;
}

const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * One take's dynamics and breaths. Levels come from `playedLevels`. Each
 * change between two dynamics with different levels is right when the notes
 * under the second average louder (or softer) by DYNAMIC_MARGIN; a hairpin
 * when its last third moves that way from its first; a breath mark when the
 * note before it ended, or the breath dipped under 45% of the take's median,
 * before the next note began.
 */
export function gradeExpression(input: {
  marks: ExpressionMarks;
  notes: readonly NoteEvent[];
  controls: readonly ControlEvent[];
  startAt: number;
  beatMs: number;
  lengthBeats: number;
}): ExpressionResult {
  const { marks, startAt, beatMs } = input;
  const beatOf = (t: number) => (t - startAt) / beatMs;
  const levels = playedLevels(input.notes, input.controls);
  const dyn = { right: 0, total: 0 };
  const unmeasured =
    levels === null ? m.music_drills_studio_unmeasured_level() : null;
  if (levels) {
    const ds = [...marks.dynamics]
      .sort((a, b) => a.beat - b.beat)
      .filter((d) => DYNAMIC_LEVEL[d.mark] !== undefined);
    const span = (from: number, to: number) =>
      levels
        .filter((l) => beatOf(l.at) >= from - 0.25 && beatOf(l.at) < to - 0.25)
        .map((l) => l.level);
    for (let i = 1; i < ds.length; i++) {
      const want = DYNAMIC_LEVEL[ds[i].mark] - DYNAMIC_LEVEL[ds[i - 1].mark];
      if (!want) continue;
      const a = span(ds[i - 1].beat, ds[i].beat);
      const b = span(ds[i].beat, ds[i + 1]?.beat ?? input.lengthBeats);
      if (!a.length || !b.length) continue;
      dyn.total++;
      if (Math.sign(want) * (meanOf(b) - meanOf(a)) >= DYNAMIC_MARGIN) dyn.right++;
    }
    for (const h of marks.hairpins) {
      const third = (h.end - h.start) / 3;
      const a = span(h.start, h.start + third);
      const b = span(h.end - third, h.end + 0.5);
      if (!a.length || !b.length) continue;
      dyn.total++;
      if ((h.kind === "crescendo" ? 1 : -1) * (meanOf(b) - meanOf(a)) >= DYNAMIC_MARGIN)
        dyn.right++;
    }
  }
  const br = { right: 0, total: 0 };
  const ons = input.notes.filter((n) => n.kind === "noteon").sort((a, b) => a.at - b.at);
  const breath = input.controls.filter((c) => c.kind === "cc" && c.controller === 2);
  const sorted = breath.map((c) => c.value).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  for (const b of marks.breaths) {
    const prev = ons.filter((n) => beatOf(n.at) < b - 0.1).at(-1);
    const next = ons.find((n) => beatOf(n.at) >= b - 0.1);
    if (!prev || !next) continue;
    br.total++;
    const released = input.notes.some(
      (n) => n.kind === "noteoff" && n.midi === prev.midi && n.at > prev.at && n.at <= next.at - 40,
    );
    const dipped =
      median > 0 && breath.some((c) => c.at > prev.at && c.at < next.at && c.value < median * 0.45);
    if (released || dipped) br.right++;
  }
  const total = dyn.total + br.total;
  return {
    score: total ? (dyn.right + br.right) / total : null,
    dynamics: dyn,
    breaths: br,
    unmeasured,
  };
}

// ---------------------------------------------------------------------------
// Vibrato on held notes: the bite (pitch bend) pulsing about 4 to 5 times a
// second on every note of a beat or longer. Loose: 3.5 to 6.5 counts.

export const HELD_VIBRATO = { minBeats: 1, lowHz: 3.5, highHz: 6.5 } as const;

export function gradeVibrato(input: {
  pass: Pass;
  notes: readonly NoteEvent[];
  controls: readonly ControlEvent[];
  startAt: number;
  beatMs: number;
}): { share: number | null; held: number; withVibrato: number } {
  const { pass, startAt, beatMs } = input;
  const bends = input.controls.filter((c) => c.kind === "pitchbend");
  const ons = input.notes.filter((n) => n.kind === "noteon");
  const held = pass.groups.filter((g) => g.durationBeats >= HELD_VIBRATO.minBeats - 1e-6);
  let withVibrato = 0;
  let counted = 0;
  for (const g of held) {
    const slot = startAt + g.startBeat * beatMs;
    const on = ons.find(
      (n) => g.notes.some((x) => x.midi === n.midi) && Math.abs(n.at - slot) <= beatMs / 2,
    );
    if (!on) continue;
    counted++;
    const off = input.notes.find((n) => n.kind === "noteoff" && n.midi === on.midi && n.at > on.at);
    const end = Math.min(off?.at ?? Infinity, on.at + g.durationBeats * beatMs);
    // A held note can be shorter than a second: read it from 400 ms.
    const w = bendWobble(
      bends.filter((b) => b.at >= on.at && b.at <= end).map((b) => ({ at: b.at, value: b.value })),
      400,
    );
    if (w?.rateHz && w.rateHz >= HELD_VIBRATO.lowHz && w.rateHz <= HELD_VIBRATO.highHz)
      withVibrato++;
  }
  return {
    share: bends.length && counted ? withVibrato / counted : null,
    held: counted,
    withVibrato,
  };
}

// ---------------------------------------------------------------------------
// Sight-reading: a pass counts as read at sight only on the song's first run.

/** True when no earlier Song Studio run played this song (by its id, or by its shelf key when it has one). */
export function isFirstRun(
  runs: readonly { exerciseId: string; params: Record<string, string | number | boolean> }[],
  songId: string,
  shelf?: string,
): boolean {
  return !runs.some(
    (r) =>
      r.exerciseId === "song.studio" &&
      (r.params.song === songId || (!!shelf && r.params.shelf === shelf)),
  );
}

/** Seconds of looking before a sight-read pass. */
export const SIGHT_LOOK_S = 30;

// ---------------------------------------------------------------------------
// Tap the rhythm: one tap at every onset of the selected voices, any key or pad.

export const TAP_MIDI = 60;
export const TAP_VOICE = "tap";

/** The selected voices' rhythm as one voice of TAP_MIDI: a note at each attack (a tie continuation is not one). */
export function tapScore(score: Score, voiceIds: readonly string[]): Score {
  const at = new Map<number, Score["voices"][number]["notes"][number]>();
  for (const v of score.voices)
    if (voiceIds.includes(v.id))
      for (const n of v.notes) {
        if (n.tieFrom) continue;
        const k = Math.round(n.startBeat * 1e4);
        const was = at.get(k);
        if (!was || n.durationBeats > was.durationBeats)
          at.set(k, { midi: TAP_MIDI, startBeat: n.startBeat, durationBeats: n.durationBeats });
      }
  const notes = [...at.values()].sort((a, b) => a.startBeat - b.startBeat);
  return { ...score, voices: [{ id: TAP_VOICE, name: m.music_drills_studio_rhythm_voice(), notes }] };
}

// ---------------------------------------------------------------------------
// The duet partner and the preview: a pass's notes as a sequence to play.

export function passSequence(pass: Pass, bpm: number, isDrum: (voiceId: string) => boolean) {
  const beatS = 60 / bpm;
  return pass.groups.flatMap((g) =>
    g.notes.map((n) => ({
      ...(isDrum(n.voiceId)
        ? { midi: scoreDrumPad(n.midi), voice: "kit" as const }
        : { midi: n.midi }),
      time: g.startBeat * beatS,
      duration: Math.max(0.08, n.durationBeats * beatS * 0.95),
      velocity: n.velocity ?? 0.8,
    })),
  );
}

// ---------------------------------------------------------------------------
// Voicing balance: the melody struck louder than the notes struck with it.

/** The melody must come out this much louder (0..1 velocity) than the accompaniment's mean. */
export const BALANCE_MARGIN = 0.05;
/** Notes within this of the melody's attack were struck with it. */
const TOGETHER_MS = 100;

/** The melody voice: the selected pitched voice that sits highest on average. */
export function melodyVoice(score: Score, voiceIds: readonly string[]): string | undefined {
  const mean = (v: Score["voices"][number]) =>
    v.notes.reduce((a, n) => a + n.midi, 0) / Math.max(1, v.notes.length);
  return score.voices
    .filter((v) => voiceIds.includes(v.id) && !v.drums && v.notes.length)
    .reduce<Score["voices"][number] | undefined>(
      (b, v) => (!b || mean(v) > mean(b) ? v : b),
      undefined,
    )?.id;
}

/**
 * Each melody note (the top note of a group, in the melody voice) struck with
 * accompaniment notes of its group within 100 ms: right when its MIDI velocity
 * beats their mean by BALANCE_MARGIN. Null when velocity was not measured.
 */
export function gradeBalance(input: {
  pass: Pass;
  melody: string | undefined;
  notes: readonly NoteEvent[];
  startAt: number;
  beatMs: number;
}): { share: number | null; right: number; total: number } {
  const ons = input.notes.filter((n) => n.kind === "noteon");
  let right = 0;
  let total = 0;
  if (!input.melody || !ons.length || !ons.every((n) => n.velocityMeasured))
    return { share: null, right, total };
  for (const g of input.pass.groups) {
    const mel = g.notes
      .filter((n) => n.voiceId === input.melody)
      .reduce<(typeof g.notes)[number] | undefined>(
        (b, n) => (!b || n.midi > b.midi ? n : b),
        undefined,
      );
    if (!mel) continue;
    const acc = new Set(g.notes.filter((n) => n !== mel && n.midi !== mel.midi).map((n) => n.midi));
    if (!acc.size) continue;
    const slot = input.startAt + g.startBeat * input.beatMs;
    const m = ons
      .filter((n) => n.midi === mel.midi && Math.abs(n.at - slot) <= input.beatMs / 2)
      .sort((a, b) => Math.abs(a.at - slot) - Math.abs(b.at - slot))[0];
    if (!m) continue;
    const with_ = ons.filter((n) => acc.has(n.midi) && Math.abs(n.at - m.at) <= TOGETHER_MS);
    if (!with_.length) continue;
    total++;
    if (m.velocity >= with_.reduce((a, n) => a + n.velocity, 0) / with_.length + BALANCE_MARGIN)
      right++;
  }
  return { share: total ? right / total : null, right, total };
}
