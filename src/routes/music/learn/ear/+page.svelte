<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import {
    AudioPitchSource,
    type AudioPitchState,
  } from "@repo/music-core/engines/audio-in";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    buildRepertoireEarTransfers,
    createRepertoireTransferExercise,
    EarTrainingSession,
    type EarTrainingSessionState,
    type RepertoireEarTransfer,
  } from "@repo/music-core/engines/ear-training";
  import { ExerciseRegistry, ExerciseScheduler } from "@repo/music-core/engines/exercise";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { SongLibrary } from "@repo/music-core/engines/song-library";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore, type SongRow } from "@repo/music-core/engines/store";
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
    type ScaleDegreeFreePlayChoice,
    type ScaleDegreeSetId,
  } from "@repo/music-core/exercises/scale-degree-recognition";

  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";
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
    audioSource = new AudioPitchSource(),
    audioSupported = AudioPitchSource.supported,
    library,
  }: {
    audioSource?: EarTrainingAudioSource;
    audioSupported?: boolean;
    library?: SongLibraryLike;
  } = $props();

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const registry = new ExerciseRegistry();
  registry.register(intervalRecognitionExercise);
  registry.register(chordQualityRecognitionExercise);
  registry.register(scaleDegreeRecognitionExercise);
  registry.register(melodyDictationExercise);
  const scheduler = new ExerciseScheduler(registry, skills, analytics);

  let ready = $state(false);
  let pending = $state(false);
  let answerMode = $state<EarTrainingAnswerMode>("choice");
  let feedbackMode = $state<EarTrainingFeedbackMode>("practice");
  let scaleDegreeSet = $state<ScaleDegreeSetId>("anchor");
  let droneOn = $state(false);
  let lastFreePlayDegree = $state<ScaleDegreeFreePlayChoice | undefined>();
  let status = $state("Preparing your learning history.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());
  let voiceState = $state<AudioPitchState>({ status: "idle" });
  let voiceStatus = $state("Voice mode starts the microphone for scale-degree sessions.");
  let repertoireTransfers = $state<RepertoireEarTransfer[]>([]);
  let session: EarTrainingSession | undefined;
  let sessionState = $state<EarTrainingSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let lastPlayedIndex = -1;
  let captured = false;
  const freePlayTonicMidi = 60;
  const freePlayTonicName = "C";
  const freePlayChoices = $derived(
    scaleDegreeFreePlayChoices({ tonicMidi: freePlayTonicMidi, scaleDegreeSet }),
  );

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
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

  void Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load(), loadRepertoireTransfers()])
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
    answerMode = mode;
  }

  function setFeedbackMode(mode: EarTrainingFeedbackMode): void {
    feedbackMode = mode;
  }

  function setScaleDegreeSet(next: ScaleDegreeSetId): void {
    scaleDegreeSet = next;
    lastFreePlayDegree = undefined;
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function loadRepertoireTransfers(): Promise<void> {
    const songLibrary = library ?? (browser && store ? new SongLibrary(store) : undefined);
    if (!songLibrary) return;
    const songs = await songLibrary.list();
    repertoireTransfers = songs.flatMap((song) =>
      buildRepertoireEarTransfers(song.score, {
        phraseLength: 4,
        scaleDegreeSet,
        maxPrompts: 1,
      }),
    );
  }

  async function startSession(
    drill: EarTrainingDrill | "mixed",
    overrides: { answerMode?: EarTrainingAnswerMode; length?: number } = {},
  ): Promise<void> {
    if (!ready || pending) return;
    const sessionAnswerMode = overrides.answerMode ?? answerMode;
    if (sessionAnswerMode === "voice" && drill !== "scale-degree") {
      status = "Voice mode is only available for focused scale-degree sessions.";
      return;
    }
    pending = true;
    status = "";

    try {
      if (!(await runtime.enableAudio())) {
        status = runtime.audioMessage;
        return;
      }

      stopFreePlayDrone();
      if (sessionAnswerMode !== "voice") {
        await stopVoiceMic();
      } else {
        if (!audioSupported) {
          status = "Microphone voice mode is not supported in this browser.";
          return;
        }
        await audioSource.start();
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
          scheduler,
          services: { skills, analytics, progress },
        },
        {
          drill,
          answerMode: sessionAnswerMode,
          feedbackMode,
          ...(overrides.length !== undefined ? { length: overrides.length } : {}),
          queueMode: drill === "mixed" ? "adaptive" : "balanced",
          scaleDegreeSet,
        },
      );
      unsubscribeSession = session.subscribe(handleSessionState);
      await session.start();
    } catch (error) {
      status = error instanceof Error ? error.message : "The session could not be started.";
    } finally {
      pending = false;
    }
  }

  async function startRepertoireTransfer(transfer: RepertoireEarTransfer): Promise<void> {
    registry.register(createRepertoireTransferExercise(transfer));
    await startSession("repertoire-transfer", { answerMode: "play-back", length: 1 });
  }

  function handleSessionState(next: EarTrainingSessionState): void {
    sessionState = next;
    status = next.error ?? "";
    if (next.status === "active" && next.currentIndex !== lastPlayedIndex) {
      lastPlayedIndex = next.currentIndex;
      queueMicrotask(replayCurrent);
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
    }
    if (next.status === "summary" && next.options.answerMode === "voice") {
      void stopVoiceMic();
    }
  }

  function replayCurrent(): void {
    if (!session) return;
    try {
      runtime.sound.playPattern(session.replay().playback);
    } catch (error) {
      status = error instanceof Error ? error.message : "The prompt could not be played.";
    }
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

  async function toggleFreePlayDrone(): Promise<void> {
    if (droneOn) {
      stopFreePlayDrone();
      return;
    }
    if (!(await runtime.enableAudio())) {
      status = runtime.audioMessage;
      return;
    }
    runtime.sound.startDrone(freePlayTonicMidi);
    droneOn = true;
  }

  async function playFreePlayDegree(choice: ScaleDegreeFreePlayChoice): Promise<void> {
    if (!(await runtime.enableAudio())) {
      status = runtime.audioMessage;
      return;
    }
    lastFreePlayDegree = choice;
    runtime.sound.playPattern(choice.playback);
  }

  async function playRepertoireTransfer(transfer: RepertoireEarTransfer): Promise<void> {
    if (!(await runtime.enableAudio())) {
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

  async function stopVoiceMic(): Promise<void> {
    if (voiceState.status === "running" || voiceState.status === "requesting") {
      await audioSource.stop();
    }
  }

  onDestroy(() => {
    unsubscribeSession?.();
    unsubscribeMidiState();
    stopFreePlayDrone();
    void stopVoiceMic();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Ear Training | Musicianship OS</title>
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
      tonicName={freePlayTonicName}
      {droneOn}
      freePlayChoices={freePlayChoices}
      lastFreePlayDegree={lastFreePlayDegree}
      {repertoireTransfers}
      {midiEnabled}
      {midiStatus}
      {audioSupported}
      {voiceStatus}
      onAnswerMode={setAnswerMode}
      onFeedbackMode={setFeedbackMode}
      onScaleDegreeSet={setScaleDegreeSet}
      onToggleDrone={toggleFreePlayDrone}
      onPlayFreePlayDegree={playFreePlayDegree}
      onPlayRepertoireTransfer={playRepertoireTransfer}
      onStartRepertoireTransfer={startRepertoireTransfer}
      onEnableMidi={enableMidi}
      onStart={startSession}
    />
  {:else if sessionState.status === "summary" && sessionState.summary}
    <EarTrainingSummary
      summary={sessionState.summary}
      onRepeat={repeatSession}
      onRetry={repeatSession}
    />
    <RoutineContinueAction routine={runtime.dailyRoutine} />
  {:else}
    <section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <EarTrainingSessionView
        state={sessionState}
        router={runtime.router}
        instrument={runtime.activeInstrument}
        surface={runtime.surfaceFor(runtime.activeInstrument)}
        {voiceStatus}
        onReplay={replayCurrent}
        onAnswer={answerChoice}
        onAccepted={playAccepted}
        onAbandon={abandon}
      />
      <EarTrainingSessionRail state={sessionState} streak={progress.state.streakDays} />
    </section>
  {/if}
</PracticeScreen>
