<script lang="ts">
  import { browser } from "$app/environment";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import { onDestroy, tick } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    ChordAudioSource,
    GateSession,
    type GateSessionState,
  } from "@repo/music-core/engines/audio-in";
  import type { ScoreFollowerLiveState } from "@repo/music-core/engines/score-follower";
  import {
    normalizeReadingDrillConfig,
    READING_DRILL_DEFAULT_CONFIG,
    ReadingSession,
    type ReadingSessionState,
  } from "@repo/music-core/engines/reading-session";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { scoreToPattern } from "@repo/music-core/engines/sound";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { curatedTunings, type TuningProfile } from "@repo/music-core/engines/tunings";
  import { CustomTuningStore } from "@repo/music-core/engines/tunings/store";
  import { Button } from "@repo/ui/button";

  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import MicrophoneGatePanel from "../../_components/MicrophoneGatePanel.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import type { PianoHand } from "../../_components/piano/PianoSurface.svelte";
  import { scoreTimelineNotes, scoreWithoutHands } from "../../_components/piano/piano-timeline";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";
  import FlashcardSession from "./_components/FlashcardSession.svelte";
  import ReadingSetup, {
    type ReadingSetupValue,
  } from "./_components/ReadingSetup.svelte";
  import ReadingSummary from "./_components/ReadingSummary.svelte";
  import SightReadingSession from "./_components/SightReadingSession.svelte";

  const { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const tuningStore = store ? new CustomTuningStore(store.settings) : undefined;
  const initialConfig = normalizeReadingDrillConfig(
    browser ? initialDrillSearch(["bpm", "tempo"]) : {},
  );
  const initialUrlBpm = browser
    ? validBpm(new URLSearchParams(window.location.search).get("bpm"))
    : undefined;

  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Preparing your reading history.");
  let setup = $state<ReadingSetupValue>({ ...initialConfig });
  let customTunings = $state<TuningProfile[]>([]);
  let session = $state<ReadingSession | undefined>();
  let sessionState = $state<ReadingSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let midiEnabled = $state(false);
  let midiStatus = $state("");
  let sessionXp = $state(0);
  let previewPlaying = $state(false);
  let previewMessage = $state("");
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let previewGeneration = 0;
  let previewPositionBeat = $state(0);
  let previewFrame: number | undefined;
  let mutedHands = $state<PianoHand[]>([]);
  let stageView = $state<"staff" | "waterfall">("staff");
  let practiceContextCleanup: (() => void) | undefined;
  let practiceContextRequest = 0;
  let practiceContextQueue = Promise.resolve();
  let performanceRequest = 0;
  let performancePending = false;
  let sessionRequest = 0;
  let captured = false;
  // Microphone wait gate. Ships hint-only: no acceptance report is passed, so
  // it lights what it hears and never pushes advancing events. Permission is
  // only ever requested from the panel's explicit button.
  const microphone = browser
    ? new GateSession({
        router: { push: (event) => runtime.router.push(event) },
        createSource: () => new ChordAudioSource(),
        instrument: "piano",
      })
    : undefined;
  let microphoneState = $state<GateSessionState>(
    microphone?.state ?? {
      status: "idle",
      message: "",
      observed: [],
      reason: "listening",
      hintOnly: true,
      hintReason: "not-listening",
    },
  );
  let microphoneTargetKey = "";

  const availableTunings = $derived(
    setup.instrument === "piano"
      ? []
      : [
          ...curatedTunings(setup.instrument),
          ...customTunings.filter(({ instrument }) => instrument === setup.instrument),
        ],
  );
  const activeTuning = $derived(
    availableTunings.find(({ id }) => id === setup.tuningId) ?? availableTunings[0],
  );
  const normalizedSetup = $derived(normalizeReadingDrillConfig(setup));
  const previewScore = $derived.by(() => {
    const prompt = sessionState?.currentPrompt;
    return prompt && "score" in prompt ? prompt.score : undefined;
  });
  const previewTimeline = $derived(previewScore ? scoreTimelineNotes(previewScore) : []);
  // Staff and waterfall are alternative views of the same phrase, never both.
  const stageWaterfall = $derived(
    stageView === "waterfall"
      ? {
          notes: previewTimeline,
          positionBeat: previewPositionBeat,
          mutedHands,
          onMutedHandsChange: requestMutedHands,
        }
      : undefined,
  );
  const summary = $derived(
    sessionState?.status === "summary" ? sessionState.summary : undefined,
  );
  const phase = $derived<"setup" | "stage" | "summary">(
    summary
      ? "summary"
      : sessionState?.status === "flashcard" || sessionState?.status === "sight-reading"
        ? "stage"
        : "setup",
  );
  const liveAnnouncement = $derived(
    phase === "summary" && summary
      ? `Reading results ready. ${summary.correct} of ${summary.total} correct.`
      : phase === "stage"
        ? status || "Reading session started."
        : pending
          ? "Starting reading session."
          : status || "Reading setup.",
  );
  let setupHeading = $state<HTMLElement | null>(null);
  let stageHeading = $state<HTMLElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let previousPhase: "setup" | "stage" | "summary" | undefined;

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    registerReadingContext(normalizedSetup);
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
    const config = normalizedSetup;
    const prompt = sessionState?.currentPrompt;
    if (
      !session ||
      sessionState?.status !== "sight-reading" ||
      sessionState.countIn !== "ready" ||
      !prompt ||
      !("score" in prompt)
    )
      return;
    const bpm = readingEngineBpm(config);
    const timeSignature = readingTimeSignature(config);
    if (
      prompt.options.bpm === bpm &&
      prompt.options.timeSignature.numerator === timeSignature.numerator &&
      prompt.options.timeSignature.denominator === timeSignature.denominator
    )
      return;
    session.retimePreparedSightReading({ bpm, timeSignature });
  });

  $effect(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
    return runtime.midi.subscribeState(() => {
      midiEnabled = runtime.midi.state.enabled;
      midiStatus = midiMessage();
    });
  });

  $effect(() => microphone?.subscribe((next) => (microphoneState = next)));

  // Retarget the gate on every follower group change, including identical-note
  // groups (the session index and group id form the key). Retargeting lands
  // unarmed, so a chord sustained across the change cannot advance.
  $effect(() => {
    if (!microphone) return;
    const state = sessionState;
    const prompt = state?.currentPrompt;
    const groups = prompt && "groups" in prompt ? prompt.groups : undefined;
    const active = state?.status === "sight-reading" && setup.instrument === "piano";
    const group = active
      ? groups?.[(state?.live as ScoreFollowerLiveState | undefined)?.currentGroupIndex ?? 0]
      : undefined;
    const key = group ? `${state?.currentIndex}:${group.id}` : "";
    if (key === microphoneTargetKey) return;
    microphoneTargetKey = key;
    microphone.setTarget(group?.midiNotes ?? []);
  });

  void initialize();

  function startMicrophone(): void {
    void microphone?.start();
  }

  function stopMicrophone(): void {
    void microphone?.stop();
  }

  async function initialize(): Promise<void> {
    try {
      const [, , , savedTunings = []] = await Promise.all([
        skills.seed(seedCoreSkills()),
        analytics.load(),
        progress.load(),
        tuningStore?.list(),
      ]);
      customTunings = savedTunings;
      ready = true;
      status = "Ready for a ten-prompt session.";
    } catch (error) {
      status = message(error, "Reading history could not be loaded.");
    }
  }

  function updateSetup(next: ReadingSetupValue, invalidatePending = true): void {
    if (invalidatePending || (pending && session)) sessionRequest += 1;
    const normalized = normalizeReadingDrillConfig(next);
    setup = normalized;
    if (runtime.activeInstrument !== normalized.instrument) {
      runtime.setActiveInstrument(normalized.instrument);
    }
    if (normalized.instrument !== "piano" && !normalized.tuningId) {
      setup = { ...normalized, tuningId: availableTunings[0]?.id };
    }
  }

  async function start(): Promise<void> {
    if (!ready || pending) return;
    const request = ++sessionRequest;
    pending = true;
    stopPreview();
    status = "";

    try {
      await settleReadingContext();
      if (request !== sessionRequest) return;
      const config = normalizedSetup;
      const tuning = activeTuning;
      session?.dispose();
      unsubscribeSession?.();
      captured = false;
      session = new ReadingSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      unsubscribeSession = session.subscribe(handleSessionState);
      if (config.activity === "flashcards") {
        await session.startFlashcards({
          instrument: config.instrument,
          ...(tuning === undefined ? {} : { tuning }),
          clefs: config.clefs,
          keys: [config.keySignature],
          range: config.range,
          promptKind: config.promptKind,
          answerMode: config.answerMode,
          length: 10,
        });
      } else {
        await session.prepareSightReading({
          instrument: config.instrument,
          ...(tuning === undefined ? {} : { tuning }),
          keySignature: config.keySignature,
          clefs: config.clefs,
          measures: config.measures,
          bpm: readingEngineBpm(config),
          timeSignature: readingTimeSignature(config),
          mode: config.mode,
          strictness: config.strictness,
          difficulty: config.difficulty,
          readingLevel: config.readingLevel,
          transposeSemitones: config.transposeSemitones,
        });
      }
      if (request !== sessionRequest) {
        unsubscribeSession?.();
        unsubscribeSession = undefined;
        session?.dispose();
        session = undefined;
        sessionState = undefined;
      }
    } catch (error) {
      unsubscribeSession?.();
      unsubscribeSession = undefined;
      session?.dispose();
      session = undefined;
      sessionState = undefined;
      if (request === sessionRequest) {
        status = message(error, "The reading session could not be started.");
      }
    } finally {
      pending = false;
    }
  }

  function midiMessage(): string {
    if (runtime.midi.state.enabled) {
      return `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`;
    }
    return runtime.midi.state.error ?? "MIDI permission has not been requested.";
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  function handleSessionState(next: ReadingSessionState): void {
    if (next.status !== "sight-reading") {
      stopPreview();
      stopMicrophone();
    }
    if (next.status === "summary" || next.status === "abandoned") runtime.endPerformance();
    sessionState = next;
    sessionXp = next.results.reduce((total, result) => total + result.xp, 0);
    status = next.error ?? "";

    // Auto-capture the finished session into the practice journal (once).
    if (next.status === "summary" && next.summary && !captured) {
      captured = true;
      void runtime.recordPractice({
        source: "drill",
        instrument: setup.instrument,
        tags: ["reading", setup.activity],
        scoringEvents: next.summary.results.map((result) => result.event),
        xpEarned: next.summary.xp,
        note: `Note reading · ${next.summary.correct}/${next.summary.total} correct (${Math.round(
          next.summary.accuracy * 100,
        )}%)`,
      });
    }
  }

  async function answerChoice(choice: string): Promise<void> {
    try {
      await session?.answerChoice(choice);
    } catch (error) {
      status = message(error, "The answer could not be saved.");
    }
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
    }
  }

  async function startSightReading(): Promise<number | undefined> {
    if (performancePending) return undefined;
    performancePending = true;
    stopPreview();
    try {
      await tick();
      const request = ++performanceRequest;
      await settleReadingContext();
      if (request !== performanceRequest) return undefined;
      if (setup.mode !== "performance") {
        const now = performance.now();
        await session?.startSightReading(now);
        return request === performanceRequest ? now : undefined;
      }
      if (!(await runtime.ensurePlaybackVoice())) {
        if (request === performanceRequest) status = runtime.audioMessage;
        return undefined;
      }
      if (request !== performanceRequest) return undefined;
      const result = await runtime.beginPerformance();
      if (request !== performanceRequest) {
        if (result.status === "started") runtime.endPerformance();
        return undefined;
      }
      if (result.status === "cancelled") return undefined;
      if (result.status === "failed") {
        status = result.message;
        return undefined;
      }
      await session?.startSightReading(Number(result.downbeat));
      if (request !== performanceRequest) {
        runtime.endPerformance();
        session?.abandon();
        return undefined;
      }
      return Number(result.downbeat);
    } finally {
      performancePending = false;
    }
  }

  async function finishSightReading(): Promise<void> {
    try {
      await session?.finishSightReading();
    } catch (error) {
      status = message(error, "The sight-reading result could not be saved.");
    } finally {
      runtime.endPerformance();
    }
  }

  function abandon(): void {
    performanceRequest += 1;
    stopPreview();
    stopMicrophone();
    runtime.endPerformance();
    session?.abandon();
    unsubscribeSession?.();
    session = undefined;
    sessionState = undefined;
    status = "Session ended without saving incomplete prompts.";
  }

  function repeat(): void {
    stopPreview();
    sessionState = undefined;
    void start();
  }

  function changeSetup(): void {
    performanceRequest += 1;
    stopPreview();
    stopMicrophone();
    runtime.endPerformance();
    unsubscribeSession?.();
    session?.dispose();
    session = undefined;
    sessionState = undefined;
    status = "Adjust your reading setup.";
  }

  function practiceAtBpm(bpm: number): void {
    runtime.setPracticeVariantBpm(bpm, readingVariantKey(normalizedSetup));
    repeat();
  }

  function registerReadingContext(config: ReadingSetupValue): void {
    performanceRequest += 1;
    const request = ++practiceContextRequest;
    practiceContextQueue = practiceContextQueue.then(async () => {
      if (request !== practiceContextRequest) return;
      const cleanup = await runtime.registerPracticeContext({
        owner: "reading",
        variantKey: readingVariantKey(config),
        defaultBpm: READING_DRILL_DEFAULT_CONFIG.bpm,
        initialUrlBpm,
        meter:
          config.meter === "compound"
            ? { numerator: 6, denominator: 8 }
            : { numerator: 4, denominator: 4 },
        allowedInstruments: ["piano", "guitar", "ukulele"],
        onBpmChange: (bpm) => {
          if (setup.bpm !== bpm) updateSetup({ ...setup, bpm }, false);
        },
        onInstrumentChange: (instrument) => {
          if (
            (instrument === "piano" || instrument === "guitar" || instrument === "ukulele") &&
            setup.instrument !== instrument
          ) {
            updateSetup({ ...setup, instrument }, false);
          }
        },
      });
      if (request !== practiceContextRequest) {
        cleanup();
        return;
      }
      if (runtime.activeInstrument !== config.instrument) {
        runtime.setActiveInstrument(config.instrument);
      }
      practiceContextCleanup?.();
      practiceContextCleanup = cleanup;
    });
  }

  function readingVariantKey(config: ReadingSetupValue): string {
    return `v1:reading:${config.activity}:${config.instrument}:${config.readingLevel}:${config.meter}:${config.answerMode}:${config.mode}`;
  }

  function validBpm(value: string | null): number | undefined {
    const bpm = Number(value);
    return Number.isFinite(bpm) && bpm > 0 ? bpm : undefined;
  }

  function practiceMissedGroups(): void {
    if (!session?.prepareMissedSightReading()) {
      repeat();
      return;
    }
    captured = false;
  }

  async function saveTuning(profile: TuningProfile): Promise<void> {
    if (!tuningStore) return;
    try {
      await tuningStore.save(profile);
      customTunings = await tuningStore.list();
      updateSetup({ ...setup, instrument: profile.instrument, tuningId: profile.id });
      status = `${profile.name} saved.`;
    } catch (error) {
      status = message(error, "The tuning could not be saved.");
    }
  }

  async function deleteTuning(id: string): Promise<void> {
    if (!tuningStore) return;
    try {
      await tuningStore.delete(id);
      customTunings = await tuningStore.list();
      updateSetup({
        ...setup,
        tuningId: curatedTunings(setup.instrument as "guitar" | "ukulele")[0]?.id,
      });
      status = "Custom tuning deleted.";
    } catch (error) {
      status = message(error, "The tuning could not be deleted.");
    }
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function readingEngineBpm(config: ReadingSetupValue): number {
    return (config.bpm * 4) / (config.meter === "compound" ? 8 : 4);
  }

  function readingTimeSignature(
    config: ReadingSetupValue,
  ): { numerator: number; denominator: number } {
    return config.meter === "compound"
      ? { numerator: 6, denominator: 8 }
      : { numerator: 4, denominator: 4 };
  }

  async function settleReadingContext(): Promise<void> {
    while (true) {
      await tick();
      const request = practiceContextRequest;
      const queue = practiceContextQueue;
      await queue;
      await tick();
      if (request === practiceContextRequest && queue === practiceContextQueue) return;
    }
  }

  async function togglePreview(): Promise<void> {
    if (previewPlaying) {
      stopPreview();
      previewMessage = "Preview paused.";
      return;
    }
    await startPreview();
  }

  async function startPreview(): Promise<void> {
    if (!previewScore) return;
    const bpm = readingEngineBpm(setup);
    const generation = ++previewGeneration;
    try {
      if (!(await runtime.ensurePlaybackVoice())) {
        if (generation === previewGeneration) previewMessage = runtime.audioMessage || "Audio could not be enabled.";
        return;
      }
      if (generation !== previewGeneration) return;
      const pattern = scoreToPattern(scoreWithoutHands(previewScore, mutedHands), { bpm });
      const epoch = runtime.sound.playPattern(pattern.steps);
      previewPlaying = true;
      previewMessage = "Playing sight-reading preview.";
      previewTimer = setTimeout(finishPreview, Math.max(300, pattern.durationSec * 1_000));
      // Reading previews are one fixed tempo, so elapsed time is linear in beats.
      if (epoch) startPositionLoop(generation, epoch.startedAt, bpm);
    } catch (error) {
      if (generation !== previewGeneration) return;
      stopPreview();
      previewMessage = message(error, "Sight-reading preview failed.");
    }
  }

  function startPositionLoop(generation: number, startedAt: number, bpm: number): void {
    const step = () => {
      if (generation !== previewGeneration) return;
      const elapsedSeconds = Math.max(0, (performance.now() - startedAt) / 1_000);
      previewPositionBeat = (elapsedSeconds * bpm) / 60;
      previewFrame = requestAnimationFrame(step);
    };
    step();
  }

  function finishPreview(): void {
    stopPreview();
    previewMessage = "Preview complete.";
  }

  function stopPreview(): void {
    previewGeneration += 1;
    if (previewTimer !== undefined) clearTimeout(previewTimer);
    previewTimer = undefined;
    if (previewFrame !== undefined) cancelAnimationFrame(previewFrame);
    previewFrame = undefined;
    previewPositionBeat = 0;
    runtime.sound.stopPattern();
    previewPlaying = false;
  }

  /** The surface asks; the route reschedules and hands back the new truth. */
  function requestMutedHands(hands: PianoHand[]): void {
    mutedHands = hands;
    if (!previewPlaying) return;
    stopPreview();
    void startPreview();
  }

  function syncConfigUrl(): void {
    const config = normalizedSetup;
    const url = new URL(window.location.href);
    url.searchParams.set("activity", config.activity);
    url.searchParams.set("instrument", config.instrument);
    if (config.tuningId) {
      url.searchParams.set("tuning", config.tuningId);
    } else {
      url.searchParams.delete("tuning");
    }
    url.searchParams.set("clefs", config.clefs.join(","));
    url.searchParams.set("key", config.keySignature);
    url.searchParams.set("low", String(config.range.lowestMidi));
    url.searchParams.set("high", String(config.range.highestMidi));
    url.searchParams.set("level", config.readingLevel);
    url.searchParams.set("difficulty", String(config.difficulty));
    url.searchParams.set("transpose", String(config.transposeSemitones));
    url.searchParams.set("prompt", config.promptKind);
    url.searchParams.set("answer", config.answerMode);
    url.searchParams.set("mode", config.mode);
    url.searchParams.set("bpm", String(config.bpm));
    url.searchParams.set("strict", config.strictness);
    url.searchParams.set("meter", config.meter);
    url.searchParams.set("measures", String(config.measures));
    syncRouteQuery(`${url.pathname}${url.search}${url.hash}`);
  }

  onDestroy(() => {
    performanceRequest += 1;
    sessionRequest += 1;
    practiceContextRequest += 1;
    practiceContextCleanup?.();
    runtime.endPerformance();
    unsubscribeSession?.();
    session?.dispose();
    stopPreview();
    microphone?.dispose();
  });
</script>

<svelte:head>
  <title>Note Reading | Practice OS</title>
  <meta
    name="description"
    content="Practice staff-note recognition and instrument locations with focused flashcards."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Note Reading"
    subtitle="Read it, locate it, play it — closing the loop from page to instrument."
  >
    {#snippet controls()}
      <SourceReadout
        label="Answer by"
        device={`Playing · ${setup.instrument}`}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <p class="sr-only" aria-live="polite" data-testid="reading-phase-announcement">
    {liveAnnouncement}
  </p>

  {#snippet summaryPhase()}
    {#if summary}
      <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
        {#snippet heading()}
          <h2 class="text-3xl font-bold tracking-tight">Reading results</h2>
        {/snippet}
        {#snippet children()}
          <div>
            <ReadingSummary
              {summary}
              bpm={setup.bpm}
              onRepeat={repeat}
              onTempo={practiceAtBpm}
              onMissedGroups={practiceMissedGroups}
            />
          </div>
        {/snippet}
        {#snippet routineContinue()}
          <RoutineContinueAction routine={runtime.dailyRoutine} />
        {/snippet}
      </DrillSummaryCard>
    {/if}
  {/snippet}

  {#snippet setupPhase()}
    <div tabindex="-1" aria-label="Reading setup" bind:this={setupHeading}>
      <ReadingSetup
        value={setup}
        tunings={availableTunings}
        {ready}
        {pending}
        {status}
        {midiEnabled}
        {midiStatus}
        onChange={updateSetup}
        onStart={start}
        onEnableMidi={enableMidi}
        onSaveTuning={saveTuning}
        onDeleteTuning={deleteTuning}
      />
    </div>
  {/snippet}

  {#snippet stagePhase()}
    <div tabindex="-1" aria-label="Reading session" bind:this={stageHeading} class="grid gap-4">
      {#if status}
        <p class="text-sm text-muted-foreground">{status}</p>
      {/if}
      {#if sessionState?.status === "sight-reading" && session}
        {#if previewScore}
          <div class="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <Button type="button" size="sm" variant="outline" onclick={() => void togglePreview()}>
              {#if previewPlaying}
                <Pause class="size-4" aria-hidden="true" />Pause
              {:else}
                <Play class="size-4" aria-hidden="true" />Play
              {/if}
            </Button>
            {#if setup.instrument === "piano"}
              <div class="flex flex-wrap gap-2" role="group" aria-label="Stage view">
                <Button
                  type="button"
                  size="sm"
                  variant={stageView === "staff" ? "secondary" : "outline"}
                  aria-pressed={stageView === "staff"}
                  onclick={() => (stageView = "staff")}
                >
                  Staff
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={stageView === "waterfall" ? "secondary" : "outline"}
                  aria-pressed={stageView === "waterfall"}
                  onclick={() => (stageView = "waterfall")}
                >
                  Waterfall
                </Button>
              </div>
            {/if}
            {#if previewMessage}
              <p class="text-sm text-muted-foreground" aria-live="polite">{previewMessage}</p>
            {/if}
          </div>
        {/if}
        {#if setup.instrument === "piano" && microphone}
          <MicrophoneGatePanel
            state={microphoneState}
            supported={ChordAudioSource.supported}
            onStart={startMicrophone}
            onStop={stopMicrophone}
          />
        {/if}
        <SightReadingSession
          sessionState={sessionState}
          router={runtime.router}
          tuning={activeTuning}
          bpm={setup.bpm}
          {stageView}
          waterfall={stageWaterfall}
          observedMidiNotes={microphoneState.observed}
          {sessionXp}
          onAccepted={playAccepted}
          onStart={startSightReading}
          onFinish={finishSightReading}
          onAbandon={abandon}
        />
      {:else if sessionState}
        <FlashcardSession
          state={sessionState}
          answerMode={setup.answerMode}
          tuning={activeTuning}
          router={runtime.router}
          {sessionXp}
          onChoice={answerChoice}
          onAccepted={playAccepted}
          onAbandon={abandon}
        />
      {/if}
    </div>
  {/snippet}

  <PracticeDrillShell
    {phase}
    startPending={pending}
    setup={setupPhase}
    stage={stagePhase}
    summary={summaryPhase}
  />
</PracticeScreen>
