import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote } from "@repo/music-core/engines/theory";
import type { StringInstrumentId, TuningProfile } from "@repo/music-core/engines/tunings";

export interface FretboardNoteFinderOptions {
  tuning: TuningProfile;
  stringNumber: number;
  fretNumber: number;
  visibleFrets?: number;
}

export interface FretboardNoteFinderPosition {
  stringNumber: number;
  fretNumber: number;
  midiNote: number;
}

export interface FretboardNoteFinderPrompt {
  label: string;
  instrument: StringInstrumentId;
  tuningId: string;
  stringNumber: number;
  fretNumber: number;
  targetMidi: number;
  targetNote: string;
  targetPitchClass: string;
  positions: FretboardNoteFinderPosition[];
  visibleFrets: number;
}

export interface FretboardNoteFinderAnswer {
  playedMidiNote?: number;
  targetMidi: number;
}

export function createFretboardNoteFinderExercise(
  options: FretboardNoteFinderOptions,
): ExerciseDefinition<FretboardNoteFinderPrompt, FretboardNoteFinderAnswer> {
  const visibleFrets = Math.max(0, Math.min(options.visibleFrets ?? 12, options.tuning.fretCount));
  const openMidi = options.tuning.openStrings[options.stringNumber - 1];
  if (openMidi === undefined) throw new Error(`String ${options.stringNumber} is not available.`);
  if (options.fretNumber < 0 || options.fretNumber > visibleFrets) {
    throw new Error("The note finder target must be on the visible fretboard.");
  }

  const targetMidi = openMidi + options.fretNumber;
  const targetNote = midiToNote(targetMidi);
  const targetPitchClass = targetNote.replace(/\d+$/, "");
  const instrumentLabel = options.tuning.instrument === "guitar" ? "Guitar" : "Ukulele";
  const positions = positionsForMidi(options.tuning, targetMidi, visibleFrets);

  return {
    id: `technique.${options.tuning.instrument}.note-finder`,
    name: `${instrumentLabel} Fretboard Note Finder`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: [
      "technique.strings.note-finder",
      `technique.${options.tuning.instrument}.note-finder`,
    ],
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => ({
      id: `fretboard-note-finder-${options.tuning.id}-${targetMidi}`,
      payload: {
        label: `Find ${targetNote}`,
        instrument: options.tuning.instrument,
        tuningId: options.tuning.id,
        stringNumber: options.stringNumber,
        fretNumber: options.fretNumber,
        targetMidi,
        targetNote,
        targetPitchClass,
        positions,
        visibleFrets,
      },
    }),
    createRun(prompt) {
      return fretboardNoteFinderRun(prompt.payload);
    },
  };
}

function positionsForMidi(
  tuning: TuningProfile,
  targetMidi: number,
  visibleFrets: number,
): FretboardNoteFinderPosition[] {
  const positions: FretboardNoteFinderPosition[] = [];
  tuning.openStrings.forEach((openMidi, index) => {
    const fretNumber = targetMidi - openMidi;
    if (fretNumber >= 0 && fretNumber <= visibleFrets) {
      positions.push({
        stringNumber: index + 1,
        fretNumber,
        midiNote: targetMidi,
      });
    }
  });
  return positions;
}

function fretboardNoteFinderRun(
  prompt: FretboardNoteFinderPrompt,
): ExerciseRun<FretboardNoteFinderAnswer> {
  const input: NoteEvent[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn" && input.length === 0) input.push(event);
    },
    getLiveState() {
      const played = input[0];
      return {
        progress: played === undefined ? 0 : 1,
        runningScore: played?.type === "noteOn" && played.midiNote === prompt.targetMidi ? 1 : 0,
        feedback: [],
      };
    },
    finish() {
      return grade(prompt, input);
    },
  };
}

function grade(
  prompt: FretboardNoteFinderPrompt,
  input: NoteEvent[],
): ExerciseResult<FretboardNoteFinderAnswer> {
  const played = input.find((event) => event.type === "noteOn");
  const playedMidiNote = played?.type === "noteOn" ? played.midiNote : undefined;
  const correct = playedMidiNote === prompt.targetMidi;
  const metrics: ScoringMetric[] = [
    { kind: "pitch", expectedMidi: prompt.targetMidi, actualMidi: playedMidiNote },
  ];

  return {
    correct,
    score: correct ? 1 : 0,
    metrics,
    feedback: [
      correct
        ? { severity: "good", message: `Found ${prompt.targetNote}.` }
        : { severity: "error", message: `Find ${prompt.targetNote}.` },
    ],
    target: { label: prompt.label, midiNotes: [prompt.targetMidi] },
    response: { midiNotes: playedMidiNote === undefined ? [] : [playedMidiNote] },
    answer: { playedMidiNote, targetMidi: prompt.targetMidi },
    input,
  };
}
