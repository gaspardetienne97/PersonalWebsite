<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
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
  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import DrillFocusScope from "../../_components/DrillFocusScope.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SessionFeedback from "../../_components/SessionFeedback.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { suggestedFingerings } from "../../_components/piano-visual";
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
  let status = $state("Preparing piano technique.");
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
  const leftKeys = $derived([...new Set(display.leftNoteLabels)]);
  const rightKeys = $derived([...new Set(display.rightNoteLabels)]);
  const leftFingerings = $derived(suggestedFingerings(display.leftMidiNotes, "left"));
  const rightFingerings = $derived(suggestedFingerings(display.rightMidiNotes, "right"));
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
      status = "Hold the left-hand pulse while the right hand runs the line.";
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
    status = "Drill cancelled. You can start again.";
  }

  function changeSetup(): void {
    startRequest += 1;
    status = "Setup ready. Change the drill settings or start again.";
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
  <PracticeScreenHeader
    title="Two-Hand Independence"
    subtitle="Keep the left hand steady on each beat while the right hand runs a faster scale line."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI · piano" : "On-screen keys"}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <DrillFocusScope active={sessionState?.status === "active"} {runtime} />

  <!-- Persistent live region: mounted outside the branches so transitions announce. -->
  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>What happened</Card.Description>
        <Card.Title level={2} class="font-bold">{resultHeadline}</Card.Title>
      {/snippet}
      {#snippet children()}
        <div class="grid gap-6 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
          <div class="grid min-h-64 place-items-center rounded-xl border p-6 text-center {result?.correct ? 'border-success/30 bg-success/10' : 'bg-muted/30'}">
            <div>
              <p class="eyebrow">Two-hand score</p>
              <p class="text-7xl font-bold leading-none tabular-nums {result?.correct ? 'text-success' : 'text-foreground'}">
                {Math.round((result?.score ?? 0) * 100)}
              </p>
              <p class="mt-3 text-sm text-muted-foreground">+{summary?.xp ?? 0} XP earned</p>
            </div>
          </div>
          <div class="grid content-start gap-5">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {#if answer && handMode !== "right"}
                <HudTile label="Left note accuracy" value={Math.round(answer.leftAccuracy * 100)} unit="%" tone={answer.leftAccuracy >= 0.9 ? "good" : "default"} />
              {/if}
              {#if answer && handMode !== "left"}
                <HudTile label="Right note accuracy" value={Math.round(answer.rightAccuracy * 100)} unit="%" tone={answer.rightAccuracy >= 0.9 ? "good" : "default"} />
              {/if}
              <HudTile label="Mean spacing error" value={Math.round(answer?.meanEvennessErrorMs ?? 0)} unit="ms" />
              <HudTile label="Tempo" value={bpm} unit="BPM" />
            </div>
            <SessionFeedback
              kind={summary?.correct === summary?.total ? "correct" : "wrong"}
              message="Drill complete"
              detail={resultDetail}
              xp={summary?.xp ?? 0}
            />
          </div>
        </div>
      {/snippet}
      {#snippet actions()}
        <AdaptiveRetryBar onRetry={() => void start()} onSlower={slowDown} retryLabel="Repeat drill" />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} summary={summaryPhase}>
    {#snippet setup()}
      <section class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card.Root class="min-w-0">
          <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <Card.Description>Hand independence · {bpm} BPM</Card.Description>
              <Card.Title>{display.patternLabel}</Card.Title>
            </div>
            <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
              {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
            </Button>
          </Card.Header>

          <Card.Content class="grid gap-6">
            <details class="group rounded-xl border bg-muted/20 p-3">
              <summary bind:this={setupSummary} class="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>
                  <span class="block text-sm font-semibold">Remembered setup</span>
                  <span class="text-xs text-muted-foreground">
                    {tonic.replace(/\d+$/, "")} · {handModeLabel(handMode)} · {bpm} BPM{dynamics && handMode === "both" ? " · Melody louder" : ""}
                  </span>
                </span>
                <span class="text-sm font-medium text-primary group-open:hidden">Edit setup</span>
                <span class="hidden text-sm font-medium text-primary group-open:inline">Hide setup</span>
              </summary>
              <fieldset disabled={pending} class="mt-4 grid gap-4 border-t pt-4 disabled:opacity-70">
                <SegmentedControl ariaLabel="Pattern" options={patternOptions} bind:value={patternKind} />
                <SegmentedControl
                  ariaLabel="Hand mode"
                  options={handModeOptions}
                  bind:value={handMode}
                />
                <SegmentedControl ariaLabel="Key" options={keyOptions} bind:value={tonic} />
                <p class="text-sm font-semibold tabular-nums">Tempo · {bpm} BPM</p>
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
              </fieldset>
            </details>
          </Card.Content>

          <Card.Footer class="flex-wrap gap-3">
            <Button type="button" disabled={!ready || pending} onclick={() => void start()}>
              {pending ? "Starting..." : "Start drill"}
            </Button>
            <StartShortcut onStart={() => void start()} />
            <p class="text-sm text-muted-foreground">{status}</p>
          </Card.Footer>
        </Card.Root>

        <PracticeStage instrument="piano" class="grid min-w-0 gap-4 p-5">
          <div>
            <p class="eyebrow">Ready stage</p>
            <h2 class="text-xl font-bold">Piano keys</h2>
            <p class="text-sm text-stage-muted">{midiStatus}</p>
          </div>
          <div class="grid gap-2">
            <span class="text-xs font-medium text-stage-muted">Left hand</span>
            <OnScreenKeyboard
              router={runtime.router}
              notes={leftKeys}
              suggestedFingerings={leftFingerings}
              onAccepted={playAccepted}
            />
          </div>
          <div class="grid gap-2">
            <span class="text-xs font-medium text-stage-muted">Right hand</span>
            <OnScreenKeyboard
              router={runtime.router}
              notes={rightKeys}
              suggestedFingerings={rightFingerings}
              onAccepted={playAccepted}
            />
          </div>
        </PracticeStage>
      </section>
    {/snippet}

    {#snippet stage()}
      <PracticeStage instrument="piano" class="grid gap-5 p-5 sm:p-6">
        <div>
          <p class="eyebrow">Focus mode · {display.patternLabel}</p>
          <h2 class="text-2xl font-bold tracking-tight" tabindex="-1" bind:this={activeHeading}>
            Hold the pulse under the line.
          </h2>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <HudTile label="Notes" value={Math.min(totalNotes, playedNotes)} unit={`/${totalNotes}`} tone="accent" />
          <HudTile label="Tempo" value={bpm} unit="BPM" />
        </div>
        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-3 text-sm text-stage-muted">
            <span>{activePrompt?.label}</span>
            <span class="tabular-nums">{Math.min(totalNotes, playedNotes)}/{totalNotes}</span>
          </div>
          <Progress value={Math.min(totalNotes, playedNotes)} max={totalNotes} />
        </div>
        <div class="grid min-w-0 gap-5">
          <div class="grid gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-stage-muted">Left hand · pulse</span>
            <OnScreenKeyboard router={runtime.router} notes={leftKeys} suggestedFingerings={leftFingerings} onAccepted={playAccepted} />
          </div>
          <div class="grid gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-stage-muted">Right hand · line</span>
            <OnScreenKeyboard router={runtime.router} notes={rightKeys} suggestedFingerings={rightFingerings} onAccepted={playAccepted} />
          </div>
        </div>
      </PracticeStage>
    {/snippet}
    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={cancel}>Cancel drill</Button>
    {/snippet}
    {#snippet rail()}
      <DrillProgressRail
        title="Live run"
        items={[
          { label: "Pattern", value: display.patternLabel },
          { label: "Hands", value: handModeLabel(handMode) },
          { label: "Tempo", value: `${bpm} BPM` },
          { label: "Input", value: runtime.activeSource === "midi" ? "MIDI" : "On-screen" },
        ]}
      >
        <p class="text-xs text-muted-foreground">{status}</p>
      </DrillProgressRail>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
