<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount, tick } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    AudioPitchSource,
    type AudioPitchState,
  } from "@repo/music-core/engines/audio-in";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    normalizeSpiderDrillConfig,
    normalizeStringTechniqueConfig,
    SPIDER_DRILL_PATTERNS,
    SPIDER_DRILL_SPANS,
    SPIDER_DRILL_TEMPOS,
    TechniqueSession,
    type StringTechniqueMode,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import {
    curatedTunings,
    type StringInstrumentId,
    type TuningProfile,
  } from "@repo/music-core/engines/tunings";
  import type {
    FretboardNoteFinderAnswer,
    FretboardNoteFinderPrompt,
  } from "@repo/music-core/exercises/fretboard-note-finder";
  import type {
    StringPatternKind,
    StringSpiderSpan,
    StringSpiderAnswer,
    StringSpiderPrompt,
  } from "@repo/music-core/exercises/string-spider";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import FrettedSequenceStage, {
    type FrettedSequenceStep,
  } from "../../_components/FrettedSequenceStage.svelte";
  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SessionFeedback from "../../_components/SessionFeedback.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  interface SpiderAudioSource {
    readonly state: AudioPitchState;
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribeState(listener: (state: AudioPitchState) => void): () => void;
    subscribeEvents(listener: (event: NoteEvent) => void): () => void;
  }

  const {
    audioSource = new AudioPitchSource(),
    audioSupported = AudioPitchSource.supported,
    runtime: runtimeProp,
  }: {
    audioSource?: SpiderAudioSource;
    audioSupported?: boolean;
    runtime?: MusicRuntime;
  } = $props();
  // svelte-ignore state_referenced_locally -- runtime ownership is fixed for a route mount
  const runtime = runtimeProp ?? useMusicRuntime();

  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const instrumentOptions = [
    { value: "guitar", label: "Guitar" },
    { value: "ukulele", label: "Ukulele" },
  ];
  const modeOptions = [
    { value: "spider", label: "Spider" },
    { value: "note-finder", label: "Note Finder" },
  ];
  const defaultInstrument: StringInstrumentId =
    runtime.activeInstrument === "ukulele" ? "ukulele" : "guitar";
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const initialConfig = normalizeSpiderDrillConfig(initialSearch, defaultInstrument);
  const initialMode = normalizeStringTechniqueConfig(initialSearch);
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;

  let mode = $state<StringTechniqueMode>(initialMode.mode);
  let instrument = $state<StringInstrumentId>(initialConfig.instrument);
  runtime.setActiveInstrument(initialConfig.instrument);
  let tuningId = $state(initialConfig.tuningId);
  let stringNumber = $state(initialConfig.stringNumber);
  let stringSpan = $state<StringSpiderSpan>(initialConfig.stringSpan);
  let startFret = $state(initialConfig.startFret);
  let pattern = $state<StringPatternKind>(initialConfig.pattern);
  let crossing = $state(initialConfig.crossing);
  let bpm = $state(String(initialConfig.bpm));
  let ready = $state(false);
  let pending = $state(false);
  let destroyed = false;
  let routeGeneration = 0;
  let startRequest = 0;
  let practiceContextReady: Promise<void> = Promise.resolve();
  let captured = false;
  let status = $state("Preparing string technique.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let audioState = $state<AudioPitchState>({ status: "idle" });
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let resultsDismissed = $state(false);
  let unsubscribeSession: (() => void) | undefined;
  let unsubscribeAudioState: (() => void) | undefined;
  let unsubscribeAudioEvents: (() => void) | undefined;

  const tunings = $derived(curatedTunings(instrument));
  const tuning = $derived(
    tunings.find((profile) => profile.id === tuningId) ?? tunings[0]!,
  );
  const prompt = $derived(
    sessionState?.currentPrompt && "startFret" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as StringSpiderPrompt)
      : undefined,
  );
  const noteFinderPrompt = $derived(
    sessionState?.currentPrompt && "targetMidi" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as FretboardNoteFinderPrompt)
      : undefined,
  );
  const summary = $derived(sessionState?.summary);
  const result = $derived(summary?.results[0]);
  const answer = $derived(result?.result.answer as StringSpiderAnswer | undefined);
  const noteFinderAnswer = $derived(result?.result.answer as FretboardNoteFinderAnswer | undefined);
  const phase = $derived<"setup" | "stage" | "summary">(
    pending
      ? "setup"
      : summary && !resultsDismissed
        ? "summary"
        : sessionState?.status === "active"
          ? "stage"
          : "setup",
  );
  const targetNoteCount = $derived(prompt?.midiNotes.length ?? (noteFinderPrompt ? 1 : 4));
  const completedNotes = $derived(
    Math.min(targetNoteCount, Math.round((sessionState?.live?.progress ?? 0) * targetNoteCount)),
  );
  const currentPosition = $derived(prompt?.positions[completedNotes]);
  const nextPositionLabel = $derived(
    noteFinderPrompt
      ? noteFinderPrompt.targetNote
      : currentPosition
        ? `S${currentPosition.stringNumber} F${currentPosition.fretNumber}`
        : "—",
  );
  const sequenceSteps = $derived.by<FrettedSequenceStep[]>(() => {
    if (noteFinderPrompt) {
      return [
        {
          id: `note-finder-${noteFinderPrompt.targetMidi}`,
          label: `Find ${noteFinderPrompt.targetNote}`,
          midiNote: noteFinderPrompt.targetMidi,
        },
      ];
    }
    return (prompt?.positions ?? []).map((position, index) => ({
      id: `string-${position.stringNumber}-fret-${position.fretNumber}-${index}`,
      label: `String ${position.stringNumber} · Fret ${position.fretNumber}`,
      midiNote: position.midiNote,
    }));
  });
  const midiStatus = $derived(
    midiEnabled
      ? `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`
      : runtime.midi.state.error ?? "MIDI permission has not been requested.",
  );
  const microphoneStatus = $derived.by(() => {
    if (!audioSupported) return "Microphone input is not supported in this browser.";
    if (audioState.status === "running") return "Microphone is listening for clear guitar notes.";
    if (audioState.status === "requesting") return "Waiting for microphone permission.";
    if (audioState.status === "denied") {
      return audioState.message ?? "Microphone access was blocked.";
    }
    if (audioState.status === "error") {
      return audioState.message ?? "Microphone input could not start.";
    }
    return "Start the microphone to score an acoustic guitar or ukulele.";
  });
  const inputDevice = $derived(
    runtime.activeSource === "midi"
      ? `MIDI · ${instrument}`
      : audioState.status === "running"
        ? `Microphone · ${instrument}`
        : "On-screen fretboard",
  );
  const normalizedConfig = $derived(
    normalizeSpiderDrillConfig({
      instrument,
      tuning: tuningId,
      string: stringNumber,
      span: stringSpan,
      fret: startFret,
      bpm,
      pattern,
      crossing,
    }),
  );
  const normalizedMode = $derived(normalizeStringTechniqueConfig({ mode }));
  const liveAnnouncement = $derived(
    phase === "summary"
      ? normalizedMode.mode === "note-finder"
        ? `Note found. ${summary?.xp ?? 0} XP.`
        : `Spider complete. ${Math.round((answer?.pitchAccuracy ?? 0) * 100)}% notes · ${Math.round(answer?.meanTimingErrorMs ?? 0)}ms mean timing error.`
      : status,
  );
  const variantKey = $derived(
    `v1:spider:${instrument}:${pattern}:${stringSpan}${crossing ? "-crossing" : ""}`,
  );

  let activeHeading = $state<HTMLHeadingElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let setupHeading = $state<HTMLDivElement | null>(null);
  let previousPhase: "setup" | "stage" | "summary" | undefined;

  void initialize();

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    const current = phase;
    const previous = previousPhase;
    previousPhase = current;
    if (previous === undefined || previous === current) return;
    if (current === "stage") activeHeading?.focus({ preventScroll: false });
    else if (current === "summary") resultsHeading?.focus({ preventScroll: false });
    else setupHeading?.focus({ preventScroll: false });
  });

  $effect(() => {
    const key = variantKey;
    routeGeneration += 1;
    let disposed = false;
    let cleanup: () => void = () => undefined;
    practiceContextReady = runtime
      .registerPracticeContext({
        owner: "spider",
        variantKey: key,
        defaultBpm: 80,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        allowedInstruments: ["guitar", "ukulele"],
        onBpmChange: (next) => (bpm = String(next)),
        onInstrumentChange: selectInstrument,
      })
      .then((nextCleanup) => {
        cleanup = nextCleanup;
        if (disposed) cleanup();
      });
    return () => {
      disposed = true;
      routeGeneration += 1;
      cleanup();
    };
  });

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
  });

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
      if (destroyed) return;
      const nextSession = new TechniqueSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      if (destroyed) {
        nextSession.dispose();
        return;
      }
      session = nextSession;
      unsubscribeSession = nextSession.subscribe((state) => {
        sessionState = state;
        if (state.error) status = state.error;
        if (state.summary) runtime.endPerformance();
        if (state.summary && !captured) {
          captured = true;
          const completed = state.summary.results[0];
          const detail = completed?.result.answer as StringSpiderAnswer | undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument,
            tags:
              mode === "note-finder"
                ? ["technique", "note-finder", instrument]
                : ["technique", "spider", pattern, instrument],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `${instrument === "guitar" ? "Guitar" : "Ukulele"} spider ${prompt?.patternLabel ?? pattern} · ${Math.round(detail.pitchAccuracy * 100)}% notes · ${Math.round(detail.meanTimingErrorMs)}ms timing`
              : "String spider drill",
          });
        }
      });
      ready = true;
      status = "Ready for string independence practice.";
    } catch (error) {
      status = message(error, "String technique could not be prepared.");
    }
  }

  function selectInstrument(value: string): void {
    const config = normalizeSpiderDrillConfig(
      {
        instrument: value,
        bpm,
        pattern,
        span: stringSpan,
      },
      value === "ukulele" ? "ukulele" : "guitar",
    );
    instrument = config.instrument;
    tuningId = config.tuningId;
    stringNumber = config.stringNumber;
    startFret = config.startFret;
    stringSpan = config.stringSpan;
    pattern = config.pattern;
    bpm = String(config.bpm);
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function toggleMicrophone(): Promise<void> {
    if (audioState.status === "running" || audioState.status === "requesting") {
      await audioSource.stop();
      return;
    }
    await audioSource.start();
  }

  async function start(): Promise<void> {
    if (!ready || pending || !session) return;
    const request = ++startRequest;
    resultsDismissed = true;
    pending = true;
    status = "";
    let generation = routeGeneration;
    try {
      await tick();
      if (request !== startRequest) return;
      generation = routeGeneration;
      await practiceContextReady;
      if (request !== startRequest || generation !== routeGeneration) return;
      const voiceReady = await runtime.ensurePlaybackVoice();
      if (request !== startRequest || generation !== routeGeneration) return;
      if (!voiceReady) {
        status = runtime.audioMessage;
        return;
      }
      const config = normalizedConfig;
      const exerciseMode = normalizedMode.mode;
      const performance = await runtime.beginPerformance();
      if (request !== startRequest || generation !== routeGeneration) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      const selectedTuning =
        curatedTunings(config.instrument).find((profile) => profile.id === config.tuningId) ??
        tuning;
      if (exerciseMode === "note-finder") {
        const nextPrompt = await session.startFretboardNoteFinder({
          tuning: selectedTuning,
          stringNumber: config.stringNumber,
          fretNumber: config.startFret,
          visibleFrets: 12,
        });
        if (request !== startRequest || generation !== routeGeneration) {
          runtime.endPerformance();
          session.abandon();
          return;
        }
        status = `Find ${nextPrompt.targetNote} on the fretboard.`;
      } else {
        await session.startSpider({
          tuning: selectedTuning,
          stringNumber: config.stringNumber,
          startFret: config.startFret,
          bpm: config.bpm,
          pattern: config.pattern,
          stringSpan: config.stringSpan,
          crossing: config.crossing,
        });
        if (request !== startRequest || generation !== routeGeneration) {
          runtime.endPerformance();
          session.abandon();
          return;
        }
        const spanLabel =
          SPIDER_DRILL_SPANS.find((option) => option.value === config.stringSpan)?.label ??
          "the selected strings";
        status = `Play ${SPIDER_DRILL_PATTERNS.find((option) => option.value === config.pattern)?.label ?? "the pattern"} across ${spanLabel.toLowerCase()}${config.crossing && config.stringSpan !== "single" ? ", crossing strings on every note" : ""}.`;
      }
      captured = false;
      resultsDismissed = false;
    } catch (error) {
      runtime.endPerformance();
      if (request === startRequest && generation === routeGeneration) {
        status = message(error, "The string technique drill could not be started.");
      }
    } finally {
      pending = false;
    }
  }

  function cancel(): void {
    startRequest += 1;
    runtime.endPerformance();
    session?.abandon();
    status = "Spider cancelled. You can start again.";
  }

  function changeSetup(): void {
    startRequest += 1;
    status = "Setup ready. Change the string technique settings or start again.";
    resultsDismissed = true;
  }

  async function slowDown(): Promise<void> {
    const current = Number(bpm);
    const slowerTempo =
      [...SPIDER_DRILL_TEMPOS].reverse().find((tempo) => tempo < current) ??
      SPIDER_DRILL_TEMPOS[0];
    runtime.setPracticeVariantBpm(slowerTempo, variantKey);
    await start();
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.12, undefined, event.velocity);
    }
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const stringMode = normalizedMode;
    const params = new URLSearchParams(window.location.search);
    params.set("mode", stringMode.mode);
    params.set("instrument", config.instrument);
    params.set("tuning", config.tuningId);
    params.set("string", String(config.stringNumber));
    params.set("span", config.stringSpan);
    params.set("fret", String(config.startFret));
    params.set("bpm", String(config.bpm));
    params.set("pattern", config.pattern);
    if (config.crossing) params.set("crossing", "1");
    else params.delete("crossing");
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onMount(() => {
    audioState = audioSource.state;
    unsubscribeAudioState = audioSource.subscribeState((state) => {
      audioState = state;
    });
    unsubscribeAudioEvents = audioSource.subscribeEvents((event) => {
      if (sessionState?.status !== "active" || event.type !== "noteOn") return;
      if ((event.confidence ?? 1) < 0.55) return;
      runtime.router.push({ ...event, instrument });
    });
  });

  onDestroy(() => {
    destroyed = true;
    routeGeneration += 1;
    startRequest += 1;
    runtime.endPerformance();
    unsubscribeSession?.();
    unsubscribeMidiState();
    unsubscribeAudioState?.();
    unsubscribeAudioEvents?.();
    void audioSource.stop();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>String Independence | Practice OS</title>
  <meta
    name="description"
    content="Practice graded fretting-hand independence patterns on guitar or ukulele."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="String Independence"
    subtitle="Build fretting-hand independence with clean chromatic pattern permutations."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={inputDevice}
        live={sessionState?.status === "active" &&
          (runtime.activeSource === "midi" || audioState.status === "running")}
      />
    {/snippet}
  </PracticeScreenHeader>


  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>
          {normalizedMode.mode === "note-finder" ? "Note found" : "Spider complete"}
        </Card.Description>
        <Card.Title>{summary?.xp ?? 0} XP</Card.Title>
      {/snippet}
      {#snippet children()}
        {#if normalizedMode.mode === "note-finder" && noteFinderAnswer}
          <SessionFeedback
            kind={summary && summary.correct === summary.total ? "correct" : "wrong"}
            message="Note found"
            detail={`Target ${noteFinderAnswer.targetMidi}${noteFinderAnswer.playedMidiNote === undefined ? "" : ` · played ${noteFinderAnswer.playedMidiNote}`}`}
            xp={summary?.xp ?? 0}
          />
        {:else if answer}
          <SessionFeedback
            kind={summary && summary.correct === summary.total ? "correct" : "wrong"}
            message="Spider complete"
            detail={`${Math.round(answer.pitchAccuracy * 100)}% notes · ${Math.round(answer.meanTimingErrorMs)}ms mean timing error`}
            xp={summary?.xp ?? 0}
          />
        {/if}
      {/snippet}
      {#snippet actions()}
        {#if normalizedMode.mode === "note-finder"}
          <AdaptiveRetryBar onRetry={start} retryLabel="Repeat note finder" />
        {:else}
          <AdaptiveRetryBar onRetry={start} onSlower={slowDown} retryLabel="Repeat spider" />
        {/if}
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} summary={summaryPhase}>
    {#snippet setup()}
      <Card.Root class="min-w-0">
        <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Card.Description>Chromatic fretting</Card.Description>
            <Card.Title bind:ref={setupHeading} tabindex="-1">
              Pattern permutations across strings
            </Card.Title>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
              {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!audioSupported || audioState.status === "requesting"}
              onclick={toggleMicrophone}
            >
              {#if audioState.status === "running" || audioState.status === "requesting"}
                Stop microphone
              {:else}
                Start microphone
              {/if}
            </Button>
          </div>
        </Card.Header>

        <Card.Content class="grid gap-6">
          <div class="grid gap-1 text-xs text-muted-foreground">
            <p>{midiStatus}</p>
            <p>{microphoneStatus}</p>
          </div>
          <fieldset class="grid gap-4">
            <SegmentedControl
              ariaLabel="Exercise"
              options={modeOptions}
              bind:value={mode}
            />

            <SegmentedControl
              ariaLabel="Instrument"
              options={instrumentOptions}
              value={instrument}
              onChange={(value) => {
                selectInstrument(value);
                runtime.setActiveInstrument(value as StringInstrumentId);
              }}
            />

            <div class="grid gap-4 sm:grid-cols-3">
              <div class="grid gap-2">
                <Label for="spider-pattern">Pattern</Label>
                <select
                  id="spider-pattern"
                  aria-label="Pattern"
                  bind:value={pattern}
                  class="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {#each SPIDER_DRILL_PATTERNS as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>
              <div class="grid gap-2">
                <Label for="spider-tuning">Tuning</Label>
                <select
                  id="spider-tuning"
                  aria-label="Tuning"
                  bind:value={tuningId}
                  class="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {#each tunings as profile (profile.id)}
                    <option value={profile.id}>{profile.name}</option>
                  {/each}
                </select>
              </div>
              <div class="grid gap-2">
                <Label for="spider-string">String</Label>
                <select
                  id="spider-string"
                  aria-label="String"
                  bind:value={stringNumber}
                  class="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {#each tuning.openStrings as _, index (index)}
                    <option value={index + 1}>String {index + 1}</option>
                  {/each}
                </select>
              </div>
              <div class="grid gap-2">
                <Label for="spider-span">String span</Label>
                <select
                  id="spider-span"
                  aria-label="String span"
                  bind:value={stringSpan}
                  class="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {#each SPIDER_DRILL_SPANS as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>
              <div class="grid gap-2">
                <Label for="spider-fret">Starting fret</Label>
                <select
                  id="spider-fret"
                  aria-label="Starting fret"
                  bind:value={startFret}
                  class="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {#each Array.from({ length: Math.min(10, tuning.fretCount - 2) }, (_, fret) => fret) as fret (fret)}
                    <option value={fret}>Fret {fret}</option>
                  {/each}
                </select>
              </div>
            </div>

            {#if stringSpan !== "single"}
              <div class="grid gap-2">
                <Label id="spider-order-label">String order</Label>
                <SegmentedControl
                  size="sm"
                  ariaLabel="String order"
                  options={[
                    { value: "blocks", label: "By string" },
                    { value: "crossing", label: "Crossing" },
                  ]}
                  value={crossing ? "crossing" : "blocks"}
                  onChange={(value) => (crossing = value === "crossing")}
                />
              </div>
            {/if}

            <p class="text-sm font-semibold tabular-nums">Tempo · {bpm} BPM</p>
          </fieldset>
        </Card.Content>

        <Card.Footer class="flex-wrap gap-3">
          <Button type="button" disabled={!ready || pending} onclick={start}>
            {pending
              ? "Starting..."
              : normalizedMode.mode === "note-finder"
                ? "Start note finder"
                : "Start spider"}
          </Button>
          <StartShortcut onStart={() => void start()} />
          <p class="text-sm text-muted-foreground">{status}</p>
        </Card.Footer>
      </Card.Root>
    {/snippet}

    {#snippet stage()}
      <h2 class="sr-only" tabindex="-1" bind:this={activeHeading}>
        {prompt?.label ??
          noteFinderPrompt?.label ??
          `${instrument === "guitar" ? "Guitar" : "Ukulele"} string ${stringNumber}`}
      </h2>
      <FrettedSequenceStage
        {instrument}
        label={prompt?.label ??
          `${instrument === "guitar" ? "Guitar" : "Ukulele"} string ${stringNumber}`}
        {tuning}
        router={runtime.router}
        steps={sequenceSteps}
        completedCount={completedNotes}
        currentIndex={completedNotes}
        visibleFrets={12}
        visibleStrings={prompt?.stringNumbers ?? [stringNumber]}
        showTargetNotes={normalizedMode.mode !== "note-finder"}
        showActiveTarget={normalizedMode.mode !== "note-finder"}
        onAccepted={playAccepted}
      />
    {/snippet}

    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={cancel}>Cancel spider</Button>
    {/snippet}

    {#snippet rail()}
      <div class="grid grid-cols-2 gap-3">
        <HudTile label="Next" value={nextPositionLabel} tone="accent" />
        <HudTile label="Notes" value={completedNotes} unit={`/${targetNoteCount}`} />
        <HudTile
          label="Quality"
          value={Math.round((sessionState?.live?.runningScore ?? 0) * 100)}
          unit="%"
          tone="good"
        />
        <HudTile label="Tempo" value={bpm} unit="BPM" />
      </div>
      {#if prompt || noteFinderPrompt}
        <div class="grid gap-3 rounded-lg border bg-card p-4">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-medium">{prompt?.label ?? noteFinderPrompt?.label}</span>
            <span class="tabular-nums text-muted-foreground">
              {completedNotes}/{targetNoteCount}
            </span>
          </div>
          <Progress value={completedNotes} max={targetNoteCount} />
        </div>
      {/if}
      <p class="text-xs text-muted-foreground" aria-live="polite">{midiStatus}</p>
      <p class="text-xs text-muted-foreground" aria-live="polite">{microphoneStatus}</p>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
