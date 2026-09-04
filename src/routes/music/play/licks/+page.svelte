<script lang="ts">
  import { browser } from "$app/environment";
  import Play from "lucide-svelte/icons/play";
  import { onDestroy, tick } from "svelte";

  import {
    Capability,
    VIEWABLE_INSTRUMENTS,
    unixMs,
    type InstrumentId,
    type NoteEvent,
    type ScoringEvent,
  } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    buildJazzSequenceCapture,
    gradeLickSequence,
    JAZZ_LICKS,
    LICK_PHRASES,
    lickTimeline,
    normalizeJazzLickDrillConfig,
    type LickCategory,
    type LickGrade,
  } from "@repo/music-core/engines/jazz";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import PianoSurface from "../../_components/piano/PianoSurface.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  let { runtime: runtimeProp }: { runtime?: MusicRuntime } = $props();
  // svelte-ignore state_referenced_locally -- runtime ownership is fixed for a route mount
  const runtime = runtimeProp ?? useMusicRuntime();
  const LICK_BPM = 150;
  const LICK_EXERCISE_ID = "jazz.lick.playback";
  const LICK_SKILL_IDS = ["harmony.ii-v-i"];
  const LICK_CAPABILITIES = [Capability.Harmony, Capability.Improvisation, Capability.Pitch];
  const LICK_DIFFICULTY = 0.6;
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const initialConfig = normalizeJazzLickDrillConfig(initialSearch);
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;
  const initialInstrument = VIEWABLE_INSTRUMENTS.includes(
    initialSearch.get("instrument") as InstrumentId,
  )
    ? (initialSearch.get("instrument") as InstrumentId)
    : runtime.activeInstrument;
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const servicesReady = Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);

  const lickCategories = [
    { value: "major-ii-V-I", label: "Major ii-V-I" },
    { value: "major-ii-V-I-VI", label: "ii-V-I-VI" },
    { value: "minor-ii-V-i", label: "Minor ii-V-i" },
    { value: "minor-chord", label: "Minor chord" },
  ];

  let category = $state<LickCategory>(initialConfig.category);
  let lickNumber = $state(initialConfig.lickNumber);
  let instrument = $state<InstrumentId>(initialInstrument);
  runtime.setActiveInstrument(initialInstrument);
  let bpm = $state(LICK_BPM);

  const visibleLicks = $derived(JAZZ_LICKS.filter((l) => l.category === category));
  const lick = $derived(JAZZ_LICKS.find((l) => l.number === lickNumber) ?? visibleLicks[0]);
  const phrase = $derived(LICK_PHRASES[lick?.number ?? 1] ?? []);
  const expectedMidi = $derived(phrase.map(([midi]) => midi));
  const phraseNotes = $derived(expectedMidi.map((midi) => midiToNote(midi, true)).join("  "));

  // The drill's own state machine. Maps 1:1 onto the shell's phase anatomy:
  // idle → setup, listening → stage, graded → summary.
  let runPhase = $state<"idle" | "listening" | "graded">("idle");
  const shellPhase = $derived<"setup" | "stage" | "summary">(
    runPhase === "graded" ? "summary" : runPhase === "listening" ? "stage" : "setup",
  );
  let played = $state<number[]>([]);
  /** The next expected note, lit on the keyboard during the run. */
  const nextTarget = $derived<Record<number, "target">>(
    expectedMidi[played.length] === undefined ? {} : { [expectedMidi[played.length]!]: "target" },
  );
  const readyHighlights = $derived(
    Object.fromEntries(expectedMidi.map((midi) => [midi, "target" as const])),
  );
  let grade = $state<LickGrade | undefined>();
  let status = $state("Ready. Hear it, then press Start.");
  // Announced by the persistent live region: branch swaps remount the visible
  // status text, so screen readers would otherwise miss the transitions.
  const liveAnnouncement = $derived(
    runPhase === "graded" && grade
      ? `Lick graded. ${grade.matched} of ${grade.total} notes, ${Math.round(grade.accuracy * 100)} percent.`
      : status,
  );
  // Branch swaps destroy the focused element, dropping focus to <body>. Move it
  // to the freshly mounted stage/results heading on each transition — but not on
  // initial mount, so page load doesn't steal focus.
  let stageHeading = $state<HTMLHeadingElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let setupHeading = $state<HTMLElement | null>(null);
  let previousShellPhase: "setup" | "stage" | "summary" | undefined;
  let captured = false;
  let attemptStartedAt = unixMs(Date.now());
  let unsubscribe: (() => void) | undefined;
  let previewGeneration = 0;
  // Reactive: drives the shell's setup lock (`startPending`) during preflight.
  let attemptPending = $state(false);
  let attemptRequest = 0;
  let practiceContextRequest = 0;
  let practiceContextReady: Promise<boolean> = Promise.resolve(true);
  const variantKey = $derived(`v1:licks:${instrument}:${lickNumber}:playback`);

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    const current = shellPhase;
    const previous = previousShellPhase;
    previousShellPhase = current;
    if (previous === undefined || previous === current) return;
    if (current === "stage") stageHeading?.focus({ preventScroll: false });
    else if (current === "summary") resultsHeading?.focus({ preventScroll: false });
    else setupHeading?.focus({ preventScroll: false });
  });

  $effect(() => {
    const key = variantKey;
    const contextRequest = ++practiceContextRequest;
    attemptRequest += 1;
    let disposed = false;
    let cleanup: () => void = () => undefined;
    practiceContextReady = runtime
      .registerPracticeContext({
        owner: "licks",
        variantKey: key,
        defaultBpm: LICK_BPM,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        allowedInstruments: [...VIEWABLE_INSTRUMENTS],
        onBpmChange: (next) => (bpm = next),
        onInstrumentChange: (next) => (instrument = next),
      })
      .then((nextCleanup) => {
        cleanup = nextCleanup;
        if (disposed || contextRequest !== practiceContextRequest) {
          cleanup();
          return false;
        }
        return true;
      });
    return () => {
      disposed = true;
      practiceContextRequest += 1;
      attemptRequest += 1;
      cleanup();
    };
  });

  function selectCategory(next: LickCategory): void {
    const config = normalizeJazzLickDrillConfig({ category: next });
    category = config.category;
    lickNumber = config.lickNumber;
    reset();
    status = "Ready. Hear it, then press Start.";
  }

  function reset(): void {
    attemptRequest += 1;
    cancelPreview();
    runtime.endPerformance();
    unsubscribe?.();
    unsubscribe = undefined;
    runPhase = "idle";
    played = [];
    grade = undefined;
    captured = false;
  }

  // Leave the graded summary for setup without starting a new run. Route-owned,
  // mirroring the shell reference: the shell renders the phase but never
  // transitions it.
  function changeSetup(): void {
    reset();
    status = "Ready. Hear it, then press Start.";
  }

  function selectLick(next: number): void {
    const config = normalizeJazzLickDrillConfig({ category, lickNumber: next });
    category = config.category;
    lickNumber = config.lickNumber;
    reset();
    status = "Ready. Hear it, then press Start.";
  }

  function syncConfigUrl(): void {
    if (!browser) return;
    const config = normalizeJazzLickDrillConfig({ category, lickNumber });
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("category", config.category);
    params.set("lick", String(config.lickNumber));
    params.set("instrument", instrument);
    params.set("bpm", String(bpm));
    syncRouteQuery(`${url.pathname}?${params.toString()}${url.hash}`);
  }

  async function playReference(): Promise<void> {
    const generation = ++previewGeneration;
    runtime.sound.stopPattern();
    if (!(await runtime.ensurePlaybackVoice())) {
      if (generation === previewGeneration) status = runtime.audioMessage;
      return;
    }
    if (generation !== previewGeneration) return;
    const secondsPerBeat = 60 / bpm;
    runtime.sound.playPattern(
      lickTimeline(phrase).map((note) => ({
        midiNotes: [note.midi],
        offsetSeconds: note.offsetBeats * secondsPerBeat,
        durationSeconds: note.beats * secondsPerBeat * 0.96,
      })),
      0.85,
    );
  }

  function cancelPreview(): void {
    previewGeneration += 1;
    runtime.sound.stopPattern();
  }

  async function startAttempt(): Promise<void> {
    if (attemptPending) return;
    reset();
    attemptPending = true;
    try {
      await tick();
      const request = ++attemptRequest;
      if (!(await practiceContextReady) || request !== attemptRequest) return;
      if (!(await runtime.ensurePlaybackVoice())) {
        if (request === attemptRequest) status = runtime.audioMessage;
        return;
      }
      if (request !== attemptRequest) return;
      const performance = await runtime.beginPerformance();
      if (request !== attemptRequest) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      attemptStartedAt = unixMs(Date.now());
      runPhase = "listening";
      status = "Play the lick.";
      unsubscribe = runtime.router.subscribe((event: NoteEvent) => {
        if (runPhase !== "listening" || event.type !== "noteOn") return;
        if (runtime.audioEnabled) {
          runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
        }
        played = [...played, event.midiNote];
        if (played.length >= expectedMidi.length) void finish();
      });
    } finally {
      attemptPending = false;
    }
  }

  async function finish(): Promise<void> {
    const request = attemptRequest;
    runtime.endPerformance();
    unsubscribe?.();
    unsubscribe = undefined;
    const currentLick = lick;
    const completedInstrument = instrument;
    const expected = [...expectedMidi];
    const response = [...played];
    const result = gradeLickSequence(expected, response);
    grade = result;
    runPhase = "graded";
    if (!captured) {
      captured = true;
      const endedAt = unixMs(Date.now());
      const sessionId = stableId("jazz-lick-session");
      const runId = stableId("jazz-lick-run");
      const capture = buildJazzSequenceCapture({
        exerciseId: LICK_EXERCISE_ID,
        label: `Lick #${currentLick?.number ?? lickNumber}`,
        sessionId,
        runId,
        eventId: stableId("jazz-lick-event"),
        promptId: `lick-${currentLick?.number ?? lickNumber}`,
        skillIds: LICK_SKILL_IDS,
        capabilities: LICK_CAPABILITIES,
        expectedMidi: expected,
        playedMidi: response,
        grade: result,
        startedAt: attemptStartedAt,
        endedAt,
        difficulty: LICK_DIFFICULTY,
        instrument: completedInstrument,
        params: {
          category,
          lickNumber: currentLick?.number ?? lickNumber,
          progression: currentLick?.progression ?? [],
        },
      });
      const xp = await ingestScoringEvents([capture.event]);
      if (request === attemptRequest) {
        status = `${result.matched}/${result.total} notes · ${Math.round(result.accuracy * 100)}% · +${xp} XP`;
      }
      await runtime.recordPractice({
        id: sessionId,
        source: "drill",
        instrument: completedInstrument,
        tags: ["jazz", "licks"],
        scoringEvents: [capture.event],
        runs: [capture.run],
        xpEarned: xp,
        note: `Lick #${currentLick?.number ?? lickNumber}: ${Math.round(result.accuracy * 100)}%`,
      });
    } else {
      status = `${result.matched}/${result.total} notes · ${Math.round(result.accuracy * 100)}%`;
    }
  }

  async function ingestScoringEvents(events: ScoringEvent[]): Promise<number> {
    await servicesReady;
    let xp = 0;
    for (const event of events) {
      await skills.ingest(event);
      await analytics.ingest(event);
      xp += await progress.ingest(event, skills);
    }
    return xp;
  }

  function stableId(prefix: string): string {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
  }

  onDestroy(() => {
    attemptRequest += 1;
    practiceContextRequest += 1;
    cancelPreview();
    runtime.endPerformance();
    unsubscribe?.();
  });
</script>

<svelte:head>
  <title>Jazz Licks Drill | Practice OS</title>
  <meta
    name="description"
    content="Hear a transcribed jazz lick, then play it back — graded note-by-note against the phrase, octave-lenient."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Jazz Licks Drill" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI" : "On-screen"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <!-- Persistent live region: mounted outside the branches so transitions announce. -->
  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet setupSummaryLine()}
    Lick #{lick?.number} · {lick?.progression.join(" ")} · {lickCategories.find((c) => c.value === category)?.label ?? category} · {bpm} BPM
  {/snippet}

  {#snippet lickLine()}
    <div class="grid gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
      <p class="eyebrow">The line</p>
      <p class="font-mono text-sm tabular-nums">{phraseNotes}</p>
      {#if lick?.tip}
        <p class="text-sm text-stage-muted">{lick.tip}</p>
      {/if}
      {#if lick?.scales?.length}
        <div class="flex flex-wrap gap-1.5 pt-1">
          {#each lick.scales as scale (scale)}
            <Badge variant="outline">{scale}</Badge>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>Lick #{lick?.number} · {lick?.progression.join(" ")}</Card.Description>
        <Card.Title>Lick complete</Card.Title>
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline">
          <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
            {Math.round((grade?.accuracy ?? 0) * 100)}<span class="text-3xl text-muted-foreground">%</span>
          </span>
          <span class="sr-only"> of notes matched</span>
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta tags={["licks"]} accuracy={grade?.accuracy ?? 0} before={visitStartedAt} />
      {/snippet}
      {#snippet children()}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile size="sm" label="Notes matched" value={`${grade?.matched ?? 0} / ${grade?.total ?? 0}`} />
          <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
        </div>
        <div class="space-y-1 rounded-lg border bg-muted/30 p-4">
          <p class="eyebrow">The line</p>
          <p class="font-mono text-sm tabular-nums">{phraseNotes}</p>
        </div>
        <p class="text-xs text-muted-foreground">Harmony · Jazz vocabulary</p>
      {/snippet}
      {#snippet actions()}
        <AdaptiveRetryBar onRetry={() => void startAttempt()} retryLabel="Again" />
        <Button type="button" variant="outline" onclick={playReference}>
          <Play aria-hidden="true" />
          Hear it
        </Button>
      {/snippet}
      {#snippet routineContinue()}
        <RoutineContinueAction routine={runtime.dailyRoutine} />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/licks" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell phase={shellPhase} startPending={attemptPending} setupSummary={setupSummaryLine} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-3 rounded-lg border bg-card p-4">
        <SegmentedControl
          size="sm"
          ariaLabel="Lick category"
          options={lickCategories}
          value={category}
          onChange={(value) => selectCategory(value as LickCategory)}
        />
        <p class="text-xs text-muted-foreground">
          Tempo lives in the practice controls above: {bpm} BPM.
        </p>
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage {instrument} class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · call and response</p>
            <h2
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              data-testid="licks-setup-heading"
              bind:this={setupHeading}
            >
              Lick #{lick?.number} · {lick?.progression.join(" ")}
            </h2>
            <p class="text-sm text-stage-muted">Hear the line at {bpm} BPM, then play it back note for note.</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onclick={playReference}>
              <Play aria-hidden="true" />
              Hear it
            </Button>
            <Button type="button" size="lg" onclick={() => void startAttempt()}>Start</Button>
            <StartShortcut onStart={() => void startAttempt()} enabled={runPhase !== "listening"} />
          </div>
        </div>
        <div class="grid gap-2">
          <p class="eyebrow">Pick a lick</p>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Pick a lick">
            {#each visibleLicks as entry (entry.number)}
              <button
                type="button"
                aria-pressed={entry.number === lickNumber}
                onclick={() => selectLick(entry.number)}
                class="size-9 rounded-md border border-stage-line text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-practice-accent {entry.number ===
                lickNumber
                  ? 'border-practice-accent bg-practice-accent text-practice-accent-foreground'
                  : 'text-stage-muted hover:bg-stage-2'}"
              >
                {entry.number}
              </button>
            {/each}
          </div>
        </div>
        {@render lickLine()}
        <div class="min-w-0 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
          <PianoSurface router={runtime.router} notes={expectedMidi} highlights={readyHighlights} noteNames="c" />
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stage()}
      <PracticeStage {instrument} class="grid gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Lick #{lick?.number} · {lick?.progression.join(" ")}</p>
            <h2 class="text-xl font-semibold tracking-tight" tabindex="-1" bind:this={stageHeading}>
              Play the line back
            </h2>
            <p class="mt-1 font-mono text-sm tabular-nums text-stage-muted">{phraseNotes}</p>
          </div>
          <span class="text-sm text-stage-muted tabular-nums">{played.length} / {expectedMidi.length}</span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <HudTile size="sm" label="Notes played" value={`${played.length} / ${expectedMidi.length}`} />
          <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
        </div>
        <Progress value={Math.min(played.length, expectedMidi.length)} max={expectedMidi.length} />
        <div class="min-w-0 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
          <PianoSurface router={runtime.router} notes={expectedMidi} highlights={nextTarget} noteNames="c" />
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}
    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={playReference}>
        <Play aria-hidden="true" />
        Hear it
      </Button>
      <Button type="button" variant="outline" onclick={reset}>Stop</Button>
    {/snippet}
    {#snippet rail()}
      <DrillProgressRail
        items={[
          { label: "Lick", value: `#${lick?.number}` },
          { label: "Progression", value: lick?.progression.join(" ") ?? "" },
          { label: "Notes", value: `${played.length} / ${expectedMidi.length}` },
          { label: "Input", value: runtime.activeSource === "midi" ? "MIDI" : "On-screen" },
        ]}
      />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
