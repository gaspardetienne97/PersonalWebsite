import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type NoteEvent,
} from "@repo/music-core/domain";

import { decodeChoiceAnswer, earTrainingRun, type EarTrainingPromptBase } from "./ear-training";

export type CadenceKind = "authentic" | "plagal" | "half" | "deceptive";

interface CadenceDefinition {
  token: CadenceKind;
  label: string;
  skillId: string;
  romanProgression: string[];
  playback: EarTrainingPromptBase["playback"];
}

const CADENCES: CadenceDefinition[] = [
  {
    token: "authentic",
    label: "Authentic",
    skillId: "ear.cadences.authentic",
    romanProgression: ["V", "I"],
    playback: [
      { midiNotes: [55, 59, 62, 65], offsetSeconds: 0, durationSeconds: 1 },
      { midiNotes: [48, 52, 55, 60], offsetSeconds: 1.1, durationSeconds: 1.2 },
    ],
  },
  {
    token: "plagal",
    label: "Plagal",
    skillId: "ear.cadences.plagal",
    romanProgression: ["IV", "I"],
    playback: [
      { midiNotes: [53, 57, 60, 65], offsetSeconds: 0, durationSeconds: 1 },
      { midiNotes: [48, 52, 55, 60], offsetSeconds: 1.1, durationSeconds: 1.2 },
    ],
  },
  {
    token: "half",
    label: "Half",
    skillId: "ear.cadences.half",
    romanProgression: ["I", "V"],
    playback: [
      { midiNotes: [48, 52, 55, 60], offsetSeconds: 0, durationSeconds: 1 },
      { midiNotes: [55, 59, 62, 67], offsetSeconds: 1.1, durationSeconds: 1.2 },
    ],
  },
  {
    token: "deceptive",
    label: "Deceptive",
    skillId: "ear.cadences.deceptive",
    romanProgression: ["V", "vi"],
    playback: [
      { midiNotes: [55, 59, 62, 65], offsetSeconds: 0, durationSeconds: 1 },
      { midiNotes: [57, 60, 64, 69], offsetSeconds: 1.1, durationSeconds: 1.2 },
    ],
  },
];

export interface CadenceRecognitionPrompt extends EarTrainingPromptBase {
  drill: "cadence";
  cadence: CadenceKind;
  romanProgression: string[];
}

export interface CreateCadenceRecognitionExerciseOptions {
  random?: () => number;
}

export function createCadenceRecognitionExercise(
  options: CreateCadenceRecognitionExerciseOptions = {},
): ExerciseDefinition<CadenceRecognitionPrompt, string | undefined> {
  const random = options.random ?? Math.random;

  return {
    id: "ear.cadence-recognition",
    name: "Cadence Recognition",
    capabilities: [Capability.EarTraining, Capability.Harmony],
    skillIds: CADENCES.map(({ skillId }) => skillId),
    inputs: ["click"],
    streaming: false,
    generate(ctx) {
      const cadence = cadenceForSkill(ctx.targetSkillIds[0]);
      const choices = choicesForDifficulty(ctx.difficulty, cadence);
      const transposeOctave = Math.floor(random() * 2) * 12;
      return {
        id: `cadence-${cadence.token}`,
        payload: {
          drill: "cadence",
          targetSkillId: cadence.skillId,
          answerToken: cadence.token,
          answerLabel: cadence.label,
          choices: choices.map(({ token, label }) => ({ token, label })),
          playback: cadence.playback.map((step) => ({
            ...step,
            midiNotes: step.midiNotes.map((note) => note + transposeOctave),
          })),
          requiredPlayedNotes: 1,
          cadence: cadence.token,
          romanProgression: [...cadence.romanProgression],
        },
      };
    },
    createRun(prompt) {
      return earTrainingRun(prompt.payload, (input) => gradeCadence(prompt.payload, input));
    },
  };
}

export const cadenceRecognitionExercise = createCadenceRecognitionExercise();

function cadenceForSkill(skillId?: string): CadenceDefinition {
  return CADENCES.find((cadence) => cadence.skillId === skillId) ?? CADENCES[0]!;
}

function choicesForDifficulty(_difficulty: number, target: CadenceDefinition): CadenceDefinition[] {
  return CADENCES.some(({ token }) => token === target.token) ? CADENCES : [...CADENCES, target];
}

function gradeCadence(
  prompt: CadenceRecognitionPrompt,
  input: NoteEvent[],
): ExerciseResult<string | undefined> {
  const tokens = prompt.choices.map(({ token }) => token);
  const answer = decodeChoiceAnswer(input, tokens);
  const correct = answer === prompt.answerToken;

  return {
    correct,
    score: correct ? 1 : 0,
    metrics: [{ kind: "choice", expected: prompt.answerToken, actual: answer }],
    feedback: [
      correct
        ? { severity: "good", message: `Correct - ${prompt.answerLabel} cadence.` }
        : { severity: "error", message: `That was a ${prompt.answerLabel} cadence.` },
    ],
    target: {
      label: prompt.answerLabel,
      choice: prompt.answerToken,
      midiNotes: prompt.playback.flatMap((step) => step.midiNotes),
    },
    response: { choice: answer },
    answer,
    input,
  };
}
