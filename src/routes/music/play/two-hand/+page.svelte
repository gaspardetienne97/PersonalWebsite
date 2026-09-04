<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";

  import { unixMs, type NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    normalizeTwoHandDrillConfig,
    TechniqueSession,
    TWO_HAND_DRILL_HAND_MODES,
    TWO_HAND_DRILL_PATTERNS,
    TWO_HAND_DRILL_TEMPOS,
    TWO_HAND_DRILL_TONICS,
    type TwoHandDrillConfig,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import {
    createTwoHandIndependenceExercise,
    type TwoHandIndependenceAnswer,
    type TwoHandIndependencePrompt,
  } from "@repo/music-core/exercises/two-hand-independence";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PianoSurface, { type PianoHighlight } from "../../_components/piano/PianoSurface.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SessionFeedback from "../../_components/SessionFeedback.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { suggestedFingerings } from "../../_components/piano/piano-fingering";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  let { runtime: runtimeProp }: { runtime?: MusicRuntime } = $props();
  // svelte-ignore state_referenced_locally -- runtime ownership is fixed for a route mount
  const runtime = runtimeProp ?? useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const initialConfig = normalizeTwoHandDrillConfig(initialSearch);
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;
  const keyOptions = TWO_HAND_DRILL_TONICS.map((value) => ({
    value,
    label: value.replace(/\d+$/, ""),
  }));
  const patternOptions = TWO_HAND_DRILL_PATTERNS.map((pattern) => ({
    value: pattern.id,
    label: pattern.label,
  }));
  const handModeOptions = TWO_HAND_DRILL_HAND_MODES.map((mode) => ({
    value: mode.id,
    label: mode.label,
  }));

  let tonic = $state(initialConfig.tonic);
  let bpm = $state(String(initialConfig.bpm));
  let patternKind = $state(initialConfig.patternKind);
  let handMode = $state(initialConfig.handMode);
  let dynamics = $state(initialConfig.dynamics);
  let ready = $state(false);
  let pending = $state(false);
  let destroyed = false;
  let routeGeneration = 0;
  let startRequest = 0;
  let practiceContextReady: Promise<void> = Promise.resolve();
  // Results are dismissible so the setup card stays reachable after a run.
  let resultsDismissed = $state(false);
  let captured = false;
  let status = $state("Loading your technique history.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;

  const activePrompt = $derived(
    sessionState?.currentPrompt && "leftMidiNotes" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as TwoHandIndependencePrompt)
      : undefined,
  );
  // A preview prompt so the keyboards render before the drill starts.
  const previewPrompt = $derived(
    createTwoHandIndependenceExercise({
      tonic,
      bpm: Number(bpm),
      bars: 2,
      patternKind,
      handMode,
      dynamics,
    }).generate({
      targetSkillIds: [],
      difficulty: 0.4,
    }).payload,
  );
  const display = $derived(activePrompt ?? previewPrompt);
  // One keyboard, hand-tagged: two surfaces would mean two QWERTY listeners and
  // two router events per press.
  const handNotes = $derived([
    ...new Set([...display.leftMidiNotes, ...display.rightMidiNotes]),
  ]);
  const handHighlights = $derived.by(() => {
    const highlights: Record<number, PianoHighlight> = {};
    for (const midiNote of display.rightMidiNotes) {
      highlights[midiNote] = { role: "target", hand: "right" };
    }
    for (const midiNote of display.leftMidiNotes) {
      highlights[midiNote] = { role: "target", hand: "left" };
    }
    return highlights;
  });
  const handFingerings = $derived({
    ...suggestedFingerings(display.rightMidiNotes, "right"),
    ...suggestedFingerings(display.leftMidiNotes, "left"),
  });
  const totalNotes = $derived(display.leftMidiNotes.length + display.rightMidiNotes.length);
  const playedNotes = $derived(Math.round((sessionState?.live?.progress ?? 0) * totalNotes));

  const summary = $derived(sessionState?.summary);
  const result = $derived(summary?.results[0]?.result);
  const answer = $derived(result?.answer as TwoHandIndependenceAnswer | undefined);
  // Route-owned phase: the shell renders it but never transitions it.
  const phase = $derived<"summary" | "stage" | "setup">(
    summary && answer && !resultsDismissed
      ? "summary"
      : sessionState?.status === "active"
        ? "stage"
        : "setup",
  );
  // Announced by the persistent live region; branch swaps remount the visible
  // status text, so screen readers would otherwise miss the transitions.
  const resultHeadline = $derived.by(() => {
    if (!answer) return "Drill complete.";
    const left = Math.round(answer.leftAccuracy * 100);
    const right = Math.round(answer.rightAccuracy * 100);
    if (handMode === "left") {
      return `Left-hand note accuracy: ${left}%.`;
    }
    if (handMode === "right") {
      return `Right-hand note accuracy: ${right}%.`;
    }
    if (answer.leftAccuracy > answer.rightAccuracy) {
      return `Left-hand note accuracy was higher: ${left}% vs ${right}%.`;
    }
    if (answer.rightAccuracy > answer.leftAccuracy) {
      return `Right-hand note accuracy was higher: ${right}% vs ${left}%.`;
    }
    return `Both hands matched on note accuracy: ${left}%.`;
  });
  const resultDetail = $derived(
    answer
      ? `${handMode === "left" ? `Left-hand note accuracy ${Math.round(answer.leftAccuracy * 100)}%` : handMode === "right" ? `Right-hand note accuracy ${Math.round(answer.rightAccuracy * 100)}%` : `Left-hand note accuracy ${Math.round(answer.leftAccuracy * 100)}% · Right-hand note accuracy ${Math.round(answer.rightAccuracy * 100)}%`} · Mean spacing error: ${Math.round(answer.meanEvennessErrorMs)} ms${
          answer.dynamicsContrast === undefined
            ? ""
            : ` · MIDI velocity contrast ${answer.dynamicsContrast >= 0 ? "+" : ""}${answer.dynamicsContrast.toFixed(2)} (melody − accompaniment)`
        }`
      : "",
  );
  const liveAnnouncement = $derived(
    phase === "summary" && answer ? `Drill complete. ${resultHeadline}` : status,
  );
  const midiStatus = $derived(
    midiEnabled
      ? `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`
      : (runtime.midi.state.error ?? "MIDI permission has not been requested."),
  );
  const variantKey = $derived(
    `v1:two-hand:${patternKind}:${handMode}:${dynamics ? "dynamics" : "even"}`,
  );

  // Branch swaps destroy the focused element (e.g. the Start button), dropping
  // focus to <body>. Move it to the freshly mounted stage/results heading on
  // each transition — but not on initial mount, so page load doesn't steal focus.
  let activeHeading = $state<HTMLHeadingElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let setupSummary = $state<HTMLElement | null>(null);
  const setupSummaryText = $derived(
    `${display.patternLabel} · ${tonic.replace(/\d+$/, "")} · ${handModeLabel(handMode)} · ${bpm} BPM${dynamics && handMode === "both" ? " · Melody louder" : ""}`,
  );
  let previousPhase: "summary" | "stage" | "setup" | undefined;

  void initialize();

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    const key = variantKey;
    routeGeneration += 1;
    let disposed = false;
    let cleanup: () => void = () => undefined;
    practiceContextReady = runtime
      .registerPracticeContext({
        owner: "two-hand",
        variantKey: key,
        defaultBpm: 80,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        pinnedInstrument: "piano",
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

  $effect(() => {
    const current = phase;
    const previous = previousPhase;
    previousPhase = current;
    if (previous === undefined || previous === current) return;
    if (current === "stage") activeHeading?.focus({ preventScroll: false });
    else if (current === "summary") resultsHeading?.focus({ preventScroll: false });
    else setupSummary?.focus({ preventScroll: false });
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
          const detail = state.summary.results[0]?.result.answer as
            | TwoHandIndependenceAnswer
            | undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument: "piano",
            tags: ["technique", "two-hand", "piano"],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `Two-hand independence · LH ${Math.round(detail.leftAccuracy * 100)}% · RH ${Math.round(detail.rightAccuracy * 100)}%`
              : "Two-hand independence drill",
          });
        }
      });
      ready = true;
      status = "Ready. Press Start, or Space.";
    } catch (error) {
      status = message(error, "Piano technique could not be prepared.");
    }
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function start(): Promise<void> {
    if (!ready || pending || !session) return;
    const request = ++startRequest;
    const generation = routeGeneration;
    resultsDismissed = true;
    pending = true;
    status = "";
    try {
      await tick();
      if (request !== startRequest || generation !== routeGeneration) return;
      await practiceContextReady;
      if (request !== startRequest || generation !== routeGeneration) return;
      const voiceReady = await runtime.ensurePlaybackVoice();
      if (request !== startRequest || generation !== routeGeneration) return;
      if (!voiceReady) {
        status = runtime.audioMessage;
        return;
      }
      const config = normalizeTwoHandDrillConfig({
        tonic,
        bpm,
        pattern: patternKind,
        hand: handMode,
        dynamics,
      });
      const performance = await runtime.beginPerformance();
      if (request !== startRequest || generation !== routeGeneration) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      captured = false;
      await session.startTwoHand({
        tonic: config.tonic,
        bpm: config.bpm,
        bars: 2,
        patternKind: config.patternKind,
        handMode: config.handMode,
        dynamics: config.dynamics,
      });
      if (request !== startRequest || generation !== routeGeneration) {
        runtime.endPerformance();
        session.abandon();
        return;
      }
      resultsDismissed = false;
      status = `Playing ${display.patternLabel.toLowerCase()} · ${handModeLabel(config.handMode)}${config.dynamics && config.handMode === "both" ? " · melody louder" : ""}.`;
    } catch (error) {
      runtime.endPerformance();
      session.abandon();
      if (request !== startRequest || generation !== routeGeneration) return;
      status = message(error, "The two-hand drill could not be started.");
    } finally {
      pending = false;
    }
  }

  function slowDown(): void {
    const current = normalizeTwoHandDrillConfig({ tonic, bpm, pattern: patternKind, hand: handMode }).bpm;
    const nextBpm =
      [...TWO_HAND_DRILL_TEMPOS].reverse().find((tempo) => tempo < current) ??
      TWO_HAND_DRILL_TEMPOS[0];
    runtime.setPracticeVariantBpm(nextBpm, variantKey);
    void start();
  }

  function syncConfigUrl(): void {
    if (!browser) return;
    const config = normalizeTwoHandDrillConfig({
      tonic,
      bpm,
      pattern: patternKind,
      hand: handMode,
      dynamics,
    });
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("tonic", config.tonic);
    params.set("bpm", String(config.bpm));
    params.set("pattern", config.patternKind);
    params.set("hand", config.handMode);
    if (config.dynamics) params.set("dynamics", "1");
    else params.delete("dynamics");
    syncRouteQuery(`${url.pathname}?${params.toString()}${url.hash}`);
  }

  function cancel(): void {
    startRequest += 1;
    runtime.endPerformance();
    session?.abandon();
    status = "Drill cancelled. Setup ready.";
  }

  function changeSetup(): void {
    startRequest += 1;
    status = "Setup ready.";
    resultsDismissed = true;
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.12, undefined, event.velocity);
    }
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function handModeLabel(value: TwoHandDrillConfig["handMode"]): string {
    return TWO_HAND_DRILL_HAND_MODES.find((mode) => mode.id === value)?.label ?? "Both";
  }

  onDestroy(() => {
    destroyed = true;
    startRequest += 1;
    routeGeneration += 1;
    runtime.endPerformance();
    unsubscribeSession?.();
    unsubscribeMidiState();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Two-Hand Independence | Practice OS</title>
  <meta
    name="description"
    content="A graded piano drill: hold a steady left-hand pulse while the right hand plays a faster line."
  />
</svelte:head>


<PracticeScreen>
  <PracticeScreenHeader title="Two-Hand Independence" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI" : "On-screen"}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <!-- Persistent live region: mounted outside the branches so transitions announce. -->
  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet keyboard()}
    <PianoSurface
      router={runtime.router}
      notes={handNotes}
      highlights={handHighlights}
      fingerings={handFingerings}
      onAccepted={playAccepted}
    />
  {/snippet}

  {#snippet setupSummaryLine()}
    {setupSummaryText}
  {/snippet}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>{display.patternLabel} · {handModeLabel(handMode)} · {bpm} BPM</Card.Description>
        <Card.Title level={2} class="font-bold">{resultHeadline}</Card.Title>
      {/snippet}
      {#snippet metric()}
        <div>
          <p class="eyebrow">Two-hand score</p>
          <p
            class="text-6xl font-bold leading-none tracking-tight tabular-nums {result?.correct
              ? 'text-success'
              : 'text-foreground'}"
          >
            {Math.round((result?.score ?? 0) * 100)}
          </p>
        </div>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta tags={["two-hand"]} accuracy={result?.score ?? 0} before={visitStartedAt} />
      {/snippet}
      {#snippet children()}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {#if answer && handMode !== "right"}
            <HudTile size="sm" label="Left note accuracy" value={Math.round(answer.leftAccuracy * 100)} unit="%" tone={answer.leftAccuracy >= 0.9 ? "good" : "default"} />
          {/if}
          {#if answer && handMode !== "left"}
            <HudTile size="sm" label="Right note accuracy" value={Math.round(answer.rightAccuracy * 100)} unit="%" tone={answer.rightAccuracy >= 0.9 ? "good" : "default"} />
          {/if}
          <HudTile size="sm" label="Mean spacing error" value={Math.round(answer?.meanEvennessErrorMs ?? 0)} unit="ms" />
          <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
        </div>
        <SessionFeedback
          kind={summary?.correct === summary?.total ? "correct" : "wrong"}
          message="Drill complete"
          detail={resultDetail}
        />
        <p class="text-xs text-muted-foreground">+{summary?.xp ?? 0} XP · Technique · Two-hand independence</p>
      {/snippet}
      {#snippet actions()}
        <AdaptiveRetryBar onRetry={() => void start()} onSlower={slowDown} retryLabel="Again" />
        <StartShortcut onStart={() => void start()} />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/two-hand" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} setupSummary={setupSummaryLine} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-4 rounded-lg border bg-card p-4">
        <SegmentedControl ariaLabel="Pattern" options={patternOptions} bind:value={patternKind} />
        <SegmentedControl ariaLabel="Hand mode" options={handModeOptions} bind:value={handMode} />
        <SegmentedControl ariaLabel="Key" options={keyOptions} bind:value={tonic} />
        {#if handMode === "both"}
          <SegmentedControl
            size="sm"
            ariaLabel="Dynamics"
            options={[
              { value: "even", label: "Even touch" },
              { value: "melody", label: "Melody louder" },
            ]}
            value={dynamics ? "melody" : "even"}
            onChange={(value) => (dynamics = value === "melody")}
          />
        {/if}
        <p class="text-xs text-muted-foreground">
          Tempo and count-in live in the practice controls above: {bpm} BPM.
        </p>
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage instrument="piano" class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · {handModeLabel(handMode)}</p>
            <h2
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              data-testid="two-hand-ready-heading"
              bind:this={setupSummary}
            >
              {display.patternLabel}
            </h2>
            <p class="text-sm text-stage-muted">
              Left hand holds the pulse, right hand runs the line. Play anything to warm up.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled={!ready || pending} onclick={() => void start()}>
              {pending ? "Starting..." : "Start"}
            </Button>
            <StartShortcut onStart={() => void start()} />
          </div>
        </div>
        {@render keyboard()}
        <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-stage-muted">
          <span>{status}</span>
          <span class="flex items-center gap-3">
            <span>{midiStatus}</span>
            <Button type="button" size="sm" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
              {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
            </Button>
          </span>
        </div>
      </PracticeStage>
    {/snippet}

    {#snippet stage()}
      <PracticeStage instrument="piano" class="grid gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">{display.patternLabel} · {handModeLabel(handMode)}</p>
            <h2 class="text-xl font-semibold tracking-tight" tabindex="-1" bind:this={activeHeading}>
              Hold the pulse under the line.
            </h2>
          </div>
          <span class="text-sm text-stage-muted tabular-nums">
            {Math.min(totalNotes, playedNotes)} / {totalNotes}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <HudTile size="sm" label="Notes" value={Math.min(totalNotes, playedNotes)} unit={`/${totalNotes}`} tone="accent" />
          <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
        </div>
        <Progress value={Math.min(totalNotes, playedNotes)} max={totalNotes} />
        {@render keyboard()}
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}
    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={cancel}>Stop</Button>
    {/snippet}
    {#snippet rail()}
      <DrillProgressRail
        items={[
          { label: "Pattern", value: display.patternLabel },
          { label: "Hands", value: handModeLabel(handMode) },
          { label: "Tempo", value: `${bpm} BPM` },
          { label: "Input", value: runtime.activeSource === "midi" ? "MIDI" : "On-screen" },
        ]}
      />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
