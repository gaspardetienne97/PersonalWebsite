<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    normalizeReadingDrillConfig,
    ReadingSession,
    type ReadingSessionState,
  } from "@repo/music-core/engines/reading-session";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { scoreToPattern } from "@repo/music-core/engines/sound";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { curatedTunings, type TuningProfile } from "@repo/music-core/engines/tunings";
  import { CustomTuningStore } from "@repo/music-core/engines/tunings/store";

  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime } from "../../_runtime.svelte";
  import FlashcardSession from "./_components/FlashcardSession.svelte";
  import ReadingSetup, {
    type ReadingSetupValue,
  } from "./_components/ReadingSetup.svelte";
  import ReadingSummary from "./_components/ReadingSummary.svelte";
  import SightReadingSession from "./_components/SightReadingSession.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const tuningStore = store ? new CustomTuningStore(store.settings) : undefined;
  const initialConfig = normalizeReadingDrillConfig(
    browser ? new URLSearchParams(window.location.search) : {},
  );

  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Preparing your reading history.");
  let setup = $state<ReadingSetupValue>({ ...initialConfig });
  let customTunings = $state<TuningProfile[]>([]);
  let session = $state<ReadingSession | undefined>();
  let sessionState = $state<ReadingSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());
  let sessionXp = $state(0);
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

  // The transport Play button previews the on-screen sight-reading melody.
  $effect(() => {
    const prompt = sessionState?.currentPrompt;
    const score = prompt && "score" in prompt ? prompt.score : undefined;
    if (!score) {
      runtime.setPlaybackSource(undefined);
      return;
    }
    const { steps, durationSec } = scoreToPattern(score, { bpm: setup.bpm });
    runtime.setPlaybackSource({
      label: "sight-reading melody",
      durationSec,
      play: () => runtime.sound.playPattern(steps),
    });
  });

  $effect(() => {
    syncConfigUrl();
  });

  void initialize();

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
  });

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

  function updateSetup(next: ReadingSetupValue): void {
    const normalized = normalizeReadingDrillConfig(next);
    setup = normalized;
    if (normalized.instrument !== "piano" && !normalized.tuningId) {
      setup = { ...normalized, tuningId: availableTunings[0]?.id };
    }
  }

  async function start(): Promise<void> {
    if (!ready || pending) return;
    pending = true;
    status = "";

    try {
      session?.dispose();
      unsubscribeSession?.();
      captured = false;
      session = new ReadingSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      unsubscribeSession = session.subscribe(handleSessionState);
      runtime.router.setActiveInstrument(setup.instrument);
      if (setup.activity === "flashcards") {
        await session.startFlashcards({
          instrument: setup.instrument,
          ...(activeTuning === undefined ? {} : { tuning: activeTuning }),
          clefs: setup.clefs,
          keys: [setup.keySignature],
          range: setup.range,
          promptKind: setup.promptKind,
          answerMode: setup.answerMode,
          length: 10,
        });
      } else {
        await session.prepareSightReading({
          instrument: setup.instrument,
          ...(activeTuning === undefined ? {} : { tuning: activeTuning }),
          keySignature: setup.keySignature,
          clefs: setup.clefs,
          measures: setup.measures,
          bpm: setup.bpm,
          timeSignature:
            setup.meter === "compound"
              ? { numerator: 6, denominator: 8 }
              : { numerator: 4, denominator: 4 },
          mode: setup.mode,
          strictness: setup.strictness,
          difficulty: setup.difficulty,
          readingLevel: setup.readingLevel,
          transposeSemitones: setup.transposeSemitones,
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

  async function startSightReading(): Promise<number> {
    const delayMs =
      runtime.audioEnabled && setup.mode === "performance"
        ? runtime.sound.playCountIn({
            bpm: setup.bpm,
            beats: setup.meter === "compound" ? 6 : 4,
            beatsPerMeasure: setup.meter === "compound" ? 3 : 4,
          }).delayMs
        : 0;
    const startTimestampMs = performance.now() + delayMs;
    await session?.startSightReading(startTimestampMs);
    return startTimestampMs;
  }

  async function finishSightReading(): Promise<void> {
    try {
      await session?.finishSightReading();
    } catch (error) {
      status = message(error, "The sight-reading result could not be saved.");
    }
  }

  function abandon(): void {
    session?.abandon();
    unsubscribeSession?.();
    session = undefined;
    sessionState = undefined;
    runtime.router.setActiveInstrument();
    status = "Session ended without saving incomplete prompts.";
  }

  function repeat(): void {
    sessionState = undefined;
    void start();
  }

  function slowDown(): void {
    setup = normalizeReadingDrillConfig({
      ...setup,
      activity: "sight-reading",
      bpm: setup.bpm - 10,
    });
    sessionState = undefined;
    void start();
  }

  function practiceMissedGroups(): void {
    if (!session?.prepareMissedSightReading()) {
      repeat();
      return;
    }
    captured = false;
    runtime.router.setActiveInstrument(setup.instrument);
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
    unsubscribeSession?.();
    unsubscribeMidiState();
    session?.dispose();
    runtime.router.setActiveInstrument();
    runtime.setPlaybackSource(undefined);
  });
</script>

<svelte:head>
  <title>Note Reading | Musicianship OS</title>
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
      onRepeat={repeat}
      onSlower={setup.activity === "sight-reading" ? slowDown : undefined}
      onMissedGroups={practiceMissedGroups}
    />
    <RoutineContinueAction routine={runtime.dailyRoutine} />
  {:else if sessionState.status === "sight-reading" && session}
    <SightReadingSession
      sessionState={sessionState}
      router={runtime.router}
      tuning={activeTuning}
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
