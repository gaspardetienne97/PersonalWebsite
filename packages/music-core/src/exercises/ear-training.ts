import {
  isNoteOn,
  monotonicMs,
  type ExerciseResult,
  type ExerciseRun,
  type NoteEvent,
} from "@repo/music-core/domain";

export type EarTrainingDrill = "interval" | "chord-quality" | "scale-degree";
export type EarTrainingAnswerMode = "choice" | "play-back";
export type EarTrainingFeedbackMode = "practice" | "test";

export interface PromptPlaybackStep {
  midiNotes: number[];
  offsetSeconds: number;
  durationSeconds: number;
}

export interface EarTrainingChoice {
  token: string;
  label: string;
}

export interface EarTrainingPromptBase {
  drill: EarTrainingDrill;
  targetSkillId: string;
  answerToken: string;
  answerLabel: string;
  choices: EarTrainingChoice[];
  playback: PromptPlaybackStep[];
  requiredPlayedNotes: number;
}

export function choiceAnswerEvent(token: string, choices: string[]): NoteEvent {
  const index = choices.indexOf(token);
  if (index < 0) throw new Error(`Unknown answer choice: ${token}`);
  return {
    type: "noteOn",
    midiNote: 0,
    velocity: 1,
    source: "click",
    timestamp: monotonicMs(globalThis.performance?.now() ?? Date.now()),
    clock: "performance",
    raw: { midiData1: index },
  };
}

export function decodeChoiceAnswer(input: NoteEvent[], choices: string[]): string | undefined {
  const index = input.find((event) => event.source === "click")?.raw?.midiData1;
  return index === undefined ? undefined : choices[index];
}

export function playedMidiNotes(input: NoteEvent[]): number[] {
  return input
    .filter(isNoteOn)
    .filter((event) => event.source !== "click")
    .map((event) => event.midiNote);
}

export function pitchClasses(midiNotes: number[]): number[] {
  return [...new Set(midiNotes.map((note) => ((note % 12) + 12) % 12))].sort((a, b) => a - b);
}

export function earTrainingRun<P extends EarTrainingPromptBase, A>(
  prompt: P,
  grade: (input: NoteEvent[]) => ExerciseResult<A>,
): ExerciseRun<A> {
  const input: NoteEvent[] = [];
  return {
    accept(event) {
      input.push(event);
    },
    getLiveState() {
      const hasChoice = input.some((event) => event.source === "click");
      const notes = playedMidiNotes(input).length;
      return {
        progress: hasChoice ? 1 : Math.min(1, notes / prompt.requiredPlayedNotes),
        runningScore: 0,
        feedback: [],
      };
    },
    finish() {
      return grade(input);
    },
  };
}
