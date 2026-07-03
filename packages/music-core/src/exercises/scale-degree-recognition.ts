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

export type ScaleDegreeContext =
  | "major"
  | "natural-minor"
  | "harmonic-minor"
  | "melodic-minor"
  | "chromatic";
export type ScaleDegreeLabelMode = "degree" | "solfege";

interface ScaleDegree {
  token: string;
  solfege: string;
  semitones: number;
}

interface ScaleContext {
  token: ScaleDegreeContext;
  degrees: string[];
}

export type ScaleDegreeSetId =
  | "anchor"
  | "major-pentachord"
  | "major-diatonic"
  | "minor-diatonic"
  | "chromatic-color"
  | "full-current";

export interface ScaleDegreeSet {
  id: ScaleDegreeSetId;
  title: string;
  summary: string;
  degrees: string[];
}

export interface ScaleDegreeFreePlayChoice {
  token: string;
  label: string;
  solfege: string;
  semitones: number;
  midiNote: number;
  playback: EarTrainingPromptBase["playback"];
}

export interface ScaleDegreeFreePlayOptions {
  tonicMidi: number;
  scaleDegreeSet?: ScaleDegreeSetId;
}

export interface IdentifyScaleDegreeOptions extends ScaleDegreeFreePlayOptions {
  midiNote: number;
}

const DEGREES: ScaleDegree[] = [
  { token: "1", solfege: "do", semitones: 0 },
  { token: "b2", solfege: "ra", semitones: 1 },
  { token: "2", solfege: "re", semitones: 2 },
  { token: "b3", solfege: "me", semitones: 3 },
  { token: "3", solfege: "mi", semitones: 4 },
  { token: "4", solfege: "fa", semitones: 5 },
  { token: "#4", solfege: "fi", semitones: 6 },
  { token: "5", solfege: "sol", semitones: 7 },
  { token: "b6", solfege: "le", semitones: 8 },
  { token: "6", solfege: "la", semitones: 9 },
  { token: "b7", solfege: "te", semitones: 10 },
  { token: "7", solfege: "ti", semitones: 11 },
];

export const SCALE_DEGREE_SETS: ScaleDegreeSet[] = [
  {
    id: "anchor",
    title: "Anchor",
    summary: "Hear home and dominant: 1 and 5.",
    degrees: ["1", "5"],
  },
  {
    id: "major-pentachord",
    title: "Major pentachord",
    summary: "Map the first five major degrees around the tonic.",
    degrees: ["1", "2", "3", "4", "5"],
  },
  {
    id: "major-diatonic",
    title: "Major diatonic",
    summary: "Recognize all seven major-key functions.",
    degrees: ["1", "2", "3", "4", "5", "6", "7"],
  },
  {
    id: "minor-diatonic",
    title: "Minor diatonic",
    summary: "Recognize natural-minor functions around the tonic.",
    degrees: ["1", "2", "b3", "4", "5", "b6", "b7"],
  },
  {
    id: "chromatic-color",
    title: "Chromatic color",
    summary: "Add b2 and #4 color tones around the diatonic degree map.",
    degrees: ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"],
  },
  {
    id: "full-current",
    title: "Current full set",
    summary: "Review every scale-degree skill currently seeded in the app.",
    degrees: ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"],
  },
];

const SCALE_CONTEXTS: ScaleContext[] = [
  { token: "major", degrees: ["1", "2", "3", "4", "5", "6", "7"] },
  { token: "natural-minor", degrees: ["1", "2", "b3", "4", "5", "b6", "b7"] },
  { token: "harmonic-minor", degrees: ["1", "2", "b3", "4", "5", "b6", "7"] },
  { token: "melodic-minor", degrees: ["1", "2", "b3", "4", "5", "6", "7"] },
  {
    token: "chromatic",
    degrees: ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"],
  },
];

export interface ScaleDegreeRecognitionPrompt extends EarTrainingPromptBase {
  drill: "scale-degree";
  degree: string;
  solfege: string;
  labelMode: ScaleDegreeLabelMode;
  semitones: number;
  scaleContext: ScaleDegreeContext;
  degreeSetId: ScaleDegreeSetId;
  tonicMidi: number;
}

export interface CreateScaleDegreeRecognitionExerciseOptions {
  random?: () => number;
  degreeSet?: ScaleDegreeSetId;
}

export function createScaleDegreeRecognitionExercise(
  options: CreateScaleDegreeRecognitionExerciseOptions = {},
): ExerciseDefinition<ScaleDegreeRecognitionPrompt, string | undefined> {
  const random = options.random ?? Math.random;
  const configuredDegreeSet = scaleDegreeSetForId(options.degreeSet);
  const configuredDegrees = configuredDegreeSet?.degrees ?? DEGREES.map(({ token }) => token);

  return {
    id: "ear.scale-degree-recognition",
    name: "Scale Degree Recognition",
    capabilities: [Capability.EarTraining, Capability.Pitch],
    skillIds: configuredDegrees.map((token) => `pitch.scale-degree.${token}`),
    inputs: ["click", "midi", "onscreen", "audio"],
    streaming: false,
    generate(ctx) {
      const degreeSet = scaleDegreeSetForId(ctx.metadata?.scaleDegreeSet) ?? configuredDegreeSet;
      const allowedDegrees = degreeSet?.degrees ?? DEGREES.map(({ token }) => token);
      const degree = degreeForSkill(ctx.targetSkillIds[0]);
      if (!allowedDegrees.includes(degree.token)) {
        throw new Error(`${degree.token} is not available in this scale-degree set`);
      }
      const choices = DEGREES.filter((choice) => allowedDegrees.includes(choice.token));
      const scaleContext = contextForDifficulty(ctx.difficulty, degree.token);
      const tonicMidi = 48 + Math.floor(random() * 13);
      const targetMidi = tonicMidi + degree.semitones;
      const labelMode = scaleDegreeLabelMode(ctx.metadata?.scaleDegreeLabelMode);
      const answerLabel = degreeLabel(degree, labelMode);

      return {
        id: `scale-degree-${scaleContext.token}-${degree.token}`,
        payload: {
          drill: "scale-degree",
          targetSkillId: `pitch.scale-degree.${degree.token}`,
          answerToken: degree.token,
          answerLabel,
          choices: choices.map((choice) => ({
            token: choice.token,
            label: degreeLabel(choice, labelMode),
          })),
          playback: [
            { midiNotes: [tonicMidi], offsetSeconds: 0, durationSeconds: 0.55 },
            { midiNotes: [targetMidi], offsetSeconds: 0.7, durationSeconds: 0.65 },
          ],
          requiredPlayedNotes: 1,
          degree: degree.token,
          solfege: degree.solfege,
          labelMode,
          semitones: degree.semitones,
          scaleContext: scaleContext.token,
          degreeSetId: degreeSet?.id ?? "full-current",
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

export function scaleDegreeSetForId(value: unknown): ScaleDegreeSet | undefined {
  if (typeof value !== "string") return undefined;
  return SCALE_DEGREE_SETS.find((set) => set.id === value);
}

export function degreeTokensForScaleDegreeSet(value: unknown): string[] {
  return [...(scaleDegreeSetForId(value)?.degrees ?? DEGREES.map(({ token }) => token))];
}

export function scaleDegreeLabelMode(value: unknown): ScaleDegreeLabelMode {
  return value === "solfege" ? "solfege" : "degree";
}

export function scaleDegreeFreePlayChoices(
  options: ScaleDegreeFreePlayOptions,
): ScaleDegreeFreePlayChoice[] {
  const allowedDegrees = new Set(degreeTokensForScaleDegreeSet(options.scaleDegreeSet));
  return DEGREES.filter(({ token }) => allowedDegrees.has(token)).map((degree) =>
    freePlayChoiceForDegree(degree, options.tonicMidi, options.tonicMidi + degree.semitones),
  );
}

export function identifyScaleDegreeFromMidi(
  options: IdentifyScaleDegreeOptions,
): ScaleDegreeFreePlayChoice | undefined {
  const pitchClass = (options.midiNote - options.tonicMidi + 120) % 12;
  const allowedDegrees = new Set(degreeTokensForScaleDegreeSet(options.scaleDegreeSet));
  const degree = DEGREES.find(
    (candidate) => candidate.semitones === pitchClass && allowedDegrees.has(candidate.token),
  );
  return degree
    ? freePlayChoiceForDegree(degree, options.tonicMidi, nearestMidiForDegree(options, degree))
    : undefined;
}

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

function degreeLabel(degree: ScaleDegree, mode: ScaleDegreeLabelMode = "degree"): string {
  return mode === "solfege" ? degree.solfege : `${degree.token} / ${degree.solfege}`;
}

function freePlayChoiceForDegree(
  degree: ScaleDegree,
  tonicMidi: number,
  midiNote: number,
): ScaleDegreeFreePlayChoice {
  return {
    token: degree.token,
    label: degreeLabel(degree),
    solfege: degree.solfege,
    semitones: degree.semitones,
    midiNote,
    playback: [
      { midiNotes: [tonicMidi], offsetSeconds: 0, durationSeconds: 0.45 },
      { midiNotes: [midiNote], offsetSeconds: 0.55, durationSeconds: 0.6 },
    ],
  };
}

function nearestMidiForDegree(options: IdentifyScaleDegreeOptions, degree: ScaleDegree): number {
  const base = options.tonicMidi + degree.semitones;
  const octaveOffset = Math.round((options.midiNote - base) / 12) * 12;
  return base + octaveOffset;
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
