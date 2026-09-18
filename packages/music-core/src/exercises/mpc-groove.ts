import {
  Capability,
  type ExerciseDefinition,
  type MonotonicMs,
  type NoteOnEvent,
} from "@repo/music-core/domain";
import { BOOM_BAP_KIT } from "@repo/music-core/engines/sequencer";

export type GrooveVoice = "kick" | "snare" | "hats";
export const GROOVE_VOICES = BOOM_BAP_KIT.filter((pad): pad is typeof pad & { id: GrooveVoice } =>
  ["kick", "snare", "hats"].includes(pad.id),
);
export const MPC_GROOVES = [
  { value: "backbeat", label: "Kick / snare" },
  { value: "eighth-hats", label: "Eighth-note hats" },
  { value: "syncopated", label: "Syncopated kick" },
] as const;
export type GrooveFamily = (typeof MPC_GROOVES)[number]["value"];
export interface MpcGrooveConfig {
  family: GrooveFamily;
  bpm: number;
  mapping: Record<GrooveVoice, number>;
}
export interface MpcGroovePrompt extends MpcGrooveConfig {
  label: string;
  responseStart: MonotonicMs;
  responseEnd: number;
  targets: { voice: GrooveVoice; beat: number }[];
}
export interface MpcGrooveAnswer {
  accuracy: number;
  matched: number;
  omissions: number;
  extras: number;
  meanTimingErrorMs: number | null;
  voices: {
    voice: GrooveVoice | "unmapped";
    matched: number;
    omissions: number;
    extras: number;
    meanTimingErrorMs: number | null;
  }[];
  variableMidiVelocity: boolean;
  accentAssessed: false;
}
export function normalizeMpcGrooveConfig(
  source: URLSearchParams | Record<string, unknown>,
): MpcGrooveConfig {
  const get = (key: string) => (source instanceof URLSearchParams ? source.get(key) : source[key]);
  const family = MPC_GROOVES.find((item) => item.value === get("groove"))?.value ?? "backbeat";
  const mapping = Object.fromEntries(
    GROOVE_VOICES.map((pad) => {
      const value = Number(get(pad.id));
      return [pad.id, Number.isInteger(value) && value >= 36 && value <= 51 ? value : pad.midi];
    }),
  ) as Record<GrooveVoice, number>;
  const requested = Number(get("bpm"));
  return {
    family,
    mapping,
    bpm: Number.isFinite(requested) && requested >= 20 ? Math.min(300, requested) : 80,
  };
}
export function grooveTargets(family: GrooveFamily): MpcGroovePrompt["targets"] {
  const kick = family === "syncopated" ? [0, 1.5, 2.75] : [0, 2];
  return [
    ...kick.map((beat) => ({ voice: "kick" as const, beat })),
    ...[1, 3].map((beat) => ({ voice: "snare" as const, beat })),
    ...(family === "backbeat"
      ? []
      : Array.from({ length: 8 }, (_, i) => ({ voice: "hats" as const, beat: i / 2 }))),
  ].sort((a, b) => a.beat - b.beat);
}
export function createMpcGrooveExercise(
  options: MpcGrooveConfig & { responseStart: MonotonicMs },
): ExerciseDefinition<MpcGroovePrompt, MpcGrooveAnswer> {
  if (
    !MPC_GROOVES.some((item) => item.value === options.family) ||
    !Number.isFinite(options.bpm) ||
    options.bpm < 20 ||
    options.bpm > 300 ||
    !Number.isFinite(options.responseStart)
  )
    throw new Error("Invalid groove clock or family");
  const pads = GROOVE_VOICES.map(({ id }) => options.mapping[id]);
  if (
    new Set(pads).size !== 3 ||
    pads.some((pad) => !Number.isInteger(pad) || pad < 0 || pad > 127)
  )
    throw new Error("Choose three different MIDI pads");
  const skillIds = ["technique.mpc", `technique.mpc.groove.${options.family}`];
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
        ...options,
        mapping: { ...options.mapping },
        label: MPC_GROOVES.find((item) => item.value === options.family)!.label,
        responseEnd: options.responseStart + 240000 / options.bpm,
        targets: grooveTargets(options.family),
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
            event.timestamp < prompt.responseEnd
          )
            hits.push(event);
        },
        getLiveState: () => ({ progress: 0, runningScore: 0, feedback: [] }),
        finish() {
          closed = true;
          const used = new Set<number>();
          const errors: number[] = [];
          const matchedHits: NoteOnEvent[] = [];
          const windowMs = Math.min(180, 60000 / prompt.bpm / 4);
          const voices: MpcGrooveAnswer["voices"] = GROOVE_VOICES.map(({ id: voice }) => {
            const targets = prompt.targets.filter((target) => target.voice === voice);
            const voiceErrors: number[] = [];
            for (const target of targets) {
              const expected = prompt.responseStart + (target.beat * 60000) / prompt.bpm;
              let nearest = -1,
                distance = windowMs;
              hits.forEach((hit, index) => {
                const error = Math.abs(hit.timestamp - expected);
                if (
                  !used.has(index) &&
                  hit.midiNote === prompt.mapping[voice] &&
                  error <= distance
                ) {
                  nearest = index;
                  distance = error;
                }
              });
              if (nearest >= 0) {
                used.add(nearest);
                voiceErrors.push(distance);
                errors.push(distance);
                matchedHits.push(hits[nearest]);
              }
            }
            return {
              voice,
              matched: voiceErrors.length,
              omissions: targets.length - voiceErrors.length,
              extras: hits.filter(
                (hit, index) => hit.midiNote === prompt.mapping[voice] && !used.has(index),
              ).length,
              meanTimingErrorMs: mean(voiceErrors),
            };
          });
          const unmapped = hits.filter(
            (hit) => !Object.values(prompt.mapping).includes(hit.midiNote),
          ).length;
          voices.push({
            voice: "unmapped",
            matched: 0,
            omissions: 0,
            extras: unmapped,
            meanTimingErrorMs: null,
          });
          const matched = used.size,
            omissions = prompt.targets.length - matched,
            extras = hits.length - matched;
          const accuracy = matched / (prompt.targets.length + extras);
          const answer: MpcGrooveAnswer = {
            accuracy,
            matched,
            omissions,
            extras,
            voices,
            meanTimingErrorMs: mean(errors),
            variableMidiVelocity:
              matchedHits.length > 1 &&
              matchedHits.every((hit) => hit.source === "midi") &&
              new Set(matchedHits.map((hit) => hit.velocity)).size > 1,
            accentAssessed: false,
          };
          return {
            correct:
              omissions === 0 && extras === 0 && (answer.meanTimingErrorMs ?? Infinity) <= 90,
            score: accuracy,
            metrics: [],
            feedback: [
              {
                severity: accuracy === 1 ? "good" : "warn",
                message: `${matched} matched, ${omissions} missed, ${extras} extra. Accents are not assessed.`,
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
function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
