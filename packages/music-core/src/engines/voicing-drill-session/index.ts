/**
 * Voicing-drill session — sequences the rootless ii-V-I across all 12 keys as a
 * graded, XP-earning drill. Each chord runs through the standard
 * {@link ExerciseRunHost}, so scoring, skill mastery (`harmony.ii-v-i`), and XP
 * flow through the same pipeline as every other exercise.
 *
 * The grading mode adapts to the instrument: polyphonic instruments hold the
 * voicing as a chord; monophonic instruments (Aerophone, voice) play it as an
 * arpeggio.
 */

import {
  isMonophonic,
  VIEWABLE_INSTRUMENTS,
  type InstrumentId,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { ExerciseRunHost, type PipelineServices } from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  buildDrillVoicings,
  type DrillVariant,
  type RootlessPosition,
} from "@repo/music-core/engines/jazz";
import {
  createVoicingDrillExercise,
  VOICING_DRILL_SKILL,
  VOICE_LEADING_SKILL,
  type VoicingGradingMode,
  type VoicingTarget,
} from "@repo/music-core/exercises/voicing-drill";

import { midiToNote } from "@repo/music-core/engines/theory";

export type VoicingDrillVariant = DrillVariant | "guide-tones" | "inversions";

const pitchClass = (midi: number): number => ((midi % 12) + 12) % 12;

export interface VoicingDrillConfig {
  instrument: InstrumentId;
  variant: VoicingDrillVariant;
  key?: number;
  startPosition: RootlessPosition;
  strict: boolean;
  autoAdvance: boolean;
}

export type VoicingDrillConfigSource = {
  get?: (key: string) => string | null;
  instrument?: unknown;
  variant?: unknown;
  key?: unknown;
  start?: unknown;
  startPosition?: unknown;
  strict?: unknown;
  advance?: unknown;
  auto?: unknown;
  autoAdvance?: unknown;
};

export const VOICING_DRILL_DEFAULT_CONFIG: VoicingDrillConfig = {
  instrument: "piano",
  variant: "major",
  startPosition: "A",
  strict: false,
  autoAdvance: true,
};

export function normalizeVoicingDrillConfig(
  source: VoicingDrillConfigSource,
  defaultInstrument: InstrumentId = VOICING_DRILL_DEFAULT_CONFIG.instrument,
): VoicingDrillConfig {
  const rawInstrument = readVoicingConfigValue(source, ["instrument"]);
  const instrument = VIEWABLE_INSTRUMENTS.includes(rawInstrument as InstrumentId)
    ? (rawInstrument as InstrumentId)
    : VIEWABLE_INSTRUMENTS.includes(defaultInstrument)
      ? defaultInstrument
      : VOICING_DRILL_DEFAULT_CONFIG.instrument;
  const rawVariant = readVoicingConfigValue(source, ["variant"]);
  const variant: VoicingDrillVariant =
    rawVariant === "minor" ||
    rawVariant === "altered" ||
    rawVariant === "guide-tones" ||
    rawVariant === "inversions"
      ? rawVariant
      : "major";
  const rawStart = readVoicingConfigValue(source, ["start", "startPosition"]);
  const rawStrict = readVoicingConfigValue(source, ["strict"]);
  const rawAdvance = readVoicingConfigValue(source, ["advance", "auto", "autoAdvance"]);

  const rawKey = Number(readVoicingConfigValue(source, ["key"]));
  // Guide tones and P2 inversions are authored piano drills: they pin the
  // instrument, grade held chords, and are checked one chord at a time.
  const pianoOnly = variant === "guide-tones" || variant === "inversions";

  return {
    instrument: pianoOnly ? "piano" : instrument,
    variant,
    ...(variant === "guide-tones"
      ? { key: guideKey(rawKey) }
      : variant === "inversions"
        ? { key: rawKey === 7 ? 7 : 0 }
        : {}),
    startPosition: rawStart === "B" ? "B" : "A",
    strict:
      variant === "inversions" ||
      rawStrict === "held" ||
      rawStrict === "strict" ||
      rawStrict === "true" ||
      rawStrict === "1",
    autoAdvance:
      !pianoOnly && !(rawAdvance === "manual" || rawAdvance === "false" || rawAdvance === "0"),
  };
}

/** Pure: the ordered list of chord targets for the 12-key ii-V-I drill. */
export function buildVoicingDrillTargets(
  instrument: InstrumentId,
  opts: {
    variant?: VoicingDrillVariant;
    key?: number;
    startPosition?: RootlessPosition;
    strict?: boolean;
  } = {},
): VoicingTarget[] {
  if (opts.variant === "inversions") return buildClosestChordsTargets(opts.key === 7 ? 7 : 0);
  if (opts.variant === "guide-tones") {
    if (instrument !== "piano") throw new Error("Guide tones require piano.");
    const key = guideKey(opts.key);
    return [
      { root: 7, suffix: "7", pcs: [11, 5], from: [53, 60], midi: [53, 59] },
      { root: 0, suffix: "maj7", pcs: [4, 11], from: [53, 59], midi: [52, 59] },
    ].map((step, index) => ({
      id: `guide-tones-${key}-${index}`,
      symbol: `${midiToNote(60 + pitchClass(step.root + key), true).replace(/\d+$/, "")}${step.suffix}`,
      mode: "chord",
      skillIds: [VOICE_LEADING_SKILL],
      expectedPitchClasses: step.pcs.map((pc) => pitchClass(pc + key)),
      displayMidi: step.midi.map((note) => note + key),
      voiceLeading: {
        fromMidi: step.from.map((note) => note + key) as [number, number],
        register: [48 + key, 71 + key],
      },
    }));
  }
  const mode: VoicingGradingMode = isMonophonic(instrument) ? "arpeggio" : "chord";

  return buildDrillVoicings(opts.variant ?? "major", opts.startPosition ?? "A").flatMap((step) =>
    step.chords.map((chord) => {
      const notes = chord.bassMidi === undefined ? chord.midi : [chord.bassMidi, ...chord.midi];
      const pcs = [...new Set(notes.map(pitchClass))];
      return {
        id: `${step.key}-${chord.symbol}`,
        skillIds: [
          VOICING_DRILL_SKILL,
          `${VOICING_DRILL_SKILL}.voicings.${opts.variant ?? "major"}`,
        ],
        symbol: chord.symbol,
        // Arpeggio is graded in ascending pitch order; chord order is irrelevant.
        expectedPitchClasses:
          mode === "arpeggio" ? [...notes].sort((a, b) => a - b).map(pitchClass) : pcs,
        expectedBassPc: chord.bassMidi === undefined ? undefined : pitchClass(chord.bassMidi),
        mode,
        // Held grading only applies to polyphonic (chord) targets.
        strict: mode === "chord" ? opts.strict : undefined,
        displayMidi: [...notes].sort((a, b) => a - b),
      } satisfies VoicingTarget;
    }),
  );
}

/**
 * P2 "Closest chords: I IV V I" (curriculum §5 P2), tabled in C major: one chord
 * per bar held for four beats, the right hand taking the inversion that moves
 * least while the left hand plays the root. Bar 1 opens the sequence; bars 2-4
 * each carry the previous bar's right hand as the voice-leading origin.
 */
const CLOSEST_CHORDS: readonly { bassMidi: number; rightMidi: number[] }[] = [
  { bassMidi: 48, rightMidi: [60, 64, 67] }, // C   · root     · C3
  { bassMidi: 41, rightMidi: [60, 65, 69] }, // F/C · second   · F2
  { bassMidi: 43, rightMidi: [59, 62, 67] }, // G/B · first    · G2
  { bassMidi: 48, rightMidi: [60, 64, 67] }, // C   · root     · C3
] as const;

/** One hand, G3 to C5: wide enough for every equally economical alternative. */
const CLOSEST_CHORDS_REGISTER: [number, number] = [55, 72];
/** Below this, a note is the left-hand root, not a voice. */
const CLOSEST_CHORDS_SPLIT_MIDI = 54;
/** A voicing within this much of the best total movement still counts as minimal. */
const CLOSEST_CHORDS_TOLERANCE_SEMITONES = 2;
/** E3 — the top of the octave the tabled left-hand roots (F2 to C3) live in. */
const CLOSEST_CHORDS_HIGHEST_ROOT = 52;

function buildClosestChordsTargets(key: 0 | 7): VoicingTarget[] {
  // G major takes the right hand up a fifth; the left-hand root follows and is
  // folded back down an octave when it leaves the bass register, so the roots
  // stay G2 C3 D3 G2 rather than climbing into the right hand.
  const shift = key;
  return CLOSEST_CHORDS.map(({ bassMidi, rightMidi }, index) => {
    const bass = foldBassRoot(bassMidi + shift);
    const right = rightMidi.map((midi) => midi + shift);
    const previous = CLOSEST_CHORDS[index - 1]?.rightMidi.map((midi) => midi + shift);
    return {
      id: `closest-chords-${key}-${index}`,
      skillIds: [VOICING_DRILL_SKILL, VOICE_LEADING_SKILL],
      symbol: inversionSymbol(bass, right[0]!),
      mode: "chord",
      strict: true,
      expectedPitchClasses: [...new Set(right.map(pitchClass))],
      expectedBassPc: pitchClass(right[0]!),
      bassSplitMidi: CLOSEST_CHORDS_SPLIT_MIDI + shift,
      requireInversion: true,
      requiredRootPc: pitchClass(bass),
      displayMidi: [bass, ...right],
      ...(previous === undefined
        ? {}
        : {
            voiceLeading: {
              fromMidi: previous,
              register: CLOSEST_CHORDS_REGISTER.map((midi) => midi + shift) as [number, number],
              toleranceSemitones: CLOSEST_CHORDS_TOLERANCE_SEMITONES,
            },
          }),
    } satisfies VoicingTarget;
  });
}

/** Keep the left-hand root inside the F2-E3 octave the table uses. */
function foldBassRoot(midi: number): number {
  return midi > CLOSEST_CHORDS_HIGHEST_ROOT ? midi - 12 : midi;
}

/** "C", or "F/C" when the bass of the voicing is not the root. */
function inversionSymbol(rootMidi: number, voicingBassMidi: number): string {
  const name = (midi: number) => midiToNote(midi).replace(/-?\d+$/, "");
  return pitchClass(rootMidi) === pitchClass(voicingBassMidi)
    ? name(rootMidi)
    : `${name(rootMidi)}/${name(voicingBassMidi)}`;
}

export interface VoicingDrillStepResult {
  target: VoicingTarget;
  event: ScoringEvent;
  xp: number;
  correct: boolean;
  score: number;
}

export interface VoicingDrillState {
  status: "idle" | "active" | "summary";
  index: number;
  total: number;
  current?: VoicingTarget;
  results: VoicingDrillStepResult[];
  xp: number;
  accuracy: number;
}

export interface VoicingDrillDependencies {
  router: InputRouter;
  services: PipelineServices;
  instrument: InstrumentId;
  variant?: VoicingDrillVariant;
  key?: number;
  startPosition?: RootlessPosition;
  /** Held-together (strict) chord grading; defaults to lenient. */
  strict?: boolean;
  assistance?: "guided" | "independent";
  sessionId?: string;
  now?: () => number;
  makeId?: () => string;
}

type StateListener = (state: VoicingDrillState) => void;

export class VoicingDrillSession {
  readonly #host: ExerciseRunHost;
  readonly #targets: VoicingTarget[];
  readonly #deps: VoicingDrillDependencies;
  readonly #sessionId: string;
  readonly #listeners = new Set<StateListener>();
  #index = 0;
  #status: VoicingDrillState["status"] = "idle";
  #results: VoicingDrillStepResult[] = [];
  #runSeq = 0;
  #disposed = false;

  constructor(deps: VoicingDrillDependencies) {
    this.#deps = deps;
    this.#targets = buildVoicingDrillTargets(deps.instrument, {
      variant: deps.variant,
      startPosition: deps.startPosition,
      strict: deps.strict,
      key: deps.key,
    });
    this.#sessionId = deps.sessionId ?? `voicing-drill-${this.#targets.length}`;
    this.#host = new ExerciseRunHost(deps.router, deps.services, {
      now: deps.now,
      makeId: deps.makeId,
    });
  }

  get state(): VoicingDrillState {
    const completed = this.#results.length;
    return {
      status: this.#status,
      index: this.#index,
      total: this.#targets.length,
      current: this.#status === "active" ? this.#targets[this.#index] : undefined,
      results: [...this.#results],
      xp: this.#results.reduce((total, result) => total + result.xp, 0),
      accuracy:
        completed === 0 ? 0 : this.#results.reduce((sum, r) => sum + r.score, 0) / completed,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  /** Live 0-1 progress of the current chord (notes matched so far). */
  get liveProgress(): number {
    return this.#host.liveState?.progress ?? 0;
  }

  get selectionFeedback(): string {
    return this.#host.liveState?.feedback[0]?.message ?? "";
  }

  start(): void {
    if (this.#disposed) throw new Error("Voicing drill is disposed.");
    if (this.#status !== "idle") throw new Error("Voicing drill has already started.");
    if (this.#targets.length === 0) throw new Error("Voicing drill has no targets.");
    this.#status = "active";
    this.#index = 0;
    this.#results = [];
    this.#beginCurrent();
    this.#emit();
  }

  /** Grade the current chord and advance. Returns the step result. */
  async submit(): Promise<VoicingDrillStepResult> {
    if (this.#disposed || this.#status !== "active")
      throw new Error("Voicing drill is not active.");
    const target = this.#targets[this.#index]!;
    const outcome = await this.#host.finish({ reason: "completed" });
    const step: VoicingDrillStepResult = {
      target,
      event: outcome.event,
      xp: outcome.xp,
      correct: outcome.result.correct,
      score: outcome.result.score,
    };
    // An already submitted answer may finish persisting after navigation.
    if (this.#disposed) return step;
    this.#results.push(step);

    if (this.#index < this.#targets.length - 1) {
      this.#index += 1;
      const next = this.#targets[this.#index]!;
      const movement = outcome.event.metrics.find((metric) => metric.kind === "voice-leading");
      if (next.voiceLeading && step.correct && movement) {
        next.voiceLeading.fromMidi = [...movement.actualMidi];
      }
      this.#beginCurrent();
    } else {
      this.#status = "summary";
    }
    this.#emit();
    return step;
  }

  dispose(): void {
    this.#disposed = true;
    this.#host.dispose();
    this.#listeners.clear();
  }

  #beginCurrent(): void {
    const target = this.#targets[this.#index]!;
    this.#host.start({
      exercise: createVoicingDrillExercise(target),
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}.${this.#runSeq++}`,
      context: {
        instrument: this.#deps.instrument,
        targetSkillIds: target.skillIds ?? [VOICING_DRILL_SKILL],
        metadata: {
          assistance: target.voiceLeading ? "independent" : (this.#deps.assistance ?? "guided"),
        },
      },
    });
  }

  #emit(): void {
    const state = this.state;
    this.#listeners.forEach((listener) => listener(state));
  }
}

function readVoicingConfigValue(
  source: VoicingDrillConfigSource,
  keys: string[],
): string | undefined {
  if (typeof source.get === "function") {
    for (const key of keys) {
      const value = source.get(key);
      if (value !== null) return value;
    }
    return undefined;
  }
  for (const key of keys) {
    const value = source[key as keyof VoicingDrillConfigSource];
    if (value !== undefined && value !== null) return String(value);
  }
  return undefined;
}

function guideKey(value: number | undefined): number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value < 12 ? value : 0;
}
