// Score follower over the canonical Score: wait mode and performance mode.
import type { Metric, NoteEvent, Score, ScoreGroup, ScoreSection, Strictness } from "../types";
import { pc } from "../theory/notes";
import { type Graded, mean } from "./grade";
import { claim, matchWindowMs, timingCredit } from "./timing";

const EPS = 1e-6;

/** Group the selected voices' notes by onset. Tie continuations are not new attacks and are skipped. */
export function scoreGroups(
  score: Score,
  select: { voiceIds?: readonly string[]; range?: { startBeat: number; endBeat: number } } = {},
): ScoreGroup[] {
  const voices = select.voiceIds
    ? score.voices.filter((v) => select.voiceIds!.includes(v.id))
    : score.voices;
  const notes = voices
    .flatMap((v) => v.notes.map((n) => ({ ...n, voiceId: v.id })))
    .filter(
      (n) =>
        !n.tieFrom &&
        (!select.range ||
          (n.startBeat >= select.range.startBeat - EPS &&
            n.startBeat < select.range.endBeat - EPS)),
    )
    .sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  const groups: ScoreGroup[] = [];
  for (const n of notes) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.startBeat - n.startBeat) < EPS) {
      last.notes.push(n);
      last.durationBeats = Math.max(last.durationBeats, n.durationBeats);
    } else
      groups.push({
        index: groups.length,
        startBeat: n.startBeat,
        durationBeats: n.durationBeats,
        notes: [n],
      });
  }
  return groups;
}

/** How long a wrong note stays flashed. */
export const WRONG_FLASH_MS = 200;

const keyOf = (midi: number, octaveExact: boolean) => (octaveExact ? midi : pc(midi));

export type GroupVerdict =
  | "pending"
  | "current"
  | "clean"
  | "with-errors"
  | "hit"
  | "partial"
  | "missed";

export interface LiveState {
  index: number;
  expected: number[];
  /** Wrong notes still inside their flash lifetime (current group only in wait mode). */
  wrong: { midi: number; at: number }[];
  verdicts: GroupVerdict[];
  done: boolean;
}

// ---------------------------------------------------------------------------
// Wait mode.

export interface WaitState {
  mode: "wait";
  groups: readonly ScoreGroup[];
  /** Piano: the exact key. Otherwise pitch class (mic octave errors). */
  octaveExact: boolean;
  index: number;
  /** Keys struck since the current group became current. */
  struck: number[];
  /** Wrong notes for the current group only; cleared when the group advances. */
  wrong: { midi: number; at: number }[];
  wrongCounts: number[];
}

export const waitStart = (groups: readonly ScoreGroup[], octaveExact: boolean): WaitState => ({
  mode: "wait",
  groups,
  octaveExact,
  index: 0,
  struck: [],
  wrong: [],
  wrongCounts: groups.map(() => 0),
});

/**
 * The group advances once every one of its pitches has been struck since it
 * became current (a chord may be struck all at once or key by key while held).
 * Anything else is a wrong note: a transient flash, never carried to the next group.
 */
export function waitInput(state: WaitState, e: NoteEvent): WaitState {
  const group = state.groups[state.index];
  if (e.kind !== "noteon" || !group) return state;
  const key = keyOf(e.midi, state.octaveExact);
  const expected = group.notes.map((n) => keyOf(n.midi, state.octaveExact));
  if (!expected.includes(key)) {
    const wrongCounts = [...state.wrongCounts];
    wrongCounts[state.index]++;
    return { ...state, wrong: [...state.wrong, { midi: e.midi, at: e.at }], wrongCounts };
  }
  const struck = state.struck.includes(key) ? state.struck : [...state.struck, key];
  if (!expected.every((k) => struck.includes(k))) return { ...state, struck };
  return { ...state, index: state.index + 1, struck: [], wrong: [] };
}

export interface WaitResult extends Graded {
  completed: number;
  total: number;
  cleanGroups: number;
  wrongNotes: number;
}

/** Wait mode is guided: score = groups completed without a wrong note / groups. */
export function waitResult(state: WaitState): WaitResult {
  const total = state.groups.length;
  const completed = Math.min(state.index, total);
  const cleanGroups = state.wrongCounts.filter((c, i) => i < completed && c === 0).length;
  const score = total ? cleanGroups / total : 0;
  return {
    score,
    correct: completed === total && score >= 0.9,
    metrics: state.groups.flatMap((g, i) =>
      g.notes.map(
        (n): Metric => ({
          kind: "pitch",
          expectedMidi: n.midi,
          actualMidi: i < completed ? n.midi : undefined,
        }),
      ),
    ),
    notMeasured: [],
    completed,
    total,
    cleanGroups,
    wrongNotes: state.wrongCounts.reduce((a, b) => a + b, 0),
  };
}

// ---------------------------------------------------------------------------
// Performance mode.

export interface PerformanceOptions {
  bpm: number;
  /** When beat 0 of the groups sounds. */
  startAt: number;
  strictness: Strictness;
  octaveExact: boolean;
  sections?: readonly ScoreSection[];
}

interface Tally {
  matched: number;
  total: number;
  missed: number;
  meanAbsErrorMs: number;
}

export interface PerformanceResult extends Graded {
  matched: number;
  expected: number;
  pitchCompletion: number;
  early: number;
  onTime: number;
  late: number;
  missed: number;
  extra: number;
  extraNotes: { midi: number; at: number }[];
  meanAbsErrorMs: number;
  groupVerdicts: ("hit" | "partial" | "missed")[];
  perSection: (Tally & { label: string })[];
}

/**
 * Real time: every note claims the nearest same-pitch onset inside
 * matchWindowMs(beat, its duration, strictness). On time is within half the
 * note's window. accuracy = matched / (expected + extra);
 * score = accuracy x 0.8 + mean timing credit x 0.2, correct at 0.9.
 */
export function gradePerformance(
  groups: readonly ScoreGroup[],
  notes: readonly NoteEvent[],
  opts: PerformanceOptions,
): PerformanceResult {
  const beatMs = 60000 / opts.bpm;
  const targets = groups.flatMap((g) =>
    g.notes.map((n) => ({
      group: g.index,
      startBeat: g.startBeat,
      midi: n.midi,
      at: opts.startAt + g.startBeat * beatMs,
      windowMs: matchWindowMs(beatMs, n.durationBeats, opts.strictness),
    })),
  );
  const ons = notes.filter((n) => n.kind === "noteon");
  const { claims, extras } = claim(
    targets,
    ons,
    (t) => t.windowMs,
    (t, h) => keyOf(t.midi, opts.octaveExact) === keyOf(h.midi, opts.octaveExact),
  );
  let early = 0;
  let onTime = 0;
  let late = 0;
  claims.forEach((c, i) => {
    if (!c) return;
    if (Math.abs(c.errorMs) <= targets[i].windowMs / 2) onTime++;
    else if (c.errorMs < 0) early++;
    else late++;
  });
  const errors = claims.flatMap((c) => (c ? [c.errorMs] : []));
  const matched = errors.length;
  const accuracy = targets.length + extras.length ? matched / (targets.length + extras.length) : 0;
  const credit = matched
    ? mean(claims.flatMap((c, i) => (c ? [timingCredit(c.errorMs, targets[i].windowMs)] : [])))
    : 0;
  const score = accuracy * 0.8 + credit * 0.2;
  const tally = (keep: (i: number) => boolean): Tally => {
    const idx = targets.flatMap((_, i) => (keep(i) ? [i] : []));
    const hit = idx.filter((i) => claims[i]);
    return {
      matched: hit.length,
      total: idx.length,
      missed: idx.length - hit.length,
      meanAbsErrorMs: mean(hit.map((i) => Math.abs(claims[i]!.errorMs))),
    };
  };
  return {
    score,
    correct: score >= 0.9,
    metrics: targets.flatMap((t, i): Metric[] => {
      const c = claims[i];
      return [
        { kind: "pitch", expectedMidi: t.midi, actualMidi: c ? ons[c.hit].midi : undefined },
        ...(c
          ? [
              {
                kind: "timing" as const,
                expectedMs: t.at,
                actualMs: ons[c.hit].at,
                errorMs: c.errorMs,
              },
            ]
          : []),
      ];
    }),
    notMeasured: [],
    matched,
    expected: targets.length,
    pitchCompletion: targets.length ? matched / targets.length : 0,
    early,
    onTime,
    late,
    missed: targets.length - matched,
    extra: extras.length,
    extraNotes: extras.map((h) => ({ midi: ons[h].midi, at: ons[h].at })),
    meanAbsErrorMs: mean(errors.map(Math.abs)),
    groupVerdicts: groups.map((g) => {
      const t = tally((i) => targets[i].group === g.index);
      return t.matched === t.total ? "hit" : t.matched ? "partial" : "missed";
    }),
    perSection: (opts.sections ?? []).map((s) => ({
      label: s.label,
      ...tally(
        (i) => targets[i].startBeat >= s.startBeat - EPS && targets[i].startBeat < s.endBeat - EPS,
      ),
    })),
  };
}

/** Aggregate across takes: mean score and the best take. */
export function aggregateTakes(takes: readonly PerformanceResult[]) {
  const bestIndex = takes.reduce((b, t, i) => (t.score > takes[b].score ? i : b), 0);
  return {
    takes: takes.length,
    meanScore: mean(takes.map((t) => t.score)),
    bestIndex: takes.length ? bestIndex : -1,
    best: takes[bestIndex] ?? null,
  };
}

export interface PerformanceState {
  mode: "performance";
  groups: readonly ScoreGroup[];
  opts: PerformanceOptions;
  notes: NoteEvent[];
}

export const performanceStart = (
  groups: readonly ScoreGroup[],
  opts: PerformanceOptions,
): PerformanceState => ({
  mode: "performance",
  groups,
  opts,
  notes: [],
});

// ---------------------------------------------------------------------------
// Both modes.

export type FollowerState = WaitState | PerformanceState;

export function followerInput<S extends FollowerState>(state: S, e: NoteEvent): S {
  if (state.mode === "wait") return waitInput(state, e) as S;
  return e.kind === "noteon" ? { ...state, notes: [...state.notes, e] } : state;
}

/** What the surfaces draw right now. */
export function liveState(state: FollowerState, now: number): LiveState {
  const fresh = (w: { at: number }) => now - w.at >= 0 && now - w.at < WRONG_FLASH_MS;
  if (state.mode === "wait") {
    const group = state.groups[state.index];
    return {
      index: state.index,
      expected: group ? group.notes.map((n) => n.midi) : [],
      wrong: state.wrong.filter(fresh),
      verdicts: state.groups.map((_, i) =>
        i < state.index
          ? state.wrongCounts[i]
            ? "with-errors"
            : "clean"
          : i === state.index
            ? "current"
            : "pending",
      ),
      done: state.index >= state.groups.length,
    };
  }
  const { groups, opts } = state;
  const beatMs = 60000 / opts.bpm;
  const sofar = state.notes.filter((n) => n.at <= now);
  const result = gradePerformance(groups, sofar, opts);
  const deadline = (g: ScoreGroup) =>
    opts.startAt +
    g.startBeat * beatMs +
    Math.max(...g.notes.map((n) => matchWindowMs(beatMs, n.durationBeats, opts.strictness)));
  const current = groups.findIndex((g) => deadline(g) >= now);
  const index = current < 0 ? groups.length : current;
  return {
    index,
    expected: groups[index]?.notes.map((n) => n.midi) ?? [],
    wrong: result.extraNotes.filter(fresh),
    verdicts: groups.map((g, i) =>
      i < index || result.groupVerdicts[i] === "hit"
        ? result.groupVerdicts[i]
        : i === index
          ? "current"
          : "pending",
    ),
    done: index >= groups.length,
  };
}

export function followerResult(state: FollowerState): WaitResult | PerformanceResult {
  return state.mode === "wait"
    ? waitResult(state)
    : gradePerformance(state.groups, state.notes, state.opts);
}
