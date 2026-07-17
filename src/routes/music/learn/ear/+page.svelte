<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";

  import { nowUnix, type NoteEvent } from "@repo/music-core/domain";
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
    createRepertoireTransferExercise,
    EarTrainingSession,
    normalizeEarTrainingConfig,
    type EarTrainingSessionState,
    type EarTrainingConfigDrill,
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
    scaleDegreeFreePlayChoices,
    scaleDegreeRecognitionExercise,
    type ScaleDegreeLabelMode,
    type ScaleDegreeFreePlayChoice,
    type ScaleDegreeSetId,
  } from "@repo/music-core/exercises/scale-degree-recognition";

  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";
  import EarTrainingLanding from "./_components/EarTrainingLanding.svelte";
  import EarTrainingSessionRail from "./_components/EarTrainingSessionRail.svelte";
  import EarTrainingSessionView from "./_components/EarTrainingSessionView.svelte";
  import EarTrainingSummary from "./_components/EarTrainingSummary.svelte";

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
    runtime = useMusicRuntime(),
    audioSource = new AudioPitchSource(),
    audioSupported = AudioPitchSource.supported,
    library,
  }: {
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

  let ready = $state(false);
  let pending = $state(false);
  let preferredDrill = $state<EarTrainingConfigDrill>(initialConfig.drill);
  let answerMode = $state<EarTrainingAnswerMode>(initialConfig.answerMode);
  let feedbackMode = $state<EarTrainingFeedbackMode>(initialConfig.feedbackMode);
  let scaleDegreeSet = $state<ScaleDegreeSetId>(initialConfig.scaleDegreeSet);
  let scaleDegreeLabelMode = $state<ScaleDegreeLabelMode>(initialConfig.scaleDegreeLabelMode);
  let practiceDrill = $state<EarTrainingDrill | "mixed">(initialConfig.drill);
  let practiceAnswerMode = $state<EarTrainingAnswerMode>(initialConfig.answerMode);
  let practiceLevel = $state<ScaleDegreeSetId>(initialConfig.scaleDegreeSet);
  let droneOn = $state(false);
  let lastFreePlayDegree = $state<ScaleDegreeFreePlayChoice | undefined>();
  let status = $state("Preparing your learning history.");
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
      drill: preferredDrill,
      answer: answerMode,
      feedback: feedbackMode,
      level: scaleDegreeSet,
      labels: scaleDegreeLabelMode,
    }),
  );

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
      status = "Ready for a ten-prompt session.";
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
    answerMode = normalizeEarTrainingConfig({ answer: mode }).answerMode;
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
    if (drill !== "repertoire-transfer") {
      preferredDrill = drill;
    }
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
      }
    } catch (error) {
      runtime.endPerformance();
      status = error instanceof Error ? error.message : "The session could not be started.";
    } finally {
      pending = false;
    }
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
    sessionState = next;
    status = next.error ?? "";
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
        tags: ["ear", next.options.drill],
        scoringEvents: next.summary.recentResults.map((result) => result.event),
        xpEarned: next.summary.xp,
        note: `Ear training · ${next.summary.correct}/${next.summary.total} correct (${Math.round(
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
      if (!isPerformanceAnswer(sessionState?.options.answerMode)) {
        answerReady = true;
        return;
      }
      const durationMs =
        prompt.playback.reduce(
          (end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds),
          0,
        ) * 1_000;
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
      if (isPerformanceAnswer(sessionState?.options.answerMode)) {
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
    params.set("drill", config.drill);
    params.set("answer", config.answerMode);
    params.set("feedback", config.feedbackMode);
    params.set("level", config.scaleDegreeSet);
    params.set("labels", config.scaleDegreeLabelMode);
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
  <title>Ear Training | Practice OS</title>
  <meta
    name="description"
    content="Practice intervals, chord qualities, and functional scale degrees by ear."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Ear Training"
    subtitle="Focus mode — build reliable recognition through short sessions and mixed review."
  >
    {#snippet controls()}
      <SourceReadout
        label="Active input"
        device={runtime.activeSource === "midi" ? "MIDI" : "On-screen"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  {#if status}
    <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
  {/if}

  {#if !sessionState}
    <EarTrainingLanding
      {ready}
      {pending}
      {answerMode}
      {feedbackMode}
      {scaleDegreeSet}
      {scaleDegreeLabelMode}
      tonicName={freePlayTonicName}
      {droneOn}
      freePlayChoices={freePlayChoices}
      lastFreePlayDegree={lastFreePlayDegree}
      {reviewQueue}
      {reviewPlan}
      {midiEnabled}
      {midiStatus}
      {audioSupported}
      {voiceStatus}
      onAnswerMode={setAnswerMode}
      onFeedbackMode={setFeedbackMode}
      onScaleDegreeSet={setScaleDegreeSet}
      onScaleDegreeLabelMode={setScaleDegreeLabelMode}
      onToggleDrone={toggleFreePlayDrone}
      onPlayFreePlayDegree={playFreePlayDegree}
      onPlayRepertoireTransfer={playRepertoireTransfer}
      onStartRepertoireTransfer={startRepertoireTransfer}
      onStartRepertoireReviewPlan={startRepertoireReviewPlan}
      onEnableMidi={enableMidi}
      onStart={startSession}
    />
  {:else if sessionState.status === "summary" && sessionState.summary}
    <EarTrainingSummary
      summary={sessionState.summary}
      onRepeat={repeatSession}
      onRetry={retryMistakes}
    />
    <RoutineContinueAction routine={runtime.dailyRoutine} />
  {:else}
    <PracticeDrillShell>
      {#snippet stage()}
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
          onAccepted={playAccepted}
          onAbandon={abandon}
        />
      {/snippet}
      {#snippet rail()}
        <EarTrainingSessionRail state={sessionState} streak={progress.state.streakDays} />
      {/snippet}
    </PracticeDrillShell>
  {/if}
</PracticeScreen>
