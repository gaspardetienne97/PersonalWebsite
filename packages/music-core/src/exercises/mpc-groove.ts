import {
  Capability,
  type DrumVoice,
  type ExerciseDefinition,
  type MonotonicMs,
  type NoteOnEvent,
} from "@repo/music-core/domain";
import { BOOM_BAP_KIT } from "@repo/music-core/engines/sequencer";

export type GrooveVoice = DrumVoice;
export type GrooveAccent = "accent" | "normal";
export type GrooveSectionLabel = "groove" | "fill";
export interface GrooveTarget {
  voice: GrooveVoice;
  /** Onset in beats from the start of the phrase (4 beats per bar). */
  beat: number;
  accent: GrooveAccent;
}
export interface GrooveDefinition {
  value: string;
  label: string;
  bars: number;
  /** One label per bar, so the fill can be scored apart from the groove. */
  sectionLabels: readonly GrooveSectionLabel[];
  targets: readonly GrooveTarget[];
}

/** The kit rows, in kit order; the shared pad map decides which pad each voice owns. */
export const GROOVE_VOICES = BOOM_BAP_KIT;
const VOICE_ORDER = GROOVE_VOICES.map((pad) => pad.id);
const BEATS_PER_BAR = 4;
/** MIDI velocity bands (0-1) per accent marking: accent >= 90, normal 50 to 89. */
const VELOCITY_BANDS: Record<GrooveAccent, { min: number; max: number }> = {
  accent: { min: 90 / 127, max: 1 },
  normal: { min: 50 / 127, max: 89 / 127 },
};
/** Bank A, widened to any canonical kit note that sits outside it (the 808 on 35). */
const PAD_MIN = Math.min(36, ...GROOVE_VOICES.map((pad) => pad.midi));
const PAD_MAX = Math.max(51, ...GROOVE_VOICES.map((pad) => pad.midi));

const at = (
  voice: GrooveVoice,
  beats: readonly number[],
  accent: GrooveAccent = "normal",
): GrooveTarget[] => beats.map((beat) => ({ voice, beat, accent }));
const ordered = (targets: GrooveTarget[]): GrooveTarget[] =>
  [...targets].sort(
    (left, right) =>
      left.beat - right.beat || VOICE_ORDER.indexOf(left.voice) - VOICE_ORDER.indexOf(right.voice),
  );
const bar = (index: number, targets: readonly GrooveTarget[]): GrooveTarget[] =>
  targets.map((target) => ({ ...target, beat: target.beat + index * BEATS_PER_BAR }));

// Curriculum §5 M2, bar 1: kick on 1 and the and-of-3, hats stop at beat 3 to
// leave the last eighth to the open hat, snares accented on 2 and 4.
const BOOM_BAP_BAR_1 = ordered([
  ...at("kick", [0, 2.5]),
  ...at("hats", [0, 0.5, 1, 1.5, 2, 2.5, 3]),
  ...at("snare", [1, 3], "accent"),
  ...at("openhat", [3.5]),
]);
// M2, bar 2: hats all eighths, kick pickup a sixteenth before beat 4.
const BOOM_BAP_BAR_2 = ordered([
  ...at("kick", [0, 2, 2.75]),
  ...at("hats", [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]),
  ...at("snare", [1, 3], "accent"),
]);
// M3, bar 4: eight sixteenth snares accented on each beat, two claps, then the
// backbeat and open hat that set up the landing.
const TURNAROUND_FILL_BAR = ordered([
  ...at("snare", [0, 1], "accent"),
  ...at("snare", [0.25, 0.5, 0.75, 1.25, 1.5, 1.75]),
  ...at("kick", [2, 3]),
  ...at("perc", [2, 2.5], "accent"),
  ...at("snare", [3], "accent"),
  ...at("openhat", [3.5], "accent"),
]);

export const MPC_GROOVE_CATALOG = [
  {
    value: "backbeat",
    label: "Kick / snare",
    bars: 1,
    sectionLabels: ["groove"],
    targets: ordered([...at("kick", [0, 2]), ...at("snare", [1, 3])]),
  },
  {
    value: "eighth-hats",
    label: "Eighth-note hats",
    bars: 1,
    sectionLabels: ["groove"],
    targets: ordered([
      ...at("kick", [0, 2]),
      ...at("snare", [1, 3]),
      ...at("hats", [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]),
    ]),
  },
  {
    value: "syncopated",
    label: "Syncopated kick",
    bars: 1,
    sectionLabels: ["groove"],
    targets: ordered([
      ...at("kick", [0, 1.5, 2.75]),
      ...at("snare", [1, 3]),
      ...at("hats", [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]),
    ]),
  },
  {
    value: "boom-bap-2bar",
    label: "Boom bap · 2 bars",
    bars: 2,
    sectionLabels: ["groove", "groove"],
    targets: [...bar(0, BOOM_BAP_BAR_1), ...bar(1, BOOM_BAP_BAR_2)],
  },
  {
    value: "turnaround-fill",
    label: "Turnaround with a fill",
    bars: 4,
    sectionLabels: ["groove", "groove", "groove", "fill"],
    targets: [
      ...bar(0, BOOM_BAP_BAR_1),
      ...bar(1, BOOM_BAP_BAR_2),
      ...bar(2, BOOM_BAP_BAR_1),
      ...bar(3, TURNAROUND_FILL_BAR),
      // The downbeat of bar 5 lands the phrase and is graded as the last target.
      ...at("kick", [4 * BEATS_PER_BAR]),
    ],
  },
] as const satisfies readonly GrooveDefinition[];

export type GrooveFamily = (typeof MPC_GROOVE_CATALOG)[number]["value"];
export const MPC_GROOVES = MPC_GROOVE_CATALOG.map(({ value, label }) => ({ value, label }));

export function grooveDefinition(family: GrooveFamily): GrooveDefinition {
  const definition = MPC_GROOVE_CATALOG.find((item) => item.value === family);
  if (!definition) throw new Error(`Unknown MPC groove: ${family}`);
  return definition;
}
export function grooveTargets(family: GrooveFamily): readonly GrooveTarget[] {
  return grooveDefinition(family).targets;
}
/** Kit rows the groove actually plays, in kit order. */
export function grooveVoices(family: GrooveFamily): typeof GROOVE_VOICES {
  const used = new Set(grooveTargets(family).map((target) => target.voice));
  return GROOVE_VOICES.filter((pad) => used.has(pad.id));
}

export interface MpcGrooveConfig {
  family: GrooveFamily;
  bpm: number;
  mapping: Partial<Record<GrooveVoice, number>>;
}
export interface MpcGroovePrompt {
  family: GrooveFamily;
  bpm: number;
  label: string;
  bars: number;
  sectionLabels: readonly GrooveSectionLabel[];
  mapping: Record<GrooveVoice, number>;
  responseStart: MonotonicMs;
  responseEnd: number;
  /** Input stays open one match window past the last target, so a closing downbeat counts. */
  captureEndMs: number;
  targets: readonly GrooveTarget[];
}
export interface MpcGrooveVoiceResult {
  voice: GrooveVoice | "unmapped";
  matched: number;
  omissions: number;
  extras: number;
  meanTimingErrorMs: number | null;
}
export interface MpcGrooveSectionResult {
  label: GrooveSectionLabel;
  targets: number;
  matched: number;
  omissions: number;
  extras: number;
  meanTimingErrorMs: number | null;
}
export interface MpcGrooveAnswer {
  accuracy: number;
  matched: number;
  omissions: number;
  extras: number;
  meanTimingErrorMs: number | null;
  voices: MpcGrooveVoiceResult[];
  sections: MpcGrooveSectionResult[];
  variableMidiVelocity: boolean;
  /** Accents are graded only where MIDI gave us real velocities to read. */
  accentAssessed: boolean;
  accentTargets: number;
  accentMatched: number;
  /** Matched hits whose velocity sat in their own written band, accents and normals alike. */
  dynamicsMatched: number;
  dynamicsTargets: number;
}

function resolveMapping(
  source: Partial<Record<GrooveVoice, number>> = {},
): Record<GrooveVoice, number> {
  return Object.fromEntries(
    GROOVE_VOICES.map((pad) => [pad.id, source[pad.id] ?? pad.midi]),
  ) as Record<GrooveVoice, number>;
}

export function normalizeMpcGrooveConfig(
  source: URLSearchParams | Record<string, unknown>,
): MpcGrooveConfig {
  const get = (key: string) => (source instanceof URLSearchParams ? source.get(key) : source[key]);
  const family =
    MPC_GROOVE_CATALOG.find((item) => item.value === get("groove"))?.value ?? "backbeat";
  const mapping = resolveMapping(
    Object.fromEntries(
      GROOVE_VOICES.flatMap((pad) => {
        const value = Number(get(pad.id));
        return Number.isInteger(value) && value >= PAD_MIN && value <= PAD_MAX
          ? [[pad.id, value]]
          : [];
      }),
    ),
  );
  const requested = Number(get("bpm"));
  return {
    family,
    mapping,
    bpm: Number.isFinite(requested) && requested >= 20 ? Math.min(300, requested) : 80,
  };
}

export function createMpcGrooveExercise(
  options: MpcGrooveConfig & { responseStart: MonotonicMs },
): ExerciseDefinition<MpcGroovePrompt, MpcGrooveAnswer> {
  if (
    !MPC_GROOVE_CATALOG.some((item) => item.value === options.family) ||
    !Number.isFinite(options.bpm) ||
    options.bpm < 20 ||
    options.bpm > 300 ||
    !Number.isFinite(options.responseStart)
  )
    throw new Error("Invalid groove clock or family");
  const definition = grooveDefinition(options.family);
  const mapping = resolveMapping(options.mapping);
  const voices = grooveVoices(options.family);
  const pads = voices.map((pad) => mapping[pad.id]);
  if (
    new Set(pads).size !== pads.length ||
    pads.some((pad) => !Number.isInteger(pad) || pad < 0 || pad > 127)
  )
    throw new Error("Choose a different MIDI pad for each groove voice");
  const skillIds = ["technique.mpc", `technique.mpc.groove.${options.family}`];
  const beatMs = 60000 / options.bpm;
  const windowMs = matchWindowMs(options.bpm);
  const lastBeat = Math.max(0, ...definition.targets.map((target) => target.beat));
  const responseEnd = options.responseStart + definition.bars * BEATS_PER_BAR * beatMs;
  return {
    id: "technique.mpc.groove",
    name: "MPC Groove Copy-back",
    capabilities: [Capability.Technique, Capability.Rhythm],
    skillIds,
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `groove-${options.family}-${options.bpm}`,
      payload: {
        family: options.family,
        bpm: options.bpm,
        mapping: { ...mapping },
        label: definition.label,
        bars: definition.bars,
        sectionLabels: [...definition.sectionLabels],
        responseStart: options.responseStart,
        responseEnd,
        captureEndMs: Math.max(responseEnd, options.responseStart + lastBeat * beatMs + windowMs),
        targets: definition.targets.map((target) => ({ ...target })),
      },
    }),
    createRun({ payload: prompt }) {
      const hits: NoteOnEvent[] = [];
      let closed = false;
      return {
        accept(event) {
          if (
            !closed &&
            event.type === "noteOn" &&
            event.timestamp >= prompt.responseStart &&
            event.timestamp < prompt.captureEndMs
          )
            hits.push(event);
        },
        getLiveState: () => ({ progress: 0, runningScore: 0, feedback: [] }),
        finish() {
          closed = true;
          const usedHits = new Set<number>();
          const matches = new Map<GrooveTarget, { hit: NoteOnEvent; errorMs: number }>();
          for (const { id: voice } of voices) {
            for (const target of prompt.targets.filter((item) => item.voice === voice)) {
              const expected = prompt.responseStart + target.beat * beatMs;
              let nearest = -1,
                distance = windowMs;
              hits.forEach((hit, index) => {
                const error = Math.abs(hit.timestamp - expected);
                if (!usedHits.has(index) && hit.midiNote === mapping[voice] && error <= distance) {
                  nearest = index;
                  distance = error;
                }
              });
              if (nearest >= 0) {
                usedHits.add(nearest);
                matches.set(target, { hit: hits[nearest]!, errorMs: distance });
              }
            }
          }
          const errorsOf = (targets: readonly GrooveTarget[]) =>
            targets.flatMap((target) => {
              const match = matches.get(target);
              return match ? [match.errorMs] : [];
            });
          const extrasIn = (predicate: (hit: NoteOnEvent, index: number) => boolean) =>
            hits.filter((hit, index) => !usedHits.has(index) && predicate(hit, index)).length;

          const voiceResults: MpcGrooveVoiceResult[] = voices.map(({ id: voice }) => {
            const targets = prompt.targets.filter((target) => target.voice === voice);
            const errors = errorsOf(targets);
            return {
              voice,
              matched: errors.length,
              omissions: targets.length - errors.length,
              extras: extrasIn((hit) => hit.midiNote === mapping[voice]),
              meanTimingErrorMs: mean(errors),
            };
          });
          const usedPads = voices.map((pad) => mapping[pad.id]);
          voiceResults.push({
            voice: "unmapped",
            matched: 0,
            omissions: 0,
            extras: extrasIn((hit) => !usedPads.includes(hit.midiNote)),
            meanTimingErrorMs: null,
          });

          const sectionOf = (beat: number) =>
            prompt.sectionLabels[
              Math.min(
                Math.max(0, Math.floor(beat / BEATS_PER_BAR)),
                prompt.sectionLabels.length - 1,
              )
            ]!;
          const sections: MpcGrooveSectionResult[] = [...new Set(prompt.sectionLabels)].map(
            (label) => {
              const targets = prompt.targets.filter((target) => sectionOf(target.beat) === label);
              const errors = errorsOf(targets);
              return {
                label,
                targets: targets.length,
                matched: errors.length,
                omissions: targets.length - errors.length,
                extras: extrasIn(
                  (hit) => sectionOf((hit.timestamp - prompt.responseStart) / beatMs) === label,
                ),
                meanTimingErrorMs: mean(errors),
              };
            },
          );

          const matchedHits = [...matches.values()].map((match) => match.hit);
          const variableMidiVelocity =
            matchedHits.length > 1 &&
            matchedHits.every((hit) => hit.source === "midi") &&
            new Set(matchedHits.map((hit) => hit.velocity)).size > 1;
          const accentTargets = prompt.targets.filter((target) => target.accent === "accent");
          const accentAssessed = variableMidiVelocity && accentTargets.length > 0;
          const inBandTargets = prompt.targets.filter((target) =>
            inBand(matches.get(target)?.hit, target.accent),
          );
          // Normals are graded against the normal band too, so a run played flat out
          // cannot collect full marks just because its accents happen to be loud.
          const dynamicsMatched = accentAssessed ? inBandTargets.length : 0;
          const accentMatched = accentAssessed
            ? inBandTargets.filter((target) => target.accent === "accent").length
            : 0;

          const matched = usedHits.size,
            omissions = prompt.targets.length - matched,
            extras = hits.length - matched;
          const accuracy = matched / (prompt.targets.length + extras);
          const errors = errorsOf(prompt.targets);
          const answer: MpcGrooveAnswer = {
            accuracy,
            matched,
            omissions,
            extras,
            voices: voiceResults,
            sections,
            meanTimingErrorMs: mean(errors),
            variableMidiVelocity,
            accentAssessed,
            accentTargets: accentTargets.length,
            accentMatched,
            dynamicsMatched,
            dynamicsTargets: prompt.targets.length,
          };
          return {
            correct:
              omissions === 0 && extras === 0 && (answer.meanTimingErrorMs ?? Infinity) <= 90,
            score: accentAssessed
              ? accuracy * 0.85 + (dynamicsMatched / prompt.targets.length) * 0.15
              : accuracy,
            metrics: [],
            feedback: [
              {
                severity: accuracy === 1 ? "good" : "warn",
                message: `${matched} matched, ${omissions} missed, ${extras} extra. ${
                  accentAssessed
                    ? `${accentMatched} of ${accentTargets.length} accents in band, ${dynamicsMatched} of ${prompt.targets.length} notes in their written band.`
                    : "Accents are not assessed."
                }`,
              },
            ],
            target: { label: prompt.label },
            response: { midiNotes: hits.map((hit) => hit.midiNote) },
            answer,
            input: [...hits],
          };
        },
      };
    },
  };
}

/**
 * Half the gap between sixteenths, capped so slow tempos stay honest. Half, not the
 * whole gap: a window as wide as the grid lets a hit be claimed by its neighbour's
 * target, so one dropped sixteenth would shift the rest of the bar and report them late.
 */
function matchWindowMs(bpm: number): number {
  return Math.min(180, 60000 / bpm / 8);
}
function inBand(hit: NoteOnEvent | undefined, accent: GrooveAccent): boolean {
  if (!hit) return false;
  const band = VELOCITY_BANDS[accent];
  return hit.velocity >= band.min && hit.velocity <= band.max;
}
function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
