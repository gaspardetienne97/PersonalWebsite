import type { EarTrainingDrill } from "@repo/music-core/exercises/ear-training";

export type EarTrainingCapabilityStatus = "built" | "partial" | "planned";

export interface EarTrainingCapability {
  id: string;
  title: string;
  status: EarTrainingCapabilityStatus;
  summary: string;
  drill?: EarTrainingDrill;
  route?: string;
}

export interface EarTrainingLearningPathStage {
  id: string;
  order: number;
  title: string;
  goal: string;
  practiceMode: string;
  currentSupport: EarTrainingCapabilityStatus;
  recommendedDrill?: EarTrainingDrill | "mixed";
  nextUpgrade?: string;
}

export const EAR_TRAINING_CAPABILITIES: EarTrainingCapability[] = [
  {
    id: "scale-degree-function",
    title: "Functional scale-degree recognition",
    status: "built",
    drill: "scale-degree",
    route: "/music/learn/ear",
    summary:
      "Tonic-relative major/minor scale-degree prompts, choice answers, play-back answers, prompt playback, skill mastery, and confusion tracking.",
  },
  {
    id: "drone-free-play",
    title: "Drone/free-play warmup",
    status: "built",
    drill: "scale-degree",
    route: "/music/learn/ear",
    summary:
      "The ear-training landing page can hold a tonic drone and play unscored scale-degree comparisons from the selected degree set before a graded session.",
  },
  {
    id: "degree-set-levels",
    title: "Scale-degree levels",
    status: "built",
    drill: "scale-degree",
    route: "/music/learn/ear",
    summary:
      "Scale-degree sessions can now narrow prompts and answer choices to Anchor, Major pentachord, Major diatonic, Minor diatonic, Chromatic color, or the current full degree set.",
  },
  {
    id: "chromatic-color",
    title: "Chromatic color degrees",
    status: "built",
    drill: "scale-degree",
    route: "/music/learn/ear",
    summary:
      "The scale-degree skill graph and exercises include b2 and #4 color tones, and the Chromatic color level can feed recognition, free-play, voice, and melody dictation.",
  },
  {
    id: "adaptive-mixed-review",
    title: "Adaptive mixed review",
    status: "built",
    drill: "scale-degree",
    route: "/music/learn/ear",
    summary:
      "Weakness/review/new priorities from the scheduler are interleaved across scale-degree, chord-quality, and interval drills without back-to-back drill repeats.",
  },
  {
    id: "pocket-mode",
    title: "Pocket listening mode",
    status: "built",
    route: "/music/learn/ear",
    summary:
      "Listening-only sessions replay prompts, reveal the answer, and let the learner self-mark heard/missed reps through the same Exercise pipeline.",
  },
  {
    id: "voice-mode",
    title: "Voice mode",
    status: "built",
    drill: "scale-degree",
    route: "/music/learn/ear",
    summary:
      "Focused scale-degree sessions can use microphone pitch events as sung answers through the shared audio-in engine and Exercise pipeline.",
  },
  {
    id: "melody-dictation-transfer",
    title: "Melody transfer",
    status: "built",
    drill: "melody-dictation",
    route: "/music/learn/ear",
    summary:
      "Focused Melody Dictation sessions play a short tonic-relative phrase from the selected degree set and grade MIDI/on-screen play-back in order.",
  },
  {
    id: "repertoire-transfer",
    title: "Repertoire transfer",
    status: "built",
    drill: "repertoire-transfer",
    route: "/music/learn/ear",
    summary:
      "Saved songs can project short melody phrases into scale-degree prompts for preview and scored play-back dictation.",
  },
  {
    id: "chord-quality-support",
    title: "Chord-quality support",
    status: "built",
    drill: "chord-quality",
    route: "/music/learn/ear",
    summary:
      "Triad and seventh-chord recognition supports harmonic vocabulary after the learner has a stronger tonic-relative pitch map.",
  },
  {
    id: "interval-label-support",
    title: "Interval-label support",
    status: "built",
    drill: "interval",
    route: "/music/learn/ear",
    summary:
      "Interval recognition remains useful as a diagnostic and vocabulary layer, but it should not be the primary beginner curriculum spine.",
  },
];

export const EAR_TRAINING_LEARNING_PATH: EarTrainingLearningPathStage[] = [
  {
    id: "anchor-tonic",
    order: 1,
    title: "Anchor the tonic",
    goal: "Hear the key center as home before naming any answer.",
    practiceMode: "Drone/free-play warmup, Pocket listening mode, then degree prompts.",
    currentSupport: "built",
    recommendedDrill: "scale-degree",
  },
  {
    id: "diatonic-degrees",
    order: 2,
    title: "Build the diatonic degree map",
    goal: "Recognize 1, 2, 3, 4, 5, 6, and 7 by function in multiple keys.",
    practiceMode: "Short scale-degree sessions with immediate feedback.",
    currentSupport: "built",
    recommendedDrill: "scale-degree",
  },
  {
    id: "sing-and-play-back",
    order: 3,
    title: "Sing or play the target",
    goal: "Move from recognition to audiation by producing the heard degree.",
    practiceMode: "Scale-degree play-back answers with MIDI, on-screen input, or microphone voice.",
    currentSupport: "built",
    recommendedDrill: "scale-degree",
  },
  {
    id: "melody-transfer",
    order: 4,
    title: "Transfer into short melodies",
    goal: "Recognize degree motion in two-to-five-note phrases instead of isolated notes.",
    practiceMode:
      "Melody dictation, scored repertoire-transfer phrases, and call-response prompts.",
    currentSupport: "built",
    recommendedDrill: "melody-dictation",
  },
  {
    id: "chromatic-color",
    order: 5,
    title: "Add chromatic color",
    goal: "Add b2, b3, #4/b5, b6, and b7 as functional colors around the tonic.",
    practiceMode:
      "Adaptive scale-degree review with difficulty-driven major/minor/chromatic contexts.",
    currentSupport: "built",
    recommendedDrill: "scale-degree",
  },
  {
    id: "harmony-and-interval-labels",
    order: 6,
    title: "Attach harmony and interval vocabulary",
    goal: "Use chord qualities and interval names to describe what the ear already understands functionally.",
    practiceMode: "Adaptive mixed review with chord-quality and interval diagnostics.",
    currentSupport: "built",
    recommendedDrill: "mixed",
  },
];

export function builtEarTrainingCapabilities(): EarTrainingCapability[] {
  return EAR_TRAINING_CAPABILITIES.filter(({ status }) => status === "built").map((item) => ({
    ...item,
  }));
}

export function currentEarTrainingLearningPath(): EarTrainingLearningPathStage[] {
  return EAR_TRAINING_LEARNING_PATH.map((stage) => ({ ...stage }));
}
