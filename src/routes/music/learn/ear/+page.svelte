<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    EarTrainingSession,
    type EarTrainingSessionState,
  } from "@repo/music-core/engines/ear-training";
  import { ExerciseRegistry, ExerciseScheduler } from "@repo/music-core/engines/exercise";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { chordQualityRecognitionExercise } from "@repo/music-core/exercises/chord-quality-recognition";
  import type {
    EarTrainingAnswerMode,
    EarTrainingDrill,
    EarTrainingFeedbackMode,
  } from "@repo/music-core/exercises/ear-training";
  import { intervalRecognitionExercise } from "@repo/music-core/exercises/interval-recognition";
  import { scaleDegreeRecognitionExercise } from "@repo/music-core/exercises/scale-degree-recognition";

  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";
  import EarTrainingLanding from "./_components/EarTrainingLanding.svelte";
  import EarTrainingSessionRail from "./_components/EarTrainingSessionRail.svelte";
  import EarTrainingSessionView from "./_components/EarTrainingSessionView.svelte";
  import EarTrainingSummary from "./_components/EarTrainingSummary.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const registry = new ExerciseRegistry();
  registry.register(intervalRecognitionExercise);
  registry.register(chordQualityRecognitionExercise);
  registry.register(scaleDegreeRecognitionExercise);
  const scheduler = new ExerciseScheduler(registry, skills, analytics);

  let ready = $state(false);
  let pending = $state(false);
  let answerMode = $state<EarTrainingAnswerMode>("choice");
  let feedbackMode = $state<EarTrainingFeedbackMode>("practice");
  let status = $state("Preparing your learning history.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());
  let session: EarTrainingSession | undefined;
  let sessionState = $state<EarTrainingSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let lastPlayedIndex = -1;
  let captured = false;

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
  });

  void Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()])
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

  function setAnswerMode(mode: EarTrainingAnswerMode): void {
    answerMode = mode;
  }

  function setFeedbackMode(mode: EarTrainingFeedbackMode): void {
    feedbackMode = mode;
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function startSession(drill: EarTrainingDrill | "mixed"): Promise<void> {
    if (!ready || pending) return;
    pending = true;
    status = "";

    try {
      if (!(await runtime.enableAudio())) {
        status = runtime.audioMessage;
        return;
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
        { drill, answerMode, feedbackMode },
      );
      unsubscribeSession = session.subscribe(handleSessionState);
      await session.start();
    } catch (error) {
      status = error instanceof Error ? error.message : "The session could not be started.";
    } finally {
      pending = false;
    }
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
        scoringEvents: next.summary.results.map((result) => result.event),
        xpEarned: next.summary.xp,
        note: `Ear training · ${next.summary.correct}/${next.summary.total} correct (${Math.round(
          next.summary.accuracy * 100,
        )}%)`,
      });
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
      await session?.answerChoice(token);
    } catch (error) {
      status = error instanceof Error ? error.message : "The answer could not be saved.";
    }
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type === "noteOn") {
      runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
    }
  }

  function abandon(): void {
    session?.abandon();
    unsubscribeSession?.();
    session = undefined;
    sessionState = undefined;
    status = "Session ended without saving incomplete prompts.";
  }

  function repeatSession(): void {
    const drill = sessionState?.options.drill ?? "mixed";
    sessionState = undefined;
    void startSession(drill);
  }

  onDestroy(() => {
    unsubscribeSession?.();
    unsubscribeMidiState();
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
      {midiEnabled}
      {midiStatus}
      onAnswerMode={setAnswerMode}
      onFeedbackMode={setFeedbackMode}
      onEnableMidi={enableMidi}
      onStart={startSession}
    />
  {:else if sessionState.status === "summary" && sessionState.summary}
    <EarTrainingSummary
      summary={sessionState.summary}
      onRepeat={repeatSession}
      onRetry={repeatSession}
    />
  {:else}
    <section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <EarTrainingSessionView
        state={sessionState}
        router={runtime.router}
        onReplay={replayCurrent}
        onAnswer={answerChoice}
        onAccepted={playAccepted}
        onAbandon={abandon}
      />
      <EarTrainingSessionRail state={sessionState} streak={progress.state.streakDays} />
    </section>
  {/if}
</PracticeScreen>
