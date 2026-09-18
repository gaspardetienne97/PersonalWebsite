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
  type FeedbackItem,
  type FeedbackSeverity,
  type InputSource,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";

import { playedMidiNotes, pitchClasses } from "./ear-training";

export type VoicingGradingMode = "chord" | "arpeggio";

export interface VoicingTarget {
  /** Stable id for this prompt (e.g. "C-ii"). */
  id: string;
  skillIds?: string[];
  /** Chord symbol shown to the player, e.g. "Dm7". */
  symbol: string;
  /**
   * Expected pitch classes. For chord mode, order is irrelevant. For arpeggio
   * mode, this is the ascending order the player should produce.
   */
  expectedPitchClasses: number[];
  /** Pitch class of the bass note (for inversion diagnostics). */
  expectedBassPc?: number;
  /**
   * Notes below this MIDI are accompaniment (a left-hand root) and are left out
   * of the inversion test, so the inversion is judged on the voiced hand alone.
   */
  bassSplitMidi?: number;
  /**
   * Grade the inversion, don't just report it: the voicing is only correct when
   * its lowest voiced note is `expectedBassPc`, which rejects an
   * octave-equivalent respelling of the same pitch classes.
   */
  requireInversion?: boolean;
  /**
   * The accompanying hand must sound this pitch class below `bassSplitMidi` —
   * "LH plays roots". Without it the voicing is not correct, even when the right
   * hand alone already covers every expected pitch class.
   */
  requiredRootPc?: number;
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
  /**
   * Two or three voices selected sequentially or via MIDI; timing is not
   * graded. Only notes inside `register` count as voices, so an accompanying
   * root below it is ignored. `toleranceSemitones` (default 0) widens the
   * acceptance: any voicing whose total movement is within it of the best one
   * counts as minimal.
   */
  voiceLeading?: {
    fromMidi: number[];
    register: [number, number];
    toleranceSemitones?: number;
  };
}

export interface VoicingDrillPrompt {
  target: VoicingTarget;
}

export interface VoicingDrillAnswer {
  playedPitchClasses: number[];
  matched: number;
  total: number;
}

const NUMBER_WORDS = ["no", "one", "two", "three"];

export const VOICING_DRILL_SKILL = "harmony.ii-v-i";
export const VOICE_LEADING_SKILL = "harmony.ii-v-i.voice-leading";

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
    skillIds: target.skillIds ?? [VOICING_DRILL_SKILL],
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
      if (target.voiceLeading) {
        const voices = target.voiceLeading.fromMidi.length;
        const word = NUMBER_WORDS[voices] ?? String(voices);
        const count = new Set(playedMidiNotes(input)).size;
        return {
          progress: Math.min(count / voices, 1),
          runningScore: 0,
          feedback: [
            {
              severity: "info",
              message:
                count === voices
                  ? `${word[0]!.toUpperCase()}${word.slice(1)} notes selected`
                  : `${count} notes selected · select exactly ${word}`,
            },
          ],
        };
      }
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

interface VoicingGrade {
  matched: number;
  actual: number[];
  /** Lowest voiced MIDI note (accompaniment below `bassSplitMidi` excluded). */
  lowestMidi?: number;
  /** Pitch classes sounded below `bassSplitMidi` — the accompanying hand. */
  accompanimentPcs: number[];
}

/** Count how many of the expected pitch classes the player produced. */
function grade(target: VoicingTarget, input: NoteEvent[]): VoicingGrade {
  const expected = target.expectedPitchClasses;
  const voiced = (midi: number) => midi >= (target.bassSplitMidi ?? Number.NEGATIVE_INFINITY);

  if (target.mode === "chord") {
    return target.strict
      ? gradeHeld(expected, input, voiced)
      : gradeCumulative(expected, input, voiced);
  }

  // Arpeggio: match the expected sequence in order against the played notes.
  const playedOrder = pitchClassOrder(playedMidiNotes(input));
  let cursor = 0;
  for (const pc of playedOrder) {
    if (cursor < expected.length && pc === expected[cursor]) cursor += 1;
  }
  return { matched: cursor, actual: pitchClasses(playedMidiNotes(input)), accompanimentPcs: [] };
}

/** Lenient: credit any expected pitch class played at any point in the run. */
function gradeCumulative(
  expected: number[],
  input: NoteEvent[],
  voiced: (midi: number) => boolean,
): VoicingGrade {
  const midiNotes = playedMidiNotes(input);
  const played = pitchClasses(midiNotes);
  const playedSet = new Set(played);
  const voicedNotes = midiNotes.filter(voiced);
  return {
    matched: expected.filter((pc) => playedSet.has(pc)).length,
    actual: played,
    accompanimentPcs: [...new Set(midiNotes.filter((midi) => !voiced(midi)).map(pc12))],
    ...(voicedNotes.length === 0 ? {} : { lowestMidi: Math.min(...voicedNotes) }),
  };
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
function gradeHeld(
  expected: number[],
  input: NoteEvent[],
  voiced: (midi: number) => boolean,
): VoicingGrade {
  const heldBySource = new Map<InputSource, Set<number>>();
  let bestMatched = 0;
  let bestActual: number[] = [];
  let bestVoicedCount = -1;
  let bestLowestMidi: number | undefined;
  let bestAccompanimentPcs: number[] = [];
  for (const event of input) {
    let held = heldBySource.get(event.source);
    if (held === undefined) {
      held = new Set<number>();
      heldBySource.set(event.source, held);
    }
    if (event.type === "noteOn") held.add(event.midiNote);
    else if (event.type === "noteOff") held.delete(event.midiNote);
    else continue;
    const heldMidi = [...heldBySource.values()].flatMap((notes) => [...notes]);
    const heldPcs = new Set(heldMidi.map(pc12));
    const matched = expected.filter((pc) => heldPcs.has(pc)).length;
    if (matched < bestMatched) continue;
    bestActual = [...heldPcs].sort((a, b) => a - b);
    // The bass is read off the most complete of the equally-matching moments:
    // releasing one voice before Check leaves the pitch classes intact, and must
    // not promote the next note up to bass.
    const voicedMidi = heldMidi.filter(voiced);
    if (matched > bestMatched || voicedMidi.length > bestVoicedCount) {
      bestVoicedCount = voicedMidi.length;
      bestLowestMidi = voicedMidi.length === 0 ? undefined : Math.min(...voicedMidi);
      bestAccompanimentPcs = [...new Set(heldMidi.filter((midi) => !voiced(midi)).map(pc12))];
    }
    bestMatched = matched;
  }
  return {
    matched: bestMatched,
    actual: bestActual,
    accompanimentPcs: bestAccompanimentPcs,
    ...(bestLowestMidi === undefined ? {} : { lowestMidi: bestLowestMidi }),
  };
}

function gradeToResult(
  target: VoicingTarget,
  input: NoteEvent[],
): ExerciseResult<VoicingDrillAnswer> {
  const expected = target.expectedPitchClasses;
  const { matched, actual, lowestMidi, accompanimentPcs } = grade(target, input);
  const total = expected.length;
  const movement = target.voiceLeading ? gradeVoiceLeading(target, input) : undefined;
  const tolerance = target.voiceLeading?.toleranceSemitones ?? 0;
  const movementMinimal =
    movement === undefined ||
    (movement.actualSemitones !== undefined &&
      movement.actualSemitones <= movement.minimumSemitones + tolerance);
  // Reported whenever a bass is expected; only gates correctness on request.
  const inversionCorrect =
    target.expectedBassPc === undefined || lowestMidi === undefined
      ? undefined
      : pc12(lowestMidi) === target.expectedBassPc;
  const inversionOk = !target.requireInversion || inversionCorrect === true;
  const rootOk =
    target.requiredRootPc === undefined || accompanimentPcs.includes(target.requiredRootPc);
  const handsOk = inversionOk && rootOk;
  const correct = movement
    ? movement.membershipCorrect && movementMinimal && handsOk
    : matched === total && handsOk;
  const score = movement
    ? correct
      ? 1
      : movement.membershipCorrect
        ? 0.5
        : 0
    : total === 0
      ? 0
      : (matched / total) * (handsOk ? 1 : 0.5);

  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const metric: ScoringMetric = {
    kind: "chord",
    expectedPitchClasses: expected,
    actualPitchClasses: actual,
    missingPitchClasses: expected.filter((pc) => !actualSet.has(pc)),
    extraPitchClasses: actual.filter((pc) => !expectedSet.has(pc)),
    expectedBass: target.expectedBassPc,
    ...(lowestMidi === undefined ? {} : { actualBass: pc12(lowestMidi) }),
    ...(inversionCorrect === undefined ? {} : { inversionCorrect }),
  };

  const verdict: FeedbackSeverity = correct ? "good" : "warn";
  const feedback: FeedbackItem[] = rootOk
    ? []
    : [{ severity: "warn", message: "Play the left-hand root under the chord." }];
  feedback.push(
    movement
      ? { severity: verdict, message: voiceLeadingFeedback(movement) }
      : correct
        ? {
            severity: verdict,
            message: `${target.symbol} — ${total}/${total} ${target.mode === "chord" && !target.strict ? "notes collected. Extra notes are tolerated." : "target notes matched."}`,
          }
        : {
            severity: verdict,
            message: `${target.symbol} — ${matched}/${total} notes. Missing ${
              metric.missingPitchClasses?.length ?? 0
            }.`,
          },
  );

  return {
    correct,
    score,
    metrics: movement ? [metric, movement] : [metric],
    feedback,
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

/**
 * Enumerate the bounded register so every equally economical voicing earns
 * credit. Two or three voices; notes outside the register (an accompanying
 * left-hand root, say) are not voices and are dropped before grading.
 * ponytail: brute force over the register — ≤ 25³/6 combinations for a triad.
 */
function gradeVoiceLeading(
  target: VoicingTarget,
  input: NoteEvent[],
): Extract<ScoringMetric, { kind: "voice-leading" }> {
  const { fromMidi, register } = target.voiceLeading!;
  const from = [...fromMidi].sort((a, b) => a - b);
  const voices = from.length;
  const inRegister = (note: number) => note >= register[0] && note <= register[1];
  const actualMidi = [...new Set(playedMidiNotes(input))].filter(inRegister).sort((a, b) => a - b);
  const expected = new Set(target.expectedPitchClasses);
  const isMember = (notes: number[]) =>
    notes.length === voices &&
    notes.every((note) => inRegister(note) && expected.has(pc12(note))) &&
    new Set(notes.map(pc12)).size === voices;
  const travel = (notes: number[]) =>
    notes.reduce((total, note, index) => total + Math.abs(note - from[index]!), 0);

  let minimumSemitones = Infinity;
  const walk = (prefix: number[], lowest: number): void => {
    if (prefix.length === voices) {
      if (isMember(prefix)) minimumSemitones = Math.min(minimumSemitones, travel(prefix));
      return;
    }
    for (let note = lowest; note <= register[1]; note += 1) walk([...prefix, note], note + 1);
  };
  walk([], register[0]);

  return {
    kind: "voice-leading",
    fromMidi: from,
    actualMidi,
    register,
    membershipCorrect: isMember(actualMidi),
    ...(actualMidi.length === voices ? { actualSemitones: travel(actualMidi) } : {}),
    minimumSemitones,
  };
}

export function voiceLeadingFeedback(
  metric: Extract<ScoringMetric, { kind: "voice-leading" }>,
): string {
  const voices = metric.fromMidi.length;
  return `Membership: ${metric.membershipCorrect ? "correct" : `needs exactly ${voices} chord tones in the register`}. Movement: ${metric.actualSemitones === undefined ? `not measured (select exactly ${voices} distinct notes)` : `${metric.actualSemitones} semitone${metric.actualSemitones === 1 ? "" : "s"}`}; minimum ${metric.minimumSemitones} semitone${metric.minimumSemitones === 1 ? "" : "s"}.`;
}
