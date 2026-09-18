<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
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
    type RootlessPosition,
  } from "@repo/music-core/engines/jazz";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import {
    buildVoicingDrillTargets,
    normalizeVoicingDrillConfig,
    type VoicingDrillVariant,
    VoicingDrillSession,
    type VoicingDrillState,
  } from "@repo/music-core/engines/voicing-drill-session";
  import { voiceLeadingFeedback } from "@repo/music-core/exercises/voicing-drill";
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
  const initialSearch = browser ? initialDrillSearch(["bpm", "tempo"]) : page.url.searchParams;
  const hasInstrumentQuery = initialSearch.has("instrument");
  const initialConfig = normalizeVoicingDrillConfig(
    initialSearch,
    hasInstrumentQuery ? "piano" : runtime.activeInstrument,
  );
  let checkMode = $state((browser ? initialSearch : page.url.searchParams).get("mode") === "check");
  const initialUrlBpm = Number(initialSearch.get("bpm")) || undefined;
  const variantLabels: Record<VoicingDrillVariant, string> = {
    major: "Rootless ii-V-I",
    minor: "Minor ii-V-i",
    altered: "Altered V7",
    "guide-tones": "Guide tones",
  };

  let instrument = $state<InstrumentId>(initialConfig.instrument);
  runtime.setActiveInstrument(initialConfig.instrument);
  let variant = $state<VoicingDrillVariant>(initialConfig.variant);
  let key = $state(initialConfig.key ?? 0);
  const guideTones = $derived(variant === "guide-tones");
  const unaided = $derived(checkMode || guideTones);
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
  let destroyed = false;
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
  const selectedNotes = $derived.by(() => {
    void liveTick;
    return session?.selectionFeedback ?? "";
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
  const preview = $derived(variant === "guide-tones" ? [] : buildDrillVoicings(variant, startPosition));
  const guideFirst = $derived(guideTones ? buildVoicingDrillTargets("piano", { variant: "guide-tones", key })[0] : undefined);
  const guideContext = $derived((phase === "stage" ? drillState?.current : guideFirst)?.voiceLeading);
  const guideFromSymbol = $derived(phase === "stage" && drillState?.index === 1
    ? drillState.results[0]?.target.symbol
    : `${midiToNote(60 + ((key + 2) % 12), true).replace(/\d+$/, "")}m7`);
  const keyLabel = $derived(midiToNote(60 + key, true).replace(/\d+$/, ""));
  const normalizedConfig = $derived(
    normalizeVoicingDrillConfig({
      instrument,
      variant,
      key,
      start: startPosition,
      strict: strict ? "held" : "lenient",
      advance: autoAdvance ? "auto" : "manual",
    }),
  );
  const variantKey = $derived(
    guideTones ? `v1:voicings:piano:guide-tones:${key}:${48 + key}-${71 + key}:independent` : `v1:voicings:${instrument}:${variant}:${startPosition}:${strict ? "held" : "lenient"}:${autoAdvance ? "auto" : "manual"}`,
  );
  const liveAnnouncement = $derived(
    phase === "summary" && summary
      ? `Voicing results ready. ${Math.round(summary.accuracy * 100)}% accuracy · ${summary.xp} XP across ${summary.total} chords.`
      : status,
  );

  const firstTarget = $derived(preview[0]?.chords[0]);
  const setupSummaryText = $derived(
    [
      variantLabel,
      INSTRUMENT_LABELS[instrument],
      variant === "major" ? (startPosition === "A" ? "A-B-A" : "B-A-B") : undefined,
      guideTones ? `Key ${keyLabel}` : mono ? undefined : strict ? "Held" : "Lenient",
      unaided ? "Check" : "Practice",
      autoAdvance && !unaided ? "Auto" : "Manual",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  /** Target keys lit on the one input keyboard (piano and Aerophone fallback). */
  const targetHighlights = $derived(
    Object.fromEntries((unaided ? [] : drillState?.current?.displayMidi ?? []).map((midi) => [midi, "target" as const])),
  );
  const readyHighlights = $derived(
    Object.fromEntries(
      (firstTarget ? [...(firstTarget.bassMidi === undefined ? [] : [firstTarget.bassMidi]), ...firstTarget.midi] : []).map(
        (midi) => [midi, "target" as const],
      ),
    ),
  );
  const chordStrip = $derived(
    (summary?.results ?? []).map((result) => ({
      symbol: result.target.symbol,
      correct: result.correct,
      score: Math.round(result.score * 100),
    })),
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
        allowedInstruments: guideTones ? ["piano"] : [...VIEWABLE_INSTRUMENTS],
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
      if (!autoAdvance || unaided) return;
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
    status = "Ready. Press Start, or Space.";
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
        key: config.key,
        assistance: unaided ? "independent" : "guided",
      });
      unsubscribeSession = session.subscribe((next) => {
        drillState = next;
        if (next.status === "summary") runtime.endPerformance();
        if (next.status === "summary" && !captured) {
          captured = true;
          void runtime.recordPractice({
            source: "drill",
            instrument: config.instrument,
            comparison: { variantKey, bpm, settings: JSON.stringify(guideTones ? { ...config, assistance: "independent", register: [48 + key, 71 + key] } : config), dimensions: guideTones ? "instrument, variant, key, register and assistance" : "instrument, variant, position, held-note rule and advance mode" },
            tags: ["jazz", "voicings", "ii-v-i"],
            scoringEvents: next.results.map((result) => result.event),
            xpEarned: next.xp,
            note: `${variantLabel} · ${Math.round(next.accuracy * 100)}% across ${next.total} chords`,
          });
        }
      });
      session.start();
      resultsDismissed = false;
      status = guideTones ? "Select exactly two guide tones for the next chord with the least total movement, then Check chord." : autoAdvance && !unaided
        ? "Play the voicing. It advances on its own."
        : "Play the voicing, then press Check chord.";
    } catch (error) {
      runtime.endPerformance();
      status = error instanceof Error ? error.message : "The voicing drill could not start.";
    } finally {
      pending = false;
    }
  }

  async function check(): Promise<void> {
    if (destroyed || !session || drillState?.status !== "active" || pending) return;
    const checkedSession = session;
    const generation = routeGeneration;
    pending = true;
    try {
      if (!(await runtime.enableAudio())) {
        // Audio is optional; grading still works without it.
      }
      if (destroyed || checkedSession !== session || generation !== routeGeneration) return;
      const step = await checkedSession.submit();
      if (destroyed || checkedSession !== session || generation !== routeGeneration) return;
      const movement = step.event.metrics.find((metric) => metric.kind === "voice-leading");
      if (movement) {
        status = `${step.target.symbol}: ${voiceLeadingFeedback(movement)}`;
        if (!step.correct && session.state.current?.voiceLeading) status += " Restored current pair for the next transition (shown above).";
        return;
      }
      status = step.correct
        ? `${step.target.symbol}: ${!mono && !strict ? "Notes collected; extras tolerated" : "Target notes matched"} · +${step.xp} XP`
        : `${step.target.symbol}: ${Math.round(step.score * 100)}% — keep going.`;
      const metric = step.event.metrics.find((metric) => metric.kind === "chord");
      const extras = metric?.extraPitchClasses ?? [];
      status += ` Extra notes: ${extras.length ? extras.map((pc) => midiToNote(60 + pc).replace(/\d+$/, "")).join(", ") : "none"}.`;
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
    status = "Setup ready.";
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
    params.set("mode", unaided ? "check" : "practice");
    if (guideTones) params.set("key", String(config.key));
    else params.delete("key");
    syncRouteQuery(`${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  onDestroy(() => {
    destroyed = true;
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
    content="Practice jazz voicings across all 12 keys, or connect two guide-tone transitions on piano."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="ii-V-I Voicing Drill" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        source={runtime.activeSource}
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
      <Card.Content class="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {#each preview as step (step.key)}
          <div class="rounded-md border px-3 py-2">
            <div class="mb-1 flex items-center justify-between gap-2">
              <span class="font-semibold">{step.key} {variant === "minor" ? "minor" : "major"}</span>
              <span class="text-xs text-muted-foreground">{step.chords.length} chords</span>
            </div>
            <div class="grid gap-1">
              {#each step.chords as chord (chord.symbol)}
                <div class="flex items-baseline justify-between gap-2">
                  <span class="font-medium">{chord.symbol}</span>
                  <span class="text-right text-xs text-muted-foreground tabular-nums">
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

  {#snippet targetView(midi: number[], highlights: Record<number, "target">, ready: boolean)}
    {#if guideTones}
      <div class="min-w-0 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
        {#key `${phase}:${drillState?.index ?? 0}`}
          <PianoSurface router={runtime.router} lowMidi={48 + key} highMidi={71 + key}
            noteNames="c" pointerMode="hold" onAccepted={playInput} />
        {/key}
      </div>
    {:else if instrument === "piano"}
      <div class="min-w-0 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
        <PianoSurface
          router={runtime.router}
          notes={checkMode ? [48, 84] : midi}
          highlights={checkMode ? {} : highlights}
          noteNames="c"
          pointerMode={ready ? "auto" : "latch"}
          onAccepted={playInput}
        />
      </div>
    {:else}
      <div class="grid min-w-0 gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
        <InstrumentView midi={checkMode ? [] : midi} {instrument} router={runtime.router} />
        {#if mono}
          <PianoSurface router={runtime.router} notes={checkMode ? [48, 84] : midi} highlights={checkMode ? {} : highlights} noteNames="c" onAccepted={playInput} />
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet guidePrompt()}
    {#if guideContext}
      <div class="grid gap-1 text-sm text-stage-muted">
        <p>Current {guideFromSymbol}: {previewNotes(guideContext.fromMidi)}</p>
        <p>Register: {midiToNote(guideContext.register[0])}–{midiToNote(guideContext.register[1])}</p>
        <p>Select the next chord’s third and seventh with the least total semitone movement. Sequential taps count as two notes selected; timing is not graded. Every distinct note played counts until Check.</p>
      </div>
    {/if}
  {/snippet}

  {#snippet setupSummary()}
    {setupSummaryText}
  {/snippet}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={changeSetup}>
      {#snippet heading()}
        <Card.Description>{variantLabel} · {guideTones ? `key ${keyLabel} · two transitions` : "all 12 keys"}</Card.Description>
        <Card.Title>Drill complete</Card.Title>
        {#if !guideTones && !mono && !strict}<p>Notes collected · Extra notes are tolerated; notes need not be held together.</p>{/if}
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline gap-1">
          <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
            {Math.round((summary?.accuracy ?? 0) * 100)}<span class="text-3xl text-muted-foreground">%</span>
          </span>
          <span class="sr-only">accuracy</span>
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta
          tags={["voicings"]}
          before={visitStartedAt}
        />
      {/snippet}
      {#snippet children()}
        <div class="grid gap-2">
          {#if guideTones}
            <ul class="grid gap-2 text-sm" aria-label="Voice-leading results">
              {#each summary?.results ?? [] as result (result.target.id)}
                {@const movement = result.event.metrics.find((metric) => metric.kind === "voice-leading")}
                <li><strong>{result.target.symbol}</strong>
                  {#if movement}{voiceLeadingFeedback(movement)}{/if}
                </li>
              {/each}
            </ul>
          {/if}
          <p class="eyebrow">Per chord</p>
          <ul class="grid grid-cols-3 gap-1 sm:grid-cols-6 lg:grid-cols-9" aria-label="Chord results">
            {#each chordStrip as chord, index (index)}
              <li
                class="rounded-md px-2 py-1.5 text-center text-xs font-semibold tabular-nums {chord.correct
                  ? 'bg-success/15 text-success'
                  : 'bg-warn/15 text-warn'}"
              >
                {chord.symbol}
                <span class="sr-only">{chord.correct ? "target notes collected" : `${chord.score}%`}</span>
              </li>
            {/each}
          </ul>
        </div>
        <p class="text-xs text-muted-foreground">
          {summary?.total ?? 0} chords · +{summary?.xp ?? 0} XP · Harmony · ii-V-I
        </p>
      {/snippet}
      {#snippet actions()}
        <AdaptiveRetryBar onRetry={() => void startDrill()} retryLabel="Again" />
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

  <PracticeDrillShell {phase} startPending={pending} {setupSummary} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-3 rounded-lg border bg-card p-4">
        {#if !guideTones}
        <SegmentedControl
          size="sm" ariaLabel="Practice mode"
          options={[{ value: "practice", label: "Practice" }, { value: "check", label: "Check" }]}
          value={checkMode ? "check" : "practice"}
          onChange={(value) => (checkMode = value === "check")}
        />
        {/if}
        <p class="text-xs text-muted-foreground">{unaided ? "Unaided Check: answer cues stay hidden until grading." : "Guided practice: target cues are shown."}</p>
        <div class="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            ariaLabel="Instrument"
            options={(guideTones ? ["piano"] as InstrumentId[] : VIEWABLE_INSTRUMENTS).map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
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
              { value: "guide-tones", label: "Guide tones" },
            ]}
            value={variant}
            onChange={(v) => {
              variant = v as VoicingDrillVariant;
              if (variant === "guide-tones") { instrument = "piano"; runtime.setActiveInstrument("piano"); }
            }}
          />
          {#if guideTones}
            <label class="flex items-center gap-2 text-sm">Key
              <select aria-label="Key" bind:value={key} class="rounded-md border bg-background px-3 py-2">
                {#each Array.from({ length: 12 }, (_, index) => index) as tonic (tonic)}
                  <option value={tonic}>{midiToNote(60 + tonic, true).replace(/\d+$/, "")}</option>
                {/each}
              </select>
            </label>
          {/if}
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
          {#if !guideTones && !mono}
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
          {#if !guideTones}
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
          {/if}
        </div>
        {#if !guideTones && !mono && !strict}<p class="text-xs text-muted-foreground">Notes collected: extra notes are tolerated; notes need not be held together.</p>{/if}
        {#if mono}
          <p class="text-xs text-muted-foreground">
            The Aerophone is monophonic: play each voicing as an ascending arpeggio.
          </p>
        {/if}
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage {instrument} class="grid gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · {guideTones ? "two transitions" : `first chord ${firstTarget?.symbol ?? ""}`}</p>
            <h2 class="text-xl font-semibold tracking-tight" tabindex="-1" bind:this={setupHeading}>
              {variantLabel} · {guideTones ? `key ${keyLabel} · two transitions` : "all 12 keys"}
            </h2>
            <p class="text-sm text-stage-muted">
              {mono ? "Play each voicing as an ascending arpeggio." : "Play anything to warm up. Nothing is graded until you start."}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled={!ready || pending} onclick={() => void startDrill()}>
              Start
            </Button>
            <StartShortcut onStart={() => void startDrill()} />
          </div>
        </div>
        {#if guideTones}{@render guidePrompt()}{/if}
        {@render targetView(
          firstTarget ? [...(firstTarget.bassMidi === undefined ? [] : [firstTarget.bassMidi]), ...firstTarget.midi] : [60, 72],
          readyHighlights,
          true,
        )}
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
      {#if !unaided}{@render drillReference()}{/if}
    {/snippet}

    {#snippet stage()}
      <PracticeStage {instrument} class="grid gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">{variantLabel} · {mono ? "arpeggio" : "chord"}</p>
            <h2 class="text-3xl font-semibold tracking-tight" tabindex="-1" bind:this={activeHeading}>
              {drillState?.current?.symbol}
            </h2>
          </div>
          <span class="text-sm text-stage-muted tabular-nums">
            {(drillState?.index ?? 0) + 1} / {drillState?.total ?? 36}
          </span>
        </div>

        {#if guideTones}{@render guidePrompt()}{/if}
        {@render targetView(drillState?.current?.displayMidi ?? [], targetHighlights, false)}

        {#if guideTones}<p class="text-sm text-stage-muted">{selectedNotes}</p>{/if}
        {#if !unaided}
        <div class="space-y-1.5">
          <div class="flex justify-between text-xs text-stage-muted">
            <span>{!mono && !strict ? "Notes collected" : "Notes matched"}</span><span>{live}%</span>
          </div>
          <Progress value={live} max={100} />
        </div>
        {/if}

        <div class="flex flex-wrap items-center gap-3">
          {#if autoAdvance && !unaided}
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
      <Button type="button" variant="outline" disabled={pending} onclick={cancel}>Stop</Button>
    {/snippet}

    {#snippet rail()}
      <DrillProgressRail
        items={[
          { label: "Chord", value: `${(drillState?.index ?? 0) + 1} / ${drillState?.total ?? 36}` },
          { label: "Accuracy", value: `${Math.round((drillState?.accuracy ?? 0) * 100)}%` },
          { label: "Skill", value: guideTones ? "Voice leading" : "ii-V-I" },
        ]}
      />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
