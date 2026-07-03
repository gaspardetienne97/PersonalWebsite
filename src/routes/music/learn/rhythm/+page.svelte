<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { onDestroy } from "svelte";

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

  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import DrillProgressRail from "../../_components/DrillProgressRail.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import TimingMeter from "../../_components/TimingMeter.svelte";
  import { replaceRouteState } from "../../_components/route-state";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const microphone = new AudioPitchSource();
  const initialConfig = browser
    ? normalizeRhythmDrillConfig(new URLSearchParams(window.location.search))
    : RHYTHM_DRILL_DEFAULT_CONFIG;
  const modeOptions = [
    { value: "pulse", label: "Pulse" },
    { value: "read-and-tap", label: "Read & Tap" },
  ];

  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Preparing your rhythm history.");
  let mode = $state<RhythmDrillMode>(initialConfig.mode);
  let bpm = $state(initialConfig.bpm);
  let beats = $state(initialConfig.beats);
  let pattern = $state<RhythmPatternId>(initialConfig.pattern);
  let tapTempoMarks = $state<number[]>([]);
  let session = $state<RhythmSession | undefined>();
  let sessionState = $state<RhythmSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());
  let microphoneState = $state<AudioPitchState>(microphone.state);
  let microphoneStatus = $state("Start the microphone to score acoustic note attacks.");
  let microphoneAcceptAfterMs = Number.POSITIVE_INFINITY;
  let captured = false;

  const liveProgress = $derived(Math.round((sessionState?.live?.progress ?? 0) * 100));
  const runSummary = $derived(sessionState?.summary);
  const hud = $derived(sessionState ? rhythmHudProjection(sessionState) : undefined);
  const activeBeatIndex = $derived(Math.floor((sessionState?.live?.progress ?? 0) * beats));
  const activePatternEvents = $derived(patternEvents(sessionState?.currentPrompt));
  const patternLabel = $derived(
    RHYTHM_DRILL_PATTERNS.find((option) => option.value === pattern)?.label ?? "Quarter-note pulse",
  );
  const modeLabel = $derived(mode === "read-and-tap" ? "Read & Tap" : "Pulse");
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

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
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
          captured = true;
          void runtime.recordPractice({
            source: "drill",
            tags: ["rhythm"],
            scoringEvents: state.summary.results.map((result) => result.event),
            xpEarned: state.summary.xp,
            note: `Rhythm pulse · ${Math.round(state.summary.accuracy * 100)}% accuracy`,
          });
        }
      });

      const delayMs = runtime.audioEnabled
        ? runtime.sound.playCountIn({ bpm, beats: 4, beatsPerMeasure: 4 }).delayMs
        : 1_000;
      const startTimestampMs = performance.now() + delayMs;
      microphoneAcceptAfterMs = startTimestampMs;
      await session.start({
        bpm,
        beats,
        pattern,
        mode,
        startTimestampMs,
      });
      status =
        delayMs > 0
          ? `Count in, then ${mode === "read-and-tap" ? "read and tap" : "tap"} ${patternLabel}.`
          : `${mode === "read-and-tap" ? "Read and tap" : "Tap"} ${patternLabel}.`;
    } catch (error) {
      status = message(error, "The rhythm session could not be started.");
    } finally {
      pending = false;
    }
  }

  function tapBeat(): void {
    const event = runtime.router.noteOn(60, "onscreen", "piano");
    if (runtime.audioEnabled) runtime.sound.playNote(event.midiNote, 0.08, undefined, 0.5);
  }

  function tapTempo(): void {
    const now = performance.now();
    const marks = [...tapTempoMarks.filter((mark) => now - mark <= 3_000), now].slice(-5);
    tapTempoMarks = marks;
    if (marks.length < 2) {
      status = "Tap tempo again to estimate BPM.";
      return;
    }

    const intervals = marks.slice(1).map((mark, index) => mark - marks[index]!);
    const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    bpm = Math.min(220, Math.max(40, Math.round(60_000 / average)));
    status = `Tap tempo set to ${bpm} BPM.`;
  }

  function repeat(): void {
    sessionState = undefined;
    status = "Ready for a rhythm session.";
  }

  function slowDown(): void {
    bpm = normalizeRhythmDrillConfig({ bpm: bpm - 10, beats, pattern, mode }).bpm;
    repeat();
  }

  function syncConfigUrl(): void {
    const config = normalizeRhythmDrillConfig({ bpm, beats, pattern, mode });
    const url = new URL(window.location.href);
    url.searchParams.set("mode", config.mode);
    url.searchParams.set("bpm", String(config.bpm));
    url.searchParams.set("beats", String(config.beats));
    url.searchParams.set("pattern", config.pattern);
    replaceRouteState(`${url.pathname}${url.search}${url.hash}`, $page.state);
  }

  function patternEvents(prompt: RhythmSessionState["currentPrompt"]): RhythmPatternPrompt["events"] {
    return prompt && "events" in prompt ? prompt.events : [];
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  onDestroy(() => {
    unsubscribeSession?.();
    unsubscribeMidiState();
    unsubscribeMicrophoneState();
    unsubscribeOnsets();
    void microphone.stop();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Rhythm Trainer | Musicianship OS</title>
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

          <div class="grid gap-5 sm:grid-cols-4">
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
              <Label for="rhythm-bpm">BPM</Label>
              <Input
                id="rhythm-bpm"
                aria-label="BPM"
                type="number"
                min="40"
                max="220"
                step="1"
                bind:value={bpm}
              />
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
            <div class="grid content-end gap-2">
              <Button type="button" variant="outline" onclick={tapTempo}>Tap tempo</Button>
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
              class="grid gap-2 rounded-lg border border-stage-line bg-stage-surface/70 p-3"
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
          <AdaptiveRetryBar onRetry={repeat} onSlower={slowDown} retryLabel="Try again" />
          <RoutineContinueAction routine={runtime.dailyRoutine} />
        </Card.Footer>
      </Card.Root>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
