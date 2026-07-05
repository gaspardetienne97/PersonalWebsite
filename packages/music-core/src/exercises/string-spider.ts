import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote } from "@repo/music-core/engines/theory";
import type { StringInstrumentId, TuningProfile } from "@repo/music-core/engines/tunings";

export interface StringSpiderOptions {
  tuning: TuningProfile;
  stringNumber: number;
  startFret: number;
  bpm: number;
  pattern?: StringPatternKind;
  stringSpan?: StringSpiderSpan;
  /**
   * String-crossing crawl: each pattern step lands on the next string in the
   * span (finger 1 string A, finger 2 string B, ...), one pass starting from
   * each string. Trains the crossing itself, not per-string blocks. No-op on
   * single-string spans.
   */
  crossing?: boolean;
}

export interface StringSpiderPrompt {
  label: string;
  instrument: StringInstrumentId;
  tuningId: string;
  stringNumber: number;
  stringNumbers: number[];
  stringSpan: StringSpiderSpan;
  crossing: boolean;
  startFret: number;
  pattern: StringPatternKind;
  patternLabel: string;
  fretNumbers: number[];
  positions: StringSpiderPosition[];
  bpm: number;
  midiNotes: number[];
  noteLabels: string[];
  targetSpacingMs: number;
}

export interface StringSpiderPosition {
  stringNumber: number;
  fretNumber: number;
  midiNote: number;
}

export interface StringSpiderAnswer {
  playedMidiNotes: number[];
  pitchAccuracy: number;
  meanTimingErrorMs: number;
}

export type StringPatternKind =
  | "ascending-1234"
  | "descending-4321"
  | "inside-out-1324"
  | "outside-in-1423";

export type StringSpiderSpan = "single" | "adjacent-2" | "adjacent-3" | "all";

export interface StringSpiderPattern {
  id: StringPatternKind;
  label: string;
  fretOffsets: number[];
}

export const STRING_SPIDER_PATTERNS: StringSpiderPattern[] = [
  { id: "ascending-1234", label: "1-2-3-4 ascending", fretOffsets: [0, 1, 2, 3] },
  { id: "descending-4321", label: "4-3-2-1 descending", fretOffsets: [3, 2, 1, 0] },
  { id: "inside-out-1324", label: "1-3-2-4 inside-out", fretOffsets: [0, 2, 1, 3] },
  { id: "outside-in-1423", label: "1-4-2-3 outside-in", fretOffsets: [0, 3, 1, 2] },
];

export const STRING_SPIDER_SPANS: { id: StringSpiderSpan; label: string }[] = [
  { id: "single", label: "Single string" },
  { id: "adjacent-2", label: "2 adjacent strings" },
  { id: "adjacent-3", label: "3 adjacent strings" },
  { id: "all", label: "All strings from start" },
];

export function createStringSpiderExercise(
  options: StringSpiderOptions,
): ExerciseDefinition<StringSpiderPrompt, StringSpiderAnswer> {
  const { tuning, stringNumber, startFret, bpm } = options;
  const pattern = stringSpiderPattern(options.pattern);
  const stringSpan = stringSpiderSpan(options.stringSpan);
  const openMidi = tuning.openStrings[stringNumber - 1];
  if (openMidi === undefined) throw new Error(`String ${stringNumber} is not available.`);
  const stringNumbers = stringNumbersForSpan(tuning, stringNumber, stringSpan);
  const crossing = (options.crossing ?? false) && stringNumbers.length > 1;

  const positionAt = (targetStringNumber: number, offset: number): StringSpiderPosition => ({
    stringNumber: targetStringNumber,
    fretNumber: startFret + offset,
    midiNote: tuning.openStrings[targetStringNumber - 1]! + startFret + offset,
  });
  // Crossing: each pattern step moves to the next string in the span, with one
  // pass starting from each string, so every finger crosses from every string.
  // Blocks (default): the full pattern on each string in turn.
  const positions = crossing
    ? stringNumbers.flatMap((_, startIndex) =>
        pattern.fretOffsets.map((offset, step) =>
          positionAt(stringNumbers[(startIndex + step) % stringNumbers.length]!, offset),
        ),
      )
    : stringNumbers.flatMap((targetStringNumber) =>
        pattern.fretOffsets.map((offset) => positionAt(targetStringNumber, offset)),
      );
  const fretNumbers = positions.map((position) => position.fretNumber);
  if (startFret < 0 || Math.max(...fretNumbers) > tuning.fretCount) {
    throw new Error("The string independence pattern must fit on the selected fretboard.");
  }

  const midiNotes = positions.map((position) => position.midiNote);
  const instrumentLabel = tuning.instrument === "guitar" ? "Guitar" : "Ukulele";
  const stringLabel =
    stringNumbers.length === 1 ? `string ${stringNumber}` : `strings ${stringNumbers.join("-")}`;

  return {
    id: `technique.${tuning.instrument}.spider.${pattern.id}`,
    name: `${instrumentLabel} String Independence ${pattern.label}`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: [
      "technique.strings.spider",
      "technique.strings.spider.permutations",
      `technique.${tuning.instrument}.spider`,
    ],
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => ({
      id: `spider-${tuning.id}-${pattern.id}-${stringSpan}${crossing ? "-crossing" : ""}-${stringNumber}-${startFret}-${bpm}`,
      payload: {
        label: `${instrumentLabel} ${stringLabel} · ${pattern.label}${crossing ? " · crossing" : ""}`,
        instrument: tuning.instrument,
        tuningId: tuning.id,
        stringNumber,
        stringNumbers,
        stringSpan,
        crossing,
        startFret,
        pattern: pattern.id,
        patternLabel: pattern.label,
        fretNumbers,
        positions,
        bpm,
        midiNotes,
        noteLabels: midiNotes.map((midiNote) => midiToNote(midiNote)),
        targetSpacingMs: 60_000 / bpm,
      },
    }),
    createRun(prompt) {
      return stringSpiderRun(prompt.payload);
    },
  };
}

export function stringSpiderPattern(
  pattern: StringPatternKind = "ascending-1234",
): StringSpiderPattern {
  return (
    STRING_SPIDER_PATTERNS.find((candidate) => candidate.id === pattern) ??
    STRING_SPIDER_PATTERNS[0]!
  );
}

export function stringSpiderSpan(span: StringSpiderSpan = "single"): StringSpiderSpan {
  return STRING_SPIDER_SPANS.some((candidate) => candidate.id === span) ? span : "single";
}

function stringNumbersForSpan(
  tuning: TuningProfile,
  startString: number,
  span: StringSpiderSpan,
): number[] {
  const requestedCount =
    span === "single"
      ? 1
      : span === "adjacent-2"
        ? 2
        : span === "adjacent-3"
          ? 3
          : tuning.openStrings.length;
  const strings: number[] = [];
  for (
    let stringNumber = startString;
    stringNumber >= 1 && strings.length < requestedCount;
    stringNumber -= 1
  ) {
    strings.push(stringNumber);
  }
  return strings;
}

function stringSpiderRun(prompt: StringSpiderPrompt): ExerciseRun<StringSpiderAnswer> {
  const input: NoteEvent[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn") input.push(event);
    },
    getLiveState() {
      const progress = Math.min(1, input.length / prompt.midiNotes.length);
      const correct = input.filter(
        (event, index) => event.type === "noteOn" && event.midiNote === prompt.midiNotes[index],
      ).length;
      return {
        progress,
        runningScore: input.length === 0 ? 0 : correct / input.length,
        feedback: [],
      };
    },
    finish() {
      const played = input.filter((event) => event.type === "noteOn");
      const firstTimestamp = played[0]?.timestamp;
      const metrics: ScoringMetric[] = [];
      let correctNotes = 0;
      let timingErrorTotal = 0;
      let timingCount = 0;

      prompt.midiNotes.forEach((expectedMidi, index) => {
        const actual = played[index];
        const actualMidi = actual?.type === "noteOn" ? actual.midiNote : undefined;
        metrics.push({ kind: "pitch", expectedMidi, actualMidi });
        if (actualMidi === expectedMidi) correctNotes += 1;

        if (firstTimestamp !== undefined && actual?.type === "noteOn") {
          const expectedMs = Number(firstTimestamp) + index * prompt.targetSpacingMs;
          const actualMs = Number(actual.timestamp);
          const errorMs = actualMs - expectedMs;
          timingErrorTotal += Math.abs(errorMs);
          timingCount += 1;
          metrics.push({ kind: "timing", expectedMs, actualMs, errorMs });
        }
      });

      const pitchAccuracy = correctNotes / prompt.midiNotes.length;
      const meanTimingErrorMs = timingCount === 0 ? 0 : timingErrorTotal / timingCount;
      const evennessScore = Math.max(0, 1 - meanTimingErrorMs / 180);
      const score = pitchAccuracy * 0.85 + evennessScore * 0.15;
      const answer: StringSpiderAnswer = {
        playedMidiNotes: played.map((event) => event.midiNote),
        pitchAccuracy,
        meanTimingErrorMs,
      };

      return {
        correct: score >= 0.9,
        score,
        metrics,
        feedback: [
          {
            severity: score >= 0.9 ? "good" : "warn",
            message: `${correctNotes}/${prompt.midiNotes.length} clean · ${Math.round(meanTimingErrorMs)}ms timing error.`,
          },
        ],
        target: { label: prompt.label, midiNotes: prompt.midiNotes },
        response: { midiNotes: answer.playedMidiNotes },
        answer,
        input,
      };
    },
  };
}
