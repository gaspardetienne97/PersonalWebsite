<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";

  import { unixMs } from "@repo/music-core/domain";

  import type {
    MpcSingleStrokeAnswer,
    MpcSingleStrokePrompt,
  } from "@repo/music-core/exercises/mpc-single-stroke";
  import {
    buildMpcRudimentSequence,
    buildMpcRudimentTargetEvents,
  } from "@repo/music-core/exercises/mpc-single-stroke";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    MPC_RUDIMENT_TEMPOS,
    MPC_RUDIMENT_PATTERN_OPTIONS,
    normalizeMpcRudimentConfig,
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import { MPC_PAD_MIDI } from "../../_components/MpcPadGrid.svelte";
  import PadRudimentStage from "../../_components/PadRudimentStage.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  let { runtime: runtimeProp }: { runtime?: MusicRuntime } = $props();
  // svelte-ignore state_referenced_locally -- runtime ownership is fixed for a route mount
  const runtime = runtimeProp ?? useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const padOptions = MPC_PAD_MIDI.flat().sort((left, right) => left - right);
  const hitCountOptions = [
    { value: "8", label: "8 hits" },
    { value: "16", label: "16 hits" },
  ];
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const initialConfig = normalizeMpcRudimentConfig(initialSearch);
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;

  let leftPadMidi = $state(String(initialConfig.leftPadMidi));
  let rightPadMidi = $state(String(initialConfig.rightPadMidi));
  let patternId = $state(initialConfig.patternId);
  let hitCount = $state(String(initialConfig.hitCount));
  let bpm = $state(String(initialConfig.bpm));
  let ready = $state(false);
  let pending = $state(false);
  let destroyed = false;
  let routeGeneration = 0;
  let startRequest = 0;
  let practiceContextReady: Promise<void> = Promise.resolve();
  let captured = false;
  let status = $state("Preparing MPC practice.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let resultsDismissed = $state(false);
  let unsubscribeSession: (() => void) | undefined;

  const prompt = $derived(
    sessionState?.currentPrompt && "targetSequence" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as MpcSingleStrokePrompt)
      : undefined,
  );
  const summary = $derived(sessionState?.summary);
  const result = $derived(summary?.results[0]);
  const answer = $derived(result?.result.answer as MpcSingleStrokeAnswer | undefined);
  const phase = $derived<"setup" | "stage" | "summary">(
    summary && !resultsDismissed
      ? "summary"
      : sessionState?.status === "active"
        ? "stage"
        : "setup",
  );
  const totalHits = $derived(prompt?.hitCount ?? Number(hitCount));
  const completedHits = $derived(
    Math.min(totalHits, Math.round((sessionState?.live?.progress ?? 0) * totalHits)),
  );
  const nextPad = $derived(prompt?.targetSequence[completedHits]);
  const runningScore = $derived(
    Math.round((sessionState?.live?.runningScore ?? 0) * 100),
  );
  const midiStatus = $derived(
    midiEnabled
      ? `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`
      : runtime.midi.state.error ?? "MIDI permission has not been requested.",
  );
  const normalizedConfig = $derived(
    normalizeMpcRudimentConfig({
      pattern: patternId,
      left: leftPadMidi,
      right: rightPadMidi,
      hits: hitCount,
      bpm,
    }),
  );
  const stageTargetSequence = $derived(
    prompt?.targetSequence ??
      buildMpcRudimentSequence(
        normalizedConfig.patternId,
        normalizedConfig.leftPadMidi,
        normalizedConfig.rightPadMidi,
        normalizedConfig.hitCount,
      ),
  );
  const stageTargetEvents = $derived(
    prompt?.targetEvents ??
      buildMpcRudimentTargetEvents(
        normalizedConfig.patternId,
        normalizedConfig.leftPadMidi,
        normalizedConfig.rightPadMidi,
        normalizedConfig.hitCount,
      ),
  );
  const variantKey = $derived(`v1:mpc:${patternId}`);
  const patternLabel = $derived(
    MPC_RUDIMENT_PATTERN_OPTIONS.find((option) => option.value === patternId)?.label ?? "Single strokes",
  );
  const liveAnnouncement = $derived(
    phase === "summary"
      ? `Rudiment complete. ${Math.round((result?.result.score ?? 0) * 100)}% total, ${summary?.xp ?? 0} XP.`
      : status,
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
        owner: "mpc",
        variantKey: key,
        defaultBpm: 80,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        pinnedInstrument: "mpc",
        onBpmChange: (next) => (bpm = String(next)),
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
          const detail = completed?.result.answer as MpcSingleStrokeAnswer | undefined;
          const patternLabel =
            completed && "patternLabel" in completed.prompt
              ? completed.prompt.patternLabel.toLowerCase()
              : "single strokes";
          void runtime.recordPractice({
            source: "drill",
            instrument: "mpc",
            tags: ["mpc", "rudiment", "single-strokes"],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `MPC ${patternLabel} · ${detail.playedPads.length} hits at ${completed && "bpm" in completed.prompt ? completed.prompt.bpm : Number(bpm)} BPM · ${Math.round(detail.padAccuracy * 100)}% pads · ${Math.round(detail.meanTimingErrorMs)}ms timing`
              : `MPC ${patternLabel}`,
          });
        }
      });
      ready = true;
      status = "Ready. Press Start, or Space.";
    } catch (error) {
      status = message(error, "MPC practice could not be prepared.");
    }
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function start(): Promise<void> {
    if (!ready || pending || !session) return;
    if (leftPadMidi === rightPadMidi) {
      status = "Choose two different MPC pads.";
      return;
    }

    const request = ++startRequest;
    resultsDismissed = true;
    pending = true;
    captured = false;
    status = "";
    let generation = routeGeneration;
    try {
      await tick();
      generation = routeGeneration;
      if (request !== startRequest) return;
      await practiceContextReady;
      if (request !== startRequest || generation !== routeGeneration) return;
      const config = normalizedConfig;
      const performance = await runtime.beginPerformance();
      if (request !== startRequest || generation !== routeGeneration) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      await session.startMpcRudiment({
        patternId: config.patternId,
        leftPadMidi: config.leftPadMidi,
        rightPadMidi: config.rightPadMidi,
        hitCount: config.hitCount,
        bpm: config.bpm,
      });
      if (request !== startRequest || generation !== routeGeneration) {
        runtime.endPerformance();
        session.abandon();
        return;
      }
      const patternLabel =
        MPC_RUDIMENT_PATTERN_OPTIONS.find((option) => option.value === config.patternId)?.label ??
        "Single strokes";
      resultsDismissed = false;
      status = `Play ${patternLabel.toLowerCase()} on pads ${config.leftPadMidi} and ${config.rightPadMidi}.`;
    } catch (error) {
      runtime.endPerformance();
      if (request !== startRequest || generation !== routeGeneration) return;
      status = message(error, "The MPC rudiment could not be started.");
    } finally {
      pending = false;
    }
  }

  function cancel(): void {
    startRequest += 1;
    runtime.endPerformance();
    session?.abandon();
    status = "Rudiment cancelled. You can start again.";
  }

  function changeSetup(): void {
    startRequest += 1;
    status = "Setup ready. Change the rudiment settings or start again.";
    resultsDismissed = true;
  }

  async function slowDown(): Promise<void> {
    const current = Number(bpm);
    const slowerTempo =
      [...MPC_RUDIMENT_TEMPOS].reverse().find((tempo) => tempo < current) ??
      MPC_RUDIMENT_TEMPOS[0];
    runtime.setPracticeVariantBpm(slowerTempo, variantKey);
    await start();
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const params = new URLSearchParams(window.location.search);
    params.set("pattern", config.patternId);
    params.set("left", String(config.leftPadMidi));
    params.set("right", String(config.rightPadMidi));
    params.set("hits", String(config.hitCount));
    params.set("bpm", String(config.bpm));
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onDestroy(() => {
    destroyed = true;
    routeGeneration += 1;
    startRequest += 1;
    runtime.endPerformance();
    unsubscribeSession?.();
    unsubscribeMidiState();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>MPC Rudiments | Practice OS</title>
  <meta
    name="description"
    content="Practice alternating MPC pad strokes with live order, timing, and velocity feedback."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="MPC Rudiments" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI" : "On-screen"}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet setupSummaryLine()}
    {patternLabel} · Pads {normalizedConfig.leftPadMidi} and {normalizedConfig.rightPadMidi} · {normalizedConfig.hitCount} hits · {bpm} BPM
  {/snippet}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>{patternLabel} · Pads {normalizedConfig.leftPadMidi} and {normalizedConfig.rightPadMidi}</Card.Description>
        <Card.Title>Rudiment complete</Card.Title>
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline">
          <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
            {Math.round((result?.result.score ?? 0) * 100)}<span class="text-3xl text-muted-foreground">%</span>
          </span>
          <span class="sr-only"> total</span>
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta tags={["mpc"]} accuracy={result?.result.score ?? 0} before={visitStartedAt} />
      {/snippet}
      {#snippet children()}
        {#if answer}
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HudTile size="sm" label="Pad accuracy" value={Math.round(answer.padAccuracy * 100)} unit="%" />
            <HudTile size="sm" label="Timing error" value={Math.round(answer.meanTimingErrorMs)} unit="ms" />
            <HudTile size="sm" label="Velocity" value={Math.round(answer.velocityConsistency * 100)} unit="%" />
            <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
          </div>
        {/if}
        <p class="text-xs text-muted-foreground">+{summary?.xp ?? 0} XP · MPC</p>
      {/snippet}
      {#snippet actions()}
        <AdaptiveRetryBar onRetry={start} onSlower={slowDown} retryLabel="Again" />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/mpc" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} setupSummary={setupSummaryLine} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-4 rounded-lg border bg-card p-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid gap-2">
            <Label for="mpc-left-pad">Left pad</Label>
            <select
              id="mpc-left-pad"
              aria-label="Left pad"
              bind:value={leftPadMidi}
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {#each padOptions as midi (midi)}
                <option value={String(midi)}>Pad {midi}</option>
              {/each}
            </select>
          </div>
          <div class="grid gap-2">
            <Label for="mpc-right-pad">Right pad</Label>
            <select
              id="mpc-right-pad"
              aria-label="Right pad"
              bind:value={rightPadMidi}
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {#each padOptions as midi (midi)}
                <option value={String(midi)}>Pad {midi}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <SegmentedControl ariaLabel="Hit count" options={hitCountOptions} bind:value={hitCount} size="sm" />
          <p class="text-sm tabular-nums text-muted-foreground">Tempo · {bpm} BPM (practice controls above)</p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
            {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
          </Button>
          <p class="text-xs text-muted-foreground">{midiStatus}</p>
        </div>
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage instrument="mpc" class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · Bank A pads</p>
            <div
              role="heading"
              aria-level="2"
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              data-testid="mpc-ready-heading"
              bind:this={setupHeading}
            >
              {patternLabel}
            </div>
            <p class="text-sm text-stage-muted">
              Alternate pads {normalizedConfig.leftPadMidi} and {normalizedConfig.rightPadMidi} for {normalizedConfig.hitCount}
              hits; order, timing and velocity are graded.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled={!ready || pending} onclick={start}>
              {pending ? "Starting..." : "Start"}
            </Button>
            <StartShortcut onStart={() => void start()} enabled={ready && !pending} />
          </div>
        </div>
        <!-- The pattern is what you drill, so it stays on the stage; the fieldset mirrors the shell's start lock. -->
        <fieldset class="min-w-0 border-0 p-0" disabled={pending}>
          <SegmentedControl ariaLabel="Rudiment pattern" options={MPC_RUDIMENT_PATTERN_OPTIONS} bind:value={patternId} />
        </fieldset>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stage()}
      <div class="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <p class="eyebrow">Bank A pads · {bpm} BPM</p>
          <h2 class="text-xl font-semibold tracking-tight" tabindex="-1" bind:this={activeHeading}>
            {patternLabel}
          </h2>
        </div>
      </div>
      <PadRudimentStage
        router={runtime.router}
        targetSequence={stageTargetSequence}
        targetEvents={stageTargetEvents}
        completedHits={completedHits}
        bpm={normalizedConfig.bpm}
      />
      {#if prompt}
        <div class="grid gap-2 px-1">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-medium">{prompt.label}</span>
            <span class="tabular-nums text-muted-foreground">{completedHits}/{prompt.hitCount}</span>
          </div>
          <Progress value={completedHits} max={prompt.hitCount} />
          <p class="text-sm text-muted-foreground">
            {sessionState?.live?.feedback[0]?.message ?? status}
          </p>
        </div>
      {/if}
    {/snippet}

    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={cancel}>Stop</Button>
    {/snippet}

    {#snippet rail()}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <HudTile size="sm" label="Next pad" value={nextPad ?? leftPadMidi} tone="accent" />
        <HudTile size="sm" label="Hits" value={completedHits} unit={`/${totalHits}`} />
        <HudTile size="sm" label="Quality" value={runningScore} unit="%" tone="good" />
        <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
        <HudTile size="sm" label="Input" value={runtime.activeSource === "midi" ? "MIDI" : "On-screen"} />
      </div>
      <p class="text-xs text-muted-foreground">{midiStatus}</p>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
