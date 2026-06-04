import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";

import {
  decodeChoiceAnswer,
  earTrainingRun,
  pitchClasses,
  playedMidiNotes,
  type EarTrainingPromptBase,
} from "./ear-training";

interface ChordQuality {
  token: string;
  label: string;
  skillId: string;
  intervals: number[];
  level: "triad" | "seventh";
}

const CHORD_QUALITIES: ChordQuality[] = [
  {
    token: "major",
    label: "Major",
    skillId: "harmony.triad.major",
    intervals: [0, 4, 7],
    level: "triad",
  },
  {
    token: "minor",
    label: "Minor",
    skillId: "harmony.triad.minor",
    intervals: [0, 3, 7],
    level: "triad",
  },
  {
    token: "diminished",
    label: "Diminished",
    skillId: "harmony.triad.diminished",
    intervals: [0, 3, 6],
    level: "triad",
  },
  {
    token: "augmented",
    label: "Augmented",
    skillId: "harmony.triad.augmented",
    intervals: [0, 4, 8],
    level: "triad",
  },
  {
    token: "major-7",
    label: "Major 7th",
    skillId: "harmony.seventh.major",
    intervals: [0, 4, 7, 11],
    level: "seventh",
  },
  {
    token: "dominant-7",
    label: "Dominant 7th",
    skillId: "harmony.seventh.dominant",
    intervals: [0, 4, 7, 10],
    level: "seventh",
  },
  {
    token: "minor-7",
    label: "Minor 7th",
    skillId: "harmony.seventh.minor",
    intervals: [0, 3, 7, 10],
    level: "seventh",
  },
  {
    token: "half-diminished-7",
    label: "Half-Diminished 7th",
    skillId: "harmony.seventh.half-diminished",
    intervals: [0, 3, 6, 10],
    level: "seventh",
  },
  {
    token: "diminished-7",
    label: "Diminished 7th",
    skillId: "harmony.seventh.diminished",
    intervals: [0, 3, 6, 9],
    level: "seventh",
  },
];

export interface ChordQualityRecognitionPrompt extends EarTrainingPromptBase {
  drill: "chord-quality";
  quality: string;
  rootMidi: number;
  intervals: number[];
}

export interface CreateChordQualityRecognitionExerciseOptions {
  random?: () => number;
}

export function createChordQualityRecognitionExercise(
  options: CreateChordQualityRecognitionExerciseOptions = {},
): ExerciseDefinition<ChordQualityRecognitionPrompt, string | undefined> {
  const random = options.random ?? Math.random;

  return {
    id: "ear.chord-quality-recognition",
    name: "Chord Quality Recognition",
    capabilities: [Capability.EarTraining, Capability.Harmony],
    skillIds: CHORD_QUALITIES.map(({ skillId }) => skillId),
    inputs: ["click", "midi", "onscreen"],
    streaming: false,
    generate(ctx) {
      const quality = qualityForSkill(ctx.targetSkillIds[0]);
      const choices = choicesForDifficulty(ctx.difficulty, quality);
      const rootMidi = 48 + Math.floor(random() * 13);
      const midiNotes = quality.intervals.map((interval) => rootMidi + interval);

      return {
        id: `chord-quality-${quality.token}`,
        payload: {
          drill: "chord-quality",
          targetSkillId: quality.skillId,
          answerToken: quality.token,
          answerLabel: quality.label,
          choices: choices.map(({ token, label }) => ({ token, label })),
          playback: [{ midiNotes, offsetSeconds: 0, durationSeconds: 0.9 }],
          requiredPlayedNotes: quality.intervals.length,
          quality: quality.token,
          rootMidi,
          intervals: [...quality.intervals],
        },
      };
    },
    createRun(prompt) {
      return earTrainingRun(prompt.payload, (input) => gradeChordQuality(prompt.payload, input));
    },
  };
}

export const chordQualityRecognitionExercise = createChordQualityRecognitionExercise();

function qualityForSkill(skillId?: string): ChordQuality {
  return CHORD_QUALITIES.find((quality) => quality.skillId === skillId) ?? CHORD_QUALITIES[0]!;
}

function choicesForDifficulty(difficulty: number, target: ChordQuality): ChordQuality[] {
  const choices =
    difficulty < 0.65
      ? CHORD_QUALITIES.filter(({ level }) => level === "triad")
      : [...CHORD_QUALITIES];
  return choices.some(({ token }) => token === target.token) ? choices : [...choices, target];
}

function classifyChord(midiNotes: number[]): { quality?: ChordQuality; shape: number[] } {
  const classes = pitchClasses(midiNotes);
  for (const root of classes) {
    const shape = classes.map((pitchClass) => (pitchClass - root + 12) % 12).sort((a, b) => a - b);
    const quality = CHORD_QUALITIES.find(({ intervals }) => sameNumbers(intervals, shape));
    if (quality) return { quality, shape };
  }

  const root = classes[0] ?? 0;
  return {
    shape: classes.map((pitchClass) => (pitchClass - root + 12) % 12).sort((a, b) => a - b),
  };
}

function gradeChordQuality(
  prompt: ChordQualityRecognitionPrompt,
  input: NoteEvent[],
): ExerciseResult<string | undefined> {
  const tokens = prompt.choices.map(({ token }) => token);
  const choice = decodeChoiceAnswer(input, tokens);
  const notes = playedMidiNotes(input);
  const classified = classifyChord(notes);
  const answer = choice ?? classified.quality?.token;
  const correct = answer === prompt.answerToken;
  const metrics: ScoringMetric[] =
    choice === undefined
      ? [
          {
            kind: "chord",
            expectedPitchClasses: [...prompt.intervals],
            actualPitchClasses: classified.shape,
          },
        ]
      : [{ kind: "choice", expected: prompt.answerToken, actual: choice }];

  return {
    correct,
    score: correct ? 1 : 0,
    metrics,
    feedback: [
      correct
        ? { severity: "good", message: `Correct - ${prompt.answerLabel}.` }
        : { severity: "error", message: `That was ${prompt.answerLabel}.` },
    ],
    target: {
      label: prompt.answerLabel,
      choice: prompt.answerToken,
      midiNotes: prompt.playback[0]?.midiNotes,
    },
    response: { choice: answer, midiNotes: notes },
    answer,
    input,
  };
}

function sameNumbers(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
