import {
  type ExerciseLiveState,
  type ExerciseResult,
  type InstrumentId,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { AEROPHONE_RANGE } from "@repo/music-core/engines/aerophone-fingering";
import { ExerciseRunHost, type PipelineServices } from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  createAerophoneArticulationExercise,
  type AerophoneArticulationPrompt,
  type ArticulationStyle,
} from "@repo/music-core/exercises/aerophone-articulation";
import {
  AEROPHONE_INTERVAL_LANDING_INTERVALS,
  createAerophoneIntervalLandingExercise,
  type AerophoneIntervalLandingId,
  type AerophoneIntervalLandingPrompt,
} from "@repo/music-core/exercises/aerophone-interval-landing";
import {
  createAerophoneLongToneExercise,
  type AerophoneLongTonePrompt,
} from "@repo/music-core/exercises/aerophone-long-tone";
import {
  createAerophoneSwellExercise,
  type AerophoneSwellPrompt,
} from "@repo/music-core/exercises/aerophone-swell";
import {
  createMpcSingleStrokeExercise,
  MPC_RUDIMENT_PATTERNS,
  type MpcHitCount,
  type MpcRudimentPatternId,
  type MpcSingleStrokePrompt,
} from "@repo/music-core/exercises/mpc-single-stroke";
import {
  createScalePatternExercise,
  type ScaleMotion,
  type ScalePatternKind,
  type ScalePatternPrompt,
  type ScaleSpan,
} from "@repo/music-core/exercises/scale-pattern";
import {
  createChordChangeExercise,
  type ChordChangePrompt,
} from "@repo/music-core/exercises/chord-change";
import {
  createChordPerfectExercise,
  type ChordPerfectPrompt,
  type ChordShape,
} from "@repo/music-core/exercises/chord-perfect";
import {
  createFretboardNoteFinderExercise,
  type FretboardNoteFinderPrompt,
} from "@repo/music-core/exercises/fretboard-note-finder";
import {
  createStringSpiderExercise,
  STRING_SPIDER_PATTERNS,
  STRING_SPIDER_SPANS,
  type StringPatternKind,
  type StringSpiderSpan,
  type StringSpiderPrompt,
} from "@repo/music-core/exercises/string-spider";
import {
  createTwoHandIndependenceExercise,
  TWO_HAND_HAND_MODES,
  TWO_HAND_PATTERNS,
  type TwoHandHandMode,
  type TwoHandIndependencePrompt,
  type TwoHandPatternKind,
} from "@repo/music-core/exercises/two-hand-independence";
import {
  curatedTunings,
  type StringInstrumentId,
  type TuningProfile,
} from "@repo/music-core/engines/tunings";

export interface TechniqueScaleOptions {
  tonic: string;
  scale: ScalePatternKind;
  bpm: number;
  motion?: ScaleMotion;
  span?: ScaleSpan;
}

export const SCALE_DRILL_SCALES = [
  "major",
  "natural-minor",
  "harmonic-minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
  "melodic-minor",
  "major-pentatonic",
  "minor-pentatonic",
  "blues",
  "altered",
  "bebop-major",
  "bebop-dominant",
  "whole-tone",
  "diminished",
] as const satisfies readonly ScalePatternKind[];

export const SCALE_DRILL_MOTIONS = [
  "up",
  "down",
  "up-down",
] as const satisfies readonly ScaleMotion[];

export const SCALE_DRILL_SPANS = [
  "pentascale",
  "one-octave",
  "two-octave",
] as const satisfies readonly ScaleSpan[];

export const SCALE_DRILL_TONICS = [
  "C4",
  "Db4",
  "D4",
  "Eb4",
  "E4",
  "F4",
  "Gb4",
  "G4",
  "Ab4",
  "A4",
  "Bb4",
  "B4",
] as const;

export interface ScaleDrillConfig {
  scale: ScalePatternKind;
  tonic: (typeof SCALE_DRILL_TONICS)[number];
  instrument: Extract<InstrumentId, "piano" | "guitar" | "ukulele" | "aerophone">;
  bpm: number;
  motion: ScaleMotion;
  span: ScaleSpan;
}

export interface ScaleDrillConfigSource {
  scale?: unknown;
  tonic?: unknown;
  key?: unknown;
  instrument?: unknown;
  bpm?: unknown;
  motion?: unknown;
  span?: unknown;
  get?: (key: string) => unknown;
}

export const SCALE_DRILL_DEFAULT_CONFIG: ScaleDrillConfig = {
  scale: "major",
  tonic: "C4",
  instrument: "piano",
  bpm: 100,
  motion: "up",
  span: "one-octave",
};

export function normalizeScaleDrillConfig(source: ScaleDrillConfigSource): ScaleDrillConfig {
  const rawScale = readScaleConfigValue(source, "scale");
  const rawTonic = readScaleConfigValue(source, "tonic") ?? readScaleConfigValue(source, "key");
  const rawInstrument = readScaleConfigValue(source, "instrument");
  const rawMotion = readScaleConfigValue(source, "motion");
  const rawSpan = readScaleConfigValue(source, "span");

  return {
    scale: SCALE_DRILL_SCALES.includes(rawScale as ScalePatternKind)
      ? (rawScale as ScalePatternKind)
      : SCALE_DRILL_DEFAULT_CONFIG.scale,
    tonic: normalizeScaleTonic(rawTonic),
    instrument:
      rawInstrument === "piano" ||
      rawInstrument === "guitar" ||
      rawInstrument === "ukulele" ||
      rawInstrument === "aerophone"
        ? rawInstrument
        : SCALE_DRILL_DEFAULT_CONFIG.instrument,
    bpm: normalizeInteger(readScaleConfigValue(source, "bpm"), 100, 60, 180),
    motion: SCALE_DRILL_MOTIONS.includes(rawMotion as ScaleMotion)
      ? (rawMotion as ScaleMotion)
      : SCALE_DRILL_DEFAULT_CONFIG.motion,
    span: SCALE_DRILL_SPANS.includes(rawSpan as ScaleSpan)
      ? (rawSpan as ScaleSpan)
      : SCALE_DRILL_DEFAULT_CONFIG.span,
  };
}

export interface TechniqueLongToneOptions {
  targetMidi: number;
  holdMs: number;
  breathController?: number;
}

export const AEROPHONE_DRILL_MODES = [
  "long-tone",
  "swell",
  "articulation",
  "interval-landing",
] as const;
export const AEROPHONE_LONG_TONE_DURATIONS = [3000, 5000, 8000] as const;
export const AEROPHONE_SWELL_DURATIONS = [4000, 6000, 8000] as const;
export const AEROPHONE_ARTICULATION_STYLES = ["staccato", "legato"] as const;
export const AEROPHONE_ARTICULATION_TEMPOS = [70, 90, 110] as const;
export const AEROPHONE_INTERVAL_LANDING_OPTIONS = AEROPHONE_INTERVAL_LANDING_INTERVALS;

export type AerophoneDrillMode = (typeof AEROPHONE_DRILL_MODES)[number];

export interface AerophoneDrillConfig {
  mode: AerophoneDrillMode;
  targetMidi: number;
  durationMs: number;
  style: ArticulationStyle;
  bpm: (typeof AEROPHONE_ARTICULATION_TEMPOS)[number];
  interval: AerophoneIntervalLandingId;
}

export interface AerophoneDrillConfigSource {
  mode?: unknown;
  target?: unknown;
  targetMidi?: unknown;
  note?: unknown;
  midi?: unknown;
  duration?: unknown;
  durationMs?: unknown;
  holdMs?: unknown;
  swellMs?: unknown;
  style?: unknown;
  bpm?: unknown;
  tempo?: unknown;
  interval?: unknown;
  get?: (key: string) => unknown;
}

export const AEROPHONE_DRILL_DEFAULT_CONFIG: AerophoneDrillConfig = {
  mode: "long-tone",
  targetMidi: 67,
  durationMs: 5000,
  style: "staccato",
  bpm: 90,
  interval: "P5",
};

export function normalizeAerophoneDrillConfig(
  source: AerophoneDrillConfigSource,
): AerophoneDrillConfig {
  const mode = normalizeAerophoneMode(readAerophoneConfigValue(source, "mode"));
  return {
    mode,
    targetMidi: normalizeAerophoneTarget(
      readAerophoneConfigValue(source, "target") ??
        readAerophoneConfigValue(source, "targetMidi") ??
        readAerophoneConfigValue(source, "note") ??
        readAerophoneConfigValue(source, "midi"),
    ),
    durationMs: normalizeAerophoneDuration(
      readAerophoneConfigValue(source, "duration") ??
        readAerophoneConfigValue(source, "durationMs") ??
        readAerophoneConfigValue(source, "holdMs") ??
        readAerophoneConfigValue(source, "swellMs"),
      mode,
    ),
    style: normalizeAerophoneStyle(readAerophoneConfigValue(source, "style")),
    bpm: normalizeAerophoneTempo(
      readAerophoneConfigValue(source, "bpm") ?? readAerophoneConfigValue(source, "tempo"),
    ),
    interval: normalizeAerophoneInterval(readAerophoneConfigValue(source, "interval")),
  };
}

export interface TechniqueSwellOptions {
  targetMidi: number;
  durationMs: number;
  breathController?: number;
}

export interface TechniqueIntervalLandingOptions {
  droneMidi: number;
  interval: AerophoneIntervalLandingId;
  holdMs: number;
  breathController?: number;
}

export interface TechniqueMpcRudimentOptions {
  leftPadMidi: number;
  rightPadMidi: number;
  hitCount: MpcHitCount;
  bpm: number;
  patternId?: MpcRudimentPatternId;
}

export const MPC_RUDIMENT_PAD_OPTIONS = Array.from({ length: 16 }, (_, index) => index + 36);
export const MPC_RUDIMENT_TEMPOS = [60, 80, 100, 120] as const;
export const MPC_RUDIMENT_PATTERN_OPTIONS = MPC_RUDIMENT_PATTERNS.map((pattern) => ({
  value: pattern.id,
  label: pattern.label,
}));

export interface MpcRudimentConfig {
  patternId: MpcRudimentPatternId;
  leftPadMidi: number;
  rightPadMidi: number;
  hitCount: MpcHitCount;
  bpm: number;
}

export interface MpcRudimentConfigSource {
  pattern?: unknown;
  patternId?: unknown;
  left?: unknown;
  leftPadMidi?: unknown;
  right?: unknown;
  rightPadMidi?: unknown;
  hits?: unknown;
  hitCount?: unknown;
  bpm?: unknown;
  get?: (key: string) => unknown;
}

export const MPC_RUDIMENT_DEFAULT_CONFIG: MpcRudimentConfig = {
  patternId: "single-strokes",
  leftPadMidi: 36,
  rightPadMidi: 38,
  hitCount: 8,
  bpm: 80,
};

export function normalizeMpcRudimentConfig(source: MpcRudimentConfigSource): MpcRudimentConfig {
  const patternId = normalizeMpcRudimentPattern(
    readMpcConfigValue(source, "pattern") ?? readMpcConfigValue(source, "patternId"),
  );
  const leftPadMidi = normalizeMpcPad(
    readMpcConfigValue(source, "left") ?? readMpcConfigValue(source, "leftPadMidi"),
    MPC_RUDIMENT_DEFAULT_CONFIG.leftPadMidi,
  );
  const requestedRightPad = normalizeMpcPad(
    readMpcConfigValue(source, "right") ?? readMpcConfigValue(source, "rightPadMidi"),
    MPC_RUDIMENT_DEFAULT_CONFIG.rightPadMidi,
  );
  const rightPadMidi =
    requestedRightPad === leftPadMidi
      ? leftPadMidi === MPC_RUDIMENT_DEFAULT_CONFIG.rightPadMidi
        ? MPC_RUDIMENT_DEFAULT_CONFIG.leftPadMidi
        : MPC_RUDIMENT_DEFAULT_CONFIG.rightPadMidi
      : requestedRightPad;
  const hitCountValue = Number(
    readMpcConfigValue(source, "hits") ?? readMpcConfigValue(source, "hitCount"),
  );

  return {
    patternId,
    leftPadMidi,
    rightPadMidi,
    hitCount: hitCountValue === 16 ? 16 : MPC_RUDIMENT_DEFAULT_CONFIG.hitCount,
    bpm: normalizeMpcTempo(readMpcConfigValue(source, "bpm")),
  };
}

export interface TechniqueSpiderOptions {
  tuning: TuningProfile;
  stringNumber: number;
  startFret: number;
  bpm: number;
  pattern?: StringPatternKind;
  stringSpan?: StringSpiderSpan;
}

export type StringTechniqueMode = "spider" | "note-finder";

export interface StringTechniqueConfig {
  mode: StringTechniqueMode;
}

export interface StringTechniqueConfigSource {
  mode?: unknown;
  get?: (key: string) => unknown;
}

export const STRING_TECHNIQUE_DEFAULT_CONFIG: StringTechniqueConfig = {
  mode: "spider",
};

export function normalizeStringTechniqueConfig(
  source: StringTechniqueConfigSource,
): StringTechniqueConfig {
  const rawMode = readStringTechniqueConfigValue(source, "mode");
  return {
    mode: rawMode === "note-finder" ? "note-finder" : STRING_TECHNIQUE_DEFAULT_CONFIG.mode,
  };
}

export const SPIDER_DRILL_TEMPOS = [60, 80, 100, 120] as const;
export const SPIDER_DRILL_PATTERNS = STRING_SPIDER_PATTERNS.map((pattern) => ({
  value: pattern.id,
  label: pattern.label,
}));
export const SPIDER_DRILL_SPANS = STRING_SPIDER_SPANS.map((span) => ({
  value: span.id,
  label: span.label,
}));

export interface SpiderDrillConfig {
  instrument: StringInstrumentId;
  tuningId: string;
  stringNumber: number;
  startFret: number;
  bpm: number;
  pattern: StringPatternKind;
  stringSpan: StringSpiderSpan;
}

export interface SpiderDrillConfigSource {
  instrument?: unknown;
  tuning?: unknown;
  tuningId?: unknown;
  string?: unknown;
  stringNumber?: unknown;
  fret?: unknown;
  startFret?: unknown;
  bpm?: unknown;
  pattern?: unknown;
  span?: unknown;
  stringSpan?: unknown;
  get?: (key: string) => unknown;
}

export const SPIDER_DRILL_DEFAULT_CONFIG: SpiderDrillConfig = {
  instrument: "guitar",
  tuningId: "guitar.standard",
  stringNumber: 6,
  startFret: 5,
  bpm: 80,
  pattern: "ascending-1234",
  stringSpan: "single",
};

export function normalizeSpiderDrillConfig(
  source: SpiderDrillConfigSource,
  defaultInstrument: StringInstrumentId = SPIDER_DRILL_DEFAULT_CONFIG.instrument,
): SpiderDrillConfig {
  const requestedInstrument = readConfigValue(source, "instrument");
  const instrument =
    requestedInstrument === "guitar" || requestedInstrument === "ukulele"
      ? requestedInstrument
      : defaultInstrument;
  const tunings = curatedTunings(instrument);
  const defaultTuningId =
    instrument === SPIDER_DRILL_DEFAULT_CONFIG.instrument
      ? SPIDER_DRILL_DEFAULT_CONFIG.tuningId
      : tunings[0]!.id;
  const requestedTuning = readConfigValue(source, "tuning") ?? readConfigValue(source, "tuningId");
  const tuning = tunings.find((profile) => profile.id === requestedTuning) ?? tunings[0]!;
  const defaultStringNumber =
    instrument === SPIDER_DRILL_DEFAULT_CONFIG.instrument
      ? SPIDER_DRILL_DEFAULT_CONFIG.stringNumber
      : tuning.openStrings.length;
  const stringNumber = normalizeInteger(
    readConfigValue(source, "string") ?? readConfigValue(source, "stringNumber"),
    defaultStringNumber,
    1,
    tuning.openStrings.length,
  );
  const startFret = normalizeInteger(
    readConfigValue(source, "fret") ?? readConfigValue(source, "startFret"),
    SPIDER_DRILL_DEFAULT_CONFIG.startFret,
    0,
    Math.max(0, Math.min(9, tuning.fretCount - 3)),
  );

  return {
    instrument,
    tuningId: tunings.some((profile) => profile.id === requestedTuning)
      ? String(requestedTuning)
      : defaultTuningId,
    stringNumber,
    startFret,
    bpm: normalizeSpiderTempo(readConfigValue(source, "bpm")),
    pattern: normalizeSpiderPattern(readConfigValue(source, "pattern")),
    stringSpan: normalizeSpiderSpan(
      readConfigValue(source, "span") ?? readConfigValue(source, "stringSpan"),
    ),
  };
}

export interface TechniqueTwoHandOptions {
  tonic: string;
  bpm: number;
  bars?: number;
  patternKind?: TwoHandPatternKind;
  handMode?: TwoHandHandMode;
}

export const TWO_HAND_DRILL_TONICS = ["C4", "G4", "F4", "D4"] as const;
export const TWO_HAND_DRILL_TEMPOS = [60, 80, 100, 120] as const;
export const TWO_HAND_DRILL_PATTERNS = TWO_HAND_PATTERNS;
export const TWO_HAND_DRILL_HAND_MODES = TWO_HAND_HAND_MODES;

export interface TwoHandDrillConfig {
  tonic: (typeof TWO_HAND_DRILL_TONICS)[number];
  bpm: (typeof TWO_HAND_DRILL_TEMPOS)[number];
  patternKind: TwoHandPatternKind;
  handMode: TwoHandHandMode;
}

export interface TwoHandDrillConfigSource {
  tonic?: unknown;
  key?: unknown;
  bpm?: unknown;
  tempo?: unknown;
  pattern?: unknown;
  patternKind?: unknown;
  hand?: unknown;
  handMode?: unknown;
  get?: (key: string) => unknown;
}

export const TWO_HAND_DRILL_DEFAULT_CONFIG: TwoHandDrillConfig = {
  tonic: "C4",
  bpm: 80,
  patternKind: "lh-pulse-rh-line",
  handMode: "both",
};

export function normalizeTwoHandDrillConfig(source: TwoHandDrillConfigSource): TwoHandDrillConfig {
  return {
    tonic: normalizeTwoHandTonic(
      readTwoHandConfigValue(source, "tonic") ?? readTwoHandConfigValue(source, "key"),
    ),
    bpm: normalizeTwoHandTempo(
      readTwoHandConfigValue(source, "bpm") ?? readTwoHandConfigValue(source, "tempo"),
    ),
    patternKind: normalizeTwoHandPattern(
      readTwoHandConfigValue(source, "pattern") ?? readTwoHandConfigValue(source, "patternKind"),
    ),
    handMode: normalizeTwoHandHandMode(
      readTwoHandConfigValue(source, "hand") ?? readTwoHandConfigValue(source, "handMode"),
    ),
  };
}

export interface TechniqueChordPerfectOptions {
  tuning: TuningProfile;
  shape: ChordShape;
}

export interface TechniqueChordChangeOptions {
  tuning: TuningProfile;
  fromShape: ChordShape;
  toShape: ChordShape;
  repetitions?: number;
}

export interface TechniqueFretboardNoteFinderOptions {
  tuning: TuningProfile;
  stringNumber: number;
  fretNumber: number;
  visibleFrets?: number;
}

export interface TechniqueArticulationOptions {
  targetMidi: number;
  style: ArticulationStyle;
  count?: number;
  bpm?: number;
  breathController?: number;
}

export type TechniquePrompt =
  | ScalePatternPrompt
  | AerophoneLongTonePrompt
  | AerophoneSwellPrompt
  | AerophoneArticulationPrompt
  | AerophoneIntervalLandingPrompt
  | MpcSingleStrokePrompt
  | StringSpiderPrompt
  | FretboardNoteFinderPrompt
  | TwoHandIndependencePrompt
  | ChordPerfectPrompt
  | ChordChangePrompt;

export interface TechniqueSessionDependencies {
  router: InputRouter;
  services: PipelineServices;
  sessionId?: string;
  initialUnlockedBpm?: number;
  tempoStepBpm?: number;
  maxBpm?: number;
  now?: () => number;
  makeId?: () => string;
}

export interface TechniqueResultView {
  prompt: TechniquePrompt;
  result: ExerciseResult;
  event: ScoringEvent;
  xp: number;
}

export interface TechniqueSummary {
  total: number;
  correct: number;
  accuracy: number;
  xp: number;
  noteAccuracy: number;
  meanEvennessErrorMs: number;
  velocityConsistency: number;
  breathSteadiness: number;
  highestUnlockedBpm: number;
  nextTargetBpm: number;
  results: TechniqueResultView[];
}

export interface TechniqueSessionState {
  status: "ready" | "active" | "summary" | "abandoned";
  currentPrompt?: TechniquePrompt;
  live?: ExerciseLiveState;
  highestUnlockedBpm: number;
  nextTargetBpm: number;
  results: TechniqueResultView[];
  summary?: TechniqueSummary;
  error?: string;
}

type StateListener = (state: TechniqueSessionState) => void;

export class TechniqueSession {
  #host: ExerciseRunHost;
  #unsubscribeRouter: () => void;
  #listeners = new Set<StateListener>();
  #status: TechniqueSessionState["status"] = "ready";
  #currentPrompt?: TechniquePrompt;
  #results: TechniqueResultView[] = [];
  #summary?: TechniqueSummary;
  #error?: string;
  #completion?: Promise<void>;
  #finishing = false;
  #disposed = false;
  #sessionId: string;
  #highestUnlockedBpm: number;

  constructor(private readonly dependencies: TechniqueSessionDependencies) {
    this.#sessionId = dependencies.sessionId ?? `technique-${Date.now()}`;
    this.#highestUnlockedBpm = dependencies.initialUnlockedBpm ?? 100;
    this.#host = new ExerciseRunHost(dependencies.router, dependencies.services, {
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
      ...(dependencies.makeId === undefined ? {} : { makeId: dependencies.makeId }),
    });
    this.#unsubscribeRouter = dependencies.router.subscribe(() => this.#handleInput());
  }

  get state(): TechniqueSessionState {
    return {
      status: this.#status,
      ...(this.#currentPrompt === undefined ? {} : { currentPrompt: this.#currentPrompt }),
      ...(this.#host.liveState === undefined ? {} : { live: this.#host.liveState }),
      highestUnlockedBpm: this.#highestUnlockedBpm,
      nextTargetBpm: this.nextTargetBpm,
      results: [...this.#results],
      ...(this.#summary === undefined ? {} : { summary: this.#summary }),
      ...(this.#error === undefined ? {} : { error: this.#error }),
    };
  }

  get nextTargetBpm(): number {
    return this.#highestUnlockedBpm;
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  async startScale(options: TechniqueScaleOptions): Promise<ScalePatternPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");
    if (options.bpm > this.#highestUnlockedBpm) {
      throw new Error(
        `Clean a scale at ${this.#highestUnlockedBpm} BPM before ${options.bpm} BPM.`,
      );
    }

    const exercise = createScalePatternExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-scale-${options.bpm}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: [`technique.scale.${options.scale}`],
        difficulty: difficultyForBpm(options.bpm),
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as ScalePatternPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async startLongTone(options: TechniqueLongToneOptions): Promise<AerophoneLongTonePrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createAerophoneLongToneExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-long-tone-${options.targetMidi}`,
      inputs: ["midi"],
      context: {
        targetSkillIds: ["technique.aerophone.breath-steadiness"],
        difficulty: difficultyForHold(options.holdMs),
        instrument: "aerophone",
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as AerophoneLongTonePrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async startSwell(options: TechniqueSwellOptions): Promise<AerophoneSwellPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createAerophoneSwellExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-swell-${options.targetMidi}`,
      inputs: ["midi"],
      context: {
        targetSkillIds: ["technique.aerophone.dynamic-control"],
        difficulty: difficultyForHold(options.durationMs),
        instrument: "aerophone",
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as AerophoneSwellPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async startIntervalLanding(
    options: TechniqueIntervalLandingOptions,
  ): Promise<AerophoneIntervalLandingPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createAerophoneIntervalLandingExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-interval-landing-${options.droneMidi}-${options.interval}`,
      inputs: ["midi"],
      context: {
        targetSkillIds: ["technique.aerophone.interval-landing"],
        difficulty: difficultyForHold(options.holdMs),
        instrument: "aerophone",
      },
    });

    const currentPrompt = prompt.payload as AerophoneIntervalLandingPrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async startMpcRudiment(options: TechniqueMpcRudimentOptions): Promise<MpcSingleStrokePrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createMpcSingleStrokeExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-mpc-${options.patternId ?? "single-strokes"}-${options.leftPadMidi}-${options.rightPadMidi}-${options.hitCount}-${options.bpm}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: ["technique.mpc", "technique.mpc.single-strokes"],
        difficulty: difficultyForBpm(options.bpm),
        instrument: "mpc",
      },
    });

    this.#status = "active";
    this.#currentPrompt = prompt.payload as MpcSingleStrokePrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return this.#currentPrompt;
  }

  async startSpider(options: TechniqueSpiderOptions): Promise<StringSpiderPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createStringSpiderExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-spider-${options.tuning.id}-${options.pattern ?? "ascending-1234"}-${options.stringSpan ?? "single"}-${options.stringNumber}-${options.startFret}-${options.bpm}`,
      inputs: ["midi", "onscreen", "audio"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: difficultyForBpm(options.bpm),
        instrument: options.tuning.instrument,
      },
    });

    const currentPrompt = prompt.payload as StringSpiderPrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async startFretboardNoteFinder(
    options: TechniqueFretboardNoteFinderOptions,
  ): Promise<FretboardNoteFinderPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createFretboardNoteFinderExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-note-finder-${options.tuning.id}-${options.stringNumber}-${options.fretNumber}`,
      inputs: ["midi", "onscreen", "audio"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: 0.3,
        instrument: options.tuning.instrument,
      },
    });

    const currentPrompt = prompt.payload as FretboardNoteFinderPrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async startTwoHand(options: TechniqueTwoHandOptions): Promise<TwoHandIndependencePrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createTwoHandIndependenceExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-two-hand-${options.patternKind ?? "lh-pulse-rh-line"}-${options.handMode ?? "both"}-${options.tonic}-${options.bpm}-${options.bars ?? 2}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: difficultyForBpm(options.bpm),
        instrument: "piano",
      },
    });

    const currentPrompt = prompt.payload as TwoHandIndependencePrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async startArticulation(
    options: TechniqueArticulationOptions,
  ): Promise<AerophoneArticulationPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createAerophoneArticulationExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-articulation-${options.style}-${options.targetMidi}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: difficultyForBpm(options.bpm ?? 90),
        instrument: "aerophone",
      },
    });

    const currentPrompt = prompt.payload as AerophoneArticulationPrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async startChordPerfect(options: TechniqueChordPerfectOptions): Promise<ChordPerfectPrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createChordPerfectExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-chord-perfect-${options.shape.id}`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: 0.4,
        instrument: options.tuning.instrument,
      },
    });

    const currentPrompt = prompt.payload as ChordPerfectPrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async startChordChange(options: TechniqueChordChangeOptions): Promise<ChordChangePrompt> {
    this.#assertUsable();
    if (this.#status === "active") throw new Error("A technique session is already active");

    const exercise = createChordChangeExercise(options);
    const prompt = this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-chord-change-${options.fromShape.id}-${options.toShape.id}-${options.repetitions ?? 2}`,
      inputs: ["midi", "onscreen", "audio"],
      context: {
        targetSkillIds: exercise.skillIds,
        difficulty: 0.45,
        instrument: options.tuning.instrument,
      },
    });

    const currentPrompt = prompt.payload as ChordChangePrompt;
    this.#status = "active";
    this.#currentPrompt = currentPrompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return currentPrompt;
  }

  async retrySave(): Promise<void> {
    this.#assertUsable();
    if (!this.#currentPrompt || this.#error === undefined) {
      throw new Error("No completed technique run is waiting to be saved");
    }
    this.#completion = this.#finishCurrent();
    await this.#completion;
  }

  abandon(): void {
    if (this.#disposed || this.#status === "summary") return;
    this.#host.cancel();
    this.#status = "abandoned";
    this.#currentPrompt = undefined;
    this.#notify();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#host.dispose();
    this.#unsubscribeRouter();
    this.#listeners.clear();
  }

  #handleInput(): void {
    this.#notify();
    if (this.#status !== "active" || this.#finishing || (this.#host.liveState?.progress ?? 0) < 1) {
      return;
    }

    this.#completion = this.#finishCurrent();
    void this.#completion.catch(() => undefined);
  }

  async #finishCurrent(): Promise<void> {
    const prompt = this.#currentPrompt;
    if (!prompt) return;

    this.#finishing = true;
    this.#error = undefined;
    try {
      const outcome = await this.#host.finish();
      const resultView = {
        prompt,
        result: outcome.result,
        event: outcome.event,
        xp: outcome.xp,
      };
      this.#results.push(resultView);
      if (
        isScalePatternPrompt(prompt) &&
        outcome.result.correct &&
        prompt.bpm >= this.#highestUnlockedBpm
      ) {
        this.#highestUnlockedBpm = Math.min(
          this.dependencies.maxBpm ?? 180,
          this.#highestUnlockedBpm + (this.dependencies.tempoStepBpm ?? 10),
        );
      }
      this.#status = "summary";
      this.#currentPrompt = undefined;
      this.#summary = summarize(this.#results, this.#highestUnlockedBpm);
      this.#notify();
    } catch (error) {
      this.#error =
        error instanceof Error ? error.message : "The technique result could not be saved.";
      this.#notify();
      throw error;
    } finally {
      this.#finishing = false;
      this.#completion = undefined;
    }
  }

  #notify(): void {
    const state = this.state;
    this.#listeners.forEach((listener) => listener(state));
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Technique session is disposed");
  }
}

function summarize(results: TechniqueResultView[], highestUnlockedBpm: number): TechniqueSummary {
  const pitchMetrics = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "pitch"),
  );
  const correctPitches = pitchMetrics.filter(
    (metric) => metric.actualMidi === metric.expectedMidi,
  ).length;
  const timingErrors = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "timing").map((metric) => metric.errorMs),
  );
  const breathMetrics = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "breath"),
  );
  const velocities = results.flatMap(({ result }) =>
    result.metrics.filter((metric) => metric.kind === "velocity").map((metric) => metric.actual),
  );

  return {
    total: results.length,
    correct: results.filter(({ result }) => result.correct).length,
    accuracy:
      results.length === 0
        ? 0
        : results.filter(({ result }) => result.correct).length / results.length,
    xp: results.reduce((total, result) => total + result.xp, 0),
    noteAccuracy: pitchMetrics.length === 0 ? 0 : correctPitches / pitchMetrics.length,
    meanEvennessErrorMs:
      timingErrors.length === 0
        ? 0
        : timingErrors.reduce((sum, error) => sum + Math.abs(error), 0) / timingErrors.length,
    velocityConsistency: consistency(velocities),
    breathSteadiness:
      breathMetrics.length === 0
        ? 0
        : breathMetrics.reduce((sum, metric) => sum + metric.steadiness, 0) / breathMetrics.length,
    highestUnlockedBpm,
    nextTargetBpm: highestUnlockedBpm,
    results: [...results],
  };
}

function isScalePatternPrompt(prompt: TechniquePrompt): prompt is ScalePatternPrompt {
  return (
    "noteLabels" in prompt &&
    Array.isArray(prompt.noteLabels) &&
    "midiNotes" in prompt &&
    Array.isArray(prompt.midiNotes) &&
    "targetSpacingMs" in prompt &&
    typeof prompt.targetSpacingMs === "number" &&
    !("targetSequence" in prompt)
  );
}

function consistency(values: number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  if (variance <= Number.EPSILON) return 1;
  return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / Math.max(average, 0.01)));
}

function difficultyForBpm(bpm: number): number {
  return Math.max(0.2, Math.min(0.9, (bpm - 60) / 160));
}

function normalizeMpcPad(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return MPC_RUDIMENT_PAD_OPTIONS.includes(numeric) ? numeric : fallback;
}

function normalizeAerophoneMode(value: unknown): AerophoneDrillMode {
  return AEROPHONE_DRILL_MODES.includes(value as AerophoneDrillMode)
    ? (value as AerophoneDrillMode)
    : AEROPHONE_DRILL_DEFAULT_CONFIG.mode;
}

function normalizeAerophoneTarget(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return AEROPHONE_DRILL_DEFAULT_CONFIG.targetMidi;
  return Math.max(
    AEROPHONE_RANGE.lowestMidi,
    Math.min(AEROPHONE_RANGE.highestMidi, Math.round(numeric)),
  );
}

function normalizeAerophoneDuration(value: unknown, mode: AerophoneDrillMode): number {
  const durations = mode === "swell" ? AEROPHONE_SWELL_DURATIONS : AEROPHONE_LONG_TONE_DURATIONS;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return mode === "swell" ? 6000 : 5000;
  return durations.reduce((closest, duration) =>
    Math.abs(duration - numeric) < Math.abs(closest - numeric) ? duration : closest,
  );
}

function normalizeAerophoneStyle(value: unknown): ArticulationStyle {
  return AEROPHONE_ARTICULATION_STYLES.includes(value as ArticulationStyle)
    ? (value as ArticulationStyle)
    : AEROPHONE_DRILL_DEFAULT_CONFIG.style;
}

function normalizeAerophoneInterval(value: unknown): AerophoneIntervalLandingId {
  return AEROPHONE_INTERVAL_LANDING_INTERVALS.some((interval) => interval.id === value)
    ? (value as AerophoneIntervalLandingId)
    : AEROPHONE_DRILL_DEFAULT_CONFIG.interval;
}

function normalizeAerophoneTempo(value: unknown): AerophoneDrillConfig["bpm"] {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return AEROPHONE_DRILL_DEFAULT_CONFIG.bpm;
  return AEROPHONE_ARTICULATION_TEMPOS.reduce((closest, tempo) =>
    Math.abs(tempo - numeric) < Math.abs(closest - numeric) ? tempo : closest,
  );
}

function readAerophoneConfigValue(source: AerophoneDrillConfigSource, key: string): unknown {
  const value = source.get?.(key);
  if (value !== null && value !== undefined && value !== "") return value;
  const direct = source[key as keyof AerophoneDrillConfigSource];
  return direct === "" ? undefined : direct;
}

function normalizeMpcTempo(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MPC_RUDIMENT_DEFAULT_CONFIG.bpm;
  return MPC_RUDIMENT_TEMPOS.reduce((closest, tempo) =>
    Math.abs(tempo - numeric) < Math.abs(closest - numeric) ? tempo : closest,
  );
}

function normalizeMpcRudimentPattern(value: unknown): MpcRudimentPatternId {
  return MPC_RUDIMENT_PATTERNS.some((pattern) => pattern.id === value)
    ? (value as MpcRudimentPatternId)
    : MPC_RUDIMENT_DEFAULT_CONFIG.patternId;
}

function readMpcConfigValue(source: MpcRudimentConfigSource, key: string): unknown {
  const value = source.get?.(key);
  if (value !== null && value !== undefined && value !== "") return value;
  const direct = source[key as keyof MpcRudimentConfigSource];
  return direct === "" ? undefined : direct;
}

function normalizeSpiderTempo(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return SPIDER_DRILL_DEFAULT_CONFIG.bpm;
  return SPIDER_DRILL_TEMPOS.reduce((closest, tempo) =>
    Math.abs(tempo - numeric) < Math.abs(closest - numeric) ? tempo : closest,
  );
}

function normalizeSpiderPattern(value: unknown): StringPatternKind {
  return STRING_SPIDER_PATTERNS.some((pattern) => pattern.id === value)
    ? (value as StringPatternKind)
    : SPIDER_DRILL_DEFAULT_CONFIG.pattern;
}

function normalizeSpiderSpan(value: unknown): StringSpiderSpan {
  return STRING_SPIDER_SPANS.some((span) => span.id === value)
    ? (value as StringSpiderSpan)
    : SPIDER_DRILL_DEFAULT_CONFIG.stringSpan;
}

function normalizeTwoHandTempo(value: unknown): TwoHandDrillConfig["bpm"] {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return TWO_HAND_DRILL_DEFAULT_CONFIG.bpm;
  return TWO_HAND_DRILL_TEMPOS.reduce((closest, tempo) =>
    Math.abs(tempo - numeric) < Math.abs(closest - numeric) ? tempo : closest,
  );
}

function normalizeTwoHandTonic(value: unknown): TwoHandDrillConfig["tonic"] {
  if (typeof value !== "string") return TWO_HAND_DRILL_DEFAULT_CONFIG.tonic;
  const requested = value.match(/-?\d+$/) ? value : `${value}4`;
  return TWO_HAND_DRILL_TONICS.includes(requested as TwoHandDrillConfig["tonic"])
    ? (requested as TwoHandDrillConfig["tonic"])
    : TWO_HAND_DRILL_DEFAULT_CONFIG.tonic;
}

function normalizeTwoHandPattern(value: unknown): TwoHandPatternKind {
  return TWO_HAND_PATTERNS.some((pattern) => pattern.id === value)
    ? (value as TwoHandPatternKind)
    : TWO_HAND_DRILL_DEFAULT_CONFIG.patternKind;
}

function normalizeTwoHandHandMode(value: unknown): TwoHandHandMode {
  return TWO_HAND_HAND_MODES.some((mode) => mode.id === value)
    ? (value as TwoHandHandMode)
    : TWO_HAND_DRILL_DEFAULT_CONFIG.handMode;
}

function readTwoHandConfigValue(source: TwoHandDrillConfigSource, key: string): unknown {
  const value = source.get?.(key);
  if (value !== null && value !== undefined && value !== "") return value;
  const direct = source[key as keyof TwoHandDrillConfigSource];
  return direct === "" ? undefined : direct;
}

function readStringTechniqueConfigValue(source: StringTechniqueConfigSource, key: string): unknown {
  const value = source.get?.(key);
  if (value !== null && value !== undefined && value !== "") return value;
  const direct = source[key as keyof StringTechniqueConfigSource];
  return direct === "" ? undefined : direct;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function readScaleConfigValue(source: ScaleDrillConfigSource, key: string): unknown {
  const value = source.get?.(key);
  if (value !== null && value !== undefined && value !== "") return value;
  const direct = source[key as keyof ScaleDrillConfigSource];
  return direct === "" ? undefined : direct;
}

function normalizeScaleTonic(value: unknown): ScaleDrillConfig["tonic"] {
  if (typeof value !== "string") return SCALE_DRILL_DEFAULT_CONFIG.tonic;
  const requested = value.match(/-?\d+$/) ? value : `${value}4`;
  return SCALE_DRILL_TONICS.includes(requested as ScaleDrillConfig["tonic"])
    ? (requested as ScaleDrillConfig["tonic"])
    : SCALE_DRILL_DEFAULT_CONFIG.tonic;
}

function readConfigValue(source: SpiderDrillConfigSource, key: string): unknown {
  const value = source.get?.(key);
  if (value !== null && value !== undefined && value !== "") return value;
  const direct = source[key as keyof SpiderDrillConfigSource];
  return direct === "" ? undefined : direct;
}

function difficultyForHold(holdMs: number): number {
  return Math.max(0.2, Math.min(0.9, holdMs / 10_000));
}
