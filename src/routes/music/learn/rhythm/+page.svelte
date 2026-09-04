<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";

  import Drum from "lucide-svelte/icons/drum";

  import {
    normalizeRhythmDrillConfig,
    RHYTHM_DRILL_DEFAULT_CONFIG,
    RHYTHM_DRILL_PATTERNS,
    RhythmSession,
    type RhythmDrillMode,
    type RhythmSessionState,
  } from "@repo/music-core/engines/rhythm-session";
  import type {
    RhythmPatternId,
    RhythmPatternPrompt,
  } from "@repo/music-core/exercises/rhythm-pattern";
  import { rhythmPatternDefinition } from "@repo/music-core/exercises/rhythm-pattern";
  import {
    AudioPitchSource,
    type AudioPitchState,
  } from "@repo/music-core/engines/audio-in";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { rhythmHudProjection } from "@repo/music-core/engines/projection";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import { unixMs } from "@repo/music-core/domain";
  import { meanPartialCredit } from "@repo/music-core/engines/sessions";
  import DrillSummaryCard from "../../_components/DrillSummaryCard.svelte";
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import TimingMeter from "../../_components/TimingMeter.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  // Injectable for tests (the gap-click click scheduling is asserted against a
  // mocked runtime), same pattern as chord-scales/licks.
  const { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const microphone = new AudioPitchSource();
  const initialConfig = browser
    ? normalizeRhythmDrillConfig(initialDrillSearch(["bpm", "tempo"]))
    : RHYTHM_DRILL_DEFAULT_CONFIG;
  const initialUrlBpm = browser
    ? validBpm(new URLSearchParams(window.location.search).get("bpm"))
    : undefined;
  // Mode changes the *display* only (whether the notation target is shown);
  // both modes grade the same pattern. Labels say so.
  const modeOptions = [
    { value: "pulse", label: "From memory" },
    { value: "read-and-tap", label: "Read & tap" },
  ];

  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Preparing your rhythm history.");
  let mode = $state<RhythmDrillMode>(initialConfig.mode);
  let bpm = $state(initialConfig.bpm);
  let beats = $state(initialConfig.beats);
  let pattern = $state<RhythmPatternId>(initialConfig.pattern);
  let session = $state<RhythmSession | undefined>();
  let sessionState = $state<RhythmSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  // Seeded by the $effect below (avoids an init-time read of the runtime prop).
  let midiEnabled = $state(false);
  let midiStatus = $state("");
  let microphoneState = $state<AudioPitchState>(microphone.state);
  let microphoneStatus = $state("Start the microphone to score acoustic note attacks.");
  let microphoneAcceptAfterMs = Number.POSITIVE_INFINITY;
  let practiceContextCleanup: (() => void) | undefined;
  let practiceContextRequest = 0;
  let practiceContextQueue = Promise.resolve();
  let captured = false;

  const liveProgress = $derived(Math.round((sessionState?.live?.progress ?? 0) * 100));
  const runSummary = $derived(sessionState?.summary);
  const hud = $derived(sessionState ? rhythmHudProjection(sessionState) : undefined);
  const activeBeatIndex = $derived(Math.floor((sessionState?.live?.progress ?? 0) * beats));
  const activePatternEvents = $derived(patternEvents(sessionState?.currentPrompt));
  const patternLabel = $derived(
    RHYTHM_DRILL_PATTERNS.find((option) => option.value === pattern)?.label ?? "Quarter-note pulse",
  );
  const modeLabel = $derived(mode === "read-and-tap" ? "Read & tap" : "From memory");
  const sourceLabel = $derived(
    runtime.activeSource === "midi"
      ? "MIDI"
      : runtime.activeSource === "audio"
        ? "Microphone"
        : microphoneState.status === "running"
          ? "Microphone"
          : "On-screen",
  );
  const phase = $derived<"setup" | "stage" | "summary">(
    runSummary ? "summary" : sessionState?.status === "active" ? "stage" : "setup",
  );
  const liveAnnouncement = $derived(
    phase === "summary" && runSummary
      ? `Pulse complete. ${Math.round(runSummary.accuracy * 100)}% accuracy · ${runSummary.xp} XP.`
      : status,
  );

  let activeHeading = $state<HTMLHeadingElement | null>(null);
  let resultsHeading = $state<HTMLElement | null>(null);
  let setupHeading = $state<HTMLDivElement | null>(null);
  let previousPhase: "setup" | "stage" | "summary" | undefined;

  void initialize();

  $effect(() => {
    if (!browser) return;
    syncConfigUrl();
  });

  $effect(() => {
    registerRhythmContext(mode, pattern);
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
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
    return runtime.midi.subscribeState(() => {
      midiEnabled = runtime.midi.state.enabled;
      midiStatus = midiMessage();
    });
  });
  const unsubscribeMicrophoneState = microphone.subscribeState((state) => {
    microphoneState = state;
    microphoneStatus =
      state.status === "requesting"
        ? "Requesting microphone access..."
        : state.status === "running"
          ? "Microphone is listening for note attacks."
          : state.message ?? "Microphone is off.";
  });
  const unsubscribeOnsets = microphone.subscribeOnsets((event) => {
    if (
      sessionState?.status !== "active" ||
      event.timestamp < microphoneAcceptAfterMs
    ) {
      return;
    }
    runtime.router.push(event);
  });

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
      ready = true;
      status = "Ready. Press Start, or Space.";
    } catch (error) {
      status = message(error, "Rhythm history could not be loaded.");
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

  async function toggleMicrophone(): Promise<void> {
    if (microphoneState.status === "running") {
      await microphone.stop();
      return;
    }
    await microphone.start();
  }

  async function startPulse(): Promise<void> {
    if (!ready || pending) return;
    pending = true;
    status = "";

    try {
      await tick();
      const contextRequest = practiceContextRequest;
      await practiceContextQueue;
      if (contextRequest !== practiceContextRequest) return;
      runtime.endPerformance();
      if (!(await runtime.ensurePlaybackVoice())) {
        if (contextRequest === practiceContextRequest) status = runtime.audioMessage;
        return;
      }
      if (contextRequest !== practiceContextRequest) return;
      const clock = await runtime.beginPerformance();
      if (contextRequest !== practiceContextRequest) {
        if (clock.status === "started") runtime.endPerformance();
        return;
      }
      if (clock.status === "cancelled") return;
      if (clock.status === "failed") {
        status = clock.message;
        return;
      }
      session?.dispose();
      unsubscribeSession?.();
      captured = false;
      microphoneAcceptAfterMs = Number.POSITIVE_INFINITY;
      session = new RhythmSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      unsubscribeSession = session.subscribe((state) => {
        sessionState = state;
        status = state.error ?? "";
        // Auto-capture the finished pulse session into the journal (once).
        if (state.summary && !captured) {
          runtime.endPerformance();
          captured = true;
          void runtime.recordPractice({
            source: "drill",
            tags: ["rhythm"],
            scoringEvents: state.summary.results.map((result) => result.event),
            xpEarned: state.summary.xp,
            note: `Rhythm · ${patternLabel} · ${Math.round(state.summary.accuracy * 100)}% accuracy`,
          });
        }
      });

      const startTimestampMs = Number(clock.downbeat);
      microphoneAcceptAfterMs = startTimestampMs;
      await session.start({
        bpm,
        beats,
        pattern,
        mode,
        startTimestampMs,
      });
      if (contextRequest !== practiceContextRequest) {
        runtime.endPerformance();
        session.abandon();
        return;
      }
      status = `${mode === "read-and-tap" ? "Read and tap" : "Tap"} ${patternLabel}.`;
    } catch (error) {
      runtime.endPerformance();
      status = message(error, "The rhythm session could not be started.");
    } finally {
      pending = false;
    }
  }

  function tapBeat(): void {
    const event = runtime.router.noteOn(60, "onscreen", "piano");
    if (runtime.audioEnabled) runtime.sound.playNote(event.midiNote, 0.08, undefined, 0.5);
  }

  function repeat(): void {
    sessionState = undefined;
    status = "Ready. Press Start, or Space.";
  }

  function cancel(): void {
    if (!session?.abandon()) {
      status = "Finishing rhythm result.";
      return;
    }
    runtime.endPerformance();
    status = "Rhythm cancelled. You can start again.";
  }

  function prepareBpm(nextBpm: number): void {
    runtime.setPracticeVariantBpm(nextBpm, rhythmVariantKey(mode, pattern));
    repeat();
  }

  function registerRhythmContext(nextMode: RhythmDrillMode, nextPattern: RhythmPatternId): void {
    const request = ++practiceContextRequest;
    const definition = rhythmPatternDefinition(nextPattern);
    practiceContextQueue = practiceContextQueue.then(async () => {
      if (request !== practiceContextRequest) return;
      const cleanup = await runtime.registerPracticeContext({
        owner: "rhythm",
        variantKey: rhythmVariantKey(nextMode, nextPattern),
        defaultBpm: RHYTHM_DRILL_DEFAULT_CONFIG.bpm,
        initialUrlBpm,
        meter: {
          numerator: definition.meter.beats,
          denominator: definition.meter.beatUnit as 2 | 4 | 8 | 16,
        },
        onBpmChange: (nextBpm) => {
          if (bpm !== nextBpm) bpm = nextBpm;
        },
        shouldPlayMetronome: (event) => {
          const schedule = definition.clickSchedule;
          if (!schedule || schedule.length === 0) return true;
          const performanceBeat =
            event.absoluteBeat - runtime.countInBars * definition.meter.beats;
          if (performanceBeat < 0) return true;
          const bar = Math.floor(performanceBeat / definition.meter.beats);
          return schedule[bar % schedule.length]?.audible ?? true;
        },
      });
      if (request !== practiceContextRequest) {
        cleanup();
        return;
      }
      practiceContextCleanup?.();
      practiceContextCleanup = cleanup;
    });
  }

  function rhythmVariantKey(nextMode: RhythmDrillMode, nextPattern: RhythmPatternId): string {
    return `v1:rhythm:${nextMode}:${nextPattern}`;
  }

  function validBpm(value: string | null): number | undefined {
    const nextBpm = Number(value);
    return Number.isFinite(nextBpm) && nextBpm > 0 ? nextBpm : undefined;
  }

  function syncConfigUrl(): void {
    const config = normalizeRhythmDrillConfig({ bpm, beats, pattern, mode });
    const url = new URL(window.location.href);
    url.searchParams.set("mode", config.mode);
    url.searchParams.set("bpm", String(config.bpm));
    url.searchParams.set("beats", String(config.beats));
    url.searchParams.set("pattern", config.pattern);
    syncRouteQuery(`${url.pathname}${url.search}${url.hash}`);
  }

  function patternEvents(prompt: RhythmSessionState["currentPrompt"]): RhythmPatternPrompt["events"] {
    return prompt && "events" in prompt ? prompt.events : [];
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  onDestroy(() => {
    practiceContextRequest += 1;
    practiceContextCleanup?.();
    runtime.endPerformance();
    unsubscribeSession?.();
    unsubscribeMicrophoneState();
    unsubscribeOnsets();
    void microphone.stop();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Rhythm Trainer | Practice OS</title>
  <meta
    name="description"
    content="Practice quarter-note pulse with MIDI, on-screen, and metronome-anchored timing feedback."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Rhythm Trainer" compact>
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={sourceLabel}
        live={runtime.activeSource === "midi" || microphoneState.status === "running"}
      >
        {#snippet icon()}<Drum class="size-4" aria-hidden="true" />{/snippet}
      </SourceReadout>
    {/snippet}
  </PracticeScreenHeader>

  <!-- The one live region for this route; the MIDI and microphone lines below are visible text only. -->
  <p class="sr-only" aria-live="polite" data-testid="rhythm-live-announcement">
    {liveAnnouncement}
  </p>

  {#snippet inputActions()}
    <Button type="button" variant="outline" disabled={midiEnabled || pending} onclick={enableMidi}>
      {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
    </Button>
    <Button
      type="button"
      variant="outline"
      disabled={pending || !AudioPitchSource.supported || microphoneState.status === "requesting"}
      onclick={toggleMicrophone}
    >
      {microphoneState.status === "running"
        ? "Stop microphone"
        : microphoneState.status === "requesting"
          ? "Starting microphone..."
          : "Start microphone"}
    </Button>
  {/snippet}

  {#snippet setupSummaryLine()}
    {patternLabel} · {modeLabel} · {beats} beats · {bpm} BPM
  {/snippet}

  {#snippet summaryPhase()}
    <DrillSummaryCard bind:headingRef={resultsHeading} onChangeSetup={repeat}>
      {#snippet heading()}
        <Card.Description>{patternLabel} · {bpm} BPM</Card.Description>
        <Card.Title>Pulse complete</Card.Title>
      {/snippet}
      {#snippet metric()}
        <p class="flex items-baseline">
          <span class="text-6xl font-bold leading-none tracking-tight tabular-nums">
            {Math.round((runSummary?.accuracy ?? 0) * 100)}<span class="text-3xl text-muted-foreground">%</span>
          </span>
          <span class="sr-only"> accuracy</span>
        </p>
      {/snippet}
      {#snippet lastRunDelta()}
        <LastRunDelta
          tags={["rhythm"]}
          accuracy={meanPartialCredit((runSummary?.results ?? []).map((result) => result.event))}
          before={visitStartedAt}
        />
      {/snippet}
      {#snippet children()}
        <TimingMeter offsetMs={hud?.offsetMs ?? 0} />
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile size="sm" label="Signed offset" value={hud?.offsetMs ?? 0} unit="ms" />
          <HudTile size="sm" label="Avg offset" value={`±${hud?.avgAbsOffsetMs ?? 0}`} unit="ms" />
          <HudTile size="sm" label="Tempo" value={bpm} unit="BPM" />
          <HudTile size="sm" label="Input" value={sourceLabel} />
        </div>
        {#if runSummary?.results[0]?.result.feedback[0]?.message}
          <p class="text-sm text-muted-foreground">{runSummary.results[0].result.feedback[0].message}</p>
        {/if}
        <p class="text-xs text-muted-foreground">+{runSummary?.xp ?? 0} XP · Rhythm</p>
      {/snippet}
      {#snippet actions()}
        <Button
          type="button"
          disabled={bpm >= 220}
          onclick={() => prepareBpm(Math.min(220, bpm + 10))}
        >
          Increase to {Math.min(220, bpm + 10)} BPM
        </Button>
        <Button type="button" variant="outline" onclick={() => prepareBpm(bpm)}>
          Repeat at {bpm} BPM
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={bpm <= 40}
          onclick={() => prepareBpm(Math.max(40, bpm - 10))}
        >
          Slow to {Math.max(40, bpm - 10)} BPM
        </Button>
      {/snippet}
      {#snippet routineContinue()}
        <RoutineContinueAction routine={runtime.dailyRoutine} />
      {/snippet}
      {#snippet nextUp()}
        <NextUpSuggestion
          {skills}
          {analytics}
          currentPath="/music/learn/rhythm"
          routine={runtime.dailyRoutine}
        />
      {/snippet}
    </DrillSummaryCard>
  {/snippet}

  <PracticeDrillShell {phase} startPending={pending} setupSummary={setupSummaryLine} summary={summaryPhase}>
    {#snippet setup()}
      <div class="grid gap-5 rounded-lg border bg-card p-4">
        <SegmentedControl ariaLabel="Rhythm mode" options={modeOptions} bind:value={mode} />
        <div class="grid gap-5 sm:grid-cols-2">
          <div class="grid gap-2">
            <Label for="rhythm-pattern">Pattern</Label>
            <select
              id="rhythm-pattern"
              aria-label="Pattern"
              bind:value={pattern}
              class="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {#each RHYTHM_DRILL_PATTERNS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          <div class="grid gap-2">
            <Label for="rhythm-beats">Beats</Label>
            <Input
              id="rhythm-beats"
              aria-label="Beats"
              type="number"
              min="2"
              max="16"
              step="1"
              bind:value={beats}
            />
          </div>
        </div>
        <p class="text-xs text-muted-foreground">
          Tempo lives in the practice controls above: {bpm} BPM. Both modes grade the same pattern; Read &amp; tap
          also shows it.
        </p>
      </div>
    {/snippet}

    {#snippet readyStage()}
      <PracticeStage class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Ready · {modeLabel}</p>
            <div
              role="heading"
              aria-level="2"
              class="text-xl font-semibold tracking-tight"
              tabindex="-1"
              data-testid="rhythm-ready-heading"
              bind:this={setupHeading}
            >
              {patternLabel}
            </div>
            <p class="text-sm text-stage-muted">
              Tap with the grid. Every hit is scored in milliseconds, ahead or behind the beat.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <p aria-label="BPM" class="rounded-full border border-stage-line px-3 py-1 text-sm tabular-nums">
              {bpm} BPM
            </p>
            <Button
              type="button"
              size="lg"
              disabled={!ready || pending || sessionState?.status === "active"}
              onclick={startPulse}
            >
              {pending ? "Starting..." : "Start"}
            </Button>
            <StartShortcut onStart={() => void startPulse()} />
          </div>
        </div>
        <div class="flex flex-wrap justify-center gap-2 sm:gap-3" aria-hidden="true">
          {#each Array.from({ length: beats }, (_, i) => i) as beatIndex (beatIndex)}
            <div
              class="grid size-9 place-items-center rounded-full border border-stage-line text-sm font-bold tabular-nums text-stage-muted sm:size-11"
            >
              {beatIndex + 1}
            </div>
          {/each}
        </div>
        <div class="grid gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
          <div class="flex flex-wrap gap-2">
            {@render inputActions()}
          </div>
          <p class="text-sm text-stage-muted">{midiStatus}</p>
          <p class="text-sm text-stage-muted">{microphoneStatus}</p>
        </div>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stage()}
      <PracticeStage class="grid min-w-0 gap-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">{modeLabel} · {bpm} BPM</p>
            <h2 tabindex="-1" bind:this={activeHeading} class="text-xl font-semibold tracking-tight">
              {patternLabel}
            </h2>
          </div>
          <span class="text-sm text-stage-muted tabular-nums">Progress {liveProgress}%</span>
        </div>
        <!-- beat visualizer -->
        <div class="flex flex-wrap justify-center gap-2 sm:gap-3" aria-hidden="true">
          {#each Array.from({ length: beats }, (_, i) => i) as beatIndex (beatIndex)}
            <div
              class="grid size-9 place-items-center rounded-full border text-sm font-bold tabular-nums transition-colors sm:size-11 {beatIndex ===
              activeBeatIndex
                ? 'border-practice-accent bg-practice-accent text-practice-accent-foreground'
                : 'border-stage-line text-stage-muted'}"
            >
              {beatIndex + 1}
            </div>
          {/each}
        </div>
        <Progress value={liveProgress} max={100} />
        <!-- Live timing: the same meter the results show, fed by the running HUD projection. -->
        <TimingMeter offsetMs={hud?.offsetMs ?? 0} />
        <div class="grid grid-cols-3 gap-3">
          <HudTile size="sm" label="Running score" value={hud?.runningScorePct ?? 0} unit="%" />
          <HudTile size="sm" label="Offset" value={hud?.offsetMs ?? 0} unit="ms" />
          <HudTile size="sm" label="Through pattern" value={liveProgress} unit="%" />
        </div>
        {#if mode === "read-and-tap" && activePatternEvents.length > 0}
          <div
            aria-label="Rhythm pattern target"
            class="grid gap-2 rounded-lg border border-stage-line bg-stage-2/70 p-3"
          >
            <div class="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-stage-muted">
              <span>{modeLabel}</span>
              <span>{patternLabel}</span>
            </div>
            <div class="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {#each activePatternEvents as event (event.id)}
                <div
                  class="grid min-h-12 place-items-center rounded-md border text-sm font-bold tabular-nums {event.accent ===
                  'accent'
                    ? 'border-practice-accent bg-practice-accent text-practice-accent-foreground'
                    : 'border-stage-line bg-background/70 text-foreground'}"
                >
                  {event.beat + 1}
                </div>
              {/each}
            </div>
          </div>
        {/if}
        <Button type="button" size="lg" class="w-full sm:w-auto sm:justify-self-center sm:px-12" data-testid="tap-beat" onclick={tapBeat}>
          {mode === "read-and-tap" ? "Tap rhythm" : "Tap beat"}
        </Button>
        <p class="text-sm text-stage-muted">{status}</p>
      </PracticeStage>
    {/snippet}

    {#snippet stageAction()}
      {@render inputActions()}
      <Button type="button" variant="outline" onclick={cancel}>Stop</Button>
    {/snippet}

    {#snippet rail()}
      <DrillProgressRail
        items={[
          { label: "Target", value: `${bpm} BPM` },
          { label: "Mode", value: modeLabel },
          { label: "Pattern", value: patternLabel },
          { label: "Input", value: sourceLabel },
        ]}
      />
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
