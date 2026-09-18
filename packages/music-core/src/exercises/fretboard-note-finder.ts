import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { midiToNote } from "@repo/music-core/engines/theory";
import type { StringInstrumentId, TuningProfile } from "@repo/music-core/engines/tunings";

export interface FretboardNoteFinderOptions {
  tuning: TuningProfile;
  stringNumber: number;
  fretNumber: number;
  visibleFrets?: number;
  interval?: { semitones: 3 | 4 | 7 | 12; windowStart: number; windowEnd: number };
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
  interval?: FretboardNoteFinderOptions["interval"];
  anchorMidi?: number;
}

export interface FretboardNoteFinderAnswer {
  playedMidiNote?: number;
  targetMidi: number;
  positionMeasured?: boolean;
  positionCorrect?: boolean;
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

  const interval = options.interval;
  if (interval && options.tuning.instrument !== "guitar")
    throw new Error("Interval recall currently supports guitar.");
  if (
    interval &&
    (![3, 4, 7, 12].includes(interval.semitones) ||
      !Number.isInteger(interval.windowStart) ||
      !Number.isInteger(interval.windowEnd) ||
      interval.windowStart < 0 ||
      interval.windowEnd > options.tuning.fretCount ||
      interval.windowEnd < interval.windowStart ||
      options.fretNumber < interval.windowStart ||
      options.fretNumber > interval.windowEnd)
  ) {
    throw new Error("Choose a valid interval and fret window containing the anchor.");
  }
  const targetMidi = openMidi + options.fretNumber + (interval?.semitones ?? 0);
  const targetNote = midiToNote(targetMidi);
  const targetPitchClass = targetNote.replace(/\d+$/, "");
  const instrumentLabel = options.tuning.instrument === "guitar" ? "Guitar" : "Ukulele";
  const positions = positionsForMidi(
    options.tuning,
    targetMidi,
    interval?.windowEnd ?? visibleFrets,
  ).filter((position) => !interval || position.fretNumber >= interval.windowStart);
  if (interval && positions.length === 0)
    throw new Error("This interval has no answer in the selected fret window.");

  return {
    id: interval
      ? `technique.${options.tuning.instrument}.interval-recall`
      : `technique.${options.tuning.instrument}.note-finder`,
    name: `${instrumentLabel} Fretboard Note Finder`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: interval
      ? ["technique.guitar.intervals", `technique.guitar.intervals.${interval.semitones}`]
      : ["technique.strings.note-finder", `technique.${options.tuning.instrument}.note-finder`],
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => ({
      id: `fretboard-note-finder-${options.tuning.id}-${targetMidi}`,
      payload: {
        label: interval
          ? `Find the ascending ${FRETBOARD_INTERVALS.find((item) => item.semitones === interval.semitones)!.label.toLowerCase()} from the anchor, within frets ${interval.windowStart}–${interval.windowEnd}`
          : `Find ${targetNote}`,
        instrument: options.tuning.instrument,
        tuningId: options.tuning.id,
        stringNumber: options.stringNumber,
        fretNumber: options.fretNumber,
        targetMidi,
        targetNote,
        targetPitchClass,
        positions,
        visibleFrets: interval?.windowEnd ?? visibleFrets,
        ...(interval ? { interval, anchorMidi: openMidi + options.fretNumber } : {}),
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
  const positionMeasured = Boolean(
    prompt.interval &&
    played?.type === "noteOn" &&
    played.source === "onscreen" &&
    played.fretPosition,
  );
  const positionCorrect =
    positionMeasured &&
    played?.type === "noteOn" &&
    played.inputProfileId === prompt.tuningId &&
    prompt.positions.some(
      (position) =>
        position.stringNumber === played.fretPosition?.stringNumber &&
        position.fretNumber === played.fretPosition?.fretNumber &&
        position.midiNote === playedMidiNote,
    );
  const correct = playedMidiNote === prompt.targetMidi && (!positionMeasured || positionCorrect);
  const metrics: ScoringMetric[] = [
    { kind: "pitch", expectedMidi: prompt.targetMidi, actualMidi: playedMidiNote },
  ];

  if (prompt.interval)
    metrics.push({
      kind: "choice",
      expected: "Valid position in the fret window",
      actual: positionMeasured
        ? positionCorrect
          ? "Valid position in the fret window"
          : "Incorrect fret position"
        : "Position not observed",
    });
  return {
    correct,
    score: correct ? 1 : 0,
    metrics,
    feedback: [
      correct
        ? {
            severity: "good",
            message: prompt.interval
              ? `${positionMeasured ? "Position and pitch" : "Pitch only; string position not observed"}: found ${prompt.targetNote}.`
              : `Found ${prompt.targetNote}.`,
          }
        : { severity: "error", message: `Find ${prompt.targetNote}.` },
    ],
    target: {
      label: prompt.label,
      midiNotes: [prompt.targetMidi],
      ...(prompt.interval
        ? {
            choice: intervalRegionToken(
              prompt.interval.semitones,
              prompt.interval.windowStart,
              prompt.tuningId,
            ),
          }
        : {}),
    },
    response: { midiNotes: playedMidiNote === undefined ? [] : [playedMidiNote] },
    answer: {
      playedMidiNote,
      targetMidi: prompt.targetMidi,
      ...(prompt.interval
        ? { positionMeasured, ...(positionMeasured ? { positionCorrect } : {}) }
        : {}),
    },
    input,
  };
}

export const FRETBOARD_INTERVALS = [
  { semitones: 3, label: "Minor third" },
  { semitones: 4, label: "Major third" },
  { semitones: 7, label: "Perfect fifth" },
  { semitones: 12, label: "Octave" },
] as const;

/** Select a playable anchor without assuming standard tuning. */
export function intervalRecallAnchor(
  tuning: TuningProfile,
  semitones: 3 | 4 | 7 | 12,
  windowStart: number,
  attempt = 0,
): { stringNumber: number; fretNumber: number } {
  const end = Math.min(tuning.fretCount, windowStart + 4);
  const anchors: { stringNumber: number; fretNumber: number }[] = [];
  tuning.openStrings.forEach((open, index) => {
    for (let fret = windowStart; fret <= end; fret++) {
      if (
        positionsForMidi(tuning, open + fret + semitones, end).some(
          (position) => position.fretNumber >= windowStart,
        )
      )
        anchors.push({ stringNumber: index + 1, fretNumber: fret });
    }
  });
  if (!anchors.length) throw new Error("No playable interval in this region.");
  return anchors[Math.max(0, Math.floor(attempt)) % anchors.length]!;
}

const intervalRegionToken = (semitones: number, start: number, tuningId: string) =>
  `interval:${semitones}:region:${start}:tuning:${tuningId}`;

/** Five recent successful position responses; hardware pitch alone cannot prove a region. */
export function intervalRegionReady(
  events: ScoringEvent[],
  semitones: number,
  start: number,
  tuningId: string,
): boolean {
  const recent = events
    .filter(
      (event) =>
        event.instrument === "guitar" &&
        event.assistance === "independent" &&
        event.source === "onscreen" &&
        event.target?.choice === intervalRegionToken(semitones, start, tuningId),
    )
    .sort((a, b) => Number(b.at) - Number(a.at))
    .slice(0, 5);
  return (
    recent.length === 5 &&
    recent.every(
      (event) =>
        event.correct &&
        event.metrics.some(
          (metric) =>
            metric.kind === "choice" &&
            metric.expected === "Valid position in the fret window" &&
            metric.actual === metric.expected,
        ),
    )
  );
}
