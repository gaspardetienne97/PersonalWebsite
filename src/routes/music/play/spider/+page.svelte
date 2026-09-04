<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount, tick } from "svelte";

  import { unixMs, type NoteEvent } from "@repo/music-core/domain";
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
  import { fretWindowAround } from "@repo/music-core/engines/projection";
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
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
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

  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
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
  // Finger numbers on the dots: finger 1 sits on the start fret.
  const fingerLabels = $derived.by(() => {
    if (!prompt) return undefined;
    const labels: Record<number, string> = {};
    for (const position of prompt.positions) {
      labels[position.midiNote] = String(position.fretNumber - prompt.startFret + 1);
    }
    return labels;
  });
  // Spider plays inside a fret window: the frets in play plus one of context.
  // Note finder keeps the whole neck (that is the point of the drill).
  const spiderWindow = $derived(
    normalizedMode.mode === "note-finder"
      ? undefined
      : fretWindowAround(
          prompt ? prompt.positions.map((position) => position.fretNumber) : [startFret, startFret + 3],
          tuning.fretCount,
        ),
  );
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
  const instrumentLabel = $derived(instrument === "guitar" ? "Guitar" : "Ukulele");
  const patternLabel = $derived(
    SPIDER_DRILL_PATTERNS.find((option) => option.value === pattern)?.label ?? "Pattern",
  );
  const spanLabel = $derived(
    SPIDER_DRILL_SPANS.find((option) => option.value === stringSpan)?.label ?? "One string",
  );
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
      status = "Ready. Press Start, or Space.";
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
  <PracticeScreenHeader title="String Independence" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={inputDevice}
        live={sessionState?.status === "active" &&
          (runtime.activeSource === "midi" || audioState.status === "running")}
      />
    {/snippet}
  </PracticeScreenHeader>

  <!-- The one live region for this route; the MIDI and microphone lines are visible text only. -->
  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet inputActions()}
    <Button type="button" variant="outline" disabled={midiEnabled || pending} onclick={enableMidi}>
      {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
    </Button>
    <Button
      type="button"
      variant="outline"
      disabled={pending || !audioSupported || audioState.status === "requesting"}
      onclick={toggleMicrophone}
    >
      {#if audioState.status === "running" || audioState.status === "requesting"}
        Stop microphone
      {:else}
        Start microphone
      {/if}
    </Button>
  {/snippet}

  {#snippet setupSummaryLine()}
    {#if normalizedMode.mode === "note-finder"}
      Note Finder · {instrumentLabel} · {tuning.name} · {bpm} BPM
    {:else}
      {patternLabel} · {instrumentLabel} · String {stringNumber} · {spanLabel} · Fret {startFret} · {bpm} BPM
    {/if}
  {/snippet}

  {#snippet summaryPhase()}
    {@const noteFinder = normalizedMode.mode === "note-finder"}
    {@const primaryPct = noteFinder
      ? Math.round(((summary?.correct ?? 0) / Math.max(1, summary?.total ?? 1)) * 100)
      : Math.round((answer?.pitchAccuracy ?? 0) * 100)}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>
          {noteFinder ? `Note Finder · ${instrumentLabel}` : `${patternLabel} · ${instrumentLabel} · ${spanLabel}`}
        </Card.Description>
        <Card.Title>{noteFinder ? "Note found" : "Spider complete"}</Card.Title>
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline">
          <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
            {primaryPct}<span class="text-3xl text-muted-foreground">%</span>
          </span>
          <span class="sr-only"> {noteFinder ? "found" : "of notes matched"}</span>
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta
          tags={["technique", noteFinder ? "note-finder" : "spider"]}
          accuracy={primaryPct / 100}
          before={visitStartedAt}
        />
      {/snippet}
      {#snippet children()}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {#if noteFinder && noteFinderAnswer}
            <HudTile size="sm" label="Target" value={noteFinderAnswer.targetMidi} unit="midi" />
            <HudTile size="sm" label="Played" value={noteFinderAnswer.playedMidiNote ?? "none"} />
          {:else if answer}
            <HudTile size="sm" label="Notes" value={Math.round(answer.pitchAccuracy * 100)} unit="%" />
            <HudTile size="sm" label="Timing error" value={Math.round(answer.meanTimingErrorMs)} unit="ms" />
            <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
          {/if}
          <HudTile size="sm" label="Input" value={inputDevice} />
        </div>
        <p class="text-xs text-muted-foreground">+{summary?.xp ?? 0} XP · Technique</p>
      {/snippet}
      {#snippet actions()}
        {#if noteFinder}
          <AdaptiveRetryBar onRetry={start} retryLabel="Again" />
        {:else}
          <AdaptiveRetryBar onRetry={start} onSlower={slowDown} retryLabel="Again" />
        {/if}
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/spider" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} setupSummary={setupSummaryLine} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid min-w-0 gap-4 rounded-lg border bg-card p-4">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div class="grid gap-2">
            <Label for="spider-pattern">Pattern</Label>
            <select
              id="spider-pattern"
              aria-label="Pattern"
              bind:value={pattern}
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <optgroup label="Classic spiders">
                {#each SPIDER_DRILL_PATTERNS.filter((option) => option.group === "classic") as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </optgroup>
              <optgroup label="All finger orders">
                {#each SPIDER_DRILL_PATTERNS.filter((option) => option.group === "permutation") as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </optgroup>
            </select>
          </div>
          <div class="grid gap-2">
            <Label for="spider-tuning">Tuning</Label>
            <select
              id="spider-tuning"
              aria-label="Tuning"
              bind:value={tuningId}
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {#each Array.from({ length: Math.min(10, tuning.fretCount - 2) }, (_, fret) => fret) as fret (fret)}
                <option value={fret}>Fret {fret}</option>
              {/each}
            </select>
          </div>
          {#if stringSpan !== "single"}
            <div class="grid gap-2">
              <span class="text-sm font-medium">String order</span>
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
        </div>
        <p class="text-sm tabular-nums text-muted-foreground">Tempo · {bpm} BPM (practice controls above)</p>
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage {instrument} class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · Chromatic fretting</p>
            <div
              role="heading"
              aria-level="2"
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              data-testid="spider-ready-heading"
              bind:this={setupHeading}
            >
              {normalizedMode.mode === "note-finder"
                ? "Find the note on the fretboard"
                : "Pattern permutations across strings"}
            </div>
            <p class="text-sm text-stage-muted">
              {normalizedMode.mode === "note-finder"
                ? "One note name at a time: find it anywhere on the neck."
                : `${patternLabel} from fret ${startFret} on ${spanLabel.toLowerCase()}, one clean note per beat.`}
              {#if spiderWindow}
                <span data-testid="spider-fret-range"> Frets {spiderWindow.start} to {spiderWindow.end} shown.</span>
              {/if}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled={!ready || pending} onclick={start}>
              {pending ? "Starting..." : "Start"}
            </Button>
            <StartShortcut onStart={() => void start()} enabled={ready && !pending} />
          </div>
        </div>
        <!-- Exercise and instrument are what you drill, so they stay on the stage; the
             fieldset mirrors the shell's start lock. -->
        <fieldset class="flex min-w-0 flex-wrap gap-3 border-0 p-0" disabled={pending}>
          <SegmentedControl ariaLabel="Exercise" options={modeOptions} bind:value={mode} />
          <SegmentedControl
            ariaLabel="Instrument"
            options={instrumentOptions}
            value={instrument}
            onChange={(value) => {
              selectInstrument(value);
              runtime.setActiveInstrument(value as StringInstrumentId);
            }}
          />
        </fieldset>
        <div class="grid gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
          <div class="flex flex-wrap gap-2">
            {@render inputActions()}
          </div>
          <p class="text-sm text-stage-muted">{midiStatus}</p>
          <p class="text-sm text-stage-muted">{microphoneStatus}</p>
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stage()}
      <div class="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <p class="eyebrow">{instrumentLabel} · {bpm} BPM</p>
          <h2 class="text-xl font-semibold tracking-tight" tabindex="-1" bind:this={activeHeading}>
            {prompt?.label ?? noteFinderPrompt?.label ?? `${instrumentLabel} string ${stringNumber}`}
          </h2>
        </div>
        <span class="text-sm tabular-nums text-muted-foreground">{completedNotes} / {targetNoteCount} notes</span>
      </div>
      <FrettedSequenceStage
        {instrument}
        label={prompt?.label ?? `${instrumentLabel} string ${stringNumber}`}
        {tuning}
        router={runtime.router}
        steps={sequenceSteps}
        completedCount={completedNotes}
        currentIndex={completedNotes}
        visibleFrets={12}
        visibleStrings={prompt?.stringNumbers ?? [stringNumber]}
        fretWindow={spiderWindow}
        dotLabels={fingerLabels}
        showTargetNotes={normalizedMode.mode !== "note-finder"}
        showActiveTarget={normalizedMode.mode !== "note-finder"}
        onAccepted={playAccepted}
      />
      {#if prompt || noteFinderPrompt}
        <div class="grid gap-2 px-1">
          <Progress value={completedNotes} max={targetNoteCount} />
          <p class="text-sm text-muted-foreground">{status}</p>
        </div>
      {/if}
    {/snippet}

    {#snippet stageAction()}
      {@render inputActions()}
      <Button type="button" variant="outline" onclick={cancel}>Stop</Button>
    {/snippet}

    {#snippet rail()}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <HudTile size="sm" label="Next" value={nextPositionLabel} tone="accent" />
        <HudTile size="sm" label="Notes" value={completedNotes} unit={`/${targetNoteCount}`} />
        <HudTile
          size="sm"
          label="Quality"
          value={Math.round((sessionState?.live?.runningScore ?? 0) * 100)}
          unit="%"
          tone="good"
        />
        <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
        <HudTile size="sm" label="Input" value={inputDevice} />
      </div>
      <p class="text-xs text-muted-foreground">{midiStatus}</p>
      <p class="text-xs text-muted-foreground">{microphoneStatus}</p>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
