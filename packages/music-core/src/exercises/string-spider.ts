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
}

export interface StringSpiderPrompt {
  label: string;
  instrument: StringInstrumentId;
  tuningId: string;
  stringNumber: number;
  startFret: number;
  bpm: number;
  midiNotes: number[];
  noteLabels: string[];
  targetSpacingMs: number;
}

export interface StringSpiderAnswer {
  playedMidiNotes: number[];
  pitchAccuracy: number;
  meanTimingErrorMs: number;
}

export function createStringSpiderExercise(
  options: StringSpiderOptions,
): ExerciseDefinition<StringSpiderPrompt, StringSpiderAnswer> {
  const { tuning, stringNumber, startFret, bpm } = options;
  const openMidi = tuning.openStrings[stringNumber - 1];
  if (openMidi === undefined) throw new Error(`String ${stringNumber} is not available.`);
  if (startFret < 0 || startFret + 3 > tuning.fretCount) {
    throw new Error("The 1-2-3-4 pattern must fit on the selected fretboard.");
  }

  const midiNotes = Array.from({ length: 4 }, (_, index) => openMidi + startFret + index);
  const instrumentLabel = tuning.instrument === "guitar" ? "Guitar" : "Ukulele";

  return {
    id: `technique.${tuning.instrument}.spider`,
    name: `${instrumentLabel} Spider 1-2-3-4`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: ["technique.strings.spider", `technique.${tuning.instrument}.spider`],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `spider-${tuning.id}-${stringNumber}-${startFret}-${bpm}`,
      payload: {
        label: `${instrumentLabel} string ${stringNumber} · frets ${startFret}-${startFret + 3}`,
        instrument: tuning.instrument,
        tuningId: tuning.id,
        stringNumber,
        startFret,
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
