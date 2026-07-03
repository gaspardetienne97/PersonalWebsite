import {
  monotonicMs,
  type ExerciseDefinition,
  type ExerciseLiveState,
  type ExercisePrompt,
  type ExerciseResult,
  type Score,
  type ScoringEvent,
} from "@repo/music-core/domain";
import {
  ExerciseRegistry,
  ExerciseRunHost,
  ExerciseScheduler,
  type PipelineServices,
  type ScheduledExercise,
} from "@repo/music-core/engines/exercise";
import type { InputRouter } from "@repo/music-core/engines/input-router";
import {
  createNoteReadingExercise,
  noteReadingChoiceEvent,
  type NoteReadingOptions,
  type NoteReadingPrompt,
  type ReadingAnswerMode,
} from "@repo/music-core/exercises/note-reading";
import {
  createSightReadingExercise,
  READING_LEVELS,
  type ReadingLevelId,
  type SightReadingOptions,
  type SightReadingPrompt,
} from "@repo/music-core/exercises/sight-reading";
import { expectedGroups } from "@repo/music-core/engines/score-follower";
import type {
  ScoreFollowerAnswer,
  ScoreFollowerLiveState,
  ScoreFollowerMode,
  TimingStrictness,
  ExpectedNoteGroup,
} from "@repo/music-core/engines/score-follower";
import { notationView, type Clef } from "@repo/music-core/engines/notation";

export type ReadingDrillActivity = "flashcards" | "sight-reading";
export type ReadingDrillInstrument = NoteReadingOptions["instrument"];
export type ReadingDrillMeter = "simple" | "compound";

export interface ReadingDrillConfig {
  activity: ReadingDrillActivity;
  instrument: ReadingDrillInstrument;
  tuningId?: string;
  clefs: Clef[];
  keySignature: string;
  range: { lowestMidi: number; highestMidi: number };
  readingLevel: ReadingLevelId;
  difficulty: number;
  transposeSemitones: number;
  promptKind: NoteReadingOptions["promptKind"];
  answerMode: ReadingAnswerMode;
  mode: ScoreFollowerMode;
  bpm: number;
  strictness: TimingStrictness;
  meter: ReadingDrillMeter;
  measures: number;
}

export type ReadingDrillConfigSource = {
  activity?: unknown;
  instrument?: unknown;
  tuning?: unknown;
  tuningId?: unknown;
  clef?: unknown;
  clefs?: unknown;
  key?: unknown;
  keySignature?: unknown;
  low?: unknown;
  lowestMidi?: unknown;
  high?: unknown;
  highestMidi?: unknown;
  difficulty?: unknown;
  level?: unknown;
  readingLevel?: unknown;
  transpose?: unknown;
  transposeSemitones?: unknown;
  prompt?: unknown;
  promptKind?: unknown;
  answer?: unknown;
  answerMode?: unknown;
  mode?: unknown;
  bpm?: unknown;
  strict?: unknown;
  strictness?: unknown;
  meter?: unknown;
  measures?: unknown;
  get?: (key: string) => string | null;
};

export const READING_DRILL_DEFAULT_CONFIG: ReadingDrillConfig = {
  activity: "flashcards",
  instrument: "piano",
  clefs: ["treble"],
  keySignature: "C major",
  range: { lowestMidi: 48, highestMidi: 84 },
  readingLevel: "level-1",
  difficulty: 0.4,
  transposeSemitones: 0,
  promptKind: "single-note",
  answerMode: "choice",
  mode: "wait",
  bpm: 90,
  strictness: "normal",
  meter: "simple",
  measures: 2,
};

const READING_KEYS = new Set([
  "C major",
  "G major",
  "F major",
  "D major",
  "Bb major",
  "A minor",
  "E minor",
  "D minor",
]);

export function normalizeReadingDrillConfig(source: ReadingDrillConfigSource): ReadingDrillConfig {
  const lowestMidi = normalizeInteger(readReadingConfigValue(source, ["low", "lowestMidi"]), {
    fallback: READING_DRILL_DEFAULT_CONFIG.range.lowestMidi,
    min: 21,
    max: 108,
  });
  const highestMidi = normalizeInteger(readReadingConfigValue(source, ["high", "highestMidi"]), {
    fallback: READING_DRILL_DEFAULT_CONFIG.range.highestMidi,
    min: 21,
    max: 108,
  });
  const instrument = normalizeReadingInstrument(readReadingConfigValue(source, ["instrument"]));
  const tuningId = readReadingConfigValue(source, ["tuning", "tuningId"]);

  return {
    activity: normalizeReadingActivity(readReadingConfigValue(source, ["activity"])),
    instrument,
    ...(instrument === "piano" || !tuningId ? {} : { tuningId }),
    clefs: normalizeClefs(readReadingConfigValue(source, ["clefs", "clef"])),
    keySignature: normalizeKeySignature(readReadingConfigValue(source, ["key", "keySignature"])),
    range: normalizeRange(lowestMidi, highestMidi),
    readingLevel: normalizeReadingLevel(readReadingConfigValue(source, ["level", "readingLevel"])),
    difficulty: normalizeDecimal(readReadingConfigValue(source, ["difficulty"]), {
      fallback: READING_DRILL_DEFAULT_CONFIG.difficulty,
      min: 0,
      max: 1,
    }),
    transposeSemitones: normalizeTransposeSemitones(
      readReadingConfigValue(source, ["transpose", "transposeSemitones"]),
    ),
    promptKind: normalizePromptKind(readReadingConfigValue(source, ["prompt", "promptKind"])),
    answerMode: normalizeAnswerMode(readReadingConfigValue(source, ["answer", "answerMode"])),
    mode: normalizeSightReadingMode(readReadingConfigValue(source, ["mode"])),
    bpm: normalizeInteger(readReadingConfigValue(source, ["bpm"]), {
      fallback: READING_DRILL_DEFAULT_CONFIG.bpm,
      min: 40,
      max: 200,
    }),
    strictness: normalizeStrictness(readReadingConfigValue(source, ["strict", "strictness"])),
    meter: normalizeMeter(readReadingConfigValue(source, ["meter"])),
    measures: normalizeInteger(readReadingConfigValue(source, ["measures"]), {
      fallback: READING_DRILL_DEFAULT_CONFIG.measures,
      min: 1,
      max: 8,
    }),
  };
}

export interface FlashcardSessionOptions extends NoteReadingOptions {
  answerMode: ReadingAnswerMode;
  length?: number;
}

export interface ReadingSessionDependencies {
  router: InputRouter;
  services: PipelineServices;
  sessionId?: string;
  random?: () => number;
  now?: () => number;
  makeId?: () => string;
}

export interface ReadingQueueItem {
  targetSkillId: string;
  difficulty: number;
  reason: ScheduledExercise["reason"];
}

export interface ReadingResultView {
  targetSkillId: string;
  prompt: NoteReadingPrompt | SightReadingPrompt;
  result: ExerciseResult;
  event: ScoringEvent;
  xp: number;
}

export interface ReadingSummary {
  total: number;
  correct: number;
  accuracy: number;
  xp: number;
  results: ReadingResultView[];
}

export interface ReadingSessionState {
  status: "ready" | "flashcard" | "sight-reading" | "summary" | "abandoned";
  currentPrompt?: NoteReadingPrompt | SightReadingPrompt;
  currentIndex: number;
  total: number;
  live?: ExerciseLiveState | ScoreFollowerLiveState;
  countIn?: "ready" | "playing" | "done";
  results: ReadingResultView[];
  summary?: ReadingSummary;
  error?: string;
}

type StateListener = (state: ReadingSessionState) => void;

export class ReadingSession {
  #host: ExerciseRunHost;
  #unsubscribeRouter: () => void;
  #listeners = new Set<StateListener>();
  #status: ReadingSessionState["status"] = "ready";
  #countIn?: ReadingSessionState["countIn"];
  #queue: ReadingQueueItem[] = [];
  #currentIndex = 0;
  #currentPrompt?: NoteReadingPrompt | SightReadingPrompt;
  #results: ReadingResultView[] = [];
  #summary?: ReadingSummary;
  #error?: string;
  #answerMode?: ReadingAnswerMode;
  #exercise?: ExerciseDefinition<NoteReadingPrompt | SightReadingPrompt, unknown>;
  #sightReadingOptions?: SightReadingOptions;
  #completion?: Promise<void>;
  #finishing = false;
  #disposed = false;
  #sessionId: string;

  constructor(private readonly dependencies: ReadingSessionDependencies) {
    this.#sessionId = dependencies.sessionId ?? `reading-${Date.now()}`;
    this.#host = new ExerciseRunHost(dependencies.router, dependencies.services, {
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
      ...(dependencies.makeId === undefined ? {} : { makeId: dependencies.makeId }),
    });
    this.#unsubscribeRouter = dependencies.router.subscribe(() => this.#handleInput());
  }

  get queue(): ReadingQueueItem[] {
    return this.#queue.map((item) => ({ ...item }));
  }

  get state(): ReadingSessionState {
    return {
      status: this.#status,
      ...(this.#currentPrompt === undefined ? {} : { currentPrompt: this.#currentPrompt }),
      currentIndex: this.#currentIndex,
      total: this.#queue.length,
      ...(this.#host.liveState === undefined ? {} : { live: this.#host.liveState }),
      ...(this.#countIn === undefined ? {} : { countIn: this.#countIn }),
      results: [...this.#results],
      ...(this.#summary === undefined ? {} : { summary: this.#summary }),
      ...(this.#error === undefined ? {} : { error: this.#error }),
    };
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    listener(this.state);
    return () => this.#listeners.delete(listener);
  }

  async startFlashcards(options: FlashcardSessionOptions): Promise<void> {
    this.#assertUsable();
    if (this.#status === "flashcard" || this.#status === "sight-reading") {
      throw new Error("A reading session is already active");
    }

    this.#exercise = createNoteReadingExercise({
      random: this.dependencies.random,
      options,
    });
    const registry = new ExerciseRegistry();
    registry.register(this.#exercise);
    const scheduler = new ExerciseScheduler(
      registry,
      this.dependencies.services.skills,
      this.dependencies.services.analytics,
    );
    this.#queue = scheduler
      .buildQueue({ length: options.length ?? 10 })
      .map(({ targetSkillIds, difficulty, reason }) => ({
        targetSkillId: targetSkillIds[0]!,
        difficulty,
        reason,
      }));
    if (this.#queue.length === 0) throw new Error("No reading prompts are available");

    this.#status = "flashcard";
    this.#countIn = undefined;
    this.#answerMode = options.answerMode;
    this.#sightReadingOptions = undefined;
    this.#currentIndex = 0;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#startCurrent();
  }

  async answerChoice(token: string): Promise<void> {
    this.#assertUsable();
    if (this.#status !== "flashcard" || !isNoteReadingPrompt(this.#currentPrompt)) {
      throw new Error("No active reading flashcard");
    }
    if (this.#answerMode !== "choice") throw new Error("This session accepts played answers");

    this.dependencies.router.push(noteReadingChoiceEvent(token, this.#currentPrompt.choices));
    if (this.#completion) await this.#completion;
  }

  async retrySave(): Promise<void> {
    this.#assertUsable();
    if (!this.#currentPrompt || this.#error === undefined) {
      throw new Error("No completed reading answer is waiting to be saved");
    }
    this.#completion = this.#finishCurrent();
    await this.#completion;
  }

  async prepareSightReading(options: SightReadingOptions): Promise<void> {
    this.#assertUsable();
    if (this.#status === "flashcard" || this.#status === "sight-reading") {
      throw new Error("A reading session is already active");
    }

    const exercise = createSightReadingExercise({
      random: this.dependencies.random,
      options,
    });
    const targetSkillId = exercise.skillIds[0];
    if (!targetSkillId) throw new Error("No sight-reading skills are available");

    const prompt = exercise.generate({
      targetSkillIds: [targetSkillId],
      difficulty: options.difficulty,
      instrument: options.instrument,
    });

    this.#exercise = exercise;
    this.#sightReadingOptions = options;
    this.#queue = [{ targetSkillId, difficulty: options.difficulty, reason: "new" }];
    this.#status = "sight-reading";
    this.#countIn = "ready";
    this.#answerMode = undefined;
    this.#currentIndex = 0;
    this.#currentPrompt = prompt.payload;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
  }

  async startSightReading(startTimestampMs: number): Promise<void> {
    this.#assertUsable();
    const prompt = this.#currentPrompt;
    const options = this.#sightReadingOptions;
    const item = this.#queue[0];
    if (this.#status !== "sight-reading" || !isSightReadingPrompt(prompt) || !options || !item) {
      throw new Error("No prepared sight-reading session");
    }
    if (this.#countIn !== "ready") throw new Error("Sight-reading already started");

    const startedPrompt: SightReadingPrompt = {
      ...prompt,
      options: {
        ...prompt.options,
        startTimestampMs: monotonicMs(startTimestampMs),
      },
    };
    const exercise = fixedSightReadingExercise(
      startedPrompt,
      createSightReadingExercise({
        random: this.dependencies.random,
        options: {
          ...options,
          startTimestampMs: monotonicMs(startTimestampMs),
        },
      }),
    );
    this.#exercise = exercise;
    this.#currentPrompt = startedPrompt;
    this.#host.start({
      exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-sight-reading`,
      inputs: ["midi", "onscreen"],
      context: {
        targetSkillIds: [item.targetSkillId],
        difficulty: item.difficulty,
        instrument: options.instrument,
      },
    });
    this.#countIn = "playing";
    this.#notify();
  }

  async finishSightReading(): Promise<void> {
    this.#assertUsable();
    if (this.#status !== "sight-reading" || !isSightReadingPrompt(this.#currentPrompt)) {
      throw new Error("No active sight-reading session");
    }

    this.#completion = this.#finishCurrent();
    await this.#completion;
  }

  prepareMissedSightReading(): boolean {
    this.#assertUsable();
    if (this.#status !== "summary" || !this.#summary) return false;

    const retry = missedSightReadingRetryPrompt(this.#summary);
    if (!retry) return false;

    const exercise = fixedSightReadingExercise(
      retry.prompt,
      createSightReadingExercise({
        random: this.dependencies.random,
        options: retry.prompt.options,
      }),
    );

    this.#host.cancel();
    this.#exercise = exercise;
    this.#sightReadingOptions = retry.prompt.options;
    this.#queue = [
      {
        targetSkillId: retry.result.targetSkillId,
        difficulty: retry.queueDifficulty,
        reason: "weakness",
      },
    ];
    this.#status = "sight-reading";
    this.#countIn = "ready";
    this.#answerMode = undefined;
    this.#currentIndex = 0;
    this.#currentPrompt = retry.prompt;
    this.#results = [];
    this.#summary = undefined;
    this.#error = undefined;
    this.#notify();
    return true;
  }

  abandon(): void {
    if (this.#disposed || this.#status === "summary") return;
    this.#status = "abandoned";
    this.#currentPrompt = undefined;
    this.#countIn = undefined;
    this.#notify();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#host.dispose();
    this.#unsubscribeRouter();
    this.#listeners.clear();
  }

  #startCurrent(): void {
    const item = this.#queue[this.#currentIndex];
    if (!item || !this.#exercise || !this.#answerMode) {
      throw new Error("No reading prompt remains");
    }
    const prompt = this.#host.start({
      exercise: this.#exercise,
      sessionId: this.#sessionId,
      runId: `${this.#sessionId}-${this.#currentIndex + 1}`,
      inputs: this.#answerMode === "choice" ? ["click", "midi", "onscreen"] : ["midi", "onscreen"],
      context: {
        targetSkillIds: [item.targetSkillId],
        difficulty: item.difficulty,
      },
    });
    this.#currentPrompt = prompt.payload as NoteReadingPrompt;
    this.#notify();
  }

  #handleInput(): void {
    if (this.#status === "sight-reading") {
      this.#notify();
      return;
    }

    if (
      this.#status !== "flashcard" ||
      this.#finishing ||
      this.#currentPrompt === undefined ||
      (this.#host.liveState?.progress ?? 0) < 1
    ) {
      return;
    }

    this.#completion = this.#finishCurrent();
    void this.#completion.catch(() => undefined);
  }

  async #finishCurrent(): Promise<void> {
    const item = this.#queue[this.#currentIndex];
    const prompt = this.#currentPrompt;
    if (!item || !prompt) return;

    this.#finishing = true;
    this.#error = undefined;
    try {
      const outcome = await this.#host.finish();
      this.#results.push({
        targetSkillId: item.targetSkillId,
        prompt,
        ...outcome,
      });
      this.#currentIndex += 1;
      if (this.#currentIndex >= this.#queue.length) {
        this.#status = "summary";
        this.#currentPrompt = undefined;
        this.#countIn = undefined;
        this.#summary = summarize(this.#results);
      } else {
        this.#startCurrent();
      }
      this.#notify();
    } catch (error) {
      this.#error =
        error instanceof Error ? error.message : "The reading result could not be saved.";
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
    if (this.#disposed) throw new Error("Reading session is disposed");
  }
}

function fixedSightReadingExercise(
  prompt: SightReadingPrompt,
  exercise: ReturnType<typeof createSightReadingExercise>,
): ExerciseDefinition<SightReadingPrompt, ScoreFollowerAnswer> {
  const fixedPrompt: ExercisePrompt<SightReadingPrompt> = {
    id: `sight-reading:${prompt.score.id}`,
    payload: prompt,
    scoreId: prompt.score.id,
  };

  return {
    ...exercise,
    generate: () => fixedPrompt,
  };
}

function isSightReadingPrompt(
  prompt: NoteReadingPrompt | SightReadingPrompt | undefined,
): prompt is SightReadingPrompt {
  return prompt !== undefined && "groups" in prompt && "notation" in prompt;
}

function isNoteReadingPrompt(
  prompt: NoteReadingPrompt | SightReadingPrompt | undefined,
): prompt is NoteReadingPrompt {
  return prompt !== undefined && "choices" in prompt && "writtenPitches" in prompt;
}

function summarize(results: ReadingResultView[]): ReadingSummary {
  const correct = results.filter(({ result }) => result.correct).length;
  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? 0 : correct / results.length,
    xp: results.reduce((total, result) => total + result.xp, 0),
    results: [...results],
  };
}

interface MissedSightReadingRetry {
  result: ReadingResultView;
  prompt: SightReadingPrompt;
  queueDifficulty: number;
}

function missedSightReadingRetryPrompt(
  summary: ReadingSummary,
): MissedSightReadingRetry | undefined {
  const result = [...summary.results]
    .reverse()
    .find(
      (candidate) =>
        isSightReadingPrompt(candidate.prompt) &&
        sightReadingAnswer(candidate.result.answer)?.missedGroups.length,
    );
  if (!result || !isSightReadingPrompt(result.prompt)) return undefined;

  const answer = sightReadingAnswer(result.result.answer);
  if (!answer || answer.missedGroups.length === 0) return undefined;

  const prompt = compactSightReadingPrompt(result.prompt, answer.missedGroups);
  return {
    result,
    prompt,
    queueDifficulty: prompt.options.difficulty,
  };
}

function compactSightReadingPrompt(
  prompt: SightReadingPrompt,
  missedGroups: ExpectedNoteGroup[],
): SightReadingPrompt {
  const missedById = new Map(missedGroups.map((group) => [group.id, group]));
  const orderedGroups = prompt.groups.filter((group) => missedById.has(group.id));
  const notes: Score["notes"] = [];
  let nextStartBeat = 0;

  for (const group of orderedGroups) {
    for (const sourceIndex of group.sourceNoteIndexes) {
      const note = prompt.score.notes[sourceIndex];
      if (!note) continue;
      notes.push({
        ...note,
        startBeat: nextStartBeat,
      });
    }
    nextStartBeat += group.durationBeats;
  }

  const totalBeats = Math.max(1, nextStartBeat);
  const timeSignature = prompt.options.timeSignature;
  const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator);
  const score: Score = {
    ...prompt.score,
    id: `${prompt.score.id}:missed:${orderedGroups.map(({ id }) => id).join(",")}`,
    title: "Missed-group retry",
    notes,
    rests: undefined,
    tempoMap: [{ ...(prompt.score.tempoMap[0] ?? { bpm: prompt.options.bpm }), atBeat: 0 }],
    timeSignatures: [{ atBeat: 0, ...timeSignature }],
    sections: [
      {
        id: "missed-groups",
        name: "Missed groups",
        startBeat: 0,
        endBeat: totalBeats,
      },
    ],
    markers: orderedGroups.map((group, index) => ({
      id: `missed:${index}`,
      beat:
        index === 0
          ? 0
          : orderedGroups.slice(0, index).reduce((total, item) => total + item.durationBeats, 0),
      label: `Missed group ${index + 1}`,
      kind: "practice",
    })),
  };
  const groups = expectedGroups(score);
  const { startTimestampMs: _startTimestampMs, ...options } = prompt.options;

  return {
    score,
    notation: notationView(score),
    groups,
    ...(prompt.readingLevel === undefined ? {} : { readingLevel: prompt.readingLevel }),
    transposeSemitones: prompt.transposeSemitones,
    options: {
      ...options,
      measures: Math.max(1, Math.ceil(totalBeats / beatsPerMeasure)),
    },
  };
}

function sightReadingAnswer(answer: unknown): ScoreFollowerAnswer | undefined {
  if (!answer || typeof answer !== "object") return undefined;
  const candidate = answer as Partial<ScoreFollowerAnswer>;
  return Array.isArray(candidate.missedGroups) ? (candidate as ScoreFollowerAnswer) : undefined;
}

function normalizeReadingActivity(value: string | undefined): ReadingDrillActivity {
  return value === "sight-reading" || value === "flashcards"
    ? value
    : READING_DRILL_DEFAULT_CONFIG.activity;
}

function normalizeReadingInstrument(value: string | undefined): ReadingDrillInstrument {
  return value === "piano" || value === "guitar" || value === "ukulele"
    ? value
    : READING_DRILL_DEFAULT_CONFIG.instrument;
}

function normalizeClefs(value: string | undefined): Clef[] {
  if (!value) return [...READING_DRILL_DEFAULT_CONFIG.clefs];
  const clefs = value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter((candidate): candidate is Clef => candidate === "treble" || candidate === "bass");
  return clefs.length > 0 ? unique(clefs) : [...READING_DRILL_DEFAULT_CONFIG.clefs];
}

function normalizeKeySignature(value: string | undefined): string {
  return value && READING_KEYS.has(value) ? value : READING_DRILL_DEFAULT_CONFIG.keySignature;
}

function normalizeRange(lowestMidi: number, highestMidi: number): ReadingDrillConfig["range"] {
  if (lowestMidi <= highestMidi) return { lowestMidi, highestMidi };
  return { ...READING_DRILL_DEFAULT_CONFIG.range };
}

function normalizeReadingLevel(value: string | undefined): ReadingLevelId {
  return READING_LEVELS.some((level) => level.id === value)
    ? (value as ReadingLevelId)
    : READING_DRILL_DEFAULT_CONFIG.readingLevel;
}

function normalizeTransposeSemitones(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < -12 || parsed > 12) {
    return READING_DRILL_DEFAULT_CONFIG.transposeSemitones;
  }
  return parsed;
}

function normalizePromptKind(value: string | undefined): NoteReadingOptions["promptKind"] {
  return value === "single-note" || value === "chord"
    ? value
    : READING_DRILL_DEFAULT_CONFIG.promptKind;
}

function normalizeAnswerMode(value: string | undefined): ReadingAnswerMode {
  return value === "choice" || value === "play" ? value : READING_DRILL_DEFAULT_CONFIG.answerMode;
}

function normalizeSightReadingMode(value: string | undefined): ScoreFollowerMode {
  return value === "wait" || value === "performance" ? value : READING_DRILL_DEFAULT_CONFIG.mode;
}

function normalizeStrictness(value: string | undefined): TimingStrictness {
  return value === "relaxed" || value === "normal" || value === "strict"
    ? value
    : READING_DRILL_DEFAULT_CONFIG.strictness;
}

function normalizeMeter(value: string | undefined): ReadingDrillMeter {
  return value === "simple" || value === "compound" ? value : READING_DRILL_DEFAULT_CONFIG.meter;
}

function normalizeInteger(
  value: string | undefined,
  options: { fallback: number; min: number; max: number },
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return options.fallback;
  return Math.min(options.max, Math.max(options.min, parsed));
}

function normalizeDecimal(
  value: string | undefined,
  options: { fallback: number; min: number; max: number },
): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return options.fallback;
  return Math.min(options.max, Math.max(options.min, parsed));
}

function readReadingConfigValue(
  source: ReadingDrillConfigSource,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const queryValue = source.get?.(key);
    if (queryValue) return queryValue;
    const value = source[key as keyof ReadingDrillConfigSource];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
