<script lang="ts">
  import { browser } from "$app/environment";
  import Check from "lucide-svelte/icons/check";
  import { onDestroy, tick } from "svelte";

  import {
    INSTRUMENT_LABELS,
    isMonophonic,
    unixMs,
    VIEWABLE_INSTRUMENTS,
    type InstrumentId,
    type NoteEvent,
  } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    buildDrillVoicings,
    type DrillVariant,
    type RootlessPosition,
  } from "@repo/music-core/engines/jazz";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import {
    normalizeVoicingDrillConfig,
    VoicingDrillSession,
    type VoicingDrillState,
  } from "@repo/music-core/engines/voicing-drill-session";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import InstrumentView from "../../_components/InstrumentView.svelte";
  import PianoSurface from "../../_components/piano/PianoSurface.svelte";
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
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : new URLSearchParams();
  const hasInstrumentQuery = initialSearch.has("instrument");
  const initialConfig = normalizeVoicingDrillConfig(
    initialSearch,
    hasInstrumentQuery ? "piano" : runtime.activeInstrument,
  );
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;
  const variantLabels: Record<DrillVariant, string> = {
    major: "Rootless ii-V-I",
    minor: "Minor ii-V-i",
    altered: "Altered V7",
  };

  let instrument = $state<InstrumentId>(initialConfig.instrument);
  runtime.setActiveInstrument(initialConfig.instrument);
  let variant = $state<DrillVariant>(initialConfig.variant);
  let startPosition = $state<RootlessPosition>(initialConfig.startPosition);
  // Grading: lenient (any note played, beginner/on-screen) vs held-together
  // (true chord detection, best with a MIDI instrument). Auto-advance moves on as
  // soon as the target is matched, so no manual "Check" is needed.
  let strict = $state(initialConfig.strict);
  let autoAdvance = $state(initialConfig.autoAdvance);
  let bpm = $state(96);

  let ready = $state(false);
  let session = $state<VoicingDrillSession | undefined>();
  let drillState = $state<VoicingDrillState | undefined>();
  let status = $state("Loading your harmony progress…");
  let pending = $state(false);
  let routeGeneration = 0;
  let startRequest = 0;
  let practiceContextReady: Promise<void> = Promise.resolve();
  let liveTick = $state(0);
  let captured = false;
  let resultsDismissed = $state(false);
  let unsubscribeSession: (() => void) | undefined;

  const live = $derived.by(() => {
    void liveTick;
    return Math.round((session?.liveProgress ?? 0) * 100);
  });
  const mono = $derived(isMonophonic(instrument));
  const summary = $derived(drillState?.status === "summary" ? drillState : undefined);
  const phase = $derived<"setup" | "stage" | "summary">(
    summary && !resultsDismissed
      ? "summary"
      : drillState?.status === "active"
        ? "stage"
        : "setup",
  );
  const variantLabel = $derived(variantLabels[variant]);
  const preview = $derived(buildDrillVoicings(variant, startPosition));
  const normalizedConfig = $derived(
    normalizeVoicingDrillConfig({
      instrument,
      variant,
      start: startPosition,
      strict: strict ? "held" : "lenient",
      advance: autoAdvance ? "auto" : "manual",
    }),
  );
  const variantKey = $derived(
    `v1:voicings:${instrument}:${variant}:${startPosition}:${strict ? "held" : "lenient"}:${autoAdvance ? "auto" : "manual"}`,
  );
  const liveAnnouncement = $derived(
    phase === "summary" && summary
      ? `Voicing results ready. ${Math.round(summary.accuracy * 100)}% accuracy · ${summary.xp} XP across ${summary.total} chords.`
      : status,
  );

  let activeHeading = $state<HTMLHeadingElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let setupHeading = $state<HTMLHeadingElement | null>(null);
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
        owner: "voicings",
        variantKey: key,
        defaultBpm: 96,
        ...(initialUrlBpm === undefined ? {} : { initialUrlBpm }),
        meter: { numerator: 4, denominator: 4 },
        allowedInstruments: [...VIEWABLE_INSTRUMENTS],
        onBpmChange: (next) => (bpm = next),
        onInstrumentChange: (next) => (instrument = next),
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

  // Recompute live progress as input arrives during an active chord, and
  // auto-advance the moment the target voicing is matched. The check is deferred
  // to a microtask so the exercise host (a later router subscriber) has already
  // fed it this event before we read `liveProgress`.
  $effect(() => {
    const unsubscribe = runtime.router.subscribe((event) => {
      if (drillState?.status !== "active") return;
      if (event.type === "noteOn") liveTick += 1;
      if (!autoAdvance) return;
      queueMicrotask(() => {
        if (!pending && drillState?.status === "active" && (session?.liveProgress ?? 0) >= 1) {
          void check();
        }
      });
    });
    return () => unsubscribe();
  });

  async function initialize(): Promise<void> {
    await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
    ready = true;
    status = "Pick an instrument and start the ii-V-I drill.";
  }

  async function startDrill(): Promise<void> {
    if (!ready || pending) return;
    const request = ++startRequest;
    resultsDismissed = true;
    pending = true;
    await tick();
    const generation = routeGeneration;
    await practiceContextReady;
    if (request !== startRequest || generation !== routeGeneration) {
      pending = false;
      return;
    }
    if (!(await runtime.ensurePlaybackVoice())) {
      pending = false;
      if (request === startRequest && generation === routeGeneration) status = runtime.audioMessage;
      return;
    }
    if (request !== startRequest || generation !== routeGeneration) {
      pending = false;
      return;
    }
    const performance = await runtime.beginPerformance();
    if (request !== startRequest || generation !== routeGeneration) {
      if (performance.status === "started") runtime.endPerformance();
      pending = false;
      return;
    }
    if (performance.status !== "started") {
      pending = false;
      status = performance.status === "failed" ? performance.message : "Start cancelled.";
      return;
    }
    try {
      const config = normalizedConfig;
      unsubscribeSession?.();
      session?.dispose();
      captured = false;
      session = new VoicingDrillSession({
        router: runtime.router,
        services: { skills, analytics, progress },
        instrument: config.instrument,
        variant: config.variant,
        startPosition: config.startPosition,
        strict: config.strict,
      });
      unsubscribeSession = session.subscribe((next) => {
        drillState = next;
        if (next.status === "summary") runtime.endPerformance();
        if (next.status === "summary" && !captured) {
          captured = true;
          void runtime.recordPractice({
            source: "drill",
            instrument: config.instrument,
            tags: ["jazz", "voicings", "ii-v-i"],
            scoringEvents: next.results.map((result) => result.event),
            xpEarned: next.xp,
            note: `${variantLabel} · ${Math.round(next.accuracy * 100)}% across ${next.total} chords`,
          });
        }
      });
      session.start();
      resultsDismissed = false;
      status = autoAdvance
        ? "Play the voicing — it advances on its own."
        : "Play the voicing, then press Check.";
    } catch (error) {
      runtime.endPerformance();
      status = error instanceof Error ? error.message : "The voicing drill could not start.";
    } finally {
      pending = false;
    }
  }

  async function check(): Promise<void> {
    if (!session || drillState?.status !== "active" || pending) return;
    pending = true;
    try {
      if (!(await runtime.enableAudio())) {
        // Audio is optional; grading still works without it.
      }
      const step = await session.submit();
      status = step.correct
        ? `${step.target.symbol} ✓ +${step.xp} XP`
        : `${step.target.symbol}: ${Math.round(step.score * 100)}% — keep going.`;
    } finally {
      pending = false;
    }
  }

  function playInput(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.2, undefined, event.velocity);
    }
  }

  function cancel(): void {
    runtime.endPerformance();
    unsubscribeSession?.();
    unsubscribeSession = undefined;
    session?.dispose();
    session = undefined;
    drillState = undefined;
    status = "Drill cancelled. Setup ready.";
  }

  function changeSetup(): void {
    startRequest += 1;
    status = "Setup ready. Change the voicing settings or start again.";
    resultsDismissed = true;
  }

  function previewNotes(midi: number[], bass?: number): string {
    return (bass === undefined ? midi : [bass, ...midi]).map((note) => midiToNote(note, true)).join(" ");
  }

  function syncConfigUrl(): void {
    const config = normalizedConfig;
    const params = new URLSearchParams(window.location.search);
    params.set("instrument", config.instrument);
    params.set("variant", config.variant);
    params.set("start", config.startPosition);
    params.set("strict", config.strict ? "held" : "lenient");
    params.set("advance", config.autoAdvance ? "auto" : "manual");
    params.set("bpm", String(bpm));
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onDestroy(() => {
    routeGeneration += 1;
    runtime.endPerformance();
    unsubscribeSession?.();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>ii-V-I Voicing Drill | Practice OS</title>
  <meta
    name="description"
    content="Play rootless, minor, and altered dominant jazz voicings through all 12 keys, graded on any instrument."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="ii-V-I Voicing Drill"
    subtitle="Play rootless, minor, and altered dominant voicings through all 12 keys. Graded on your instrument — XP feeds the ii-V-I skill."
  >
    {#snippet controls()}
      <SourceReadout
        label="Playing on"
        device={runtime.activeSource === "midi" ? "MIDI" : "On-screen"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>


  <p class="sr-only" aria-live="polite">{liveAnnouncement}</p>

  {#snippet drillReference()}
    <Card.Root>
      <Card.Header>
        <Card.Description>Reference</Card.Description>
        <Card.Title class="text-base">Drill preview</Card.Title>
      </Card.Header>
      <Card.Content class="grid max-h-[28rem] gap-2 overflow-y-auto pr-1 text-sm">
        {#each preview as step (step.key)}
          <div class="rounded-md border px-3 py-2">
            <div class="mb-1 flex items-center justify-between gap-2">
              <span class="font-semibold">{step.key} {variant === "minor" ? "minor" : "major"}</span>
              <Badge variant="outline">{step.chords.length} chords</Badge>
            </div>
            <div class="grid gap-1">
              {#each step.chords as chord (chord.symbol)}
                <div class="flex items-baseline justify-between gap-2">
                  <span class="font-medium">{chord.symbol}</span>
                  <span class="text-right text-xs text-muted-foreground">
                    {previewNotes(chord.midi, chord.bassMidi)}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/snippet}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>Voicing result</Card.Description>
        <Card.Title>
          Drill complete · {Math.round((summary?.accuracy ?? 0) * 100)}% accuracy · +{summary?.xp ?? 0} XP
        </Card.Title>
      {/snippet}
      {#snippet children()}
        <p class="text-sm text-muted-foreground">
          {summary?.total ?? 0} chords completed across all 12 keys.
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta
          tags={["voicings"]}
          accuracy={summary?.accuracy ?? 0}
          before={visitStartedAt}
        />
      {/snippet}
      {#snippet actions()}
        <AdaptiveRetryBar onRetry={() => void startDrill()} retryLabel="Repeat voicings" />
        <Button type="button" variant="outline" disabled={pending} onclick={() => void startDrill()}>
          Restart drill
        </Button>
        <StartShortcut onStart={() => void startDrill()} />
      {/snippet}
      {#snippet routineContinue()}
        <RoutineContinueAction routine={runtime.dailyRoutine} />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion
          {skills}
          {analytics}
          currentPath="/music/play/voicings"
          routine={runtime.dailyRoutine}
        />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} summary={summaryPhase}>
    {#snippet setup()}
      <section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card.Root class="self-start">
          <Card.Header class="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Card.Description>Drill</Card.Description>
              <Card.Title bind:ref={setupHeading} tabindex="-1">
                {variantLabel} · all 12 keys
              </Card.Title>
            </div>
          </Card.Header>

          <Card.Content class="grid gap-5">
            <div class="flex flex-wrap items-center gap-2">
              <SegmentedControl
                size="sm"
                ariaLabel="Instrument"
                options={VIEWABLE_INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
                value={instrument}
                onChange={(v) => {
                  instrument = v as InstrumentId;
                  runtime.setActiveInstrument(instrument);
                }}
              />
              <SegmentedControl
                size="sm"
                ariaLabel="Drill variant"
                options={[
                  { value: "major", label: "Major" },
                  { value: "minor", label: "Minor" },
                  { value: "altered", label: "Altered V7" },
                ]}
                value={variant}
                onChange={(v) => (variant = v as DrillVariant)}
              />
              {#if variant === "major"}
                <SegmentedControl
                  size="sm"
                  ariaLabel="Start position"
                  options={[
                    { value: "A", label: "A-B-A" },
                    { value: "B", label: "B-A-B" },
                  ]}
                  value={startPosition}
                  onChange={(v) => (startPosition = v as RootlessPosition)}
                />
              {/if}
              {#if !mono}
                <SegmentedControl
                  size="sm"
                  ariaLabel="Grading"
                  options={[
                    { value: "lenient", label: "Lenient" },
                    { value: "held", label: "Held" },
                  ]}
                  value={strict ? "held" : "lenient"}
                  onChange={(v) => (strict = v === "held")}
                />
              {/if}
              <SegmentedControl
                size="sm"
                ariaLabel="Advance"
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "manual", label: "Manual" },
                ]}
                value={autoAdvance ? "auto" : "manual"}
                onChange={(v) => (autoAdvance = v === "auto")}
              />
            </div>

            {#if mono}
              <p class="text-xs text-muted-foreground">
                The Aerophone is monophonic — play each voicing as an ascending arpeggio.
              </p>
            {/if}
          </Card.Content>

          <Card.Footer class="flex-wrap gap-3">
            <Button type="button" disabled={!ready || pending} onclick={() => void startDrill()}>
              Start drill
            </Button>
            <StartShortcut onStart={() => void startDrill()} />
            <p class="text-sm text-muted-foreground">{status}</p>
          </Card.Footer>
        </Card.Root>

        <aside class="grid content-start gap-4">
          {@render drillReference()}
          <DrillProgressRail
            title="0 / 36 chords"
            items={[
              { label: "Accuracy", value: "0%" },
              { label: "XP earned", value: 0 },
              { label: "Skill", value: "ii-V-I (Harmony)" },
            ]}
          />
        </aside>
      </section>
    {/snippet}

    {#snippet stage()}
      <PracticeStage instrument={instrument} class="grid gap-5 p-5 sm:p-6">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Focus mode · {variantLabel}</p>
            <h2
              class="text-2xl font-bold tracking-tight"
              tabindex="-1"
              bind:this={activeHeading}
            >
              {drillState?.current?.symbol}
            </h2>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="secondary">{mono ? "arpeggio" : "chord"}</Badge>
            <span class="text-sm text-stage-muted tabular-nums">
              {(drillState?.index ?? 0) + 1} / {drillState?.total ?? 36}
            </span>
          </div>
        </div>

        {#if drillState?.current?.displayMidi}
          <div class="grid min-w-0 gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-4">
            <p class="text-xs font-semibold uppercase tracking-widest text-stage-muted">
              Target voicing
            </p>
            <InstrumentView
              midi={drillState.current.displayMidi}
              {instrument}
              router={runtime.router}
            />
          </div>
        {/if}

        <div class="space-y-1.5">
          <div class="flex justify-between text-xs text-stage-muted">
            <span>Notes matched</span><span>{live}%</span>
          </div>
          <Progress value={live} max={100} />
        </div>

        <div class="min-w-0 rounded-xl border border-stage-line bg-stage-2/70 p-4">
          <PianoSurface router={runtime.router} pointerMode="latch" onAccepted={playInput} />
        </div>

        <div class="flex flex-wrap items-center gap-3">
          {#if autoAdvance}
            <Button type="button" variant="outline" disabled={pending} onclick={check}>
              Skip chord
            </Button>
          {:else}
            <Button type="button" disabled={pending} onclick={check}>
              <Check aria-hidden="true" />
              Check chord
            </Button>
          {/if}
          <p class="text-sm text-stage-muted">{status}</p>
        </div>
      </PracticeStage>
    {/snippet}

    {#snippet stageAction()}
      <Button type="button" variant="outline" disabled={pending} onclick={cancel}>
        Cancel drill
      </Button>
    {/snippet}

    {#snippet rail()}
      {@render drillReference()}
      <DrillProgressRail
        title={`${drillState?.results.length ?? 0} / ${drillState?.total ?? 36} chords`}
        items={[
          { label: "Accuracy", value: `${Math.round((drillState?.accuracy ?? 0) * 100)}%` },
          { label: "XP earned", value: drillState?.xp ?? 0 },
          { label: "Skill", value: "ii-V-I (Harmony)" },
        ]}
      />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
