<script lang="ts">
  import { browser } from "$app/environment";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import { onDestroy, tick } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
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

  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
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
  let practiceContextCleanup: (() => void) | undefined;
  let practiceContextRequest = 0;
  let practiceContextQueue = Promise.resolve();
  let performanceRequest = 0;
  let performancePending = false;
  let sessionRequest = 0;
  let captured = false;

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

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    registerReadingContext(normalizedSetup);
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

  void initialize();

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
    if (invalidatePending) sessionRequest += 1;
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
    } catch (error) {
      status = message(error, "The reading session could not be started.");
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
    if (next.status !== "sight-reading") stopPreview();
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
    if (!previewScore) return;
    const generation = ++previewGeneration;
    try {
      if (!(await runtime.ensurePlaybackVoice())) {
        if (generation === previewGeneration) previewMessage = runtime.audioMessage || "Audio could not be enabled.";
        return;
      }
      if (generation !== previewGeneration) return;
      const pattern = scoreToPattern(previewScore, { bpm: readingEngineBpm(setup) });
      runtime.sound.playPattern(pattern.steps);
      previewPlaying = true;
      previewMessage = "Playing sight-reading preview.";
      previewTimer = setTimeout(finishPreview, Math.max(300, pattern.durationSec * 1_000));
    } catch (error) {
      if (generation !== previewGeneration) return;
      stopPreview();
      previewMessage = message(error, "Sight-reading preview failed.");
    }
  }

  function finishPreview(): void {
    runtime.sound.stopPattern();
    previewTimer = undefined;
    previewPlaying = false;
    previewMessage = "Preview complete.";
  }

  function stopPreview(): void {
    previewGeneration += 1;
    if (previewTimer !== undefined) clearTimeout(previewTimer);
    previewTimer = undefined;
    runtime.sound.stopPattern();
    previewPlaying = false;
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


  {#if !sessionState}
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
  {:else if sessionState.status === "summary" && sessionState.summary}
    <ReadingSummary
      summary={sessionState.summary}
      bpm={setup.bpm}
      onRepeat={repeat}
      onTempo={practiceAtBpm}
      onMissedGroups={practiceMissedGroups}
    />
    <RoutineContinueAction routine={runtime.dailyRoutine} />
  {:else if sessionState.status === "sight-reading" && session}
    {#if status}
      <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
    {/if}
    {#if previewScore}
      <div class="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <Button type="button" size="sm" variant="outline" onclick={() => void togglePreview()}>
          {#if previewPlaying}
            <Pause class="size-4" aria-hidden="true" />Pause
          {:else}
            <Play class="size-4" aria-hidden="true" />Play
          {/if}
        </Button>
        {#if previewMessage}
          <p class="text-sm text-muted-foreground" aria-live="polite">{previewMessage}</p>
        {/if}
      </div>
    {/if}
    <SightReadingSession
      sessionState={sessionState}
      router={runtime.router}
      tuning={activeTuning}
      bpm={setup.bpm}
      {sessionXp}
      onAccepted={playAccepted}
      onStart={startSightReading}
      onFinish={finishSightReading}
      onAbandon={abandon}
    />
  {:else}
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
</PracticeScreen>
