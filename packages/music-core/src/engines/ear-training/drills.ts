// Every ear drill is its own route under /music/learn/ear/<slug>; the Ear
// Training Path organises them. This file is the single source for the slugs,
// what each drill can be configured with, and every deep link into them.
import type {
  EarTrainingAnswerMode,
  EarTrainingDrill,
  EarTrainingFeedbackMode,
} from "@repo/music-core/exercises/ear-training";
import {
  SCALE_DEGREE_SETS,
  type ScaleDegreeLabelMode,
  type ScaleDegreeSetId,
} from "@repo/music-core/exercises/scale-degree-recognition";

export type EarTrainingDrillSlug =
  | "mixed"
  | "intervals"
  | "chord-qualities"
  | "cadences"
  | "scale-degrees"
  | "melody-dictation"
  | "repertoire-transfer";

export interface EarTrainingDrillDefinition {
  slug: EarTrainingDrillSlug;
  title: string;
  description: string;
  /** Session drill option and journal tag (unchanged from the single-route era). */
  drill: EarTrainingDrill | "mixed";
  /** Answer modes this drill supports; the first is the default. */
  answerModes: EarTrainingAnswerMode[];
  usesScaleDegreeLevel: boolean;
  usesLabels: boolean;
  queueMode: "adaptive" | "balanced";
  /** Skill Graph nodes the drill advances (umbrella ids aggregate their children). */
  skillIds: string[];
}

export const EAR_TRAINING_PATH_HREF = "/music/learn/ear";

export const EAR_TRAINING_DRILLS: EarTrainingDrillDefinition[] = [
  {
    slug: "intervals",
    title: "Intervals",
    description: "Two notes, name the distance. Ascending, descending, harmonic.",
    drill: "interval",
    answerModes: ["choice", "play-back", "listen"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["pitch.intervals"],
  },
  {
    slug: "chord-qualities",
    title: "Chord qualities",
    description: "Triads and seventh chords by ear.",
    drill: "chord-quality",
    answerModes: ["choice", "play-back", "listen"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["harmony.triads", "harmony.sevenths"],
  },
  {
    slug: "cadences",
    title: "Cadences",
    description: "Authentic, plagal, half and deceptive cadences in a stated key.",
    drill: "cadence",
    answerModes: ["choice", "listen"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["ear.cadences"],
  },
  {
    slug: "scale-degrees",
    title: "Scale degrees",
    description: "Hear a note over the tonic and answer its function.",
    drill: "scale-degree",
    answerModes: ["choice", "play-back", "voice", "listen"],
    usesScaleDegreeLevel: true,
    usesLabels: true,
    queueMode: "balanced",
    skillIds: ["pitch.scale-degrees"],
  },
  {
    slug: "melody-dictation",
    title: "Melody dictation",
    description: "Hear a short phrase, play it back in order.",
    drill: "melody-dictation",
    answerModes: ["play-back"],
    usesScaleDegreeLevel: true,
    usesLabels: true,
    queueMode: "balanced",
    skillIds: ["pitch.scale-degrees"],
  },
  {
    slug: "repertoire-transfer",
    title: "Repertoire transfer",
    description: "Phrases from your saved songs, mapped back to scale degrees.",
    drill: "repertoire-transfer",
    answerModes: ["play-back"],
    usesScaleDegreeLevel: true,
    usesLabels: true,
    queueMode: "balanced",
    skillIds: ["pitch.scale-degrees"],
  },
  {
    slug: "mixed",
    title: "Ear training review",
    description: "A short adaptive mix of intervals, chord qualities, scale degrees and cadences.",
    drill: "mixed",
    answerModes: ["choice", "play-back", "listen"],
    usesScaleDegreeLevel: true,
    usesLabels: true,
    queueMode: "adaptive",
    skillIds: ["pitch.scale-degrees", "pitch.intervals", "harmony.triads", "ear.cadences"],
  },
];

export function earTrainingDrillBySlug(
  slug: string | undefined,
): EarTrainingDrillDefinition | undefined {
  return EAR_TRAINING_DRILLS.find((definition) => definition.slug === slug);
}

export function earTrainingDrillForDrill(
  drill: EarTrainingDrill | "mixed",
): EarTrainingDrillDefinition {
  return (
    EAR_TRAINING_DRILLS.find((definition) => definition.drill === drill) ??
    EAR_TRAINING_DRILLS.at(-1)!
  );
}

export interface EarTrainingHrefOptions {
  answer?: EarTrainingAnswerMode;
  feedback?: EarTrainingFeedbackMode;
  level?: ScaleDegreeSetId;
  labels?: ScaleDegreeLabelMode;
  routine?: boolean;
}

/** The only way to build a link into an ear drill: never hand-write the query string. */
export function earTrainingDrillHref(
  slug: EarTrainingDrillSlug,
  options: EarTrainingHrefOptions = {},
): string {
  const definition = earTrainingDrillBySlug(slug)!;
  const params = new URLSearchParams();
  if (options.answer) params.set("answer", clampEarAnswerMode(definition, options.answer));
  if (options.feedback) params.set("feedback", options.feedback);
  if (options.level && definition.usesScaleDegreeLevel) params.set("level", options.level);
  if (options.labels && definition.usesLabels) params.set("labels", options.labels);
  if (options.routine) params.set("routine", "1");
  const query = params.toString();
  return `${EAR_TRAINING_PATH_HREF}/${slug}${query ? `?${query}` : ""}`;
}

/** The requested answer mode when the drill supports it, otherwise the drill's default. */
export function clampEarAnswerMode(
  definition: EarTrainingDrillDefinition,
  mode: EarTrainingAnswerMode | undefined,
): EarTrainingAnswerMode {
  return mode && definition.answerModes.includes(mode) ? mode : definition.answerModes[0]!;
}

const LEGACY_DRILL_SLUGS: Record<string, EarTrainingDrillSlug> = {
  interval: "intervals",
  "chord-quality": "chord-qualities",
  cadence: "cadences",
  "scale-degree": "scale-degrees",
  "melody-dictation": "melody-dictation",
  "repertoire-transfer": "repertoire-transfer",
  mixed: "mixed",
};

/**
 * Where an old single-route link (`/music/learn/ear?drill=cadence&answer=listen`)
 * lands now. Returns undefined when the search carries nothing drill-specific,
 * so a plain visit stays on the path page. `?routine=1` alone means the daily
 * routine's ear step: the review drill.
 */
export function legacyEarTrainingHref(search: string | URLSearchParams): string | undefined {
  const params = new URLSearchParams(search);
  const drill = params.get("drill");
  const slug =
    drill === null ? (params.get("routine") ? "mixed" : undefined) : LEGACY_DRILL_SLUGS[drill];
  if (!slug) return undefined;
  params.delete("drill");
  const query = params.toString();
  return `${EAR_TRAINING_PATH_HREF}/${slug}${query ? `?${query}` : ""}`;
}

/** The drill that practises a skill, for dashboards and challenges. Undefined for non-ear skills. */
export function earTrainingHrefForSkill(skillId: string): string | undefined {
  if (skillId === "ear.cadences" || skillId.startsWith("ear.cadences.")) {
    return earTrainingDrillHref("cadences");
  }
  if (skillId === "pitch.intervals" || skillId.startsWith("pitch.interval.")) {
    return earTrainingDrillHref("intervals");
  }
  if (skillId === "pitch.scale-degrees" || skillId.startsWith("pitch.scale-degree.")) {
    return earTrainingDrillHref("scale-degrees");
  }
  if (
    skillId === "harmony.triads" ||
    skillId.startsWith("harmony.triad.") ||
    skillId === "harmony.sevenths" ||
    skillId.startsWith("harmony.seventh.")
  ) {
    return earTrainingDrillHref("chord-qualities");
  }
  if (skillId.startsWith("harmony.") || skillId.startsWith("pitch.")) {
    return earTrainingDrillHref("mixed");
  }
  return undefined;
}

/** Skill ids for the degrees of a level, e.g. `pitch.scale-degree.b3`. */
export function scaleDegreeSkillIds(setId: ScaleDegreeSetId): string[] {
  const set = SCALE_DEGREE_SETS.find((entry) => entry.id === setId);
  return (set?.degrees ?? []).map((token) => `pitch.scale-degree.${token}`);
}
