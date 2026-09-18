<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";

  import { nowUnix, unixMs, type NoteEvent } from "@repo/music-core/domain";
  import {
    AudioPitchSource,
    type AudioPitchState,
  } from "@repo/music-core/engines/audio-in";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    buildEarTrainingRetrySchedule,
    buildRepertoireReviewPlan,
    buildRepertoireReviewPlanSchedule,
    buildRepertoireReviewQueue,
    clampEarAnswerMode,
    createRepertoireTransferExercise,
    EarTrainingSession,
    earTrainingDrillHref,
    normalizeEarTrainingConfig,
    type EarTrainingDrillDefinition,
    type EarTrainingSessionState,
    type RepertoireEarTransfer,
    type RepertoireReviewItem,
    type RepertoireReviewPlan,
  } from "@repo/music-core/engines/ear-training";
  import {
    ExerciseRegistry,
    ExerciseScheduler,
    type ScheduledExercise,
  } from "@repo/music-core/engines/exercise";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { SongLibrary } from "@repo/music-core/engines/song-library";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore, type SongRow } from "@repo/music-core/engines/store";
  import { cadenceRecognitionExercise } from "@repo/music-core/exercises/cadence-recognition";
  import { chordQualityRecognitionExercise } from "@repo/music-core/exercises/chord-quality-recognition";
  import type {
    EarTrainingAnswerMode,
    EarTrainingDrill,
    EarTrainingFeedbackMode,
  } from "@repo/music-core/exercises/ear-training";
  import { intervalRecognitionExercise } from "@repo/music-core/exercises/interval-recognition";
  import { melodyDictationExercise } from "@repo/music-core/exercises/melody-dictation";
  import {
    SCALE_DEGREE_SETS,
    scaleDegreeFreePlayChoices,
    scaleDegreeRecognitionExercise,
    type ScaleDegreeLabelMode,
    type ScaleDegreeFreePlayChoice,
    type ScaleDegreeSetId,
  } from "@repo/music-core/exercises/scale-degree-recognition";

  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import DrillSummaryCard from "../../../_components/DrillSummaryCard.svelte";
  import LastRunDelta from "../../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../../_components/NextUpSuggestion.svelte";
  import PracticeStage from "../../../_components/PracticeStage.svelte";
  import StartShortcut from "../../../_components/StartShortcut.svelte";
  import PracticeDrillShell from "../../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../../_components/RoutineContinueAction.svelte";
  import SourceReadout from "../../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../../_runtime.svelte";
  import EarTrainingFreePlay from "./EarTrainingFreePlay.svelte";
  import EarTrainingSetup from "./EarTrainingSetup.svelte";
  import EarTrainingSessionRail from "./EarTrainingSessionRail.svelte";
  import EarTrainingSessionView from "./EarTrainingSessionView.svelte";
  import EarTrainingSummary from "./EarTrainingSummary.svelte";
  import RepertoireReviewPicker from "./RepertoireReviewPicker.svelte";

  // One ear drill per route. The definition (slug, session drill, answer modes,
  // which setup controls apply) comes from music-core; this component owns the
  // session lifecycle, playback gating, voice input, journal capture and URL sync
  // for every /music/learn/ear/<slug> route.

  export interface EarTrainingAudioSource {
    state: AudioPitchState;
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribeState(listener: (state: AudioPitchState) => void): () => void;
    subscribeEvents(listener: (event: NoteEvent) => void): () => void;
  }

  interface SongLibraryLike {
    list(): Promise<SongRow[]>;
  }

  let {
    definition,
    runtime = useMusicRuntime(),
    audioSource = new AudioPitchSource(),
    audioSupported = AudioPitchSource.supported,
    library,
  }: {
    definition: EarTrainingDrillDefinition;
    runtime?: MusicRuntime;
    audioSource?: EarTrainingAudioSource;
    audioSupported?: boolean;
    library?: SongLibraryLike;
  } = $props();

  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const registry = new ExerciseRegistry();
  registry.register(intervalRecognitionExercise);
  registry.register(chordQualityRecognitionExercise);
  registry.register(cadenceRecognitionExercise);
  registry.register(scaleDegreeRecognitionExercise);
  registry.register(melodyDictationExercise);
  const scheduler = new ExerciseScheduler(registry, skills, analytics);
  const initialConfig = normalizeEarTrainingConfig(
    browser ? initialDrillSearch(["bpm", "tempo"]) : {},
  );
  const initialUrlBpm = browser
    ? validBpm(new URLSearchParams(window.location.search).get("bpm"))
    : undefined;
  const routeHref = $derived(earTrainingDrillHref(definition.slug));
  const isRepertoire = $derived(definition.slug === "repertoire-transfer");
  const showFreePlay = $derived(definition.slug === "scale-degrees" || definition.slug === "mixed");

  let ready = $state(false);
  let pending = $state(false);
  // The route's definition never changes after mount; the initial read is intended.
  // svelte-ignore state_referenced_locally
  let answerMode = $state<EarTrainingAnswerMode>(
    clampEarAnswerMode(definition, initialConfig.answerMode),
  );
  let feedbackMode = $state<EarTrainingFeedbackMode>(initialConfig.feedbackMode);
  let scaleDegreeSet = $state<ScaleDegreeSetId>(initialConfig.scaleDegreeSet);
  let scaleDegreeLabelMode = $state<ScaleDegreeLabelMode>(initialConfig.scaleDegreeLabelMode);
  // svelte-ignore state_referenced_locally
  let practiceDrill = $state<EarTrainingDrill | "mixed">(definition.drill);
  // svelte-ignore state_referenced_locally
  let practiceAnswerMode = $state<EarTrainingAnswerMode>(
    clampEarAnswerMode(definition, initialConfig.answerMode),
  );
  let practiceLevel = $state<ScaleDegreeSetId>(initialConfig.scaleDegreeSet);
  let droneOn = $state(false);
  let lastFreePlayDegree = $state<ScaleDegreeFreePlayChoice | undefined>();
  let status = $state("Loading your ear-training history.");
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  let midiEnabled = $state(false);
  let midiStatus = $state("");
  let voiceState = $state<AudioPitchState>({ status: "idle" });
  let voiceStatus = $state("Voice mode starts the microphone for scale-degree sessions.");
  let reviewQueue = $state<RepertoireReviewItem[]>([]);
  let reviewPlan = $state<RepertoireReviewPlan | undefined>();
  let session: EarTrainingSession | undefined;
  let sessionState = $state<EarTrainingSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let lastPlayedIndex = -1;
  let captured = false;
  let resultsDismissed = $state(false);
  let answerReady = $state(false);
  let answerGeneration = 0;
  let promptPlaybackTimer: ReturnType<typeof setTimeout> | undefined;
  let settlePromptPlayback: ((completed: boolean) => void) | undefined;
  let practiceContextCleanup: (() => void) | undefined;
  let practiceContextRequest = 0;
  let practiceContextQueue = Promise.resolve();
  const freePlayTonicMidi = 60;
  const freePlayTonicName = "C";
  const freePlayChoices = $derived(
    scaleDegreeFreePlayChoices({ tonicMidi: freePlayTonicMidi, scaleDegreeSet }),
  );
  const normalizedConfig = $derived(
    normalizeEarTrainingConfig({
      answer: answerMode,
      feedback: feedbackMode,
      level: scaleDegreeSet,
      labels: scaleDegreeLabelMode,
    }),
  );
  const summary = $derived(sessionState?.status === "summary" ? sessionState.summary : undefined);
  const answerModeLabel = $derived(
    { choice: "Choice", "play-back": "Play-back", listen: "Pocket", "listen-along": "Listen along", voice: "Voice" }[answerMode],
  );
  const setupSummaryText = $derived(
    [
      feedbackMode === "practice" ? "Practice" : "Test",
      answerModeLabel,
      definition.usesLabels
        ? scaleDegreeLabelMode === "solfege"
          ? "Solfege labels"
          : "Degree labels"
        : undefined,
      definition.usesScaleDegreeLevel
        ? (SCALE_DEGREE_SETS.find((set) => set.id === scaleDegreeSet)?.title ?? scaleDegreeSet)
        : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const canStart = $derived(
    ready && !pending && (!isRepertoire || (reviewPlan?.recommendedOrder.length ?? 0) > 0),
  );
  const phase = $derived<"summary" | "stage" | "setup">(
    summary && !resultsDismissed
      ? "summary"
      : sessionState?.status === "active"
        ? "stage"
        : "setup",
  );
  const listeningAlong = $derived(sessionState?.options.answerMode === "listen-along");
  const selfRated = $derived(sessionState?.options.answerMode === "listen");
  const liveAnnouncement = $derived(
    phase === "summary" && summary
      ? listeningAlong ? "Listen along complete. Unscored." : `${selfRated ? "Self-rated recall" : "Session"} complete. ${summary.correct} of ${summary.total} correct.`
      : phase === "stage"
        ? status || (sessionState?.awaitingContinue ? `${sessionState.feedback[0]?.message ?? "Answer saved."} Review your answer, then Continue.` : "Ear training session started.")
        : pending
          ? "Starting ear training session."
          : status || "Ear training setup.",
  );
  let setupHeading = $state<HTMLElement | null>(null);
  let stageHeading = $state<HTMLElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let previousPhase: "summary" | "stage" | "setup" | undefined;

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
    return runtime.midi.subscribeState(() => {
      midiEnabled = runtime.midi.state.enabled;
      midiStatus = midiMessage();
    });
  });

  $effect(() => {
    registerEarContext(practiceDrill, practiceAnswerMode, practiceLevel);
  });

  $effect(() => {
    const current = phase;
    const previous = previousPhase;
    previousPhase = current;
    if (previous === undefined || previous === current) return;
    if (current === "stage") stageHeading?.focus({ preventScroll: false });
    else if (current === "summary") resultsHeading?.focus({ preventScroll: false });
    else setupHeading?.focus({ preventScroll: false });
  });

  $effect(() => {
    voiceState = audioSource.state;
    voiceStatus = voiceMessage(audioSource.state);
    const unsubscribeVoiceState = audioSource.subscribeState((state) => {
      voiceState = state;
      voiceStatus = voiceMessage(state);
    });
    const unsubscribeVoiceEvents = audioSource.subscribeEvents((event) => {
      if (answerMode === "voice" && sessionState?.status === "active") {
        runtime.router.push(event);
      }
    });

    return () => {
      unsubscribeVoiceState();
      unsubscribeVoiceEvents();
    };
  });

  void Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()])
    .then(() => loadRepertoireTransfers())
    .then(() => {
      ready = true;
      status = "Ready. Press Start, or Space.";
    })
    .catch((error) => {
      status = error instanceof Error ? error.message : "Learning history could not be loaded.";
    });

  function midiMessage(): string {
    if (runtime.midi.state.enabled) {
      return `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`;
    }
    return runtime.midi.state.error ?? "MIDI permission has not been requested.";
  }

  function voiceMessage(state: AudioPitchState): string {
    if (!audioSupported) return "Microphone voice mode is not supported in this browser.";
    if (state.status === "running") return "Microphone is listening for your sung answer.";
    if (state.status === "requesting") return "Requesting microphone access...";
    return state.message ?? "Voice mode starts the microphone for scale-degree sessions.";
  }

  function setAnswerMode(mode: EarTrainingAnswerMode): void {
    answerMode = clampEarAnswerMode(definition, normalizeEarTrainingConfig({ answer: mode }).answerMode);
    practiceAnswerMode = answerMode;
  }

  function setFeedbackMode(mode: EarTrainingFeedbackMode): void {
    feedbackMode = normalizeEarTrainingConfig({ feedback: mode }).feedbackMode;
  }

  function setScaleDegreeSet(next: ScaleDegreeSetId): void {
    scaleDegreeSet = normalizeEarTrainingConfig({ level: next }).scaleDegreeSet;
    practiceLevel = scaleDegreeSet;
    lastFreePlayDegree = undefined;
    void loadRepertoireTransfers();
  }

  function setScaleDegreeLabelMode(next: ScaleDegreeLabelMode): void {
    scaleDegreeLabelMode = normalizeEarTrainingConfig({ labels: next }).scaleDegreeLabelMode;
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function loadRepertoireTransfers(): Promise<void> {
    const songLibrary = library ?? (browser && store ? new SongLibrary(store) : undefined);
    if (!songLibrary) return;
    const songs = await songLibrary.list();
    reviewQueue = buildRepertoireReviewQueue(
      songs.map((song) => song.score),
      (skillId) => skills.getMastery(skillId),
      { phraseLength: 4, scaleDegreeSet, now: nowUnix(), limit: 6 },
    );
    reviewPlan = buildRepertoireReviewPlan(reviewQueue);
  }

  async function startSession(
    drill: EarTrainingDrill | "mixed",
    overrides: {
      answerMode?: EarTrainingAnswerMode;
      length?: number;
      scaleDegreeSet?: ScaleDegreeSetId;
      scheduled?: ScheduledExercise[];
    } = {},
  ): Promise<void> {
    if (!ready || pending) return;
    const sessionAnswerMode = overrides.answerMode ?? answerMode;
    practiceDrill = drill;
    practiceAnswerMode = sessionAnswerMode;
    practiceLevel = overrides.scaleDegreeSet ?? scaleDegreeSet;
    if (sessionAnswerMode === "voice" && drill !== "scale-degree") {
      status = "Voice mode is only available for focused scale-degree sessions.";
      return;
    }
    pending = true;
    status = "";

    try {
      await tick();
      const contextRequest = practiceContextRequest;
      await practiceContextQueue;
      if (contextRequest !== practiceContextRequest) return;
      if (!(await runtime.ensurePlaybackVoice())) {
        if (contextRequest === practiceContextRequest) status = runtime.audioMessage;
        return;
      }
      if (contextRequest !== practiceContextRequest) return;

      stopFreePlayDrone();
      if (sessionAnswerMode !== "voice") {
        await stopVoiceMic();
        if (contextRequest !== practiceContextRequest) return;
      } else {
        if (!audioSupported) {
          status = "Microphone voice mode is not supported in this browser.";
          return;
        }
        await audioSource.start();
        if (contextRequest !== practiceContextRequest) {
          await stopVoiceMic();
          return;
        }
        if (audioSource.state.status === "denied" || audioSource.state.status === "error") {
          status = voiceMessage(audioSource.state);
          return;
        }
      }
      session?.dispose();
      unsubscribeSession?.();
      lastPlayedIndex = -1;
      captured = false;
      session = new EarTrainingSession(
        {
          router: runtime.router,
          registry,
          scheduler:
            overrides.scheduled === undefined
              ? scheduler
              : ({
                  buildQueue: () => overrides.scheduled ?? [],
                } as ExerciseScheduler),
          services: { skills, analytics, progress },
        },
        {
          drill,
          answerMode: sessionAnswerMode,
          ...(sessionAnswerMode === "play-back" ? { instrument: runtime.activeInstrument } : {}),
          feedbackMode,
          scaleDegreeLabelMode,
          ...(overrides.length !== undefined ? { length: overrides.length } : {}),
          queueMode: drill === "mixed" ? "adaptive" : "balanced",
          scaleDegreeSet: overrides.scaleDegreeSet ?? scaleDegreeSet,
          deferPerformanceAnswers: isPerformanceAnswer(sessionAnswerMode),
        },
      );
      unsubscribeSession = session.subscribe(handleSessionState);
      await session.start();
      if (contextRequest !== practiceContextRequest) {
        session.dispose();
        unsubscribeSession?.();
        session = undefined;
        sessionState = undefined;
        await stopVoiceMic();
      } else {
        resultsDismissed = false;
      }
    } catch (error) {
      runtime.endPerformance();
      status = error instanceof Error ? error.message : "The session could not be started.";
    } finally {
      pending = false;
    }
  }

  /** Start on the ready stage: this drill, or the repertoire review plan on that route. */
  function startPrimary(): void {
    if (isRepertoire) void startRepertoireReviewPlan();
    else void startSession(definition.drill);
  }

  async function startRepertoireTransfer(transfer: RepertoireEarTransfer): Promise<void> {
    registry.register(createRepertoireTransferExercise(transfer));
    await startSession("repertoire-transfer", { answerMode: "play-back", length: 1 });
  }

  async function startRepertoireReviewPlan(): Promise<void> {
    if (!reviewPlan || reviewPlan.recommendedOrder.length === 0) return;
    for (const item of reviewPlan.recommendedOrder) {
      registry.register(createRepertoireTransferExercise(item.transfer));
    }
    const scheduled = buildRepertoireReviewPlanSchedule(reviewPlan);
    await startSession("repertoire-transfer", {
      answerMode: "play-back",
      length: scheduled.length,
      scheduled,
    });
  }

  function handleSessionState(next: EarTrainingSessionState): void {
    const wasAwaitingContinue = sessionState?.awaitingContinue;
    sessionState = next;
    status = next.error ?? "";
    if (next.awaitingContinue && !wasAwaitingContinue) {
      answerGeneration += 1;
      cancelPromptPlaybackWait();
      runtime.sound.stopPattern();
      runtime.endPerformance();
      answerReady = false;
    }
    if (next.status === "active" && next.currentIndex !== lastPlayedIndex) {
      runtime.sound.stopPattern();
      runtime.endPerformance();
      answerReady = false;
      answerGeneration += 1;
      cancelPromptPlaybackWait();
      const generation = answerGeneration;
      lastPlayedIndex = next.currentIndex;
      queueMicrotask(() => void startCurrentPrompt(generation));
    }
    if (next.status === "summary") {
      answerGeneration += 1;
      cancelPromptPlaybackWait();
      runtime.sound.stopPattern();
      runtime.endPerformance();
    }
    // Auto-capture the finished drill into the practice journal (once).
    if (next.status === "summary" && next.summary && !captured) {
      captured = true;
      void runtime.recordPractice({
        source: "drill",
        comparison: { variantKey: `v1:ear:${next.options.drill}:${next.options.scaleDegreeSet ?? scaleDegreeSet}:${next.options.answerMode}`, bpm: runtime.transportBpm, settings: JSON.stringify(next.options), dimensions: "drill, level, answer mode and feedback setup" },
        tags: [
          "ear",
          definition.drill,
          ...(next.options.drill !== definition.drill ? [next.options.drill] : []),
        ],
        scoringEvents: next.summary.recentResults.map((result) => result.event),
        xpEarned: next.summary.xp,
        note: next.options.answerMode === "listen-along" ? `Listen along · ${next.queue.length} prompts · Unscored` : `${next.options.answerMode === "listen" ? "Pocket recall · Self-rated" : "Ear training"} · ${next.summary.correct}/${next.summary.total} correct (${Math.round(
          next.summary.accuracy * 100,
        )}%)`,
      });
      // Practice updates mastery, so re-rank the review queue.
      void loadRepertoireTransfers();
    }
    if (next.status === "summary" && next.options.answerMode === "voice") {
      void stopVoiceMic();
    }
  }

  async function startCurrentPrompt(generation: number): Promise<void> {
    if (!session) return;
    try {
      const prompt = session.replay();
      runtime.sound.playPattern(prompt.playback, playbackVelocity(prompt.drill));
      const durationMs =
        prompt.playback.reduce(
          (end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds),
          0,
        ) * 1_000;
      if (sessionState?.options.answerMode === "listen-along") {
        // Two seconds after playback to associate the visible answer with the sound.
        if (await waitForPromptPlayback(durationMs + 2_000, generation)) session?.advanceListening();
        return;
      }
      if (!isPerformanceAnswer(sessionState?.options.answerMode)) {
        answerReady = true;
        return;
      }
      if (!(await waitForPromptPlayback(durationMs, generation))) return;
      await practiceContextQueue;
      if (generation !== answerGeneration) return;
      const clock = await runtime.beginPerformance();
      if (generation !== answerGeneration) {
        if (clock.status === "started") runtime.endPerformance();
        return;
      }
      if (clock.status === "cancelled") return;
      if (clock.status === "failed") {
        session.abandon();
        session.dispose();
        unsubscribeSession?.();
        session = undefined;
        sessionState = undefined;
        await stopVoiceMic();
        status = clock.message;
        return;
      }
      session.armCurrentAnswer();
      answerReady = true;
    } catch (error) {
      runtime.endPerformance();
      status = error instanceof Error ? error.message : "The prompt could not be started.";
    }
  }

  function replayCurrent(): void {
    if (!session) return;
    try {
      if (!sessionState?.awaitingContinue && (isPerformanceAnswer(sessionState?.options.answerMode) || sessionState?.options.answerMode === "listen-along")) {
        answerGeneration += 1;
        answerReady = false;
        cancelPromptPlaybackWait();
        session.disarmCurrentAnswer();
        runtime.endPerformance();
        runtime.sound.stopPattern();
        void startCurrentPrompt(answerGeneration);
        return;
      }
      runtime.sound.stopPattern();
      const prompt = session.replay();
      runtime.sound.playPattern(prompt.playback, playbackVelocity(prompt.drill));
    } catch (error) {
      status = error instanceof Error ? error.message : "The prompt could not be played.";
    }
  }

  function playbackVelocity(drill: EarTrainingDrill): number {
    return drill === "interval" ? 1 : 0.8;
  }

  function waitForPromptPlayback(durationMs: number, generation: number): Promise<boolean> {
    cancelPromptPlaybackWait();
    if (durationMs <= 0) return Promise.resolve(generation === answerGeneration);
    return new Promise((resolve) => {
      settlePromptPlayback = resolve;
      promptPlaybackTimer = setTimeout(() => {
        promptPlaybackTimer = undefined;
        settlePromptPlayback = undefined;
        resolve(generation === answerGeneration);
      }, durationMs);
    });
  }

  function cancelPromptPlaybackWait(): void {
    if (promptPlaybackTimer !== undefined) clearTimeout(promptPlaybackTimer);
    promptPlaybackTimer = undefined;
    settlePromptPlayback?.(false);
    settlePromptPlayback = undefined;
  }

  async function answerChoice(token: string): Promise<void> {
    try {
      if (sessionState?.options.answerMode === "listen") {
        await session?.answerListening(token === "__listen_correct");
      } else {
        await session?.answerChoice(token);
      }
    } catch (error) {
      status = error instanceof Error ? error.message : "The answer could not be saved.";
    }
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type === "noteOn") {
      runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
    }
  }

  function playTonic(midiNote: number): void {
    runtime.sound.playNote(midiNote, 0.45, undefined, 0.8);
  }

  async function toggleFreePlayDrone(): Promise<void> {
    if (droneOn) {
      stopFreePlayDrone();
      return;
    }
    if (!(await runtime.ensurePlaybackVoice())) {
      status = runtime.audioMessage;
      return;
    }
    runtime.sound.startDrone(freePlayTonicMidi);
    droneOn = true;
  }

  async function playFreePlayDegree(choice: ScaleDegreeFreePlayChoice): Promise<void> {
    if (!(await runtime.ensurePlaybackVoice())) {
      status = runtime.audioMessage;
      return;
    }
    lastFreePlayDegree = choice;
    runtime.sound.playPattern(choice.playback);
  }

  async function playRepertoireTransfer(transfer: RepertoireEarTransfer): Promise<void> {
    if (!(await runtime.ensurePlaybackVoice())) {
      status = runtime.audioMessage;
      return;
    }
    runtime.sound.playPattern(transfer.playback);
  }

  function stopFreePlayDrone(): void {
    if (!droneOn) return;
    runtime.sound.stopDrone();
    droneOn = false;
  }

  function abandon(): void {
    answerGeneration += 1;
    cancelPromptPlaybackWait();
    runtime.sound.stopPattern();
    runtime.endPerformance();
    session?.abandon();
    unsubscribeSession?.();
    void stopVoiceMic();
    session = undefined;
    sessionState = undefined;
    status = "Session ended without saving incomplete prompts.";
  }

  function changeSetup(): void {
    resultsDismissed = true;
    status = "Setup ready.";
  }

  function repeatSession(): void {
    const drill = sessionState?.options.drill ?? "mixed";
    sessionState = undefined;
    void startSession(drill);
  }

  function retryMistakes(): void {
    const retryState = sessionState;
    const scheduled = retryState?.summary
      ? buildEarTrainingRetrySchedule(retryState.summary, {
          limit: Math.min(10, Math.max(1, retryState.summary.confusions.length)),
        })
      : [];
    if (scheduled.length === 0) {
      repeatSession();
      return;
    }

    sessionState = undefined;
    void startSession("mixed", {
      answerMode: retryState?.options.answerMode,
      length: scheduled.length,
      scaleDegreeSet: "full-current",
      scheduled,
    });
  }

  function registerEarContext(
    drill: EarTrainingDrill | "mixed",
    mode: EarTrainingAnswerMode,
    level: ScaleDegreeSetId,
  ): void {
    const request = ++practiceContextRequest;
    practiceContextQueue = practiceContextQueue.then(async () => {
      if (request !== practiceContextRequest) return;
      const cleanup = await runtime.registerPracticeContext({
        owner: "ear-training",
        variantKey: `v1:ear:${drill}:${level}:${mode}`,
        defaultBpm: 96,
        initialUrlBpm,
        meter: { numerator: 4, denominator: 4 },
        onBpmChange: syncEarBpm,
      });
      if (request !== practiceContextRequest) {
        cleanup();
        return;
      }
      practiceContextCleanup?.();
      practiceContextCleanup = cleanup;
    });
  }

  function syncEarBpm(bpm: number): void {
    if (!browser) return;
    const params = new URLSearchParams(window.location.search);
    params.set("bpm", String(bpm));
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  function isPerformanceAnswer(mode: EarTrainingAnswerMode | undefined): boolean {
    return mode === "play-back" || mode === "voice";
  }

  function validBpm(value: string | null): number | undefined {
    const bpm = Number(value);
    return Number.isFinite(bpm) && bpm > 0 ? bpm : undefined;
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const params = new URLSearchParams(window.location.search);
    params.delete("drill");
    params.set("answer", clampEarAnswerMode(definition, config.answerMode));
    params.set("feedback", config.feedbackMode);
    if (definition.usesScaleDegreeLevel) params.set("level", config.scaleDegreeSet);
    else params.delete("level");
    if (definition.usesLabels) params.set("labels", config.scaleDegreeLabelMode);
    else params.delete("labels");
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  async function stopVoiceMic(): Promise<void> {
    if (voiceState.status === "running" || voiceState.status === "requesting") {
      await audioSource.stop();
    }
  }

  onDestroy(() => {
    answerGeneration += 1;
    cancelPromptPlaybackWait();
    runtime.sound.stopPattern();
    practiceContextRequest += 1;
    practiceContextCleanup?.();
    runtime.endPerformance();
    unsubscribeSession?.();
    stopFreePlayDrone();
    void stopVoiceMic();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>{definition.title} | Practice OS</title>
  <meta name="description" content={definition.description} />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title={definition.title} compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        source={answerMode === "voice" ? "audio" : runtime.activeSource}
        live={answerMode === "voice" ? voiceState.status === "running" : runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <p class="sr-only" aria-live="polite" data-testid="ear-phase-announcement">
    {liveAnnouncement}
  </p>

  {#snippet summaryPhase()}
    {#if summary}
      <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
        {#snippet heading()}
          <Card.Description>{listeningAlong ? `${sessionState?.queue.length ?? 0} prompts · Unscored` : `${selfRated ? "Self-rated recall · " : ""}${summary.correct} of ${summary.total} correct`}</Card.Description>
          <Card.Title>Session complete</Card.Title>
        {/snippet}
        {#snippet metric()}
          {#if listeningAlong}<p class="text-3xl font-semibold">Listen along complete</p>{:else}
          <p class="flex items-baseline">
            <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
              {Math.round(summary.accuracy * 100)}<span class="text-3xl text-muted-foreground">%</span>
            </span>
            <span class="sr-only">{selfRated ? " self-rated recall" : " accuracy"}</span>
          </p>
          {/if}
        {/snippet}
        {#snippet lastRunDelta()}
          {#if !listeningAlong && !selfRated}
          <LastRunDelta
            tags={["ear", definition.drill]}
            before={visitStartedAt}
          />
          {/if}
        {/snippet}
        {#snippet children()}
          {#if !listeningAlong}<EarTrainingSummary {summary} />{:else}<p class="text-sm text-muted-foreground">No answers, XP or mastery were scored.</p>{/if}
        {/snippet}
        {#snippet actions()}
          {#if summary.confusions.length > 0}
            <Button type="button" onclick={retryMistakes}>Retry mistakes</Button>
            <Button type="button" variant="outline" onclick={repeatSession}>Again</Button>
          {:else}
            <Button type="button" onclick={repeatSession}>Again</Button>
          {/if}
          <Button href="/music" variant="ghost">Return to Practice</Button>
        {/snippet}
        {#snippet routineContinue()}
          <RoutineContinueAction routine={runtime.dailyRoutine} />
        {/snippet}
        {#snippet nextUp()}
          <NextUpSuggestion
            {skills}
            {analytics}
            currentPath={routeHref}
            routine={runtime.dailyRoutine}
          />
        {/snippet}
      </DrillSummaryCard>
    {/if}
  {/snippet}

  {#snippet setupSummary()}
    {setupSummaryText}
  {/snippet}

  {#snippet setupPhase()}
    <EarTrainingSetup
      answerModes={definition.answerModes}
      showLevel={definition.usesScaleDegreeLevel}
      showLabels={definition.usesLabels}
      {answerMode}
      {feedbackMode}
      {scaleDegreeSet}
      {scaleDegreeLabelMode}
      {midiEnabled}
      {midiStatus}
      {audioSupported}
      {voiceStatus}
      onAnswerMode={setAnswerMode}
      onFeedbackMode={setFeedbackMode}
      onScaleDegreeSet={setScaleDegreeSet}
      onScaleDegreeLabelMode={setScaleDegreeLabelMode}
      onEnableMidi={enableMidi}
    />
  {/snippet}

  {#snippet readyStage()}
    <div tabindex="-1" aria-label="Ear training setup" bind:this={setupHeading} class="grid gap-6">
      <PracticeStage instrument={runtime.activeInstrument} class="grid gap-5 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · {definition.title}</p>
            <h2
              class="text-xl font-semibold tracking-tight"
              data-testid="ear-ready-heading"
            >
              {isRepertoire
                ? reviewPlan?.totalItems
                  ? `${reviewPlan.totalItems} phrase${reviewPlan.totalItems === 1 ? "" : "s"} from your songs`
                  : "Save a song to review its phrases"
                : "Ready. Press Start, or Space."}
            </h2>
            <p class="text-sm text-stage-muted">{definition.description}</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled={!canStart} onclick={startPrimary}>
              {pending ? "Starting session" : "Start"}
            </Button>
            <StartShortcut onStart={startPrimary} enabled={canStart} />
          </div>
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
      {#if showFreePlay}
        <EarTrainingFreePlay
          tonicName={freePlayTonicName}
          {droneOn}
          {scaleDegreeSet}
          choices={freePlayChoices}
          lastDegree={lastFreePlayDegree}
          disabled={!ready || pending}
          onToggleDrone={toggleFreePlayDrone}
          onPlayDegree={playFreePlayDegree}
        />
      {/if}
      {#if isRepertoire}
        <RepertoireReviewPicker
          {ready}
          {pending}
          {reviewQueue}
          {reviewPlan}
          onPlayRepertoireTransfer={playRepertoireTransfer}
          onStartRepertoireTransfer={startRepertoireTransfer}
          onStartRepertoireReviewPlan={startRepertoireReviewPlan}
        />
      {/if}
    </div>
  {/snippet}

  {#snippet stageActionRow()}
    {#if sessionState}
      <Button type="button" variant="ghost" onclick={abandon}>Stop</Button>
    {/if}
  {/snippet}

  <PracticeDrillShell
    {phase}
    startPending={pending}
    {setupSummary}
    setup={setupPhase}
    {readyStage}
    stageAction={stageActionRow}
    summary={summaryPhase}
  >
    {#snippet stage()}
      {#if sessionState}
        <div tabindex="-1" aria-label="Ear training session" bind:this={stageHeading} class="grid gap-4">
          {#if status}
            <p class="text-sm text-muted-foreground">{status}</p>
          {/if}
          <EarTrainingSessionView
            state={sessionState}
            router={runtime.router}
            instrument={runtime.activeInstrument}
            surface={runtime.surfaceFor(runtime.activeInstrument)}
            {voiceStatus}
            {answerReady}
            onReplay={replayCurrent}
            onPlayTonic={playTonic}
            onAnswer={answerChoice}
            onContinue={() => session?.continue()}
            onReveal={() => session?.revealAnswer()}
            onAccepted={playAccepted}
          />
        </div>
      {/if}
    {/snippet}
    {#snippet rail()}
      {#if sessionState}
        <EarTrainingSessionRail state={sessionState} streak={progress.state.streakDays} />
      {/if}
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
