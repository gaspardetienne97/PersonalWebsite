/**
 * Fretboard positions drill — the positions-driven Spider variant (curriculum
 * §3 G-I3, §4 item 7). Where `string-spider.ts` generates finger permutations
 * from a start fret, this runs an *authored* list of string/fret positions
 * transposed by a root fret: the five minor-pentatonic boxes and the five CAGED
 * major shapes.
 *
 * What each input can establish is respected: on-screen taps carry a
 * `fretPosition`, so string and fret are graded; microphone and MIDI give pitch
 * only, and the result says so rather than pretending the box was played.
 */

import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote } from "@repo/music-core/engines/theory";
import { gradeFrettedSequence } from "./string-spider";
import type { StringInstrumentId, TuningProfile } from "@repo/music-core/engines/tunings";

export type FretboardPatternFamily = "minor-pentatonic" | "caged-major";

export type FretboardPatternId =
  | `minor-pentatonic-box-${1 | 2 | 3 | 4 | 5}`
  | `caged-major-${"e" | "d" | "c" | "a" | "g"}-shape`;

export interface FretboardPatternDefinition {
  id: FretboardPatternId;
  label: string;
  family: FretboardPatternFamily;
  /**
   * Playing order, low string to high. `fretOffset` is measured from the
   * pattern's root fret — the fret of the tonic on string 6 — so one root fret
   * places every box or shape of a family where it belongs on the neck.
   */
  offsets: { stringNumber: number; fretOffset: number }[];
}

export interface FretboardPatternPosition {
  stringNumber: number;
  fretNumber: number;
  midiNote: number;
}

export interface FretboardPatternOptions {
  tuning: TuningProfile;
  patternId: FretboardPatternId;
  /** Fret of the tonic on the lowest string; the offsets are relative to it. */
  rootFret: number;
  bpm: number;
}

export interface FretboardPatternPrompt {
  label: string;
  instrument: StringInstrumentId;
  tuningId: string;
  patternId: FretboardPatternId;
  patternLabel: string;
  family: FretboardPatternFamily;
  rootFret: number;
  bpm: number;
  positions: FretboardPatternPosition[];
  midiNotes: number[];
  noteLabels: string[];
  targetSpacingMs: number;
}

export interface FretboardPatternAnswer {
  playedMidiNotes: number[];
  pitchAccuracy: number;
  /** Notes played with an observable string and fret (on-screen input only). */
  positionsMeasured: number;
  positionsCorrect: number;
  meanTimingErrorMs: number;
}

/** Two notes per string, string 6 to string 1, offsets from the box-1 root fret. */
function pentatonicBox(
  id: FretboardPatternId,
  label: string,
  perString: [number, number][],
): FretboardPatternDefinition {
  return {
    id,
    label,
    family: "minor-pentatonic",
    offsets: perString.flatMap(([low, high], index) => {
      const stringNumber = 6 - index;
      return [
        { stringNumber, fretOffset: low },
        { stringNumber, fretOffset: high },
      ];
    }),
  };
}

/**
 * A CAGED grip, arpeggiated low string to high. `baseOffset` is where the shape
 * sits above the string-6 tonic: E at the root, then D, C, A and G up the neck.
 */
function cagedShape(
  id: FretboardPatternId,
  label: string,
  baseOffset: number,
  grip: [stringNumber: number, fret: number][],
): FretboardPatternDefinition {
  return {
    id,
    label,
    family: "caged-major",
    offsets: grip.map(([stringNumber, fret]) => ({
      stringNumber,
      fretOffset: baseOffset + fret,
    })),
  };
}

export const FRETBOARD_PATTERNS: FretboardPatternDefinition[] = [
  pentatonicBox("minor-pentatonic-box-1", "Minor pentatonic box 1", [
    [0, 3],
    [0, 2],
    [0, 2],
    [0, 2],
    [0, 3],
    [0, 3],
  ]),
  pentatonicBox("minor-pentatonic-box-2", "Minor pentatonic box 2", [
    [3, 5],
    [2, 5],
    [2, 5],
    [2, 4],
    [3, 5],
    [3, 5],
  ]),
  pentatonicBox("minor-pentatonic-box-3", "Minor pentatonic box 3", [
    [5, 7],
    [5, 7],
    [5, 7],
    [4, 7],
    [5, 8],
    [5, 7],
  ]),
  pentatonicBox("minor-pentatonic-box-4", "Minor pentatonic box 4", [
    [7, 10],
    [7, 10],
    [7, 9],
    [7, 9],
    [8, 10],
    [7, 10],
  ]),
  pentatonicBox("minor-pentatonic-box-5", "Minor pentatonic box 5", [
    [10, 12],
    [10, 12],
    [9, 12],
    [9, 12],
    [10, 12],
    [10, 12],
  ]),
  // Open-shape grips, written as their open-chord frets and lifted by
  // `baseOffset` so one root fret places all five around the same tonic.
  cagedShape("caged-major-e-shape", "CAGED E shape", 0, [
    [6, 0],
    [5, 2],
    [4, 2],
    [3, 1],
    [2, 0],
    [1, 0],
  ]),
  cagedShape("caged-major-d-shape", "CAGED D shape", 2, [
    [4, 0],
    [3, 2],
    [2, 3],
    [1, 2],
  ]),
  cagedShape("caged-major-c-shape", "CAGED C shape", 4, [
    [5, 3],
    [4, 2],
    [3, 0],
    [2, 1],
    [1, 0],
  ]),
  cagedShape("caged-major-a-shape", "CAGED A shape", 7, [
    [5, 0],
    [4, 2],
    [3, 2],
    [2, 2],
    [1, 0],
  ]),
  cagedShape("caged-major-g-shape", "CAGED G shape", 9, [
    [6, 3],
    [5, 2],
    [4, 0],
    [3, 0],
    [2, 0],
    [1, 3],
  ]),
];

export function fretboardPatternDefinition(
  patternId: FretboardPatternId,
): FretboardPatternDefinition {
  return FRETBOARD_PATTERNS.find((pattern) => pattern.id === patternId) ?? FRETBOARD_PATTERNS[0]!;
}

/**
 * The root frets at which this pattern fits on the neck — the route clamps its
 * picker to this rather than letting `createFretboardPatternExercise` throw.
 */
export function fretboardPatternRootFretRange(
  tuning: TuningProfile,
  definition: FretboardPatternDefinition,
): { min: number; max: number } {
  const offsets = definition.offsets.map((offset) => offset.fretOffset);
  const min = Math.max(0, -Math.min(...offsets));
  return { min, max: Math.max(min, tuning.fretCount - Math.max(...offsets)) };
}

export function fretboardPatternPositions(
  tuning: TuningProfile,
  definition: FretboardPatternDefinition,
  rootFret: number,
): FretboardPatternPosition[] {
  return definition.offsets.map(({ stringNumber, fretOffset }) => {
    const openMidi = tuning.openStrings[stringNumber - 1];
    if (openMidi === undefined) throw new Error(`String ${stringNumber} is not available.`);
    const fretNumber = rootFret + fretOffset;
    return { stringNumber, fretNumber, midiNote: openMidi + fretNumber };
  });
}

export function createFretboardPatternExercise(
  options: FretboardPatternOptions,
): ExerciseDefinition<FretboardPatternPrompt, FretboardPatternAnswer> {
  const { tuning, rootFret, bpm } = options;
  const definition = fretboardPatternDefinition(options.patternId);
  const positions = fretboardPatternPositions(tuning, definition, rootFret);
  const frets = positions.map((position) => position.fretNumber);
  if (Math.min(...frets) < 0 || Math.max(...frets) > tuning.fretCount) {
    throw new Error("This position pattern does not fit on the selected fretboard.");
  }

  const midiNotes = positions.map((position) => position.midiNote);
  const instrumentLabel = tuning.instrument === "guitar" ? "Guitar" : "Ukulele";

  return {
    id: `technique.${tuning.instrument}.positions.${definition.id}`,
    name: `${instrumentLabel} ${definition.label}`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: ["technique.strings.spider", `technique.${tuning.instrument}.spider`],
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => ({
      id: `fretboard-pattern-${tuning.id}-${definition.id}-${rootFret}-${bpm}`,
      payload: {
        label: `${instrumentLabel} · ${definition.label} · root fret ${rootFret}`,
        instrument: tuning.instrument,
        tuningId: tuning.id,
        patternId: definition.id,
        patternLabel: definition.label,
        family: definition.family,
        rootFret,
        bpm,
        positions,
        midiNotes,
        noteLabels: midiNotes.map((midiNote) => midiToNote(midiNote)),
        targetSpacingMs: 60_000 / bpm,
      },
    }),
    createRun(prompt) {
      return fretboardPatternRun(prompt.payload);
    },
  };
}

function fretboardPatternRun(prompt: FretboardPatternPrompt): ExerciseRun<FretboardPatternAnswer> {
  const input: NoteEvent[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn") input.push(event);
    },
    getLiveState() {
      const progress = Math.min(1, input.length / prompt.positions.length);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      const graded = gradeFrettedSequence(prompt.midiNotes, prompt.targetSpacingMs, input);
      const metrics: ScoringMetric[] = [...graded.metrics];
      const total = prompt.positions.length;
      let positionsMeasured = 0;
      let positionsCorrect = 0;
      // A note is right when the input could see its position and the position
      // matched, or — when only pitch was observable — when the pitch matched.
      let correctNotes = 0;

      prompt.positions.forEach((position, index) => {
        const actual = graded.played[index];
        // Only on-screen taps carry a string and a fret; pitch alone cannot
        // establish which one was played.
        const fretPosition =
          actual?.source === "onscreen" && actual.inputProfileId === prompt.tuningId
            ? actual.fretPosition
            : undefined;
        if (fretPosition) {
          positionsMeasured += 1;
          if (
            fretPosition.stringNumber === position.stringNumber &&
            fretPosition.fretNumber === position.fretNumber
          ) {
            positionsCorrect += 1;
            correctNotes += 1;
          }
          return;
        }
        if (actual?.midiNote === position.midiNote) correctNotes += 1;
      });

      const measuredAny = positionsMeasured > 0;
      metrics.push({
        kind: "choice",
        expected: "Every note on its own string and fret",
        actual: !measuredAny
          ? "Position not observed"
          : positionsCorrect === positionsMeasured
            ? "Every note on its own string and fret"
            : "Wrong string or fret",
      });

      const accuracy = total === 0 ? 0 : correctNotes / total;
      const score = accuracy * 0.85 + graded.evennessScore * 0.15;
      const answer: FretboardPatternAnswer = {
        playedMidiNotes: graded.playedMidiNotes,
        pitchAccuracy: graded.pitchAccuracy,
        positionsMeasured,
        positionsCorrect,
        meanTimingErrorMs: graded.meanTimingErrorMs,
      };

      return {
        correct: score >= 0.9,
        score,
        metrics,
        feedback: [
          {
            severity: accuracy === 1 ? "good" : "warn",
            message: measuredAny
              ? `${positionsCorrect}/${positionsMeasured} notes on the right string and fret.`
              : `${graded.correctNotes}/${total} pitches matched.`,
          },
          ...(measuredAny
            ? []
            : [
                {
                  severity: "info" as const,
                  message: "Pitch only: position not verified. Tap the fretboard to grade the box.",
                },
              ]),
        ],
        target: { label: prompt.label, midiNotes: prompt.midiNotes },
        response: { midiNotes: answer.playedMidiNotes },
        answer,
        input,
      };
    },
  };
}
