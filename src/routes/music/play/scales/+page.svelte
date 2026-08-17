<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { tempoLadderProjection } from "@repo/music-core/engines/projection";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    normalizeScaleDrillConfig,
    SCALE_DRILL_MOTIONS,
    SCALE_DRILL_SPANS,
    SCALE_DRILL_TONICS,
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { noteToMidi } from "@repo/music-core/engines/theory";
  import {
    JAZZ_SCALE_KINDS,
    scalePatternSemitones,
    type ScaleMotion,
    type ScalePatternPrompt,
    type ScalePatternKind,
    type ScaleSpan,
  } from "@repo/music-core/exercises/scale-pattern";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import { INSTRUMENT_LABELS, VIEWABLE_INSTRUMENTS, type InstrumentId } from "@repo/music-core/domain";

  import InstrumentView from "../../_components/InstrumentView.svelte";
  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import { unixMs } from "@repo/music-core/domain";
  import { meanPartialCredit } from "@repo/music-core/engines/sessions";
  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import DrillFocusScope from "../../_components/DrillFocusScope.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  let { runtime: runtimeProp }: { runtime?: MusicRuntime } = $props();
  // svelte-ignore state_referenced_locally -- runtime ownership is fixed for a route mount
  const runtime = runtimeProp ?? useMusicRuntime();
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const initialConfig = normalizeScaleDrillConfig(initialSearch);
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;

  // Which scale to practice. The drill is technical (play it evenly, unlock
  // faster tempos); jazz/modal scales make it double as jazz vocabulary.
  const SCALE_OPTIONS: { value: ScalePatternKind; label: string; jazz: boolean }[] = [
    { value: "major", label: "Major", jazz: false },
    { value: "natural-minor", label: "Natural minor", jazz: false },
    { value: "harmonic-minor", label: "Harmonic minor", jazz: false },
    { value: "dorian", label: "Dorian", jazz: true },
    { value: "phrygian", label: "Phrygian", jazz: false },
    { value: "lydian", label: "Lydian", jazz: true },
    { value: "mixolydian", label: "Mixolydian", jazz: true },
    { value: "locrian", label: "Locrian", jazz: false },
    { value: "melodic-minor", label: "Melodic minor", jazz: true },
    { value: "major-pentatonic", label: "Major pentatonic", jazz: false },
    { value: "minor-pentatonic", label: "Minor pentatonic", jazz: false },
    { value: "blues", label: "Blues", jazz: true },
    { value: "altered", label: "Altered (super-locrian)", jazz: true },
    { value: "bebop-major", label: "Bebop major", jazz: true },
    { value: "bebop-dominant", label: "Bebop dominant", jazz: true },
    { value: "whole-tone", label: "Whole tone", jazz: true },
    { value: "diminished", label: "Diminished (half-whole)", jazz: true },
  ];
  const MOTION_OPTIONS: { value: ScaleMotion; label: string }[] = SCALE_DRILL_MOTIONS.map(
    (value) => ({
      value,
      label: value === "up" ? "Ascending" : value === "down" ? "Descending" : "Up-down",
    }),
  );
  const SPAN_OPTIONS: { value: ScaleSpan; label: string }[] = SCALE_DRILL_SPANS.map((value) => ({
    value,
    label:
      value === "pentascale" ? "Pentascale" : value === "two-octave" ? "Two octaves" : "One octave",
  }));
  let scale = $state<ScalePatternKind>(initialConfig.scale);
  const scaleLabel = $derived(
    SCALE_OPTIONS.find((option) => option.value === scale)?.label ?? "Major",
  );
  const isJazzScale = $derived(JAZZ_SCALE_KINDS.includes(scale));
  let tonic = $state(initialConfig.tonic);
  let motion = $state<ScaleMotion>(initialConfig.motion);
  let span = $state<ScaleSpan>(initialConfig.span);
  const motionLabel = $derived(
    MOTION_OPTIONS.find((option) => option.value === motion)?.label ?? "Ascending",
  );
  const spanLabel = $derived(
    SPAN_OPTIONS.find((option) => option.value === span)?.label ?? "One octave",
  );
  const tonicLabel = $derived(tonic.replace(/\d+$/, ""));
  // Reference view of the selected scale pattern on the chosen instrument.
  const referenceMidi = $derived(
    scalePatternSemitones(scale, span, motion).map((semitones) => noteToMidi(tonic) + semitones),
  );
  let scaleInstrument = $state<InstrumentId>(initialConfig.instrument);
  runtime.setActiveInstrument(initialConfig.instrument);

  let ready = $state(false);
  let pending = $state(false);
  let destroyed = false;
  let startRequest = 0;
  let practiceContextRequest = 0;
  let practiceContextReady: Promise<boolean> = Promise.resolve(true);
  let status = $state("Preparing your technique history.");
  let tempo = $state(initialConfig.bpm);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());
  let captured = false;

  const liveProgress = $derived(Math.round((sessionState?.live?.progress ?? 0) * 100));
  const activePrompt = $derived(
    sessionState?.currentPrompt &&
      "noteLabels" in sessionState.currentPrompt &&
      "bpm" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as ScalePatternPrompt)
      : undefined,
  );
  const summary = $derived(sessionState?.summary);
  // Set true by "Change setup" to leave the summary phase without a new run
  // (abandon() no-ops in the summary state, so this is route-owned; mirrors
  // two-hand). Cleared only after the current request starts successfully.
  let resultsDismissed = $state(false);
  // The shell phase, computed from route state; the shell renders it but never
  // transitions. Focus management and announcements key off actual phase swaps.
  const phase = $derived<"summary" | "stage" | "setup">(
    summary && !resultsDismissed
      ? "summary"
      : sessionState?.status === "active" && activePrompt
        ? "stage"
        : "setup",
  );
  // Announced by the persistent live region; branch swaps remount the visible
  // status text, so screen readers would otherwise miss the transitions.
  const liveAnnouncement = $derived(
    phase === "summary" && summary
      ? `Scale complete. ${Math.round(summary.noteAccuracy * 100)}% notes clean · next target ${summary.nextTargetBpm} BPM.`
      : status,
  );
  const currentTempo = $derived(sessionState?.nextTargetBpm ?? tempo);
  const ladderState = $derived(sessionState ?? session?.state);
  const tempoLadder = $derived(
    ladderState ? tempoLadderProjection(ladderState, { startBpm: 100, stepBpm: 10, rungs: 6 }) : [],
  );
  const normalizedConfig = $derived(
    normalizeScaleDrillConfig({ scale, tonic, instrument: scaleInstrument, bpm: tempo, motion, span }),
  );
  const variantKey = $derived(`v1:scales:${scaleInstrument}:${scale}:${motion}:${span}`);

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
    const contextRequest = ++practiceContextRequest;
    startRequest += 1;
    let disposed = false;
    let cleanup: () => void = () => undefined;
    practiceContextReady = runtime
      .registerPracticeContext({
        owner: "scales",
        variantKey: key,
        defaultBpm: 100,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        allowedInstruments: [...VIEWABLE_INSTRUMENTS],
        onBpmChange: (bpm) => (tempo = bpm),
        onInstrumentChange: (next) => (scaleInstrument = next),
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
      startRequest += 1;
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
    midiStatus = midiMessage();
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
        status = state.error ?? "";
        if (state.summary) runtime.endPerformance();
        // Auto-capture the finished scale run into the journal (once).
        if (state.summary && !captured) {
          captured = true;
          void runtime.recordPractice({
            source: "drill",
            instrument: runtime.activeInstrument,
            tags: isJazzScale ? ["scales", "jazz"] : ["scales"],
            scoringEvents: state.summary.results.map((result) => result.event),
            xpEarned: state.summary.xp,
            note: `${scaleLabel} scale · ${Math.round(state.summary.noteAccuracy * 100)}% notes clean`,
          });
        }
      });
      ready = true;
      status = "Ready for scale practice.";
    } catch (error) {
      status = message(error, "Technique history could not be loaded.");
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

  async function startScale(): Promise<void> {
    if (!ready || pending || !session) return;
    const request = ++startRequest;
    resultsDismissed = true;
    pending = true;
    status = "";
    let performanceStarted = false;

    try {
      await tick();
      if (request !== startRequest) return;
      if (!(await practiceContextReady) || request !== startRequest) return;
      captured = false;
      if (!(await runtime.ensurePlaybackVoice())) {
        if (request === startRequest) status = runtime.audioMessage;
        return;
      }
      if (request !== startRequest) return;
      const config = normalizedConfig;
      const performance = await runtime.beginPerformance();
      if (request !== startRequest) {
        if (performance.status === "started") runtime.endPerformance();
        return;
      }
      if (performance.status !== "started") {
        status = performance.status === "failed" ? performance.message : "Start cancelled.";
        return;
      }
      performanceStarted = true;
      await session.startScale({
        tonic: config.tonic,
        scale: config.scale,
        bpm: config.bpm,
        motion: config.motion,
        span: config.span,
      });
      if (request !== startRequest) {
        runtime.endPerformance();
        session.abandon();
        return;
      }
      resultsDismissed = false;
      status = `Play the ${tonicLabel} ${scaleLabel} ${spanLabel.toLowerCase()} ${motionLabel.toLowerCase()} evenly.`;
    } catch (error) {
      runtime.endPerformance();
      if (performanceStarted) session.abandon();
      if (request !== startRequest) return;
      status = message(error, "The scale session could not be started.");
    } finally {
      pending = false;
    }
  }

  function playAccepted(event: NoteEvent): void {
    if (event.type !== "noteOn") return;
    if (runtime.audioEnabled) runtime.sound.playNote(event.midiNote, 0.12, undefined, event.velocity);
  }

  async function slowDown(): Promise<void> {
    const next = normalizeScaleDrillConfig({
      scale,
      tonic,
      instrument: scaleInstrument,
      bpm: tempo - 10,
    }).bpm;
    runtime.setPracticeVariantBpm(next, variantKey);
    await startScale();
  }

  async function increaseTempo(): Promise<void> {
    runtime.setPracticeVariantBpm(summary?.nextTargetBpm ?? tempo, variantKey);
    await startScale();
  }

  function cancel(): void {
    startRequest += 1;
    runtime.endPerformance();
    session?.abandon();
    status = "Run ended. Setup ready.";
  }

  // Leave the summary phase for setup. abandon() no-ops once a run has settled
  // into its summary, so returning to setup is a route-owned view decision.
  function changeSetup(): void {
    startRequest += 1;
    status = "Setup ready. Change the scale settings or start again.";
    resultsDismissed = true;
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const params = new URLSearchParams(window.location.search);
    params.set("scale", config.scale);
    params.set("tonic", config.tonic);
    params.set("instrument", config.instrument);
    params.set("bpm", String(config.bpm));
    params.set("motion", config.motion);
    params.set("span", config.span);
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  onDestroy(() => {
    destroyed = true;
    startRequest += 1;
    practiceContextRequest += 1;
    runtime.endPerformance();
    unsubscribeSession?.();
    unsubscribeMidiState();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Scales & Technique | Practice OS</title>
  <meta
    name="description"
    content="Practice scale technique with MIDI or on-screen input, evenness feedback, and tempo unlocks."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Scales & Technique"
    subtitle="Clean at tempo unlocks the next. Note accuracy and evenness, scored per rep."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? `MIDI · ${INSTRUMENT_LABELS[scaleInstrument]}` : "On-screen"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <DrillFocusScope active={sessionState?.status === "active"} {runtime} />

  <!-- Persistent live region: mounted outside the branches so transitions announce. -->
  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>Scale complete</Card.Description>
        <Card.Title>
          {Math.round((summary?.noteAccuracy ?? 0) * 100)}% notes · {summary?.xp ?? 0} XP
        </Card.Title>
      {/snippet}
      {#snippet children()}
        <div class="grid gap-2 text-sm text-muted-foreground">
          <p>Evenness error: {Math.round(summary?.meanEvennessErrorMs ?? 0)}ms average.</p>
          <p>Next target: {summary?.nextTargetBpm} BPM</p>
          <p>{summary?.results[0]?.result.feedback[0]?.message}</p>
        </div>
        <!-- The summary owns the tempo decision: the ladder lives here, never on
             setup or the stage. -->
        <div class="grid gap-2" aria-label="Tempo ladder">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tempo ladder</p>
          {#each tempoLadder as rung (rung.bpm)}
            <div
              class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm
                {rung.status === 'target'
                ? 'border-primary bg-primary text-primary-foreground'
                : rung.status === 'unlocked'
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'text-muted-foreground'}"
            >
              <span class="font-semibold tabular-nums">{rung.bpm} BPM</span>
              <span class="text-xs uppercase tracking-wide">
                {rung.status === "target" ? "Next" : rung.status === "unlocked" ? "Unlocked" : "Locked"}
              </span>
            </div>
          {/each}
        </div>
      {/snippet}
      {#snippet actions()}
        <AdaptiveRetryBar
          onRetry={increaseTempo}
          onSlower={slowDown}
          retryLabel="Practice next tempo"
        />
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta
          tags={["scales"]}
          accuracy={meanPartialCredit((summary?.results ?? []).map((result) => result.event))}
          before={visitStartedAt}
        />
      {/snippet}
      {#snippet routineContinue()}
        <RoutineContinueAction routine={runtime.dailyRoutine} />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/scales" routine={runtime.dailyRoutine} />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} summary={summaryPhase}>
    {#snippet setup()}
      <section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <Card.Root>
          <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
            <div class="space-y-1">
              <Card.Description>Scale practice</Card.Description>
              <Card.Title>{tonicLabel} {scaleLabel}</Card.Title>
            </div>
            <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
              {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
            </Button>
          </Card.Header>
          <Card.Content class="grid gap-6">
            <p class="text-sm text-muted-foreground" aria-live="polite">{midiStatus}</p>

            <details class="group rounded-xl border bg-muted/20 p-3">
              <summary bind:this={setupSummary} class="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>
                  <span class="block text-sm font-semibold">Remembered setup</span>
                  <span class="text-xs text-muted-foreground">
                    {tonicLabel} {scaleLabel} · {motionLabel} · {spanLabel} · {tempo} BPM
                  </span>
                </span>
                <span class="text-sm font-medium text-primary group-open:hidden">Edit setup</span>
                <span class="hidden text-sm font-medium text-primary group-open:inline">Hide setup</span>
              </summary>
              <fieldset
                disabled={pending || sessionState?.status === "active"}
                class="mt-4 grid gap-5 border-t pt-4 disabled:opacity-70"
              >
                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="grid gap-2">
                    <Label for="scale-kind">Scale</Label>
                    <select
                      id="scale-kind"
                      aria-label="Scale"
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      bind:value={scale}
                      disabled={sessionState?.status === "active"}
                    >
                      <optgroup label="Modes">
                        {#each SCALE_OPTIONS.filter((option) => !option.jazz) as option (option.value)}
                          <option value={option.value}>{option.label}</option>
                        {/each}
                      </optgroup>
                      <optgroup label="Jazz / modal">
                        {#each SCALE_OPTIONS.filter((option) => option.jazz) as option (option.value)}
                          <option value={option.value}>{option.label}</option>
                        {/each}
                      </optgroup>
                    </select>
                  </div>

                  <div class="grid gap-2">
                    <Label for="scale-tonic">Tonic</Label>
                    <select
                      id="scale-tonic"
                      aria-label="Tonic"
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      bind:value={tonic}
                      disabled={sessionState?.status === "active"}
                    >
                      {#each SCALE_DRILL_TONICS as note (note)}
                        <option value={note}>{note.replace(/\d+$/, "")}</option>
                      {/each}
                    </select>
                  </div>

                  <div class="grid gap-2">
                    <Label for="scale-span">Span</Label>
                    <select
                      id="scale-span"
                      aria-label="Span"
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      bind:value={span}
                      disabled={sessionState?.status === "active"}
                    >
                      {#each SPAN_OPTIONS as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </div>

                  <div class="grid gap-2">
                    <Label for="scale-motion">Motion</Label>
                    <select
                      id="scale-motion"
                      aria-label="Motion"
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      bind:value={motion}
                      disabled={sessionState?.status === "active"}
                    >
                      {#each MOTION_OPTIONS as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </div>
                </div>

                <div class="grid max-w-xs gap-2">
                  <Label>Tempo</Label>
                  <p class="text-sm font-semibold tabular-nums">{tempo} BPM</p>
                  <p class="text-xs text-muted-foreground">
                    Current unlocked target: {currentTempo} BPM
                  </p>
                </div>
              </fieldset>
            </details>
          </Card.Content>
          <Card.Footer class="flex-wrap gap-3">
            <Button
              type="button"
              disabled={!ready || pending || sessionState?.status === "active"}
              onclick={startScale}
            >
              {pending ? "Starting..." : "Start Scale"}
            </Button>
            <StartShortcut onStart={() => void startScale()} />
            <p class="text-sm text-muted-foreground">{status}</p>
          </Card.Footer>
        </Card.Root>

        <aside class="grid min-w-0 content-start gap-4">
          <Card.Root class="min-w-0">
            <Card.Header class="gap-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Card.Description>Reference</Card.Description>
                  <Card.Title>{tonicLabel} {scaleLabel} on {INSTRUMENT_LABELS[scaleInstrument]}</Card.Title>
                </div>
                <fieldset disabled={pending || sessionState?.status === "active"}>
                  <SegmentedControl
                    size="sm"
                    ariaLabel="Scale instrument"
                    options={VIEWABLE_INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
                    value={scaleInstrument}
                    onChange={(v) => {
                      scaleInstrument = v as InstrumentId;
                      runtime.setActiveInstrument(scaleInstrument);
                    }}
                  />
                </fieldset>
              </div>
            </Card.Header>
            <Card.Content class="min-w-0 overflow-x-auto">
              <InstrumentView midi={referenceMidi} instrument={scaleInstrument} router={runtime.router} />
            </Card.Content>
          </Card.Root>

          <Card.Root class="min-w-0">
            <Card.Header>
              <Card.Description>Streak</Card.Description>
              <Card.Title>{progress.state.streakDays} days</Card.Title>
            </Card.Header>
          </Card.Root>
        </aside>
      </section>
    {/snippet}

    {#snippet stage()}
      <PracticeStage instrument={scaleInstrument} class="grid gap-5 p-5 sm:p-6">
        <div>
          <p class="eyebrow">Focus mode · {motionLabel}</p>
          <h2 class="text-2xl font-bold tracking-tight" tabindex="-1" bind:this={activeHeading}>
            {activePrompt?.label}
          </h2>
          <p class="text-sm text-stage-muted">
            {activePrompt?.bpm} BPM · Follow the scale cleanly before adding speed.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile label="Progress" value={liveProgress} unit="%" tone="accent" />
          <HudTile label="Notes" value={activePrompt?.noteLabels.length ?? 0} />
          <HudTile label="Tempo" value={activePrompt?.bpm ?? currentTempo} unit="BPM" />
          <HudTile label="Span" value={spanLabel} />
        </div>
        <Progress value={liveProgress} max={100} />
        <div class="min-w-0 rounded-xl border border-stage-line bg-stage-2/70 p-4">
          <OnScreenKeyboard
            router={runtime.router}
            notes={activePrompt?.noteLabels ?? []}
            onAccepted={playAccepted}
          />
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}
    {#snippet stageAction()}
      <Button type="button" variant="outline" onclick={cancel}>End run</Button>
    {/snippet}
    {#snippet rail()}
      <DrillProgressRail
        title="Live run"
        items={[
          { label: "Scale", value: `${tonicLabel} ${scaleLabel}` },
          { label: "Motion", value: motionLabel },
          { label: "Target", value: `${currentTempo} BPM` },
          { label: "Input", value: runtime.activeSource === "midi" ? "MIDI" : "On-screen" },
        ]}
      />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
