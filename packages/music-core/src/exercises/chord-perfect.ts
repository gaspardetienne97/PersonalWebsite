/**
 * Chord-Perfect — the Justin-Guitar "chord perfect" drill. Fret a chord shape,
 * then sound each voiced string one at a time (low to high) to confirm every
 * note rings cleanly. The MIDI / on-screen version computes the target pitch on
 * each fretted string from the shape and the tuning, then grades that you played
 * each note in ascending order, so a muted or fretted-wrong string shows up.
 *
 * Consumes normalized noteOn events and advances
 * `technique.{instrument}.chord-perfect` through the standard exercise pipeline
 * (scoring → skills → XP).
 *
 * Note: the curated chord shapes are standard open voicings; they still want a
 * pass on the physical instrument (string/fret mapping) before being treated as
 * verified — see the handoff's deferred hardware-verification list.
 */

import {
  Capability,
  discreteRun,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { identifyChord, toPitchClasses } from "@repo/music-core/engines/chord-id";
import { midiToNote } from "@repo/music-core/engines/theory";
import type { StringInstrumentId, TuningProfile } from "@repo/music-core/engines/tunings";
import { verifyChordTarget } from "@repo/music-core/engines/chord-verification";

export interface ChordShape {
  id: string;
  name: string;
  instrument: StringInstrumentId;
  tuningId: string;
  /** Fret per string in string-number order (index 0 = string 1); null = muted. */
  frets: (number | null)[];
}

/**
 * Curated standard open voicings. Frets are string-number order (string 1 = the
 * highest-pitched string); null mutes the string. Guitar standard tuning is
 * E-A-D-G-B-E, ukulele high-G is G-C-E-A.
 */
export const CHORD_SHAPES: ChordShape[] = [
  shape("guitar.c-major", "C major", "guitar", "guitar.standard", [0, 1, 0, 2, 3, null]),
  shape("guitar.g-major", "G major", "guitar", "guitar.standard", [3, 0, 0, 0, 2, 3]),
  shape("guitar.d-major", "D major", "guitar", "guitar.standard", [2, 3, 2, 0, null, null]),
  shape("guitar.e-minor", "E minor", "guitar", "guitar.standard", [0, 0, 0, 2, 2, 0]),
  shape("guitar.a-minor", "A minor", "guitar", "guitar.standard", [0, 1, 2, 2, 0, null]),
  shape("ukulele.c-major", "C major", "ukulele", "ukulele.high-g", [3, 0, 0, 0]),
  shape("ukulele.f-major", "F major", "ukulele", "ukulele.high-g", [0, 1, 0, 2]),
  shape("ukulele.g-major", "G major", "ukulele", "ukulele.high-g", [2, 3, 2, 0]),
  shape("ukulele.a-minor", "A minor", "ukulele", "ukulele.high-g", [0, 0, 0, 2]),
];

export function chordShapesFor(instrument: StringInstrumentId): ChordShape[] {
  return CHORD_SHAPES.filter((entry) => entry.instrument === instrument);
}

export function chordShapeMidiNotes(tuning: TuningProfile, shape: ChordShape): number[] {
  if (shape.frets.length !== tuning.openStrings.length) {
    throw new Error("Chord shape does not match the tuning's string count.");
  }

  return shape.frets
    .map((fret, index) => (fret === null ? undefined : tuning.openStrings[index]! + fret))
    .filter((midi): midi is number => midi !== undefined)
    .sort((left, right) => left - right);
}

export interface ChordPerfectOptions {
  tuning: TuningProfile;
  shape: ChordShape;
}

export interface ChordPerfectPrompt {
  label: string;
  instrument: StringInstrumentId;
  tuningId: string;
  shapeId: string;
  /** Voiced strings, ascending by pitch — the order to play and grade. */
  midiNotes: number[];
  noteLabels: string[];
  /** Every voiced note, for lighting the whole shape on the fretboard. */
  shapeMidiNotes: number[];
}

export interface ChordPerfectAnswer {
  playedMidiNotes: number[];
  pitchAccuracy: number;
}

export interface OpenChordIdentificationPrompt {
  label: string;
  instrument: StringInstrumentId;
  tuningId: string;
  shapeId: string;
  expectedSymbol: string;
  expectedPitchClasses: number[];
  shapeMidiNotes: number[];
}

export interface OpenChordIdentificationAnswer {
  expectedSymbol: string;
  detectedSymbol?: string;
  confidence: number;
  targetCoverage: number;
  pitchClasses: number[];
  observedMidiNotes: number[];
}

export function createChordPerfectExercise(
  options: ChordPerfectOptions,
): ExerciseDefinition<ChordPerfectPrompt, ChordPerfectAnswer> {
  const { tuning, shape } = options;
  const midiNotes = chordShapeMidiNotes(tuning, shape);

  return {
    id: `technique.${tuning.instrument}.chord-perfect`,
    name: `${shape.name} Chord-Perfect`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: ["technique.strings.chord-perfect", `technique.${tuning.instrument}.chord-perfect`],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `chord-perfect-${shape.id}`,
      payload: {
        label: `${shape.name} · ${midiNotes.length} strings`,
        instrument: tuning.instrument,
        tuningId: tuning.id,
        shapeId: shape.id,
        midiNotes,
        noteLabels: midiNotes.map((midi) => midiToNote(midi)),
        shapeMidiNotes: midiNotes,
      },
    }),
    createRun(prompt) {
      return chordPerfectRun(prompt.payload);
    },
  };
}

export function createOpenChordIdentificationExercise(
  options: ChordPerfectOptions,
): ExerciseDefinition<OpenChordIdentificationPrompt, OpenChordIdentificationAnswer> {
  const { tuning, shape } = options;
  const midiNotes = chordShapeMidiNotes(tuning, shape);
  const expectedPitchClasses = toPitchClasses(midiNotes);
  const expectedSymbol = identifyChord(expectedPitchClasses, {
    maxCandidates: 1,
    minConfidence: 1,
  })[0]?.symbol;

  return {
    id: `technique.${tuning.instrument}.open-chord-id`,
    name: `${shape.name} Open Chord ID`,
    capabilities: [Capability.Technique, Capability.Harmony, Capability.Pitch],
    skillIds: ["technique.strings.open-chord-id", `technique.${tuning.instrument}.open-chord-id`],
    inputs: ["audio", "midi", "onscreen"],
    streaming: false,
    generate: () => ({
      id: `open-chord-id-${shape.id}`,
      payload: {
        label: `${shape.name} · open chord ID`,
        instrument: tuning.instrument,
        tuningId: tuning.id,
        shapeId: shape.id,
        expectedSymbol: expectedSymbol ?? shape.name,
        expectedPitchClasses,
        shapeMidiNotes: midiNotes,
      },
    }),
    createRun(prompt) {
      return discreteRun((input) => gradeOpenChordIdentification(prompt.payload, input));
    },
  };
}

function chordPerfectRun(prompt: ChordPerfectPrompt): ExerciseRun<ChordPerfectAnswer> {
  const input: NoteEvent[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn") input.push(event);
    },
    getLiveState() {
      const progress =
        prompt.midiNotes.length === 0 ? 0 : Math.min(1, input.length / prompt.midiNotes.length);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      const played = input.filter((event) => event.type === "noteOn");
      const metrics: ScoringMetric[] = [];
      let correct = 0;
      prompt.midiNotes.forEach((expectedMidi, index) => {
        const actual = played[index];
        const actualMidi = actual?.type === "noteOn" ? actual.midiNote : undefined;
        metrics.push({ kind: "pitch", expectedMidi, actualMidi });
        if (actualMidi === expectedMidi) correct += 1;
      });

      const total = prompt.midiNotes.length;
      const pitchAccuracy = total === 0 ? 0 : correct / total;

      return {
        // "Chord perfect" means every voiced string rang true.
        correct: correct === total && total > 0,
        score: pitchAccuracy,
        metrics,
        feedback: [
          {
            severity: correct === total ? "good" : "warn",
            message: `${correct}/${total} strings clean.`,
          },
        ],
        target: { label: prompt.label, midiNotes: prompt.midiNotes },
        response: { midiNotes: played.map((event) => event.midiNote) },
        answer: { playedMidiNotes: played.map((event) => event.midiNote), pitchAccuracy },
        input,
      };
    },
  };
}

function gradeOpenChordIdentification(prompt: OpenChordIdentificationPrompt, input: NoteEvent[]) {
  const observedMidiNotes = input
    .filter((event) => event.type === "noteOn")
    .map((event) => event.midiNote);
  const pitchClasses = toPitchClasses(observedMidiNotes);
  const detected = identifyChord(pitchClasses, { maxCandidates: 1 })[0];
  const verification = verifyChordTarget({
    expectedMidiNotes: prompt.shapeMidiNotes,
    observedMidiNotes,
  });
  const detectedSymbol = detected?.symbol;
  const correct = detectedSymbol === prompt.expectedSymbol && verification.correct;
  const score = correct
    ? 1
    : Math.max(0, Math.min(1, (detected?.confidence ?? 0) * 0.35 + verification.score * 0.65));
  const metrics: ScoringMetric[] = [
    { kind: "choice", expected: prompt.expectedSymbol, actual: detectedSymbol },
    {
      kind: "chord",
      expectedPitchClasses: [...prompt.expectedPitchClasses],
      actualPitchClasses: [...pitchClasses],
      missingPitchClasses: [...verification.missingPitchClasses],
      extraPitchClasses: [...verification.extraPitchClasses],
    },
  ];

  return {
    correct,
    score,
    metrics,
    feedback: [
      correct
        ? { severity: "good" as const, message: `Heard ${prompt.expectedSymbol}.` }
        : {
            severity: "warn" as const,
            message: detectedSymbol
              ? `Heard ${detectedSymbol}; target was ${prompt.expectedSymbol}.`
              : `Target was ${prompt.expectedSymbol}; no clear chord was detected.`,
          },
    ],
    target: {
      label: prompt.expectedSymbol,
      choice: prompt.expectedSymbol,
      midiNotes: prompt.shapeMidiNotes,
    },
    response: {
      label: detectedSymbol,
      choice: detectedSymbol,
      midiNotes: observedMidiNotes,
    },
    answer: {
      expectedSymbol: prompt.expectedSymbol,
      detectedSymbol,
      confidence: detected?.confidence ?? 0,
      targetCoverage: verification.coverage,
      pitchClasses,
      observedMidiNotes,
    },
    input,
  };
}

function shape(
  id: string,
  name: string,
  instrument: StringInstrumentId,
  tuningId: string,
  frets: (number | null)[],
): ChordShape {
  return { id, name, instrument, tuningId, frets };
}
