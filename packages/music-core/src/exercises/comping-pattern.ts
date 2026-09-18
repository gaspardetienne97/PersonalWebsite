/**
 * Comping pattern — a right-hand lick over a left-hand shell voicing, played in
 * time. The musical material is a generated {@link Score} with one voice per
 * hand; the grading is the existing `score-follower` in performance mode, one
 * follower per hand, so there is no new timing engine here.
 *
 * Two things the plain follower cannot express are added on top, both of them
 * rules the curriculum states for P3 "Blue third over a C7 shell":
 *
 *  - **Swing tolerance.** The written score is straight, but an off-beat eighth
 *    is musically right anywhere from straight (0.5 of a beat) to swung (2/3).
 *    Onsets inside that corridor have their swing displacement subtracted before
 *    they reach the follower, so both readings are on time and anything past the
 *    swung position is still measured from it.
 *  - **Left-hand extras.** The Charleston comp plays beat 1 and the and-of-2 and
 *    then nothing: an extra shell onset on beats 3 or 4 is a fault the follower
 *    would ignore, because its pitches are ones the score expects elsewhere.
 */

import {
  Capability,
  monotonicMs,
  type ExerciseDefinition,
  type ExerciseResult,
  type ExerciseRun,
  type MonotonicMs,
  type NoteEvent,
  type Score,
  type ScoreNote,
  type ScoringMetric,
} from "@repo/music-core/domain";
import {
  beatToMs,
  createScoreFollower,
  expectedGroups,
  timingWindowMs,
  type ScoreFollowerAnswer,
  type TimingStrictness,
} from "@repo/music-core/engines/score-follower";

export const COMPING_SKILL = "technique.piano.comping";

/** Beats per 4/4 bar. Every comping pattern below is in 4/4. */
const BEATS_PER_BAR = 4;
/** A swung eighth sits two thirds of the way through the beat. */
const SWUNG_OFFBEAT = 2 / 3;

export interface CompingNote {
  /** Onset in beats from the start of the pattern (bar 1 beat 1 = 0). */
  startBeat: number;
  midiNote: number;
  durationBeats: number;
  /** Suggested fingering: shown on the key, never graded — MIDI cannot see fingers. */
  finger?: number;
}

/** One left-hand attack of the shell, in beats from the start of its bar. */
export interface CompingOnset {
  beat: number;
  durationBeats: number;
}

export interface CompingPattern {
  id: string;
  label: string;
  /** Chord symbol held for the whole pattern, e.g. "C7". */
  chord: string;
  /** Starting tempo from the curriculum. */
  bpm: number;
  bars: number;
  /** Swung eighths: the off-beat is accepted from straight (0.5) to swung (2/3). */
  swing: boolean;
  /** Right hand: the lick. */
  lick: CompingNote[];
  /** Left hand: the comp rhythm, one bar's worth, repeated in every bar. */
  compRhythm: CompingOnset[];
  /** Left hand: the shell voicing struck at each comp onset. */
  shellMidi: number[];
}

export interface CompingGradingOptions {
  bpm?: number;
  strictness?: TimingStrictness;
  startTimestampMs?: MonotonicMs;
  /** Defaults to the pattern's own `swing`. */
  swingTolerance?: boolean;
}

export interface CompingAnswer {
  rightHandNotes: number;
  rightHandExpected: number;
  leftHandOnsets: number;
  leftHandExpectedOnsets: number;
  /** Distinct shell onsets on beats 3-4, where the comp rhythm asks for silence. */
  leftHandExtras: number;
}

export const RIGHT_HAND_VOICE = "right-hand";
export const LEFT_HAND_VOICE = "left-hand";

/**
 * P3 "Blue third over a C7 shell" (curriculum §5 P3): two bars of swung eighths,
 * the blue third (E♭) sliding into E natural over a C3 + B♭3 shell.
 */
export const BLUE_THIRD_C7: CompingPattern = {
  id: "blue-third-c7",
  label: "Blue third over a C7 shell",
  chord: "C7",
  bpm: 84,
  bars: 2,
  swing: true,
  lick: [
    { startBeat: 0, midiNote: 67, durationBeats: 0.5, finger: 2 }, // G4
    { startBeat: 0.5, midiNote: 70, durationBeats: 0.5, finger: 3 }, // Bb4
    { startBeat: 1, midiNote: 72, durationBeats: 1, finger: 4 }, // C5
    { startBeat: 2, midiNote: 70, durationBeats: 0.5, finger: 3 }, // Bb4
    { startBeat: 2.5, midiNote: 67, durationBeats: 0.5, finger: 2 }, // G4
    { startBeat: 3, midiNote: 64, durationBeats: 1, finger: 1 }, // E4
    { startBeat: 4, midiNote: 63, durationBeats: 0.5, finger: 1 }, // Eb4 — the blue third
    { startBeat: 4.5, midiNote: 64, durationBeats: 0.5, finger: 2 }, // E4
    { startBeat: 5, midiNote: 67, durationBeats: 1, finger: 3 }, // G4
    { startBeat: 6, midiNote: 60, durationBeats: 2, finger: 1 }, // C4
  ],
  // Charleston: beat 1 and the and-of-2, then silence through beats 3 and 4.
  compRhythm: [
    { beat: 0, durationBeats: 1 },
    { beat: 1.5, durationBeats: 0.5 },
  ],
  shellMidi: [48, 58], // C3 + Bb3
};

/**
 * P-A1: the same lick over F7 and G7. The right hand transposes by the interval;
 * the left-hand shell drops an octave so it stays under the lick, as the
 * variation's F2 + E♭3 spells out.
 */
export const COMPING_PATTERNS: readonly CompingPattern[] = [
  BLUE_THIRD_C7,
  transposeComping(BLUE_THIRD_C7, {
    id: "blue-third-f7",
    chord: "F7",
    semitones: 5,
    shellMidi: [41, 51], // F2 + Eb3
  }),
  transposeComping(BLUE_THIRD_C7, {
    id: "blue-third-g7",
    chord: "G7",
    semitones: 7,
    shellMidi: [43, 53], // G2 + F3
  }),
];

function transposeComping(
  pattern: CompingPattern,
  to: { id: string; chord: string; semitones: number; shellMidi: number[] },
): CompingPattern {
  return {
    ...pattern,
    id: to.id,
    label: pattern.label.replace(pattern.chord, to.chord),
    chord: to.chord,
    lick: pattern.lick.map((note) => ({ ...note, midiNote: note.midiNote + to.semitones })),
    shellMidi: [...to.shellMidi],
  };
}

/** The pattern as a Score: the right hand is the melody, the left hand the comp. */
export function compingScore(pattern: CompingPattern): Score {
  const notes: ScoreNote[] = pattern.lick.map((note) => ({
    midiNote: note.midiNote,
    startBeat: note.startBeat,
    durationBeats: note.durationBeats,
    velocity: 0.8,
    voiceId: RIGHT_HAND_VOICE,
  }));
  const rests: Score["rests"] = [];

  for (let bar = 0; bar < pattern.bars; bar += 1) {
    const barStart = bar * BEATS_PER_BAR;
    let cursor = 0;
    for (const onset of pattern.compRhythm) {
      if (onset.beat > cursor) {
        rests.push({
          startBeat: barStart + cursor,
          durationBeats: onset.beat - cursor,
          voiceId: LEFT_HAND_VOICE,
        });
      }
      for (const midiNote of pattern.shellMidi) {
        notes.push({
          midiNote,
          startBeat: barStart + onset.beat,
          durationBeats: onset.durationBeats,
          velocity: 0.7,
          voiceId: LEFT_HAND_VOICE,
        });
      }
      cursor = onset.beat + onset.durationBeats;
    }
    if (cursor < BEATS_PER_BAR) {
      rests.push({
        startBeat: barStart + cursor,
        durationBeats: BEATS_PER_BAR - cursor,
        voiceId: LEFT_HAND_VOICE,
      });
    }
  }

  return {
    id: `comping.${pattern.id}`,
    title: pattern.label,
    origin: "generated",
    tempoMap: [{ atBeat: 0, bpm: pattern.bpm }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [
      { id: RIGHT_HAND_VOICE, name: "Right hand", role: "melody" },
      { id: LEFT_HAND_VOICE, name: "Left hand", role: "harmony" },
    ],
    notes: notes.sort((left, right) => left.startBeat - right.startBeat),
    rests,
    chords: [{ symbol: pattern.chord, startBeat: 0, durationBeats: pattern.bars * BEATS_PER_BAR }],
    sections: [],
    markers: [],
  };
}

export interface CompingPatternPrompt {
  pattern: CompingPattern;
  score: Score;
  bpm: number;
  /** Notes below this belong to the left hand (hand is inferred from register). */
  splitMidi: number;
}

export function createCompingPatternExercise(
  pattern: CompingPattern,
  options: CompingGradingOptions = {},
): ExerciseDefinition<CompingPatternPrompt, CompingAnswer> {
  const bpm = options.bpm ?? pattern.bpm;
  const score = compingScore(pattern);
  const splitMidi = Math.max(...pattern.shellMidi) + 1;

  return {
    id: `comping.${pattern.id}`,
    name: pattern.label,
    capabilities: [Capability.Technique, Capability.Rhythm, Capability.Harmony],
    skillIds: ["technique.piano", COMPING_SKILL],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `${pattern.id}-${bpm}`,
      payload: { pattern, score, bpm, splitMidi },
    }),
    createRun: (prompt) => compingRun(prompt.payload, options),
  };
}

function compingRun(
  prompt: CompingPatternPrompt,
  options: CompingGradingOptions,
): ExerciseRun<CompingAnswer> {
  const { pattern, score, bpm, splitMidi } = prompt;
  const strictness = options.strictness ?? "normal";
  const startMs = (options.startTimestampMs ?? 0) as number;
  const swingTolerance = options.swingTolerance ?? pattern.swing;
  const beatMs = beatToMs(1, bpm);
  const windowBeats = timingWindowMs({ bpm, durationBeats: 0.5, strictness }) / beatMs;

  const voiceScore = (voiceId: string): Score => ({
    ...score,
    notes: score.notes.filter((note) => note.voiceId === voiceId),
  });
  const followerOptions = {
    mode: "performance" as const,
    bpm,
    strictness,
    ...(options.startTimestampMs === undefined
      ? {}
      : { startTimestampMs: options.startTimestampMs }),
  };
  const right = createScoreFollower(expectedGroups(voiceScore(RIGHT_HAND_VOICE)), followerOptions);
  const left = createScoreFollower(expectedGroups(voiceScore(LEFT_HAND_VOICE)), followerOptions);

  /**
   * Subtract the swing displacement, capped at the corridor width, so a straight
   * and a swung off-beat both land on the written position and a note past the
   * swung position is still measured from it. Anything later than the swung
   * position plus an eighth-note timing window is left alone, so an early next
   * downbeat is not dragged backwards.
   * ponytail: the window is the eighth-note one, not the target note's own, so
   * the guard is a few ms tight against a long note. Compute it per target if
   * that ever matters.
   */
  const swingAdjustedBeat = (rawBeat: number): number => {
    if (!swingTolerance) return rawBeat;
    const fraction = rawBeat - Math.floor(rawBeat);
    if (fraction < 0.5 || fraction > SWUNG_OFFBEAT + windowBeats) return rawBeat;
    return rawBeat - Math.min(fraction - 0.5, SWUNG_OFFBEAT - 0.5);
  };

  // Extras are counted per onset, not per note: one two-note shell stab in the
  // silence is one extra.
  const extraOnsetBeats = new Set<number>();
  // What the player actually did, kept unquantised: only the follower sees the
  // swing-adjusted copy.
  const input: NoteEvent[] = [];

  return {
    accept(event) {
      if (event.type !== "noteOn" && event.type !== "noteOff") return;
      input.push(event);
      const beat = swingAdjustedBeat(((event.timestamp as number) - startMs) / beatMs);
      const adjusted: NoteEvent = {
        ...event,
        timestamp: monotonicMs(startMs + beat * beatMs),
      };
      if (event.midiNote >= splitMidi) {
        right.accept(adjusted);
        return;
      }
      left.accept(adjusted);
      if (event.type === "noteOn" && inSilentBeats(beat, pattern, windowBeats)) {
        // One stab is one extra: both shell notes fall in the same eighth.
        extraOnsetBeats.add(Math.round(beat * 2) / 2);
      }
    },
    getLiveState() {
      const rightState = right.getLiveState();
      const leftState = left.getLiveState();
      const progress = (rightState.progress + leftState.progress) / 2;
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      return gradeComping(prompt, right.finish(), left.finish(), extraOnsetBeats.size, input);
    },
  };
}

/**
 * True when a left-hand onset lands in the stretch the comp rhythm leaves empty
 * (beats 3 and 4 of the Charleston), allowing a timing window on either side so
 * a late and-of-2 or an early next downbeat is not mistaken for an extra.
 */
function inSilentBeats(beat: number, pattern: CompingPattern, windowBeats: number): boolean {
  const last = pattern.compRhythm[pattern.compRhythm.length - 1];
  if (last === undefined) return false;
  const inBar = ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  return inBar > last.beat + windowBeats && inBar < BEATS_PER_BAR - windowBeats;
}

function gradeComping(
  prompt: CompingPatternPrompt,
  right: ExerciseResult<ScoreFollowerAnswer>,
  left: ExerciseResult<ScoreFollowerAnswer>,
  leftHandExtras: number,
  input: NoteEvent[],
): ExerciseResult<CompingAnswer> {
  // The follower always returns an answer from finish().
  const rightAnswer = right.answer!;
  const leftAnswer = left.answer!;
  const answer: CompingAnswer = {
    rightHandNotes: rightAnswer.matchedNotes,
    rightHandExpected: rightAnswer.expectedNotes,
    leftHandOnsets: leftAnswer.completedGroups,
    leftHandExpectedOnsets: leftAnswer.expectedGroups,
    leftHandExtras,
  };
  // The curriculum's success rule: every right-hand note in order and on time,
  // every shell onset, and nothing on beats 3 or 4. The follower only matches a
  // note inside its timing window, so "10 of 10 notes" already means on time.
  const correct =
    answer.rightHandNotes === answer.rightHandExpected &&
    answer.leftHandOnsets === answer.leftHandExpectedOnsets &&
    leftHandExtras === 0;
  const score = Math.max(0, (right.score + left.score) / 2 - 0.1 * leftHandExtras);
  const metrics: ScoringMetric[] = [...right.metrics, ...left.metrics];

  return {
    correct,
    score,
    metrics,
    feedback: [
      {
        severity: correct ? "good" : "warn",
        message: `RH ${answer.rightHandNotes}/${answer.rightHandExpected} notes · LH ${answer.leftHandOnsets}/${answer.leftHandExpectedOnsets} onsets${
          leftHandExtras === 0
            ? ""
            : ` · ${leftHandExtras} extra left-hand onset${leftHandExtras === 1 ? "" : "s"} on beats 3-4`
        }.`,
      },
    ],
    target: {
      label: `${prompt.pattern.label} · ${prompt.pattern.chord}`,
      midiNotes: prompt.score.notes.map((note) => note.midiNote),
    },
    ...(right.response === undefined && left.response === undefined
      ? {}
      : {
          response: {
            midiNotes: [...(right.response?.midiNotes ?? []), ...(left.response?.midiNotes ?? [])],
          },
        }),
    answer,
    input: [...input],
  };
}
