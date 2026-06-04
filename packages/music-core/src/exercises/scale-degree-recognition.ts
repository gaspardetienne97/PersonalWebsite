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
  playedMidiNotes,
  type EarTrainingPromptBase,
} from "./ear-training";

export type ScaleDegreeContext = "major" | "natural-minor" | "harmonic-minor" | "melodic-minor";

interface ScaleDegree {
  token: string;
  solfege: string;
  semitones: number;
}

interface ScaleContext {
  token: ScaleDegreeContext;
  degrees: string[];
}

const DEGREES: ScaleDegree[] = [
  { token: "1", solfege: "do", semitones: 0 },
  { token: "2", solfege: "re", semitones: 2 },
  { token: "b3", solfege: "me", semitones: 3 },
  { token: "3", solfege: "mi", semitones: 4 },
  { token: "4", solfege: "fa", semitones: 5 },
  { token: "5", solfege: "sol", semitones: 7 },
  { token: "b6", solfege: "le", semitones: 8 },
  { token: "6", solfege: "la", semitones: 9 },
  { token: "b7", solfege: "te", semitones: 10 },
  { token: "7", solfege: "ti", semitones: 11 },
];

const SCALE_CONTEXTS: ScaleContext[] = [
  { token: "major", degrees: ["1", "2", "3", "4", "5", "6", "7"] },
  { token: "natural-minor", degrees: ["1", "2", "b3", "4", "5", "b6", "b7"] },
  { token: "harmonic-minor", degrees: ["1", "2", "b3", "4", "5", "b6", "7"] },
  { token: "melodic-minor", degrees: ["1", "2", "b3", "4", "5", "6", "7"] },
];

export interface ScaleDegreeRecognitionPrompt extends EarTrainingPromptBase {
  drill: "scale-degree";
  degree: string;
  solfege: string;
  semitones: number;
  scaleContext: ScaleDegreeContext;
  tonicMidi: number;
}

export interface CreateScaleDegreeRecognitionExerciseOptions {
  random?: () => number;
}

export function createScaleDegreeRecognitionExercise(
  options: CreateScaleDegreeRecognitionExerciseOptions = {},
): ExerciseDefinition<ScaleDegreeRecognitionPrompt, string | undefined> {
  const random = options.random ?? Math.random;

  return {
    id: "ear.scale-degree-recognition",
    name: "Scale Degree Recognition",
    capabilities: [Capability.EarTraining, Capability.Pitch],
    skillIds: DEGREES.map(({ token }) => `pitch.scale-degree.${token}`),
    inputs: ["click", "midi", "onscreen"],
    streaming: false,
    generate(ctx) {
      const degree = degreeForSkill(ctx.targetSkillIds[0]);
      const scaleContext = contextForDifficulty(ctx.difficulty, degree.token);
      const tonicMidi = 48 + Math.floor(random() * 13);
      const targetMidi = tonicMidi + degree.semitones;
      const answerLabel = degreeLabel(degree);

      return {
        id: `scale-degree-${scaleContext.token}-${degree.token}`,
        payload: {
          drill: "scale-degree",
          targetSkillId: `pitch.scale-degree.${degree.token}`,
          answerToken: degree.token,
          answerLabel,
          choices: DEGREES.map((choice) => ({
            token: choice.token,
            label: degreeLabel(choice),
          })),
          playback: [
            { midiNotes: [tonicMidi], offsetSeconds: 0, durationSeconds: 0.55 },
            { midiNotes: [targetMidi], offsetSeconds: 0.7, durationSeconds: 0.65 },
          ],
          requiredPlayedNotes: 1,
          degree: degree.token,
          solfege: degree.solfege,
          semitones: degree.semitones,
          scaleContext: scaleContext.token,
          tonicMidi,
        },
      };
    },
    createRun(prompt) {
      return earTrainingRun(prompt.payload, (input) => gradeScaleDegree(prompt.payload, input));
    },
  };
}

export const scaleDegreeRecognitionExercise = createScaleDegreeRecognitionExercise();

function degreeForSkill(skillId?: string): ScaleDegree {
  const token = skillId?.replace("pitch.scale-degree.", "");
  return DEGREES.find((degree) => degree.token === token) ?? DEGREES[0]!;
}

function contextForDifficulty(difficulty: number, degree: string): ScaleContext {
  const preferred =
    difficulty < 0.35
      ? SCALE_CONTEXTS[0]!
      : difficulty < 0.6
        ? SCALE_CONTEXTS[1]!
        : difficulty < 0.8
          ? SCALE_CONTEXTS[2]!
          : SCALE_CONTEXTS[3]!;
  return preferred.degrees.includes(degree)
    ? preferred
    : SCALE_CONTEXTS.find((context) => context.degrees.includes(degree))!;
}

function degreeLabel(degree: ScaleDegree): string {
  return `${degree.token} / ${degree.solfege}`;
}

function gradeScaleDegree(
  prompt: ScaleDegreeRecognitionPrompt,
  input: NoteEvent[],
): ExerciseResult<string | undefined> {
  const tokens = prompt.choices.map(({ token }) => token);
  const choice = decodeChoiceAnswer(input, tokens);
  const notes = playedMidiNotes(input);
  const playedSemitones =
    notes[0] === undefined ? undefined : (notes[0] - prompt.tonicMidi + 120) % 12;
  const playedDegree = DEGREES.find(({ semitones }) => semitones === playedSemitones)?.token;
  const answer = choice ?? playedDegree;
  const correct = answer === prompt.answerToken;
  const metrics: ScoringMetric[] = [
    { kind: "choice", expected: prompt.answerToken, actual: answer },
  ];

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
      midiNotes: [prompt.tonicMidi + prompt.semitones],
    },
    response: { choice: answer, midiNotes: notes },
    answer,
    input,
  };
}
