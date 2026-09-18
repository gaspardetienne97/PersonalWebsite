import {
  Capability,
  type ExerciseDefinition,
  type ExerciseLiveState,
  type ExerciseRun,
  type NoteEvent,
  type NoteOnEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";

export interface ScalePatternPrompt {
  label: string;
  /** Every expected note in playing order; a hands-together beat contributes two. */
  midiNotes: number[];
  noteLabels: string[];
  bpm: number;
  targetSpacingMs: number;
  motion: ScaleMotion;
  span: ScaleSpan;
  hands: ScaleHands;
  /** Expected notes per beat, low to high: one per beat, or two when hands play together. */
  noteGroups: number[][];
  /** Milliseconds within which the two hands count as striking a beat together. */
  togetherWindowMs: number;
  /** Extra success bar a curriculum checkpoint adds: evenness must reach this (0-1). */
  minEvenness?: number;
}

/** Which hand(s) play the pattern. "both" doubles it an octave apart, in parallel. */
export type ScaleHands = "right" | "left" | "both";

export interface ScalePatternAnswer {
  midiNotes: number[];
  /** Evenness of the beat onsets, 0-1 — the number behind the feedback percentage. */
  evenness: number;
  /** Beats where both hands landed inside the together window. Undefined when unmeasured. */
  togetherCount?: number;
  /** Beats the pattern asks both hands to strike. Undefined when unmeasured. */
  togetherTotal?: number;
}

export interface ScalePatternLiveState extends ExerciseLiveState {
  /** One flag per beat played so far. Undefined unless both hands are measured. */
  togetherFlags?: boolean[];
}

export type ScalePatternKind =
  | "major"
  | "natural-minor"
  | "harmonic-minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "locrian"
  | "melodic-minor"
  | "major-pentatonic"
  | "minor-pentatonic"
  | "blues"
  | "altered"
  | "bebop-major"
  | "bebop-dominant"
  | "whole-tone"
  | "diminished";

export type ScaleMotion = "up" | "down" | "up-down";

export type ScaleSpan = "pentascale" | "one-octave" | "two-octave";

/** Ascending semitone offsets from the tonic, octave inclusive. */
const SCALE_INTERVALS: Record<ScalePatternKind, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  "natural-minor": [0, 2, 3, 5, 7, 8, 10, 12],
  "harmonic-minor": [0, 2, 3, 5, 7, 8, 11, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12],
  lydian: [0, 2, 4, 6, 7, 9, 11, 12],
  mixolydian: [0, 2, 4, 5, 7, 9, 10, 12],
  locrian: [0, 1, 3, 5, 6, 8, 10, 12],
  "melodic-minor": [0, 2, 3, 5, 7, 9, 11, 12],
  "major-pentatonic": [0, 2, 4, 7, 9, 12],
  "minor-pentatonic": [0, 3, 5, 7, 10, 12],
  blues: [0, 3, 5, 6, 7, 10, 12],
  altered: [0, 1, 3, 4, 6, 8, 10, 12],
  "bebop-major": [0, 2, 4, 5, 7, 8, 9, 11, 12],
  "bebop-dominant": [0, 2, 4, 5, 7, 9, 10, 11, 12],
  "whole-tone": [0, 2, 4, 6, 8, 10, 12],
  diminished: [0, 1, 3, 4, 6, 7, 9, 10, 12],
};

/** Ascending semitone offsets for a scale kind (octave inclusive). */
export function scaleSemitones(scale: ScalePatternKind): number[] {
  return SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
}

/** Semitone offsets for a scale practice prompt after span and motion are applied. */
export function scalePatternSemitones(
  scale: ScalePatternKind,
  span: ScaleSpan = "one-octave",
  motion: ScaleMotion = "up",
): number[] {
  return applyMotion(scaleSpanSemitones(scale, span), motion);
}

/** Scales beyond the church-mode basics that read as jazz vocabulary. */
export const JAZZ_SCALE_KINDS: ScalePatternKind[] = [
  "dorian",
  "mixolydian",
  "lydian",
  "melodic-minor",
  "altered",
  "bebop-major",
  "bebop-dominant",
  "whole-tone",
  "diminished",
];

export interface ScalePatternOptions {
  tonic?: string;
  scale?: ScalePatternKind;
  bpm?: number;
  motion?: ScaleMotion;
  span?: ScaleSpan;
  hands?: ScaleHands;
  /**
   * Extra success bar, 0-1: with it set, a run is only `correct` when its
   * evenness also reaches it. Unset (the default) leaves scoring untouched.
   */
  minEvenness?: number;
}

/** |onset RH − onset LH| within this counts a hands-together beat as together. */
export const SCALE_TOGETHER_WINDOW_MS = 40;

export function createScalePatternExercise(
  options: ScalePatternOptions = {},
): ExerciseDefinition<ScalePatternPrompt, ScalePatternAnswer> {
  const tonic = options.tonic ?? "C4";
  const scale = options.scale ?? "major";
  const bpm = options.bpm ?? 120;
  const motion = options.motion ?? "up";
  const span = options.span ?? "one-octave";
  const hands = options.hands ?? "right";
  const noteGroups = scaleNoteGroups(tonic, scale, span, motion, hands);
  const midiNotes = noteGroups.flat();
  const label = `${pitchClassLabel(tonic)} ${scaleLabel(scale)} · ${spanLabel(span)} · ${motionLabel(motion)}${hands === "right" ? "" : ` · ${handsLabel(hands)}`}`;

  return {
    id: `technique.scale.${pitchClassLabel(tonic).toLowerCase()}-${scale}-${span}-${motion}`,
    name: `${label} Scale`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: [`technique.scale.${scale}`],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `scale-${pitchClassLabel(tonic).toLowerCase()}-${scale}-${span}-${motion}-${hands}-${bpm}`,
      payload: {
        label,
        midiNotes,
        noteLabels: midiNotes.map((midi) => midiToNote(midi)),
        bpm,
        targetSpacingMs: 60_000 / bpm,
        motion,
        span,
        hands,
        noteGroups,
        togetherWindowMs: SCALE_TOGETHER_WINDOW_MS,
        ...(options.minEvenness === undefined ? {} : { minEvenness: options.minEvenness }),
      },
    }),
    createRun(prompt) {
      return scaleRun(prompt.payload);
    },
  };
}

export const majorScaleExercise = createScalePatternExercise({ tonic: "C4", scale: "major" });

function scaleRun(prompt: ScalePatternPrompt): ExerciseRun<ScalePatternAnswer> {
  const input: NoteEvent[] = [];
  const handSize = prompt.hands === "both" ? 2 : 1;

  return {
    accept(event) {
      if (event.type === "noteOn") {
        input.push(event);
      }
    },
    getLiveState(): ScalePatternLiveState {
      const progress = Math.min(1, input.length / prompt.midiNotes.length);
      const beats = playedBeats(input, prompt);
      const together = gradeTogether(prompt, beats);
      return {
        progress,
        runningScore: progress,
        feedback: [],
        // Only the beats where both hands have already landed.
        ...(together === undefined
          ? {}
          : {
              togetherFlags: together.flags.slice(
                0,
                beats.filter((events) => events.length === handSize).length,
              ),
            }),
      };
    },
    finish() {
      const played = input.filter((event): event is NoteOnEvent => event.type === "noteOn");
      const beats = playedBeats(input, prompt);
      const together = gradeTogether(prompt, beats);
      const metrics: ScoringMetric[] = [];
      let correctNotes = 0;

      prompt.noteGroups.forEach((expectedGroup, beat) => {
        // Within a beat the two hands arrive in either order; grade the pitch set.
        const actualGroup = [...(beats[beat] ?? [])]
          .map((event) => event.midiNote)
          .sort((left, right) => left - right);
        expectedGroup.forEach((expectedMidi, index) => {
          const actualMidi = actualGroup[index];
          metrics.push({ kind: "pitch", expectedMidi, actualMidi });
          if (actualMidi === expectedMidi) correctNotes += 1;
        });
      });

      // Evenness and timing run on one onset per beat: the earlier hand.
      const onsets = beats.map((events) =>
        Math.min(...events.map((event) => Number(event.timestamp))),
      );
      const firstOnset = onsets[0];
      if (firstOnset !== undefined) {
        onsets.forEach((actualMs, beat) => {
          const expectedMs = firstOnset + beat * prompt.targetSpacingMs;
          metrics.push({ kind: "timing", expectedMs, actualMs, errorMs: actualMs - expectedMs });
        });
      }

      const spacings = onsets.slice(1).map((onset, index) => onset - onsets[index]!);
      const evennessError =
        spacings.length === 0
          ? prompt.targetSpacingMs
          : spacings.reduce((sum, spacing) => sum + Math.abs(spacing - prompt.targetSpacingMs), 0) /
            spacings.length;
      const pitchScore = correctNotes / prompt.midiNotes.length;
      const evennessScore = Math.max(0, 1 - evennessError / 180);
      const score = pitchScore * 0.85 + evennessScore * 0.15;
      // A checkpoint can demand evenness outright; without one the bar is unchanged.
      const correct =
        score >= 0.9 && (prompt.minEvenness === undefined || evennessScore >= prompt.minEvenness);

      return {
        correct,
        score,
        metrics,
        feedback: [
          {
            severity: correct ? "good" : "warn",
            message: `Evenness ${Math.round(evennessScore * 100)}%, notes ${correctNotes}/${prompt.midiNotes.length}.`,
          },
          ...(prompt.hands === "both"
            ? [
                together === undefined
                  ? {
                      severity: "info" as const,
                      message:
                        "Together not measured — the on-screen keyboard plays one hand at a time.",
                    }
                  : {
                      severity: (together.count / prompt.noteGroups.length >= 0.8
                        ? "good"
                        : "warn") as "good" | "warn",
                      message: `Together ${together.count}/${prompt.noteGroups.length} beats within ${prompt.togetherWindowMs} ms.`,
                    },
              ]
            : []),
        ],
        target: { label: prompt.label, midiNotes: prompt.midiNotes },
        response: { midiNotes: played.map((event) => event.midiNote) },
        answer: {
          midiNotes: played.map((event) => event.midiNote),
          evenness: evennessScore,
          ...(together === undefined
            ? {}
            : { togetherCount: together.count, togetherTotal: prompt.noteGroups.length }),
        },
        input,
      };
    },
  };
}

/**
 * Played onsets chunked by beat: one note per beat, or one per hand when hands
 * play together. Two-hand beats are split by onset **gap**, not by counting, so
 * a dropped note costs its own beat instead of shifting every later one. The
 * threshold is half a beat — far looser than the together window, so a pair
 * played too far apart to count as together still belongs to the same beat.
 */
function playedBeats(input: NoteEvent[], prompt: ScalePatternPrompt): NoteOnEvent[][] {
  const played = input.filter((event): event is NoteOnEvent => event.type === "noteOn");
  if (prompt.hands !== "both") return played.map((event) => [event]);

  const maxGapMs = prompt.targetSpacingMs / 2;
  const beats: NoteOnEvent[][] = [];
  for (const event of played) {
    const current = beats.at(-1);
    const startedAt = current === undefined ? undefined : Number(current[0]!.timestamp);
    if (
      current !== undefined &&
      current.length < 2 &&
      Number(event.timestamp) - startedAt! <= maxGapMs
    ) {
      current.push(event);
    } else {
      beats.push([event]);
    }
  }
  return beats;
}

/**
 * Simultaneity: for each beat both hands strike, did the onsets land inside the
 * window? An on-screen keyboard plays one note at a time, so a run typed there
 * reports "together not measured" rather than a false zero — but a MIDI run that
 * simply missed hands is measured, and scores those beats 0.
 */
function gradeTogether(
  prompt: ScalePatternPrompt,
  beats: NoteOnEvent[][],
): { flags: boolean[]; count: number } | undefined {
  if (prompt.hands !== "both") return undefined;
  const played = beats.flat();
  if (played.length === 0) return undefined;
  if (played.every((event) => event.source === "onscreen")) return undefined;
  const flags = prompt.noteGroups.map((_group, beat) => {
    const events = beats[beat];
    if (events === undefined || events.length < 2) return false;
    return (
      Math.abs(Number(events[1]!.timestamp) - Number(events[0]!.timestamp)) <=
      prompt.togetherWindowMs
    );
  });
  return { flags, count: flags.filter(Boolean).length };
}

/** Expected notes per beat, low to high; "both" doubles the line an octave down. */
function scaleNoteGroups(
  tonic: string,
  scale: ScalePatternKind,
  span: ScaleSpan,
  motion: ScaleMotion,
  hands: ScaleHands,
): number[][] {
  const root = noteToMidi(tonic);
  return scalePatternSemitones(scale, span, motion).map((semitones) => {
    const upper = root + semitones;
    if (hands === "both") return [upper - 12, upper];
    return [hands === "left" ? upper - 12 : upper];
  });
}

function scaleSpanSemitones(scale: ScalePatternKind, span: ScaleSpan): number[] {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  if (span === "pentascale") return intervals.filter((interval) => interval < 12).slice(0, 5);
  if (span === "two-octave") {
    return [...intervals, ...intervals.slice(1).map((interval) => interval + 12)];
  }
  return intervals;
}

function applyMotion(intervals: number[], motion: ScaleMotion): number[] {
  if (motion === "down") return [...intervals].reverse();
  if (motion === "up-down") return [...intervals, ...intervals.slice(0, -1).reverse()];
  return intervals;
}

function scaleLabel(scale: ScalePatternKind): string {
  return scale.replaceAll("-", " ");
}

function spanLabel(span: ScaleSpan): string {
  if (span === "pentascale") return "pentascale";
  if (span === "two-octave") return "two octaves";
  return "one octave";
}

function handsLabel(hands: ScaleHands): string {
  if (hands === "both") return "hands together";
  if (hands === "left") return "left hand";
  return "right hand";
}

function motionLabel(motion: ScaleMotion): string {
  if (motion === "down") return "descending";
  if (motion === "up-down") return "up-down";
  return "ascending";
}

function pitchClassLabel(note: string): string {
  return note.trim().replace(/-?\d+$/, "");
}
