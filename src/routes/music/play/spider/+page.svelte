<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

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
  import HudTile from "../../_components/HudTile.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SessionFeedback from "../../_components/SessionFeedback.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime } from "../../_runtime.svelte";

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
  }: {
    audioSource?: SpiderAudioSource;
    audioSupported?: boolean;
  } = $props();

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const instrumentOptions = [
    { value: "guitar", label: "Guitar" },
    { value: "ukulele", label: "Ukulele" },
  ];
  const tempoOptions = SPIDER_DRILL_TEMPOS.map((value) => ({
    value: String(value),
    label: `${value} BPM`,
  }));
  const modeOptions = [
    { value: "spider", label: "Spider" },
    { value: "note-finder", label: "Note Finder" },
  ];
  const defaultInstrument: StringInstrumentId =
    runtime.activeInstrument === "ukulele" ? "ukulele" : "guitar";
  const initialConfig = normalizeSpiderDrillConfig(
    browser ? initialDrillSearch() : {},
    defaultInstrument,
  );
  const initialMode = normalizeStringTechniqueConfig(
    browser ? initialDrillSearch() : {},
  );

  let mode = $state<StringTechniqueMode>(initialMode.mode);
  let instrument = $state<StringInstrumentId>(initialConfig.instrument);
  let tuningId = $state(initialConfig.tuningId);
  let stringNumber = $state(initialConfig.stringNumber);
  let stringSpan = $state<StringSpiderSpan>(initialConfig.stringSpan);
  let startFret = $state(initialConfig.startFret);
  let pattern = $state<StringPatternKind>(initialConfig.pattern);
  let bpm = $state(String(initialConfig.bpm));
  let ready = $state(false);
  let pending = $state(false);
  let captured = false;
  let status = $state("Preparing string technique.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let audioState = $state<AudioPitchState>({ status: "idle" });
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
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
    }),
  );
  const normalizedMode = $derived(normalizeStringTechniqueConfig({ mode }));

  void initialize();

  $effect(() => {
    syncConfigUrl();
  });

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
  });

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
      session = new TechniqueSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      unsubscribeSession = session.subscribe((state) => {
        sessionState = state;
        if (state.error) status = state.error;
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
    runtime.setActiveInstrument(instrument);
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
    const config = normalizedConfig;
    pending = true;
    captured = false;
    status = "";
    try {
      const selectedTuning =
        curatedTunings(config.instrument).find((profile) => profile.id === config.tuningId) ??
        tuning;
      if (normalizedMode.mode === "note-finder") {
        const nextPrompt = await session.startFretboardNoteFinder({
          tuning: selectedTuning,
          stringNumber: config.stringNumber,
          fretNumber: config.startFret,
          visibleFrets: 12,
        });
        status = `Find ${nextPrompt.targetNote} on the fretboard.`;
      } else {
        await session.startSpider({
          tuning: selectedTuning,
          stringNumber: config.stringNumber,
          startFret: config.startFret,
          bpm: config.bpm,
          pattern: config.pattern,
          stringSpan: config.stringSpan,
        });
        const spanLabel =
          SPIDER_DRILL_SPANS.find((option) => option.value === config.stringSpan)?.label ??
          "the selected strings";
        status = `Play ${SPIDER_DRILL_PATTERNS.find((option) => option.value === config.pattern)?.label ?? "the pattern"} across ${spanLabel.toLowerCase()}.`;
      }
    } catch (error) {
      status = message(error, "The string technique drill could not be started.");
    } finally {
      pending = false;
    }
  }

  function cancel(): void {
    session?.abandon();
    status = "Spider cancelled. You can start again.";
  }

  async function slowDown(): Promise<void> {
    const current = Number(bpm);
    const slowerTempo =
      [...SPIDER_DRILL_TEMPOS].reverse().find((tempo) => tempo < current) ??
      SPIDER_DRILL_TEMPOS[0];
    bpm = String(slowerTempo);
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
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onMount(() => {
    runtime.setActiveInstrument(instrument);
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

  <PracticeDrillShell>
    {#snippet setup()}
      <Card.Root class="min-w-0">
        <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Card.Description>Chromatic fretting</Card.Description>
            <Card.Title>Pattern permutations across strings</Card.Title>
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
          <fieldset
            disabled={sessionState?.status === "active"}
            class="grid gap-4 disabled:opacity-70"
          >
            <SegmentedControl
              ariaLabel="Exercise"
              options={modeOptions}
              bind:value={mode}
            />

            <SegmentedControl
              ariaLabel="Instrument"
              options={instrumentOptions}
              value={instrument}
              onChange={selectInstrument}
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
                  {#each tuning.openStrings as _, index}
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
                  {#each Array.from({ length: Math.min(10, tuning.fretCount - 2) }, (_, fret) => fret) as fret}
                    <option value={fret}>Fret {fret}</option>
                  {/each}
                </select>
              </div>
            </div>

            <SegmentedControl ariaLabel="Tempo" options={tempoOptions} bind:value={bpm} />
          </fieldset>
        </Card.Content>

        <Card.Footer class="flex-wrap gap-3">
          {#if sessionState?.status === "active"}
            <Button type="button" variant="outline" onclick={cancel}>Cancel spider</Button>
          {:else}
            <Button type="button" disabled={!ready || pending} onclick={start}>
              {pending
                ? "Starting..."
                : normalizedMode.mode === "note-finder"
                  ? summary
                    ? "Repeat note finder"
                    : "Start note finder"
                  : summary
                    ? "Repeat spider"
                    : "Start spider"}
            </Button>
            <StartShortcut onStart={() => void start()} />
          {/if}
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>
    {/snippet}

    {#snippet stage()}
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

    {#snippet feedback()}
      {#if summary && normalizedMode.mode === "note-finder" && noteFinderAnswer}
        <div class="grid gap-3">
          <SessionFeedback
            kind={summary.correct === summary.total ? "correct" : "wrong"}
            message="Note found"
            detail={`Target ${noteFinderAnswer.targetMidi}${noteFinderAnswer.playedMidiNote === undefined ? "" : ` · played ${noteFinderAnswer.playedMidiNote}`}`}
            xp={summary.xp}
          />
          <AdaptiveRetryBar onRetry={start} retryLabel="Repeat note finder" />
        </div>
      {:else if summary && answer}
        <div class="grid gap-3">
          <SessionFeedback
            kind={summary.correct === summary.total ? "correct" : "wrong"}
            message="Spider complete"
            detail={`${Math.round(answer.pitchAccuracy * 100)}% notes · ${Math.round(answer.meanTimingErrorMs)}ms mean timing error`}
            xp={summary.xp}
          />
          <AdaptiveRetryBar onRetry={start} onSlower={slowDown} retryLabel="Repeat spider" />
        </div>
      {/if}
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
