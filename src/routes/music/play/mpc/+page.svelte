<script lang="ts">
  import { GROOVE_VOICES, MPC_GROOVES, grooveTargets, normalizeMpcGrooveConfig, type MpcGrooveAnswer, type MpcGroovePrompt } from "@repo/music-core/exercises/mpc-groove";
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";

  import { unixMs, type ExerciseResult } from "@repo/music-core/domain";

  import type {
    MpcSingleStrokeAnswer,
    MpcSingleStrokePrompt,
  } from "@repo/music-core/exercises/mpc-single-stroke";
  import {
    buildMpcRudimentSequence,
    buildMpcRudimentTargetEvents,
    assessedMpcResult,
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

  import TempoPracticeSuggestion from "../../_components/TempoPracticeSuggestion.svelte";
  import MidiStatus from "../../_components/MidiStatus.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import MpcPadGrid, { MPC_PAD_MIDI, DEFAULT_PAD_KEYS } from "../../_components/MpcPadGrid.svelte";
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

  const initialGroove = normalizeMpcGrooveConfig(initialSearch);
  const modeOptions = [{ value: "rudiment", label: "Rudiments" }, { value: "groove", label: "Groove copy-back" }];
  let mode = $state(initialSearch.get("mode") === "groove" ? "groove" : "rudiment");
  let grooveFamily = $state(initialGroove.family);
  let grooveMapping = $state({ ...initialGroove.mapping });
  let responseDeadline: ReturnType<typeof setTimeout> | undefined;
  let groovePreparing = $state(false);
  const grooveConfig = $derived(normalizeMpcGrooveConfig({ groove: grooveFamily, ...grooveMapping, bpm }));
  const grooveAnswer = $derived(mode === "groove" ? result?.result.answer as MpcGrooveAnswer | undefined : undefined);
  const completedGroove = $derived(completedPrompt && "responseStart" in completedPrompt ? completedPrompt as MpcGroovePrompt : undefined);

  let mappingOpen = $state(false);
  let keymap = $state({ ...DEFAULT_PAD_KEYS });
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
  const completedPrompt = $derived(summary?.results[0]?.prompt);
  const completedBpm = $derived(completedPrompt && "bpm" in completedPrompt ? completedPrompt.bpm : Number(bpm));
  const result = $derived(summary?.results[0]);
  const answer = $derived(result?.result.answer as MpcSingleStrokeAnswer | undefined);
  const assessed = $derived(result && mode !== "groove" ? assessedMpcResult(result.result as ExerciseResult<MpcSingleStrokeAnswer>) : undefined);
  const phase = $derived<"setup" | "stage" | "summary">(
    summary && !resultsDismissed
      ? "summary"
      : sessionState?.status === "active" || groovePreparing
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
  const variantKey = $derived(mode === "groove" ? `v1:mpc:groove:${grooveFamily}` : `v1:mpc:${patternId}`);
  const patternLabel = $derived(
    mode === "groove" ? (MPC_GROOVES.find(option => option.value === grooveFamily)?.label ?? "Groove") : (MPC_RUDIMENT_PATTERN_OPTIONS.find((option) => option.value === patternId)?.label ?? "Single strokes"),
  );
  const liveAnnouncement = $derived(
    phase === "summary"
      ? mode === "groove" ? `Groove complete. ${Math.round((grooveAnswer?.accuracy ?? 0) * 100)}% independent accuracy.` : `Rudiment complete. ${Math.round((assessed?.score ?? 0) * 100)}% on measured dimensions, ${summary?.xp ?? 0} XP.`
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
        if (state.summary) { runtime.endPerformance(); stopGrooveSound(); }
        if (state.summary && !captured) {
          captured = true;
          const completed = state.summary.results[0];
          if (completed && "responseStart" in completed.prompt) {
            const detail = completed.result.answer as MpcGrooveAnswer;
            const config = completed.prompt;
            void runtime.recordPractice({
              source: "drill", instrument: "mpc",
              comparison: { variantKey: `v1:mpc:groove:${config.family}`, bpm: config.bpm, settings: JSON.stringify({ family: config.family, bpm: config.bpm, mapping: config.mapping }), dimensions: "groove family, BPM and voice mappings" },
              tags: ["mpc", "groove", config.family], scoringEvents: [completed.event], xpEarned: state.summary.xp,
              note: `MPC groove recall · ${config.label} · ${config.bpm} BPM · ${Math.round(detail.accuracy * 100)}% independent accuracy · ${detail.meanTimingErrorMs === null ? "Timing not measured" : `${Math.round(detail.meanTimingErrorMs)}ms timing`} · Accents not assessed`,
            });
            return;
          }
          const detail = completed?.result.answer as MpcSingleStrokeAnswer | undefined;
          const patternLabel =
            completed && "patternLabel" in completed.prompt
              ? completed.prompt.patternLabel.toLowerCase()
              : "single strokes";
          void runtime.recordPractice({
            source: "drill",
            instrument: "mpc",
            comparison: { variantKey, bpm: Number(bpm), settings: JSON.stringify(normalizedConfig), dimensions: "pattern, pads and hit count" },
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

  async function start(): Promise<void> {
    if (!ready || pending || !session) return;
    if (mode === "groove" && new Set(Object.values(grooveMapping)).size !== 3) {
      status = "Choose three different MIDI pads.";
      return;
    }
    if (mode !== "groove" && leftPadMidi === rightPadMidi) {
      status = "Choose two different MPC pads.";
      return;
    }

    const request = ++startRequest;
    resultsDismissed = true;
    pending = true;
    captured = false;
    status = "";
    stopGrooveSound();
    let generation = routeGeneration;
    try {
      await tick();
      generation = routeGeneration;
      if (request !== startRequest) return;
      await practiceContextReady;
      if (request !== startRequest || generation !== routeGeneration) return;
      const config = normalizedConfig;
      const groove = grooveConfig;
      if (mode === "groove") { groovePreparing = true; status = "Listen to one bar, then count in for one bar."; }
      const performanceResult = await runtime.beginPerformance(mode === "groove" ? {
        countInBars: 1,
        leadIn: { bars: 1, onStart: (event) => {
          if (request !== startRequest || generation !== routeGeneration) return;
          for (const target of grooveTargets(groove.family)) {
            runtime.sound.playPercussion(target.voice, event.atSeconds + target.beat * 60 / groove.bpm);
          }
        } },
      } : undefined);
      if (request !== startRequest || generation !== routeGeneration) {
        if (performanceResult.status === "started") runtime.endPerformance();
        return;
      }
      if (performanceResult.status !== "started") {
        stopGrooveSound();
        status = performanceResult.status === "failed" ? performanceResult.message : "Start cancelled.";
        return;
      }
      if (mode === "groove") {
        const prompt = await session.startMpcGroove({ ...groove, responseStart: performanceResult.downbeat });
        if (request !== startRequest || generation !== routeGeneration) {
          runtime.endPerformance(); stopGrooveSound(); session.abandon(); return;
        }
        groovePreparing = false; resultsDismissed = false; status = "Your turn. Copy the groove for one bar.";
        const finishAtDeadline = () => {
          if (request !== startRequest || generation !== routeGeneration) return;
          const remaining = prompt.responseEnd - performance.now();
          if (remaining > 0) { responseDeadline = setTimeout(finishAtDeadline, remaining); return; }
          responseDeadline = undefined;
          runtime.endPerformance(); runtime.sound.stopPercussion(); session?.finishNow();
        };
        responseDeadline = setTimeout(finishAtDeadline, Math.max(0, prompt.responseEnd - performance.now()));
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
      stopGrooveSound();
      if (request !== startRequest || generation !== routeGeneration) return;
      status = message(error, "The MPC rudiment could not be started.");
    } finally {
      groovePreparing = false;
      pending = false;
    }
  }

  function stopGrooveSound(): void {
    if (responseDeadline !== undefined) clearTimeout(responseDeadline);
    responseDeadline = undefined;
    runtime.sound.stopPercussion();
  }

  const unsubscribeGrooveInput = runtime.router.subscribe(event => {
    const prompt = sessionState?.currentPrompt;
    if (mode !== "groove" || !prompt || !("responseStart" in prompt) || event.type !== "noteOn" ||
        event.timestamp < prompt.responseStart || event.timestamp >= prompt.responseEnd || sessionState?.status !== "active") return;
    const voice = GROOVE_VOICES.find(voice => prompt.mapping[voice.id] === event.midiNote);
    if (voice) runtime.sound.playPercussion(voice.id, undefined, event.velocity);
  });

  function cancel(): void {
    startRequest += 1;
    runtime.endPerformance();
    session?.abandon();
    stopGrooveSound();
    groovePreparing = false;
    status = "Practice cancelled. You can start again.";
  }

  function changeSetup(): void {
    startRequest += 1;
    status = "Setup ready. Change the rudiment settings or start again.";
    resultsDismissed = true;
  }

  function practiceAtTempo(nextBpm: number): void {
    runtime.setPracticeVariantBpm(nextBpm, variantKey);
    void start();
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const params = new URLSearchParams(window.location.search);
    params.set("mode", mode);
    if (mode === "groove") {
      params.set("groove", grooveConfig.family);
      for (const voice of GROOVE_VOICES) params.set(voice.id, String(grooveConfig.mapping[voice.id]));
    }
    params.set("pattern", config.patternId);
    params.set("left", String(config.leftPadMidi));
    params.set("right", String(config.rightPadMidi));
    params.set("hits", String(config.hitCount));
    params.set("bpm", String(mode === "groove" ? grooveConfig.bpm : config.bpm));
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onDestroy(() => {
    destroyed = true;
    routeGeneration += 1;
    startRequest += 1;
    runtime.endPerformance();
    stopGrooveSound();
    unsubscribeGrooveInput();
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
        source={runtime.activeSource}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>
  <MidiStatus class="-mt-2" />

  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet setupSummaryLine()}
    {#if mode === "groove"}Groove copy-back · {patternLabel} · {bpm} BPM
    {:else}{patternLabel} · Pads {normalizedConfig.leftPadMidi} and {normalizedConfig.rightPadMidi} · {normalizedConfig.hitCount} hits · {bpm} BPM{/if}
  {/snippet}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>{patternLabel} · {bpm} BPM</Card.Description>
        <Card.Title>{mode === "groove" ? "Groove complete" : "Rudiment complete"}</Card.Title>
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline">
          <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
              {Math.round((grooveAnswer?.accuracy ?? assessed?.score ?? 0) * 100)}<span class="text-3xl text-muted-foreground">%</span>
          </span>
          <span class="sr-only"> {mode === "groove" ? "independent accuracy" : "measured dimensions"}</span>
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        {#if grooveAnswer || assessed?.velocityMeasured}<LastRunDelta tags={["mpc"]} before={visitStartedAt} />{/if}
      {/snippet}
      {#snippet children()}
        {#if grooveAnswer && completedGroove}
          <div class="grid grid-cols-2 gap-3">
            <HudTile size="sm" label="Independent accuracy" value={Math.round(grooveAnswer.accuracy * 100)} unit="%" />
            <HudTile size="sm" label="Timing error" value={grooveAnswer.meanTimingErrorMs === null ? "Not measured" : Math.round(grooveAnswer.meanTimingErrorMs)} unit={grooveAnswer.meanTimingErrorMs === null ? undefined : "ms"} />
          </div>
          <p class="text-sm text-muted-foreground">{grooveAnswer.matched} matched · {grooveAnswer.omissions} missed · {grooveAnswer.extras} extra. Timing uses matched hits only.</p>
          <p class="text-sm text-muted-foreground">Accents are not assessed for these grooves. Velocity: {grooveAnswer.variableMidiVelocity ? "variable MIDI observed" : "Not measured"}.</p>
          <div class="max-w-full overflow-x-auto">
            <table aria-label="Expected groove" class="w-full text-center text-xs">
              <caption class="pb-2 text-left font-medium">Expected groove · sixteenth-note grid</caption>
              <thead><tr><th scope="col">Voice</th>{#each Array.from({length:16}, (_,i)=>i) as step (step)}<th scope="col" class="min-w-5">{step % 4 === 0 ? step / 4 + 1 : ["", "e", "&", "a"][step % 4]}</th>{/each}</tr></thead>
              <tbody>{#each GROOVE_VOICES as voice (voice.id)}<tr><th scope="row">{voice.name}</th>{#each Array.from({length:16}, (_,i)=>i) as step (step)}<td class="border p-1">{completedGroove.targets.some(target=>target.voice===voice.id && target.beat===step/4) ? "●" : "·"}</td>{/each}</tr>{/each}</tbody>
            </table>
          </div>
          <ul class="space-y-1 text-sm">{#each grooveAnswer.voices as voice (voice.voice)}<li>{GROOVE_VOICES.find(item=>item.id===voice.voice)?.name ?? "Unmapped pads"}: {voice.matched} matched, {voice.omissions} missed, {voice.extras} extra; timing {voice.meanTimingErrorMs === null ? "Not measured" : `${Math.round(voice.meanTimingErrorMs)}ms`}.</li>{/each}</ul>
        {:else if answer}
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HudTile size="sm" label="Pad accuracy" value={Math.round(answer.padAccuracy * 100)} unit="%" />
            <HudTile size="sm" label="Timing error" value={Math.round(answer.meanTimingErrorMs)} unit="ms" />
            <HudTile size="sm" label="Velocity" value={assessed?.velocityMeasured ? Math.round(answer.velocityConsistency * 100) : "Not measured"} unit={assessed?.velocityMeasured ? "%" : undefined} />
            <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
          </div>
          {#if !assessed?.velocityMeasured}<p class="text-sm text-muted-foreground">On-screen velocity is fixed. This score covers pad order, timing and completion; velocity needs MIDI input.</p>{/if}
        {/if}
        <p class="text-xs text-muted-foreground">+{summary?.xp ?? 0} XP · MPC</p>
      {/snippet}
      {#snippet actions()}
        <TempoPracticeSuggestion bpm={completedBpm} clean={mode === "groove" ? (grooveAnswer?.accuracy ?? 0) >= 0.95 && (grooveAnswer?.meanTimingErrorMs ?? Infinity) <= 60 : (answer?.padAccuracy ?? 0) >= 0.95 && (answer?.meanTimingErrorMs ?? Infinity) <= 60} basis={mode === "groove" ? "Based on independent groove accuracy and matched timing; accents are not assessed." : "Based on pad accuracy and measured timing; velocity is separate."} onPractice={practiceAtTempo} />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/mpc" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} setupSummary={setupSummaryLine} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-4 rounded-lg border bg-card p-4">
        {#if mode === "groove"}
          <div class="grid gap-3 sm:grid-cols-3">
            {#each GROOVE_VOICES as voice (voice.id)}
              <div class="grid gap-2"><Label for={`groove-${voice.id}`}>{voice.name} pad</Label><select id={`groove-${voice.id}`} aria-label={`${voice.name} pad`} bind:value={grooveMapping[voice.id]} class="h-9 rounded-md border border-input bg-background px-3 text-sm">{#each padOptions as midi (midi)}<option value={midi}>Pad {midi}</option>{/each}</select></div>
            {/each}
          </div>
        {:else}
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
        {/if}
        <details bind:open={mappingOpen}>
          <summary class="cursor-pointer text-sm font-medium">Keyboard pad mapping</summary>
          {#if mappingOpen && !pending}
          <PracticeStage instrument="mpc" class="mt-3 max-w-xs p-3">
            <MpcPadGrid router={runtime.router} bind:keymap editable />
          </PracticeStage>
          {/if}
        </details>
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
              {#if mode === "groove"}Hear one bar, count in for one bar, then copy it for one bar. Targets appear afterward.
              {:else}Alternate pads {normalizedConfig.leftPadMidi} and {normalizedConfig.rightPadMidi} for {normalizedConfig.hitCount}
              hits; order, timing and velocity are graded.{/if}
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
          <SegmentedControl ariaLabel="Practice mode" options={modeOptions} bind:value={mode} />
          <div class="mt-3">
            {#if mode === "groove"}<SegmentedControl ariaLabel="Groove family" options={[...MPC_GROOVES]} bind:value={grooveFamily} />
            {:else}<SegmentedControl ariaLabel="Rudiment pattern" options={MPC_RUDIMENT_PATTERN_OPTIONS} bind:value={patternId} />{/if}
          </div>
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
      {#if mode === "groove"}
        <PracticeStage instrument="mpc" class="grid min-w-0 gap-4 p-4 sm:p-6">
          <p class="text-lg font-medium">{status}</p>
          <p class="text-sm text-stage-muted">{#each GROOVE_VOICES as voice (voice.id)}<span class="mr-3 inline-block">{voice.name}: pad {grooveConfig.mapping[voice.id]} ({keymap[grooveConfig.mapping[voice.id]]?.toUpperCase() ?? "unassigned"})</span>{/each}</p>
          <div class="mx-auto w-full max-w-sm"><MpcPadGrid {keymap} router={runtime.router} labels={Object.fromEntries(GROOVE_VOICES.map((voice) => [grooveConfig.mapping[voice.id], voice.name]))} /></div>
        </PracticeStage>
      {:else}
      <PadRudimentStage
        {keymap}
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
      {/if}
    {/snippet}

    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={cancel}>Stop</Button>
    {/snippet}

    {#snippet rail()}
      {#if mode !== "groove"}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <HudTile size="sm" label="Next pad" value={nextPad ?? leftPadMidi} tone="accent" />
        <HudTile size="sm" label="Hits" value={completedHits} unit={`/${totalHits}`} />
        <HudTile size="sm" label="Quality" value={runningScore} unit="%" tone="good" />
        <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
        <HudTile size="sm" label="Input" value={runtime.activeSource === "midi" ? "MIDI" : "On-screen"} />
      </div>
      {/if}
      <MidiStatus />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
