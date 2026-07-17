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
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import DrillFocusScope from "../../_components/DrillFocusScope.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import TimingMeter from "../../_components/TimingMeter.svelte";
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

  void initialize();

  $effect(() => {
    if (!browser) return;
    syncConfigUrl();
  });

  $effect(() => {
    registerRhythmContext(mode, pattern);
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
      status = "Ready for a pulse session.";
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
    status = "Ready for a rhythm session.";
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
  <PracticeScreenHeader
    title="Rhythm Trainer"
    subtitle="Lock your timing against the grid — feedback in milliseconds, ahead or behind."
  >
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

  <DrillFocusScope active={sessionState?.status === "active"} {runtime} />

  <PracticeDrillShell complete={!!runSummary}>
    {#snippet setup()}
      <Card.Root>
        <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-1">
            <Card.Description>Pattern practice</Card.Description>
            <Card.Title>{patternLabel}</Card.Title>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
              {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!AudioPitchSource.supported || microphoneState.status === "requesting"}
              onclick={toggleMicrophone}
            >
              {microphoneState.status === "running"
                ? "Stop microphone"
                : microphoneState.status === "requesting"
                  ? "Starting microphone..."
                  : "Start microphone"}
            </Button>
          </div>
        </Card.Header>
        <Card.Content class="grid gap-6">
          <p class="text-sm text-muted-foreground" aria-live="polite">{midiStatus}</p>
          <p class="text-sm text-muted-foreground" aria-live="polite">{microphoneStatus}</p>

          <SegmentedControl
            ariaLabel="Rhythm mode"
            options={modeOptions}
            bind:value={mode}
          />

          <div class="grid gap-5 sm:grid-cols-3">
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
              <span class="text-sm font-medium">BPM</span>
              <p aria-label="BPM" class="flex h-10 items-center rounded-md border px-3 text-sm">
                {bpm} BPM
              </p>
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
        </Card.Content>
        <Card.Footer class="flex-wrap gap-3">
          <Button
            type="button"
            disabled={!ready || pending || sessionState?.status === "active"}
            onclick={startPulse}
          >
            {pending ? "Starting..." : "Start Rhythm"}
          </Button>
            <StartShortcut onStart={() => void startPulse()} />
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>
    {/snippet}

    {#snippet stage()}
      {#if sessionState?.status === "active"}
        <PracticeStage class="grid gap-4 p-5">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-medium">Progress</p>
            <p class="text-sm text-stage-muted">{liveProgress}%</p>
          </div>
          <!-- beat visualizer -->
          <div class="flex justify-center gap-3" aria-hidden="true">
            {#each Array.from({ length: beats }, (_, i) => i) as beatIndex (beatIndex)}
              <div
                class="grid size-11 place-items-center rounded-full border text-sm font-bold tabular-nums transition-colors {beatIndex ===
                activeBeatIndex
                  ? 'border-practice-accent bg-practice-accent text-practice-accent-foreground'
                  : 'border-stage-line text-stage-muted'}"
              >
                {beatIndex + 1}
              </div>
            {/each}
          </div>
          <Progress value={liveProgress} max={100} />
            <div class="grid grid-cols-2 gap-2 text-center">
            <div class="rounded-lg border border-stage-line p-2">
              <span class="block text-lg font-bold tabular-nums">{hud?.runningScorePct ?? 0}%</span>
              <small class="text-stage-muted">Running score</small>
            </div>
            <div class="rounded-lg border border-stage-line p-2">
              <span class="block text-lg font-bold tabular-nums">{liveProgress}%</span>
              <small class="text-stage-muted">Through pattern</small>
            </div>
          </div>
          <p class="text-center text-sm font-medium text-stage-muted">{patternLabel}</p>
          {#if mode === "read-and-tap" && activePatternEvents.length > 0}
            <div
              aria-label="Rhythm pattern target"
              class="grid gap-2 rounded-lg border border-stage-line bg-stage-2/70 p-3"
            >
              <div class="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-stage-muted">
                <span>{modeLabel}</span>
                <span>{patternLabel}</span>
              </div>
              <div class="grid grid-cols-4 gap-2">
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
          <Button type="button" size="lg" data-testid="tap-beat" onclick={tapBeat}>
            {mode === "read-and-tap" ? "Tap rhythm" : "Tap beat"}
          </Button>
        </PracticeStage>
      {/if}
    {/snippet}

    {#snippet rail()}
      <DrillProgressRail
        title="This session"
        items={[
          { label: "Target", value: `${bpm} BPM` },
          { label: "Mode", value: modeLabel },
          { label: "Pattern", value: patternLabel },
          { label: "Streak", value: `${progress.state.streakDays} days` },
        ]}
      />
    {/snippet}

    {#snippet summary()}
      <Card.Root>
        <Card.Header>
          <Card.Description>Pulse complete</Card.Description>
          <Card.Title>
            {Math.round((runSummary?.accuracy ?? 0) * 100)}% accuracy · {runSummary?.xp ?? 0} XP
          </Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-4 text-sm text-muted-foreground">
          <TimingMeter offsetMs={hud?.offsetMs ?? 0} />
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-lg border p-3 text-center">
              <span class="block text-xl font-bold tabular-nums text-foreground"
                >{hud?.accuracyPct ?? 0}%</span
              >
              <small>Accuracy</small>
            </div>
            <div class="rounded-lg border p-3 text-center">
              <span class="block text-xl font-bold tabular-nums text-foreground"
                >{hud?.offsetMs ?? 0}<small>ms</small></span
              >
              <small>Signed offset</small>
            </div>
            <div class="rounded-lg border p-3 text-center">
              <span class="block text-xl font-bold tabular-nums text-foreground"
                >±{hud?.avgAbsOffsetMs ?? 0}<small>ms</small></span
              >
              <small>Avg offset</small>
            </div>
          </div>
          <p>{runSummary?.results[0]?.result.feedback[0]?.message}</p>
        </Card.Content>
        <Card.Footer class="flex-wrap gap-3">
          <LastRunDelta tags={["rhythm"]} accuracy={meanPartialCredit((runSummary?.results ?? []).map((result) => result.event))} before={visitStartedAt} />
          <Button type="button" disabled={bpm >= 220} onclick={() => prepareBpm(Math.min(220, bpm + 10))}>
            Increase to {Math.min(220, bpm + 10)} BPM
          </Button>
          <Button type="button" variant="outline" onclick={() => prepareBpm(bpm)}>
            Repeat at {bpm} BPM
          </Button>
          <Button type="button" variant="outline" disabled={bpm <= 40} onclick={() => prepareBpm(Math.max(40, bpm - 10))}>
            Slow to {Math.max(40, bpm - 10)} BPM
          </Button>
          <RoutineContinueAction routine={runtime.dailyRoutine} />
          <NextUpSuggestion {skills} {analytics} currentPath="/music/learn/rhythm" routine={runtime.dailyRoutine} />
        </Card.Footer>
      </Card.Root>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
