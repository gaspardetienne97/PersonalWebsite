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

export type IntervalDirection = "ascending" | "descending" | "harmonic";

export interface IntervalRecognitionPrompt extends EarTrainingPromptBase {
  drill: "interval";
  interval: string;
  semitones: number;
  direction: IntervalDirection;
  rootMidi: number;
}

interface IntervalDefinition {
  token: string;
  label: string;
  semitones: number;
}

const INTERVALS: IntervalDefinition[] = [
  { token: "m2", label: "Minor 2nd", semitones: 1 },
  { token: "M2", label: "Major 2nd", semitones: 2 },
  { token: "m3", label: "Minor 3rd", semitones: 3 },
  { token: "M3", label: "Major 3rd", semitones: 4 },
  { token: "P4", label: "Perfect 4th", semitones: 5 },
  { token: "TT", label: "Tritone", semitones: 6 },
  { token: "P5", label: "Perfect 5th", semitones: 7 },
  { token: "m6", label: "Minor 6th", semitones: 8 },
  { token: "M6", label: "Major 6th", semitones: 9 },
  { token: "m7", label: "Minor 7th", semitones: 10 },
  { token: "M7", label: "Major 7th", semitones: 11 },
  { token: "P8", label: "Perfect Octave", semitones: 12 },
];

const INTERVAL_SKILL_IDS = INTERVALS.map(({ token }) => `pitch.interval.${token}`);

export interface CreateIntervalRecognitionExerciseOptions {
  random?: () => number;
}

export function createIntervalRecognitionExercise(
  options: CreateIntervalRecognitionExerciseOptions = {},
): ExerciseDefinition<IntervalRecognitionPrompt, string | undefined> {
  const random = options.random ?? Math.random;

  return {
    id: "ear.interval-recognition",
    name: "Interval Recognition",
    capabilities: [Capability.EarTraining, Capability.Pitch],
    skillIds: INTERVAL_SKILL_IDS,
    inputs: ["click", "midi", "onscreen"],
    streaming: false,
    generate(ctx) {
      const interval = intervalForSkill(ctx.targetSkillIds[0]);
      const direction = chooseDirection(ctx.difficulty, random());
      const rootMidi = 48 + Math.floor(random() * 13);
      const targetMidi = rootMidi + interval.semitones;

      return {
        id: `interval-${interval.token}-${direction}`,
        payload: {
          drill: "interval",
          targetSkillId: `pitch.interval.${interval.token}`,
          answerToken: interval.token,
          answerLabel: interval.label,
          choices: INTERVALS.map(({ token, label }) => ({ token, label })),
          playback: intervalPlayback(rootMidi, targetMidi, direction),
          requiredPlayedNotes: 2,
          interval: interval.token,
          semitones: interval.semitones,
          direction,
          rootMidi,
        },
      };
    },
    createRun(prompt) {
      return earTrainingRun(prompt.payload, (input) => gradeInterval(prompt.payload, input));
    },
  };
}

export const intervalRecognitionExercise = createIntervalRecognitionExercise();

function intervalForSkill(skillId?: string): IntervalDefinition {
  const token = skillId?.replace("pitch.interval.", "");
  return INTERVALS.find((interval) => interval.token === token) ?? INTERVALS[7]!;
}

function intervalForSemitones(semitones: number): IntervalDefinition | undefined {
  return INTERVALS.find((interval) => interval.semitones === semitones);
}

function chooseDirection(difficulty: number, random: number): IntervalDirection {
  if (difficulty < 0.4 || random < 0.6) return "ascending";
  if (random < 0.9) return "descending";
  return "harmonic";
}

function intervalPlayback(
  rootMidi: number,
  targetMidi: number,
  direction: IntervalDirection,
): IntervalRecognitionPrompt["playback"] {
  if (direction === "harmonic") {
    return [{ midiNotes: [rootMidi, targetMidi], offsetSeconds: 0, durationSeconds: 0.8 }];
  }

  const notes = direction === "ascending" ? [rootMidi, targetMidi] : [targetMidi, rootMidi];
  return notes.map((midiNote, index) => ({
    midiNotes: [midiNote],
    offsetSeconds: index * 0.65,
    durationSeconds: 0.55,
  }));
}

function gradeInterval(
  prompt: IntervalRecognitionPrompt,
  input: NoteEvent[],
): ExerciseResult<string | undefined> {
  const tokens = prompt.choices.map(({ token }) => token);
  const choice = decodeChoiceAnswer(input, tokens);
  const notes = playedMidiNotes(input);
  const playedDistance = notes.length >= 2 ? notes[1]! - notes[0]! : undefined;
  const distance = playedDistance === undefined ? undefined : Math.abs(playedDistance);
  const playedInterval = distance === undefined ? undefined : intervalForSemitones(distance)?.token;
  const directionCorrect =
    prompt.direction === "harmonic" ||
    playedDistance === undefined ||
    (prompt.direction === "ascending" ? playedDistance > 0 : playedDistance < 0);
  const answer = choice ?? playedInterval;
  const correct = answer === prompt.answerToken && directionCorrect;
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
      midiNotes: prompt.playback.flatMap(({ midiNotes }) => midiNotes),
    },
    response: { choice: answer, midiNotes: notes },
    answer,
    input,
  };
}
