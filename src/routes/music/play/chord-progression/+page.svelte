<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount, tick } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import {
    createChordFollower,
    expectedChordsFromProgression,
    type ChordFollowerRun,
    type ChordFollowerState,
    type ChordFollowerSummary,
    type ChordGrade,
    type ChordObservation,
  } from "@repo/music-core/engines/chord-follower";
  import { toPitchClasses } from "@repo/music-core/engines/chord-id";
  import {
    ChordAudioSource,
    chromaToPitchClasses,
    type ChordAnalysis,
    type AudioPitchState,
  } from "@repo/music-core/engines/audio-in";
  import {
    JAM_PROGRESSIONS,
    JAM_PROGRESSION_GROUPS,
    normalizeChordProgressionDrillConfig,
    targetTones,
    transposeProgression,
    type JamProgressionGroup,
    type TargetTone,
    type ToneRole,
  } from "@repo/music-core/engines/jam";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PianoSurface, { type PianoHighlightRole } from "../../_components/piano/PianoSurface.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import ProgressionChartStage from "../../_components/ProgressionChartStage.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  interface ChordSourceLike {
    readonly state: AudioPitchState;
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribeState(listener: (state: AudioPitchState) => void): () => void;
    subscribeAnalysis(listener: (analysis: ChordAnalysis) => void): () => void;
  }

  const {
    audioSource = new ChordAudioSource(),
    analyzeOnsetWindow = defaultAnalyzeOnsetWindow,
    runtime = useMusicRuntime(),
  }: {
    audioSource?: ChordSourceLike;
    /** Run Basic Pitch on a buffered onset window and return detected MIDI notes. Injectable for tests. */
    analyzeOnsetWindow?: (window: Float32Array) => Promise<number[]>;
    runtime?: MusicRuntime;
  } = $props();

  // ponytail: reuse the transcribe route's raw-PCM Basic Pitch adapter — the
  // chord follower only needs MIDI notes from a buffered onset window, never a
  // live frame loop.
  async function defaultAnalyzeOnsetWindow(window: Float32Array): Promise<number[]> {
    const { extractBasicPitchNotesFromSamples } = await import(
      "../../transcribe/basic-pitch-extractor"
    );
    const notes = await extractBasicPitchNotesFromSamples(window);
    return notes.map((note) => note.midiNote);
  }

  const progressionOptions = JAM_PROGRESSIONS.map((entry) => ({
    value: entry.id,
    label: entry.name,
  }));
  const groupOptions = JAM_PROGRESSION_GROUPS.map((group) => ({
    value: group.id,
    label: group.label,
  }));
  const transposeOptions = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((value) => ({
    value: String(value),
    label: value === 0 ? "0" : value > 0 ? `+${value}` : String(value),
  }));
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const initialConfig = normalizeChordProgressionDrillConfig(initialSearch);
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;

  let progressionGroup = $state<JamProgressionGroup>(initialConfig.group);
  let progressionId = $state(initialConfig.progressionId);
  let bpm = $state(initialConfig.bpm);
  let transposeSemitones = $state(String(initialConfig.transpose));
  let followerState = $state<ChordFollowerState | undefined>();
  let detected = $state<number[]>([]);
  let running = $state(false);
  let startPending = $state(false);
  let sourceTeardownPending = $state(false);
  let status = $state("Pick a progression, then start strumming on the beat.");
  let follower: ChordFollowerRun | undefined;
  let unsubscribeAnalysis: (() => void) | undefined;
  let unsubscribeAudioState: (() => void) | undefined;
  let audioState = $state<AudioPitchState>({ status: "idle" });
  let captured = false;
  // Input path (decision 10): the microphone strums through Basic Pitch, or MIDI /
  // on-screen keys through the shared router. Keys is the default when a MIDI
  // device is already the active source, so a pianist lands on a usable drill.
  let inputMode = $state<"microphone" | "keys">(runtime.activeSource === "midi" ? "keys" : "microphone");
  let unsubscribeNotes: (() => void) | undefined;
  // Notes currently sounding on the keys path; a chord is the set held ~150 ms
  // after the last attack, so a MIDI chord (attacks a few ms apart) and an
  // on-screen latched chord (clicks a second apart) both arrive as one observation.
  const sounding = new Set<number>();
  let chordTimer: ReturnType<typeof setTimeout> | undefined;
  let chordStartMs: number | undefined;
  const CHORD_WINDOW_MS = 150;
  // Bumped after every flushed chord so the on-screen keyboard drops its latched
  // notes (wait-group reset) and the next chord starts from an empty hand.
  let chordFlushes = $state(0);

  const baseProgression = $derived(
    JAM_PROGRESSIONS.find((entry) => entry.id === progressionId) ?? JAM_PROGRESSIONS[0]!,
  );
  const filteredProgressionOptions = $derived(
    JAM_PROGRESSIONS.filter((entry) => entry.group === progressionGroup).map((entry) => ({
      value: entry.id,
      label: entry.name,
    })),
  );
  const progression = $derived(transposeProgression(baseProgression, Number(transposeSemitones)));
  const expected = $derived(expectedChordsFromProgression(progression));
  const currentIndex = $derived(followerState?.currentIndex ?? 0);
  const currentChord = $derived(progression.chords[currentIndex] ?? progression.chords[0]!);
  const chartTones = $derived<TargetTone[]>(targetTones(currentChord.symbol, currentChord.scale));
  const detectedLabels = $derived(detected.map(pitchClassLabel).join(", ") || "None yet");
  // One keyboard carries the tone roles of the current chord (by pitch class) and
  // lights its chord tones as targets around middle C; on the keys path it is live.
  const KEY_RANGE = Array.from({ length: 37 }, (_, i) => 48 + i);
  const keyToneRoles = $derived(
    Object.fromEntries(
      KEY_RANGE.map((midi) => [
        midi,
        chartTones.find((tone) => tone.pitchClass === midi % 12)?.role ?? ("avoid" as ToneRole),
      ]),
    ) as Record<number, ToneRole>,
  );
  const currentChordMidi = $derived(
    (expected[currentIndex]?.pitchClasses ?? []).map((pc) => 60 + pc).sort((a, b) => a - b),
  );
  const keyTargets = $derived<Record<number, PianoHighlightRole>>(
    Object.fromEntries(currentChordMidi.map((midi) => [midi, "target"])),
  );
  const normalizedConfig = $derived(
    normalizeChordProgressionDrillConfig({
      group: progressionGroup,
      progression: progressionId,
      bpm,
      transpose: transposeSemitones,
    }),
  );
  const variantKey = $derived(`v1:chord-progression:${progressionId}:follow`);
  let routeGeneration = 0;
  let captureGeneration = 0;
  let onsetQueue: Promise<void> = Promise.resolve();
  let practiceContextReady: Promise<void> = Promise.resolve();

  // The settled run summary (finish() output). It is set only when a run ends
  // via Stop; `resultsDismissed` (set by "Change setup") lets the route leave
  // the summary phase without starting a new run. Both reset on every start.
  let summary = $state<ChordFollowerSummary | undefined>();
  let finishError = $state<string | undefined>();
  let resultsDismissed = $state(false);
  // Route-computed shell phase. The shell renders exactly this phase and never
  // transitions; setup is hidden during the run and while showing results.
  const phase = $derived<"summary" | "stage" | "setup">(
    summary && !resultsDismissed ? "summary" : running ? "stage" : "setup",
  );
  // Persistent live region announces phase swaps, which remount the visible text.
  const liveAnnouncement = $derived(
    phase === "summary" && summary ? (finishError ?? status) : status,
  );

  // Branch swaps drop focus to <body>; move it to the freshly mounted stage or
  // results heading on each transition, but never on initial mount.
  let activeHeading = $state<HTMLElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let setupHeading = $state<HTMLElement | null>(null);
  let previousPhase: "summary" | "stage" | "setup" | undefined;

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
    const defaultBpm = baseProgression.defaultBpm ?? 100;
    routeGeneration += 1;
    let disposed = false;
    let cleanup: () => void = () => undefined;
    practiceContextReady = runtime
      .registerPracticeContext({
        owner: "chord-progression",
        variantKey: key,
        defaultBpm,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        onBpmChange: (next) => (bpm = next),
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

  function selectGroup(value: string): void {
    const config = normalizeChordProgressionDrillConfig({ group: value });
    progressionGroup = config.group;
    progressionId = config.progressionId;
    bpm = config.bpm;
    transposeSemitones = String(config.transpose);
  }

  function selectProgression(value: string): void {
    const config = normalizeChordProgressionDrillConfig({ progression: value });
    progressionGroup = config.group;
    progressionId = config.progressionId;
    bpm = config.bpm;
    transposeSemitones = String(config.transpose);
  }

  function gradeBadge(grade: ChordGrade | undefined): string {
    if (!grade) return "pending";
    if (!grade.matched) return "missed";
    return grade.timingBand === "in-time" ? "matched in-time" : "matched off-time";
  }

  function gradeTone(grade: ChordGrade | undefined): "default" | "good" | "accent" {
    const badge = gradeBadge(grade);
    if (badge === "matched in-time") return "good";
    if (badge === "matched off-time") return "accent";
    return "default";
  }

  function chordBadge(index: number): string {
    return gradeBadge(followerState?.grades[index]);
  }

  function badgeTone(index: number): "default" | "good" | "accent" {
    return gradeTone(followerState?.grades[index]);
  }

  // Leave the summary phase for setup without starting a run. Mirrors scales'
  // route-owned Change setup; the summary is retained but hidden.
  function changeSetup(): void {
    resultsDismissed = true;
    followerState = undefined;
    detected = [];
    status = "Setup ready — choose a progression, then start.";
  }

  async function start(): Promise<void> {
    if (running || startPending || sourceTeardownPending) return;
    const capture = ++captureGeneration;
    follower = undefined;
    onsetQueue = Promise.resolve();
    startPending = true;
    captured = false;
    summary = undefined;
    finishError = undefined;
    resultsDismissed = false;
    followerState = undefined;
    detected = [];
    const useMicrophone = inputMode === "microphone";
    status = useMicrophone ? "Requesting microphone access." : "Starting.";
    try {
      await tick();
      const generation = routeGeneration;
      await practiceContextReady;
      if (!captureIsCurrent(capture, generation)) {
        return;
      }
      if (useMicrophone) {
        await audioSource.start();
        if (!captureIsCurrent(capture, generation)) {
          await resetCapture(capture);
          return;
        }
        audioState = audioSource.state;
        if (audioSource.state.status !== "running") {
          status = audioSource.state.message ?? "Microphone capture could not start.";
          await resetCapture(capture);
          return;
        }
      }
      const config = normalizedConfig;
      const performance = await runtime.beginPerformance();
      if (!captureIsCurrent(capture, generation)) {
        await resetCapture(capture);
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        await resetCapture(capture);
        return;
      }
      if (useMicrophone && audioSource.state.status !== "running") {
        status = audioSource.state.message ?? "Microphone capture stopped before the downbeat.";
        await resetCapture(capture);
        return;
      }
      const startAtMs = performance.downbeat;
      const nextFollower = createChordFollower(expected, { bpm: config.bpm, startAtMs });
      if (!captureIsCurrent(capture, generation)) return;
      follower = nextFollower;
      followerState = nextFollower.state();
      if (useMicrophone) unsubscribeAnalysis = audioSource.subscribeAnalysis(onAnalysis);
      else unsubscribeNotes = runtime.router.subscribe(onNoteEvent);
      startPending = false;
      running = true;
      status = useMicrophone
        ? "Listening. Strum each chord on the beat."
        : "Listening. Play each chord on the beat.";
    } catch (error) {
      if (capture === captureGeneration) {
        status = message(error, "The chord-progression drill could not be started.");
        await resetCapture(capture);
      }
    }
  }

  async function resetCapture(expectedGeneration?: number): Promise<void> {
    if (expectedGeneration !== undefined && expectedGeneration !== captureGeneration) return;
    captureGeneration += 1;
    runtime.endPerformance();
    running = false;
    startPending = false;
    unsubscribeAnalysis?.();
    unsubscribeAnalysis = undefined;
    stopNotes();
    follower = undefined;
    onsetQueue = Promise.resolve();
    await audioSource.stop();
  }

  function stopNotes(): void {
    unsubscribeNotes?.();
    unsubscribeNotes = undefined;
    if (chordTimer !== undefined) clearTimeout(chordTimer);
    chordTimer = undefined;
    chordStartMs = undefined;
    sounding.clear();
  }

  // Keys path: collect attacks into one chord observation per window.
  function onNoteEvent(event: NoteEvent): void {
    if (!follower) return;
    if (event.type === "noteOff") {
      sounding.delete(event.midiNote);
      return;
    }
    if (event.type !== "noteOn") return;
    sounding.add(event.midiNote);
    if (chordStartMs === undefined) chordStartMs = event.timestamp;
    if (chordTimer !== undefined) clearTimeout(chordTimer);
    const activeFollower = follower;
    const generation = captureGeneration;
    chordTimer = setTimeout(() => flushChord(activeFollower, generation), CHORD_WINDOW_MS);
  }

  function flushChord(activeFollower: ChordFollowerRun, generation: number): void {
    chordTimer = undefined;
    const atMs = chordStartMs;
    chordStartMs = undefined;
    if (atMs === undefined || !followerIsCurrent(activeFollower, generation)) return;
    const pitchClasses = toPitchClasses([...sounding]);
    if (pitchClasses.length === 0) return;
    detected = pitchClasses;
    followerState = activeFollower.accept({ pitchClasses, confidence: 0.9, source: "onset", atMs });
    sounding.clear();
    chordFlushes += 1;
  }

  async function stop(): Promise<void> {
    if (follower) await finish(follower, captureGeneration);
    else {
      status = "Drill stopped.";
      await resetCapture();
    }
  }

  function onAnalysis(analysis: ChordAnalysis): void {
    const activeFollower = follower;
    const generation = captureGeneration;
    if (!activeFollower) return;
    // Chroma is a weak observation: the follower honors source/confidence, so it
    // uses chroma for the detected readout only — it grades/times/advances from
    // onsets, so feeding chroma here can't false-advance with no strum.
    if (!analysis.onsetWindow) {
      const observation: ChordObservation = {
        pitchClasses: chromaToPitchClasses(analysis.chroma),
        confidence: 0.4,
        source: "chroma",
        atMs: analysis.timestamp,
      };
      if (!followerIsCurrent(activeFollower, generation)) return;
      followerState = activeFollower.accept(observation);
      detected = followerState.detectedPitchClasses;
      return;
    }
    onsetQueue = onsetQueue
      .then(() => gradeOnset(analysis, activeFollower, generation))
      .catch((error) => {
        if (followerIsCurrent(activeFollower, generation)) {
          status = message(error, "Chord analysis failed. Try the next strum.");
        }
      });
  }

  async function gradeOnset(
    analysis: ChordAnalysis,
    activeFollower: ChordFollowerRun,
    generation: number,
  ): Promise<void> {
    if (!analysis.onsetWindow || !followerIsCurrent(activeFollower, generation)) return;
    const midi = await analyzeOnsetWindow(analysis.onsetWindow);
    if (!followerIsCurrent(activeFollower, generation)) return;
    const pitchClasses = toPitchClasses(midi);
    detected = pitchClasses;
    const observation: ChordObservation = {
      pitchClasses,
      confidence: 0.9,
      source: "onset",
      atMs: analysis.timestamp,
    };
    followerState = activeFollower.accept(observation);
    if (followerState.done) await finish(activeFollower, generation);
  }

  async function finish(activeFollower: ChordFollowerRun, generation: number): Promise<void> {
    if (!followerIsCurrent(activeFollower, generation) || captured) return;
    captured = true;
    running = false;
    startPending = false;
    runtime.endPerformance();
    const finishSummary = activeFollower.finish();
    // Set state in the same synchronous block as running=false so the phase
    // flips straight from stage to summary with no setup flash.
    summary = finishSummary;
    finishError = undefined;
    status = `Progression complete. ${finishSummary.correct}/${finishSummary.total} chords matched.`;
    unsubscribeAnalysis?.();
    unsubscribeAnalysis = undefined;
    stopNotes();
    sourceTeardownPending = true;
    try {
      const results = await Promise.allSettled([
        audioSource.stop(),
        runtime.recordPractice({
          source: "drill",
          instrument: "guitar",
          tags: ["technique", "chord-changes"],
          scoringEvents: [],
          xpEarned: Math.round(finishSummary.score * 20),
          note: `Chord progression · ${finishSummary.correct}/${finishSummary.total} chords`,
        }),
      ]);
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected && phase === "summary") {
        finishError = message(rejected.reason, "The completed run could not be finalized.");
      }
    } finally {
      sourceTeardownPending = false;
    }
  }

  function captureIsCurrent(capture: number, route: number): boolean {
    return capture === captureGeneration && route === routeGeneration;
  }

  function followerIsCurrent(activeFollower: ChordFollowerRun, generation: number): boolean {
    return generation === captureGeneration && follower === activeFollower;
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function pitchClassLabel(pitchClass: number): string {
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][pitchClass] ?? "?";
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const params = new URLSearchParams(window.location.search);
    params.set("group", config.group);
    params.set("progression", config.progressionId);
    params.set("bpm", String(config.bpm));
    params.set("transpose", String(config.transpose));
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onMount(() => {
    audioState = audioSource.state;
    unsubscribeAudioState = audioSource.subscribeState((next) => {
      audioState = next;
      if (running && next.status !== "running" && next.status !== "requesting") {
        status = next.message ?? "Microphone capture stopped.";
        void resetCapture();
      }
    });
  });

  onDestroy(() => {
    routeGeneration += 1;
    captureGeneration += 1;
    runtime.endPerformance();
    unsubscribeAnalysis?.();
    unsubscribeAudioState?.();
    stopNotes();
    follower = undefined;
    onsetQueue = Promise.resolve();
    void audioSource.stop();
  });
</script>

<svelte:head>
  <title>Chord Progression | Practice OS</title>
  <meta
    name="description"
    content="Strum a known chord progression in time — chroma + onset-confirmed Basic Pitch grade each chord change for correctness and timing."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Chord Progression"
    subtitle="Strum a known progression on the beat — the chord follower grades each change for correctness and timing."
  />

  <!-- Persistent live region: mounted outside the phase branches so transitions announce. -->
  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#if startPending}
    <div class="flex justify-end">
      <Button type="button" variant="outline" onclick={() => void stop()}>Stop</Button>
    </div>
  {/if}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>Progression complete</Card.Description>
        <Card.Title>{summary?.correct ?? 0} of {summary?.total ?? 0} chords matched</Card.Title>
      {/snippet}
      {#snippet children()}
        <p class="text-sm text-muted-foreground">
          Score: {Math.round((summary?.score ?? 0) * 100)}%
        </p>
        {#if finishError}
          <p class="text-sm text-destructive">{finishError}</p>
        {/if}
        <div class="grid gap-2 text-sm">
          {#each expected as chord, i (i)}
            <div class="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <span class="font-semibold">{chord.symbol}</span>
              <HudTile
                label="Grade"
                value={gradeBadge(summary?.grades[i])}
                tone={gradeTone(summary?.grades[i])}
                class="px-2 py-1"
              />
            </div>
          {/each}
        </div>
      {/snippet}
      {#snippet actions()}
        <Button type="button" disabled={sourceTeardownPending} onclick={() => void start()}>Repeat</Button>
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell
    {phase}
    startPending={startPending || sourceTeardownPending}
    summary={summaryPhase}
  >
    {#snippet setup()}
      <section class="grid min-w-0 gap-6">
        <ProgressionChartStage {progression} {currentIndex} tones={chartTones} />

        <Card.Root class="min-w-0">
          <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <Card.Description>Known progression</Card.Description>
              <Card.Title
                bind:ref={setupHeading}
                tabindex="-1"
                data-testid="chord-progression-setup-heading"
              >
                {progression.name}
              </Card.Title>
              <Card.Description>{progression.key} · {progression.style}</Card.Description>
            </div>
          </Card.Header>

          <Card.Content class="grid gap-6">
            <div class="grid gap-4">
              <SegmentedControl
                ariaLabel="Group"
                options={groupOptions}
                value={progressionGroup}
                onChange={selectGroup}
              />
              <SegmentedControl
                ariaLabel="Progression"
                options={filteredProgressionOptions.length > 0 ? filteredProgressionOptions : progressionOptions}
                value={progressionId}
                onChange={selectProgression}
              />
              <SegmentedControl
                ariaLabel="Transpose"
                options={transposeOptions}
                bind:value={transposeSemitones}
              />
              <p class="text-sm font-semibold tabular-nums">Tempo · {bpm} BPM</p>
              <SegmentedControl
                ariaLabel="Input"
                options={[
                  { value: "microphone", label: "Microphone" },
                  { value: "keys", label: "MIDI or on-screen keys" },
                ]}
                bind:value={inputMode}
              />
            </div>

            <p class="text-sm text-muted-foreground">{status}</p>
            {#if audioState.status === "denied" || audioState.status === "error"}
              <p class="text-destructive">{audioState.message}</p>
            {/if}
          </Card.Content>

          <Card.Footer class="flex-wrap gap-3">
            <Button type="button" onclick={() => void start()}>Start</Button>
          </Card.Footer>
        </Card.Root>
      </section>
    {/snippet}

    {#snippet stage()}
      <div class="grid gap-4">
        <div>
          <p class="eyebrow">Now playing · {progression.name}</p>
          <h2
            class="text-2xl font-bold tracking-tight"
            tabindex="-1"
            bind:this={activeHeading}
            data-testid="chord-progression-stage-heading"
          >
            {progression.name}
          </h2>
          <p class="text-sm text-muted-foreground">{progression.key} · {progression.style}</p>
        </div>

        <ProgressionChartStage {progression} {currentIndex} tones={chartTones} />

        {#if inputMode === "keys"}
          <div class="min-w-0 rounded-xl border bg-muted/30 p-3 sm:p-4">
            <PianoSurface
              router={runtime.router}
              notes={currentChordMidi}
              toneRoles={keyToneRoles}
              highlights={keyTargets}
              waitGroupKey={`chord-${currentIndex}-${chordFlushes}`}
              noteNames="c"
            />
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <HudTile label="Chord" value={currentIndex} unit={`/${expected.length}`} />
          <HudTile
            label="Matched"
            value={followerState?.grades.filter((grade) => grade.matched).length ?? 0}
            unit={`/${expected.length}`}
            tone="good"
          />
          <HudTile label="Tempo" value={bpm} unit="bpm" tone="accent" />
        </div>

        <p class="text-sm text-muted-foreground">{status}</p>
        {#if audioState.status === "denied" || audioState.status === "error"}
          <p class="text-destructive">{audioState.message}</p>
        {/if}
      </div>
    {/snippet}

    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={() => void stop()}>Stop</Button>
    {/snippet}

    {#snippet rail()}
      <Card.Root>
        <Card.Header>
          <Card.Description>Progression grades</Card.Description>
          <Card.Title class="text-base">Chord-by-chord grading</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-2 text-sm">
          {#each expected as chord, i (i)}
            <div class="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <span class="font-semibold">{chord.symbol}</span>
              <HudTile label="Grade" value={chordBadge(i)} tone={badgeTone(i)} class="px-2 py-1" />
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>Live detection</Card.Description>
          <Card.Title class="text-base">Detected tones</Card.Title>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground">
          {detectedLabels}
        </Card.Content>
      </Card.Root>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
