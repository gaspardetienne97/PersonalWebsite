/**
 * Two-hand independence — a piano coordination drill. The left hand holds a
 * steady root pulse (one note per beat) while the right hand plays a faster
 * scale line (two notes per beat), so the hands move at different rates. Each
 * hand is graded independently: notes are sorted into hands by register (a
 * split point between the two octaves), then matched in order, so you have to
 * keep the left steady while the right runs its own line.
 *
 * MIDI-first and on-screen friendly: it consumes normalized noteOn events and
 * advances `technique.piano.two-hand-independence` through the standard
 * exercise pipeline (scoring → skills → XP).
 */

import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type ExerciseRun,
  type NoteEvent,
  type NoteOnEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";

export interface TwoHandIndependenceOptions {
  /** Right-hand starting note, e.g. "C4". The left-hand root sits two octaves below. */
  tonic?: string;
  bpm?: number;
  /** Number of 4/4 bars. */
  bars?: number;
  patternKind?: TwoHandPatternKind;
  handMode?: TwoHandHandMode;
  /**
   * Dynamics mode: the melody hand must play louder than the accompaniment
   * (graded on MIDI velocity contrast between hands). Needs velocity-sensitive
   * input and both hands, so it is forced off unless handMode is "both".
   */
  dynamics?: boolean;
}

export type TwoHandPatternKind =
  | "lh-pulse-rh-line"
  | "rh-pulse-lh-line"
  | "lh-shell-rh-line"
  | "alberti-rh-holds"
  | "contrary-motion-scale";

export type TwoHandHand = "left" | "right";
export type TwoHandHandMode = "both" | "left" | "right";

export interface TwoHandPatternOption {
  id: TwoHandPatternKind;
  label: string;
}

export interface TwoHandTargetEvent {
  hand: TwoHandHand;
  midiNote: number;
  beat: number;
}

export const TWO_HAND_PATTERNS: readonly TwoHandPatternOption[] = [
  { id: "lh-pulse-rh-line", label: "Pulse + line" },
  { id: "rh-pulse-lh-line", label: "Role swap" },
  { id: "lh-shell-rh-line", label: "Shell + line" },
  { id: "alberti-rh-holds", label: "Alberti + holds" },
  { id: "contrary-motion-scale", label: "Contrary scale" },
] as const;

export const TWO_HAND_HAND_MODES: readonly {
  id: TwoHandHandMode;
  label: string;
}[] = [
  { id: "both", label: "Both" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
] as const;

export interface TwoHandIndependencePrompt {
  label: string;
  patternKind: TwoHandPatternKind;
  patternLabel: string;
  handMode: TwoHandHandMode;
  targetEvents: TwoHandTargetEvent[];
  /** Left hand: a steady root pulse, one note per beat. */
  leftMidiNotes: number[];
  /** Right hand: an eighth-note scale line, two notes per beat. */
  rightMidiNotes: number[];
  leftNoteLabels: string[];
  rightNoteLabels: string[];
  /** Notes at or above this midi belong to the right hand; below, the left. */
  splitMidi: number;
  bpm: number;
  beatMs: number;
  /** Dynamics mode: grade the melody hand louder than the accompaniment. */
  dynamics: boolean;
  /** The hand carrying the line (or holds) — the one that should sing out. */
  melodyHand: TwoHandHand;
}

export interface TwoHandIndependenceAnswer {
  leftPlayed: number[];
  rightPlayed: number[];
  leftAccuracy: number;
  rightAccuracy: number;
  /** Mean deviation from the expected note spacing, in ms — the evenness signal. */
  meanEvennessErrorMs: number;
  /** Dynamics mode only: mean melody velocity minus mean accompaniment velocity (−1..1). */
  dynamicsContrast?: number;
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

export function createTwoHandIndependenceExercise(
  options: TwoHandIndependenceOptions = {},
): ExerciseDefinition<TwoHandIndependencePrompt, TwoHandIndependenceAnswer> {
  const tonic = options.tonic ?? "C4";
  const bpm = options.bpm ?? 100;
  const bars = options.bars ?? 2;
  const patternKind = options.patternKind ?? "lh-pulse-rh-line";
  const handMode = options.handMode ?? "both";
  const dynamics = (options.dynamics ?? false) && handMode === "both";
  const melodyHand = melodyHandForPattern(patternKind);
  const beatMs = 60_000 / bpm;

  const rhRoot = noteToMidi(tonic);
  const lhRoot = rhRoot - 24;
  const beats = bars * 4;
  const allEvents = buildTargetEvents({ patternKind, lhRoot, rhRoot, beats });
  const targetEvents = filterEventsByHandMode(allEvents, handMode);
  const leftEvents = targetEvents.filter((event) => event.hand === "left");
  const rightEvents = targetEvents.filter((event) => event.hand === "right");
  const leftMidiNotes = leftEvents.map((event) => event.midiNote);
  const rightMidiNotes = rightEvents.map((event) => event.midiNote);

  const splitMidi = Math.floor((lhRoot + rhRoot) / 2);
  const patternLabel = labelForPattern(patternKind);
  const label = `${pitchClassLabel(tonic)} ${patternLabel}`;
  const skillIds =
    patternKind === "lh-shell-rh-line"
      ? [
          "technique.piano",
          "technique.piano.two-hand-independence",
          "technique.piano.independence.shell-line",
        ]
      : ["technique.piano", "technique.piano.two-hand-independence"];

  return {
    id: "technique.piano.two-hand-independence",
    name: "Two-Hand Independence",
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds,
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `two-hand-${patternKind}-${handMode}${dynamics ? "-dynamics" : ""}-${pitchClassLabel(tonic).toLowerCase()}-${bpm}-${bars}`,
      payload: {
        label: dynamics ? `${label} · dynamics` : label,
        patternKind,
        patternLabel,
        handMode,
        targetEvents,
        leftMidiNotes,
        rightMidiNotes,
        leftNoteLabels: leftMidiNotes.map((midi) => midiToNote(midi)),
        rightNoteLabels: rightMidiNotes.map((midi) => midiToNote(midi)),
        splitMidi,
        bpm,
        beatMs,
        dynamics,
        melodyHand,
      },
    }),
    createRun(prompt) {
      return twoHandRun(prompt.payload);
    },
  };
}

function twoHandRun(prompt: TwoHandIndependencePrompt): ExerciseRun<TwoHandIndependenceAnswer> {
  const input: NoteEvent[] = [];
  const total = prompt.targetEvents.length;

  return {
    accept(event) {
      if (event.type === "noteOn") input.push(event);
    },
    getLiveState() {
      const progress = total === 0 ? 0 : Math.min(1, input.length / total);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      return gradeTwoHand(prompt, input);
    },
  };
}

function gradeTwoHand(
  prompt: TwoHandIndependencePrompt,
  input: NoteEvent[],
): ExerciseResult<TwoHandIndependenceAnswer> {
  const played = input.filter((event): event is NoteOnEvent => event.type === "noteOn");
  const leftExpected = prompt.targetEvents.filter((event) => event.hand === "left");
  const rightExpected = prompt.targetEvents.filter((event) => event.hand === "right");
  const leftExpectedNotes = new Set(leftExpected.map((event) => event.midiNote));
  const rightExpectedNotes = new Set(rightExpected.map((event) => event.midiNote));
  const leftPlayed = played.filter((event) =>
    belongsToHand(event.midiNote, "left", prompt, leftExpectedNotes, rightExpectedNotes),
  );
  const rightPlayed = played.filter((event) =>
    belongsToHand(event.midiNote, "right", prompt, leftExpectedNotes, rightExpectedNotes),
  );

  const left = gradeHand(leftExpected, leftPlayed, prompt.beatMs);
  const right = gradeHand(rightExpected, rightPlayed, prompt.beatMs);

  const totalNotes = prompt.targetEvents.length;
  const pitchScore = (left.correct + right.correct) / totalNotes;
  const evennessErrors = [...left.spacingErrors, ...right.spacingErrors];
  const meanEvennessError =
    evennessErrors.length === 0
      ? 0
      : evennessErrors.reduce((sum, error) => sum + error, 0) / evennessErrors.length;
  const evennessScore = Math.max(0, 1 - meanEvennessError / 180);

  // Dynamics mode: the melody hand should sing out over the accompaniment.
  // Full credit at ≥0.2 mean-velocity separation (normalized 0-1 velocities);
  // equal or inverted balance earns nothing.
  const melodyPlayed = prompt.melodyHand === "left" ? leftPlayed : rightPlayed;
  const accompanimentPlayed = prompt.melodyHand === "left" ? rightPlayed : leftPlayed;
  const dynamicsContrast = prompt.dynamics
    ? (meanVelocity(melodyPlayed) ?? 0) - (meanVelocity(accompanimentPlayed) ?? 0)
    : undefined;
  const dynamicsScore =
    dynamicsContrast === undefined ? 0 : Math.max(0, Math.min(1, dynamicsContrast / 0.2));

  const score = prompt.dynamics
    ? pitchScore * 0.7 + evennessScore * 0.15 + dynamicsScore * 0.15
    : pitchScore * 0.8 + evennessScore * 0.2;

  const leftAccuracy =
    prompt.leftMidiNotes.length === 0 ? 1 : left.correct / prompt.leftMidiNotes.length;
  const rightAccuracy =
    prompt.rightMidiNotes.length === 0 ? 1 : right.correct / prompt.rightMidiNotes.length;

  return {
    correct: score >= 0.9,
    score,
    metrics: [...left.metrics, ...right.metrics],
    feedback: [
      {
        severity: score >= 0.9 ? "good" : "warn",
        message: `LH ${left.correct}/${prompt.leftMidiNotes.length} steady · RH ${right.correct}/${prompt.rightMidiNotes.length} line.`,
      },
      ...(dynamicsContrast === undefined
        ? []
        : [
            {
              severity: (dynamicsScore >= 0.75 ? "good" : "warn") as "good" | "warn",
              message:
                dynamicsContrast > 0
                  ? `Melody ${Math.round(dynamicsContrast * 100)}% louder than the accompaniment.`
                  : `Bring the ${prompt.melodyHand} hand out — the melody wasn't louder.`,
            },
          ]),
    ],
    target: {
      label: prompt.label,
      midiNotes: prompt.targetEvents.map((event) => event.midiNote),
    },
    response: { midiNotes: played.map((event) => event.midiNote) },
    answer: {
      leftPlayed: leftPlayed.map((event) => event.midiNote),
      rightPlayed: rightPlayed.map((event) => event.midiNote),
      leftAccuracy,
      rightAccuracy,
      meanEvennessErrorMs: meanEvennessError,
      ...(dynamicsContrast === undefined ? {} : { dynamicsContrast }),
    },
    input,
  };
}

function gradeHand(
  expected: TwoHandTargetEvent[],
  played: NoteEvent[],
  beatMs: number,
): { correct: number; metrics: ScoringMetric[]; spacingErrors: number[] } {
  const metrics: ScoringMetric[] = [];
  let correct = 0;
  expected.forEach((expectedEvent, index) => {
    const actual = played[index];
    const expectedMidi = expectedEvent.midiNote;
    const actualMidi = actual?.type === "noteOn" ? actual.midiNote : undefined;
    metrics.push({ kind: "pitch", expectedMidi, actualMidi });
    if (actualMidi === expectedMidi) correct += 1;
  });

  const spacingErrors = played.slice(1).map((event, index) => {
    const currentTarget = expected[index + 1];
    const previousTarget = expected[index];
    const expectedSpacing =
      currentTarget && previousTarget ? (currentTarget.beat - previousTarget.beat) * beatMs : 0;
    return Math.abs(Number(event.timestamp) - Number(played[index]!.timestamp) - expectedSpacing);
  });

  return { correct, metrics, spacingErrors };
}

function buildTargetEvents({
  patternKind,
  lhRoot,
  rhRoot,
  beats,
}: {
  patternKind: TwoHandPatternKind;
  lhRoot: number;
  rhRoot: number;
  beats: number;
}): TwoHandTargetEvent[] {
  const events: TwoHandTargetEvent[] = [];

  if (patternKind === "lh-pulse-rh-line") {
    for (let beat = 0; beat < beats; beat += 1) {
      events.push({ hand: "left", midiNote: lhRoot, beat });
    }
    for (let index = 0; index < beats * 2; index += 1) {
      events.push({
        hand: "right",
        midiNote: scaleNote(rhRoot, index),
        beat: index * 0.5,
      });
    }
  }

  if (patternKind === "rh-pulse-lh-line") {
    for (let index = 0; index < beats * 2; index += 1) {
      events.push({
        hand: "left",
        midiNote: scaleNote(lhRoot, index),
        beat: index * 0.5,
      });
    }
    for (let beat = 0; beat < beats; beat += 1) {
      events.push({ hand: "right", midiNote: rhRoot, beat });
    }
  }

  if (patternKind === "lh-shell-rh-line") {
    const leftShell = [0, 7, 10, 7];
    const rightFragment = [0, 2, 4, 7, 9, 7, 4, 2];
    for (let beat = 0; beat < beats; beat += 1) {
      events.push({
        hand: "left",
        midiNote: lhRoot + leftShell[beat % leftShell.length]!,
        beat,
      });
    }
    for (let index = 0; index < beats * 2; index += 1) {
      events.push({
        hand: "right",
        midiNote: rhRoot + rightFragment[index % rightFragment.length]!,
        beat: index * 0.5,
      });
    }
  }

  if (patternKind === "alberti-rh-holds") {
    const alberti = [0, 7, 4, 7];
    const holds = [0, 4, 7, 12];
    for (let index = 0; index < beats * 2; index += 1) {
      events.push({
        hand: "left",
        midiNote: lhRoot + alberti[index % alberti.length]!,
        beat: index * 0.5,
      });
    }
    for (let beat = 0; beat < beats; beat += 1) {
      events.push({
        hand: "right",
        midiNote: rhRoot + holds[beat % holds.length]!,
        beat,
      });
    }
  }

  if (patternKind === "contrary-motion-scale") {
    const topRoot = rhRoot + 12;
    for (let index = 0; index < beats * 2; index += 1) {
      events.push({
        hand: "left",
        midiNote: scaleNote(lhRoot, index),
        beat: index * 0.5,
      });
      events.push({
        hand: "right",
        midiNote: scaleNote(topRoot, index, -1),
        beat: index * 0.5,
      });
    }
  }

  return events.sort((a, b) => a.beat - b.beat || handSort(a.hand) - handSort(b.hand));
}

function filterEventsByHandMode(
  events: TwoHandTargetEvent[],
  handMode: TwoHandHandMode,
): TwoHandTargetEvent[] {
  return handMode === "both" ? events : events.filter((event) => event.hand === handMode);
}

function scaleNote(root: number, index: number, direction: 1 | -1 = 1): number {
  const span = MAJOR_STEPS.length * 2;
  const phase = index % span;
  const step = phase < MAJOR_STEPS.length ? phase : span - 1 - phase;
  if (direction === 1) return root + MAJOR_STEPS[step]!;
  // Descending walks the major scale DOWN from `root` (degree offsets mirrored
  // below the root). Negating the ascending semitone offsets would leave the
  // key: from C5 that yields B♭4/A♭4/E♭4/D♭4 instead of B4/A4/E4/D4.
  return root + (step === 0 ? 0 : MAJOR_STEPS[MAJOR_STEPS.length - step]! - 12);
}

function handSort(hand: TwoHandHand): number {
  return hand === "left" ? 0 : 1;
}

function belongsToHand(
  midiNote: number,
  hand: TwoHandHand,
  prompt: TwoHandIndependencePrompt,
  leftExpectedNotes: Set<number>,
  rightExpectedNotes: Set<number>,
): boolean {
  if (hand === "left" && prompt.handMode === "right") return false;
  if (hand === "right" && prompt.handMode === "left") return false;
  if (hand === "left" && leftExpectedNotes.has(midiNote) && !rightExpectedNotes.has(midiNote)) {
    return true;
  }
  if (hand === "right" && rightExpectedNotes.has(midiNote) && !leftExpectedNotes.has(midiNote)) {
    return true;
  }
  return hand === "left" ? midiNote < prompt.splitMidi : midiNote >= prompt.splitMidi;
}

function meanVelocity(events: NoteOnEvent[]): number | undefined {
  if (events.length === 0) return undefined;
  return events.reduce((sum, event) => sum + event.velocity, 0) / events.length;
}

/** The hand carrying the line (or the sung holds) — the one to bring out. */
function melodyHandForPattern(patternKind: TwoHandPatternKind): TwoHandHand {
  return patternKind === "rh-pulse-lh-line" ? "left" : "right";
}

function labelForPattern(patternKind: TwoHandPatternKind): string {
  return TWO_HAND_PATTERNS.find((pattern) => pattern.id === patternKind)?.label ?? "Pulse + line";
}

function pitchClassLabel(note: string): string {
  return note.trim().replace(/-?\d+$/, "");
}
