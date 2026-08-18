/**
 * Voicing drill — play a jazz voicing (or, on a monophonic instrument, its
 * arpeggio) and be graded on it.
 *
 * This is the graded, input-driven version of the jazz rootless ii-V-I drill:
 * it consumes normalized NoteEvents (MIDI or on-screen), so the same drill works
 * across instruments, and it advances the `harmony.ii-v-i` skill through the
 * standard exercise pipeline (scoring → skills → XP).
 *
 * Polyphonic instruments are graded on the held chord (pitch-class set);
 * monophonic instruments (Aerophone, voice) are graded on the arpeggio sequence,
 * which is how a wind player "plays a chord".
 */

import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type ExerciseRun,
  type InputSource,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";

import { playedMidiNotes, pitchClasses } from "./ear-training";

export type VoicingGradingMode = "chord" | "arpeggio";

export interface VoicingTarget {
  /** Stable id for this prompt (e.g. "C-ii"). */
  id: string;
  /** Chord symbol shown to the player, e.g. "Dm7". */
  symbol: string;
  /**
   * Expected pitch classes. For chord mode, order is irrelevant. For arpeggio
   * mode, this is the ascending order the player should produce.
   */
  expectedPitchClasses: number[];
  /** Pitch class of the bass note (for inversion diagnostics). */
  expectedBassPc?: number;
  mode: VoicingGradingMode;
  /**
   * Chord-mode grading strictness:
   *  - falsy (lenient) — credit any expected pitch class played at any point in
   *    the run (beginner / on-screen friendly).
   *  - `true` (held) — credit only the best overlap while notes are physically
   *    held together (true chord detection; best with a MIDI instrument).
   * Ignored in arpeggio mode (always sequential).
   */
  strict?: boolean;
  /** The voiced MIDI notes, for showing the target on an instrument view. */
  displayMidi?: number[];
}

export interface VoicingDrillPrompt {
  target: VoicingTarget;
}

export interface VoicingDrillAnswer {
  playedPitchClasses: number[];
  matched: number;
  total: number;
}

export const VOICING_DRILL_SKILL = "harmony.ii-v-i";

/**
 * A voicing-drill exercise pinned to one target. The session builds one per
 * chord of the ii-V-I cycle and runs them in sequence through the run host.
 */
export function createVoicingDrillExercise(
  target: VoicingTarget,
): ExerciseDefinition<VoicingDrillPrompt, VoicingDrillAnswer> {
  return {
    id: `voicing-drill.${target.id}`,
    name: `Voice ${target.symbol}`,
    capabilities: [Capability.Harmony],
    skillIds: [VOICING_DRILL_SKILL],
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => ({ id: target.id, payload: { target } }),
    createRun: (prompt) => createVoicingRun(prompt.payload.target),
  };
}

function createVoicingRun(target: VoicingTarget): ExerciseRun<VoicingDrillAnswer> {
  const input: NoteEvent[] = [];
  const expected = target.expectedPitchClasses;

  return {
    accept(event) {
      input.push(event);
    },
    getLiveState() {
      const { matched } = grade(target, input);
      const progress = expected.length === 0 ? 0 : matched / expected.length;
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      return gradeToResult(target, input);
    },
  };
}

const pc12 = (midi: number): number => ((midi % 12) + 12) % 12;

/** Count how many of the expected pitch classes the player produced. */
function grade(target: VoicingTarget, input: NoteEvent[]): { matched: number; actual: number[] } {
  const expected = target.expectedPitchClasses;

  if (target.mode === "chord") {
    return target.strict ? gradeHeld(expected, input) : gradeCumulative(expected, input);
  }

  // Arpeggio: match the expected sequence in order against the played notes.
  const playedOrder = pitchClassOrder(playedMidiNotes(input));
  let cursor = 0;
  for (const pc of playedOrder) {
    if (cursor < expected.length && pc === expected[cursor]) cursor += 1;
  }
  return { matched: cursor, actual: pitchClasses(playedMidiNotes(input)) };
}

/** Lenient: credit any expected pitch class played at any point in the run. */
function gradeCumulative(
  expected: number[],
  input: NoteEvent[],
): { matched: number; actual: number[] } {
  const played = pitchClasses(playedMidiNotes(input));
  const playedSet = new Set(played);
  return { matched: expected.filter((pc) => playedSet.has(pc)).length, actual: played };
}

/**
 * Held: the best overlap with the target while notes are physically held
 * together. Replays the noteOn/noteOff stream and tracks the currently-held
 * set, so taps that never overlap don't count as a chord. Monotonic (keeps the
 * best moment), so progress only rises.
 *
 * The held set is per input source (on-screen, MIDI, audio) and graded on the
 * union: a `noteOff` only releases the source that sent it, so letting go of a
 * doubled pitch on one device cannot erase another device's live hold.
 * ponytail: coarse source, not per-device — two MIDI keyboards still share a set.
 */
function gradeHeld(expected: number[], input: NoteEvent[]): { matched: number; actual: number[] } {
  const heldBySource = new Map<InputSource, Set<number>>();
  let bestMatched = 0;
  let bestActual: number[] = [];
  for (const event of input) {
    let held = heldBySource.get(event.source);
    if (held === undefined) {
      held = new Set<number>();
      heldBySource.set(event.source, held);
    }
    if (event.type === "noteOn") held.add(event.midiNote);
    else if (event.type === "noteOff") held.delete(event.midiNote);
    else continue;
    const heldPcs = new Set([...heldBySource.values()].flatMap((notes) => [...notes].map(pc12)));
    const matched = expected.filter((pc) => heldPcs.has(pc)).length;
    if (matched >= bestMatched) {
      bestMatched = matched;
      bestActual = [...heldPcs].sort((a, b) => a - b);
    }
  }
  return { matched: bestMatched, actual: bestActual };
}

function gradeToResult(
  target: VoicingTarget,
  input: NoteEvent[],
): ExerciseResult<VoicingDrillAnswer> {
  const expected = target.expectedPitchClasses;
  const { matched, actual } = grade(target, input);
  const total = expected.length;
  const score = total === 0 ? 0 : matched / total;
  const correct = matched === total;

  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const metric: ScoringMetric = {
    kind: "chord",
    expectedPitchClasses: expected,
    actualPitchClasses: actual,
    missingPitchClasses: expected.filter((pc) => !actualSet.has(pc)),
    extraPitchClasses: actual.filter((pc) => !expectedSet.has(pc)),
    expectedBass: target.expectedBassPc,
  };

  return {
    correct,
    score,
    metrics: [metric],
    feedback: [
      correct
        ? { severity: "good", message: `${target.symbol} — all ${total} notes correct.` }
        : {
            severity: "warn",
            message: `${target.symbol} — ${matched}/${total} notes. Missing ${
              metric.missingPitchClasses?.length ?? 0
            }.`,
          },
    ],
    target: { label: target.symbol },
    response: { midiNotes: playedMidiNotes(input) },
    answer: { playedPitchClasses: actual, matched, total },
    input,
  };
}

/** Played pitch classes in the order they were first struck. */
function pitchClassOrder(midiNotes: number[]): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const note of midiNotes) {
    const pc = ((note % 12) + 12) % 12;
    if (!seen.has(pc)) {
      seen.add(pc);
      order.push(pc);
    }
  }
  return order;
}
