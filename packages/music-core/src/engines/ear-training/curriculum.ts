import type {
  LearningPathDefinition,
  LearningPathStepDefinition,
} from "@repo/music-core/engines/learning-path";
import type { EarTrainingDrill } from "@repo/music-core/exercises/ear-training";

import { EAR_TRAINING_PATH_HREF, earTrainingDrillHref, scaleDegreeSkillIds } from "./drills";

export type EarTrainingCapabilityStatus = "built" | "partial" | "planned";

export interface EarTrainingCapability {
  id: string;
  title: string;
  status: EarTrainingCapabilityStatus;
  summary: string;
  drill?: EarTrainingDrill;
  route?: string;
}

export interface EarTrainingLearningPathStage extends LearningPathStepDefinition {
  id: string;
  order: number;
  title: string;
  /** What the step adds, shown on the path card. */
  summary: string;
  /** What "done" means, shown on the path card. */
  detail: string;
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
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Tonic-relative major/minor scale-degree prompts, choice answers, play-back answers, prompt playback, skill mastery, and confusion tracking.",
  },
  {
    id: "drone-free-play",
    title: "Drone/free-play warmup",
    status: "built",
    drill: "scale-degree",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "The ear-training landing page can hold a tonic drone and play unscored scale-degree comparisons from the selected degree set before a graded session.",
  },
  {
    id: "degree-set-levels",
    title: "Scale-degree levels",
    status: "built",
    drill: "scale-degree",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Scale-degree sessions can now narrow prompts and answer choices to Anchor, Major pentachord, Major diatonic, Minor diatonic, Chromatic color, or the current full degree set.",
  },
  {
    id: "chromatic-color",
    title: "Chromatic color degrees",
    status: "built",
    drill: "scale-degree",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "The scale-degree skill graph and exercises include b2 and #4 color tones, and the Chromatic color level can feed recognition, free-play, voice, and melody dictation.",
  },
  {
    id: "adaptive-mixed-review",
    title: "Adaptive mixed review",
    status: "built",
    drill: "scale-degree",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Weakness/review/new priorities from the scheduler are interleaved across scale-degree, chord-quality, and interval drills without back-to-back drill repeats.",
  },
  {
    id: "pocket-mode",
    title: "Pocket recall and Listen along",
    status: "built",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Pocket recall hides answers until Reveal and labels self-ratings. Listen along shows answers and advances automatically without scoring.",
  },
  {
    id: "voice-mode",
    title: "Voice mode",
    status: "built",
    drill: "scale-degree",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Focused scale-degree sessions can use microphone pitch events as sung answers through the shared audio-in engine and Exercise pipeline.",
  },
  {
    id: "melody-dictation-transfer",
    title: "Melody transfer",
    status: "built",
    drill: "melody-dictation",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Focused Melody Dictation sessions play a short tonic-relative phrase from the selected degree set and grade MIDI/on-screen play-back in order.",
  },
  {
    id: "repertoire-transfer",
    title: "Repertoire transfer",
    status: "built",
    drill: "repertoire-transfer",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Saved songs can project short melody phrases into scale-degree prompts for preview and scored play-back dictation.",
  },
  {
    id: "chord-quality-support",
    title: "Chord-quality support",
    status: "built",
    drill: "chord-quality",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Triad and seventh-chord recognition supports harmonic vocabulary after the learner has a stronger tonic-relative pitch map.",
  },
  {
    id: "interval-label-support",
    title: "Interval-label support",
    status: "built",
    drill: "interval",
    route: EAR_TRAINING_PATH_HREF,
    summary:
      "Interval recognition remains useful as a diagnostic and vocabulary layer, but it should not be the primary beginner curriculum spine.",
  },
];

const COLOR_DEGREE_SKILLS = ["b2", "b3", "#4", "b6", "b7"].map(
  (token) => `pitch.scale-degree.${token}`,
);

export const EAR_TRAINING_LEARNING_PATH: EarTrainingLearningPathStage[] = [
  {
    id: "anchor-tonic",
    order: 1,
    title: "Anchor the tonic",
    summary: "Adds degrees 1 and 5 over a drone, in listening mode.",
    detail: "Listening warmup; self-marked reps are not a mastery assessment.",
    kind: "reference",
    goal: "Hear the key center as home before naming any answer.",
    practiceMode: "Drone/free-play warmup, unscored Listen along, then degree prompts.",
    currentSupport: "built",
    recommendedDrill: "scale-degree",
    href: earTrainingDrillHref("scale-degrees", { answer: "listen-along", level: "anchor" }),
  },
  {
    id: "diatonic-degrees",
    modalities: ["heard"],
    exerciseIds: ["ear.scale-degree-recognition"],
    order: 2,
    title: "Build the diatonic degree map",
    summary: "Adds 2, 3, 4, 6 and 7. Answer by choice.",
    detail:
      "At least one unaided choice answer for each major degree, each averaging 66% or higher.",
    goal: "Recognize 1, 2, 3, 4, 5, 6, and 7 by function in multiple keys.",
    practiceMode: "Short scale-degree sessions with immediate feedback.",
    currentSupport: "built",
    recommendedDrill: "scale-degree",
    href: earTrainingDrillHref("scale-degrees", { answer: "choice", level: "major-diatonic" }),
    links: [
      {
        label: "Minor diatonic",
        href: earTrainingDrillHref("scale-degrees", { answer: "choice", level: "minor-diatonic" }),
      },
    ],
    skillIds: scaleDegreeSkillIds("major-diatonic"),
  },
  {
    id: "sing-and-play-back",
    modalities: ["played", "sung"],
    exerciseIds: ["ear.scale-degree-recognition"],
    minSessions: 2,
    order: 3,
    title: "Sing or play the target",
    summary: "The same degrees, answered on your instrument or by voice.",
    detail:
      "Each major degree produced in at least two sessions without hints, each averaging 66% or higher.",
    goal: "Move from recognition to audiation by producing the heard degree.",
    practiceMode: "Scale-degree play-back answers with MIDI, on-screen input, or microphone voice.",
    currentSupport: "built",
    recommendedDrill: "scale-degree",
    href: earTrainingDrillHref("scale-degrees", { answer: "play-back", level: "major-diatonic" }),
    links: [
      {
        label: "Voice",
        href: earTrainingDrillHref("scale-degrees", { answer: "voice", level: "major-diatonic" }),
      },
    ],
    skillIds: scaleDegreeSkillIds("major-diatonic"),
  },
  {
    id: "melody-transfer",
    modalities: ["played", "written"],
    exerciseIds: ["ear.melody-dictation", "ear.repertoire-transfer"],
    order: 4,
    title: "Transfer into short melodies",
    summary: "Short phrases as degree slots, then phrases from your own songs.",
    detail: "Each major degree attempted in unaided melody phrases, each averaging 66% or higher.",
    goal: "Recognize degree motion in two-to-five-note phrases instead of isolated notes.",
    practiceMode:
      "Melody dictation, scored repertoire-transfer phrases, and call-response prompts.",
    currentSupport: "built",
    recommendedDrill: "melody-dictation",
    href: earTrainingDrillHref("melody-dictation", { level: "major-diatonic" }),
    links: [{ label: "Repertoire transfer", href: earTrainingDrillHref("repertoire-transfer") }],
    skillIds: scaleDegreeSkillIds("major-diatonic"),
  },
  {
    id: "chromatic-color",
    modalities: ["heard"],
    exerciseIds: ["ear.scale-degree-recognition"],
    order: 5,
    title: "Add chromatic color",
    summary: "Adds b2, b3, #4, b6 and b7 as colors around the tonic.",
    detail:
      "At least one unaided choice answer for each color degree, each averaging 66% or higher.",
    goal: "Add b2, b3, #4/b5, b6, and b7 as functional colors around the tonic.",
    practiceMode:
      "Adaptive scale-degree review with difficulty-driven major/minor/chromatic contexts.",
    currentSupport: "built",
    recommendedDrill: "scale-degree",
    href: earTrainingDrillHref("scale-degrees", { level: "chromatic-color" }),
    skillIds: COLOR_DEGREE_SKILLS,
  },
  {
    id: "harmony-and-interval-labels",
    modalities: ["heard"],
    order: 6,
    title: "Attach harmony and interval vocabulary",
    summary: "Ear training review with intervals, chord qualities and cadences mixed in.",
    detail:
      "Unaided heard answers for intervals, triads and cadences, each averaging 66% or higher.",
    goal: "Use chord qualities and interval names to describe what the ear already understands functionally.",
    practiceMode: "Adaptive mixed review with chord-quality and interval diagnostics.",
    currentSupport: "built",
    recommendedDrill: "mixed",
    kind: "review",
    href: earTrainingDrillHref("mixed"),
    links: [
      { label: "Intervals", href: earTrainingDrillHref("intervals") },
      { label: "Chord qualities", href: earTrainingDrillHref("chord-qualities") },
      { label: "Cadences", href: earTrainingDrillHref("cadences") },
    ],
    skillIds: ["pitch.intervals", "harmony.triads", "ear.cadences"],
  },
];

export const EAR_TRAINING_LEARNING_PATH_DEFINITION: LearningPathDefinition<EarTrainingLearningPathStage> =
  {
    id: "ear-training",
    title: "Ear Training Path",
    subtitle:
      "Tonic first, then every degree, then melodies. Each step opens one drill with the right setup.",
    href: EAR_TRAINING_PATH_HREF,
    steps: EAR_TRAINING_LEARNING_PATH,
  };

export function builtEarTrainingCapabilities(): EarTrainingCapability[] {
  return EAR_TRAINING_CAPABILITIES.filter(({ status }) => status === "built").map((item) => ({
    ...item,
  }));
}

export function currentEarTrainingLearningPath(): EarTrainingLearningPathStage[] {
  return EAR_TRAINING_LEARNING_PATH.map((stage) => ({ ...stage }));
}
