<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

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
    type ScalePatternKind,
    type ScaleSpan,
  } from "@repo/music-core/exercises/scale-pattern";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import { INSTRUMENT_LABELS, VIEWABLE_INSTRUMENTS, type InstrumentId } from "@repo/music-core/domain";

  import InstrumentView from "../../_components/InstrumentView.svelte";
  import AdaptiveRetryBar from "../../_components/AdaptiveRetryBar.svelte";
  import LastRunDelta from "../../_components/LastRunDelta.svelte";
  import NextUpSuggestion from "../../_components/NextUpSuggestion.svelte";
  import { unixMs } from "@repo/music-core/domain";
  import { meanPartialCredit } from "@repo/music-core/engines/sessions";
  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import StartShortcut from "../../_components/StartShortcut.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../../_components/route-state";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  // Baseline cutoff for the last-run comparison (see LastRunDelta).
  const visitStartedAt = unixMs(Date.now());
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const initialConfig = normalizeScaleDrillConfig(
    browser ? initialDrillSearch() : {},
  );

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

  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Preparing your technique history.");
  let tempo = $state(initialConfig.bpm);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());
  let captured = false;

  const liveProgress = $derived(Math.round((sessionState?.live?.progress ?? 0) * 100));
  const activePrompt = $derived(sessionState?.currentPrompt);
  const summary = $derived(sessionState?.summary);
  const currentTempo = $derived(sessionState?.nextTargetBpm ?? tempo);
  const ladderState = $derived(sessionState ?? session?.state);
  const tempoLadder = $derived(
    ladderState ? tempoLadderProjection(ladderState, { startBpm: 100, stepBpm: 10, rungs: 6 }) : [],
  );
  const normalizedConfig = $derived(
    normalizeScaleDrillConfig({ scale, tonic, instrument: scaleInstrument, bpm: tempo, motion, span }),
  );

  void initialize();

  $effect(() => {
    syncConfigUrl();
  });

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
  });

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
      session = new TechniqueSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      unsubscribeSession = session.subscribe((state) => {
        sessionState = state;
        status = state.error ?? "";
        if (state.summary) tempo = state.nextTargetBpm;
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
    pending = true;
    status = "";

    try {
      captured = false;
      const config = normalizedConfig;
      await session.startScale({
        tonic: config.tonic,
        scale: config.scale,
        bpm: config.bpm,
        motion: config.motion,
        span: config.span,
      });
      status = `Play the ${tonicLabel} ${scaleLabel} ${spanLabel.toLowerCase()} ${motionLabel.toLowerCase()} evenly.`;
    } catch (error) {
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
    tempo = normalizeScaleDrillConfig({
      scale,
      tonic,
      instrument: scaleInstrument,
      bpm: tempo - 10,
    }).bpm;
    await startScale();
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

  {#if summary}
    <Card.Root>
      <Card.Header>
        <Card.Description>Scale complete</Card.Description>
        <Card.Title>
          {Math.round(summary.noteAccuracy * 100)}% notes · {summary.xp} XP
        </Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-2 text-sm text-muted-foreground">
        <p>Evenness error: {Math.round(summary.meanEvennessErrorMs)}ms average.</p>
        <p>Next target: {summary.nextTargetBpm} BPM</p>
        <p>{summary.results[0]?.result.feedback[0]?.message}</p>
      </Card.Content>
      <Card.Footer class="flex-wrap gap-3">
        <LastRunDelta tags={["scales"]} accuracy={meanPartialCredit(summary.results.map((result) => result.event))} before={visitStartedAt} />
        <AdaptiveRetryBar
          onRetry={startScale}
          onSlower={slowDown}
          retryLabel="Practice next tempo"
        />
        <RoutineContinueAction routine={runtime.dailyRoutine} />
        <NextUpSuggestion {skills} {analytics} currentPath="/music/play/scales" routine={runtime.dailyRoutine} />
      </Card.Footer>
    </Card.Root>
  {:else}
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
                {#each SCALE_DRILL_TONICS as note}
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
            <Label for="scale-tempo">Tempo</Label>
            <Input
              id="scale-tempo"
              aria-label="Tempo"
              type="number"
              min="60"
              max={sessionState?.highestUnlockedBpm ?? 100}
              step="10"
              bind:value={tempo}
              disabled={sessionState?.status === "active"}
            />
            <p class="text-xs text-muted-foreground">
              Current unlocked target: {currentTempo} BPM
            </p>
          </div>

          {#if sessionState?.status === "active" && activePrompt}
            <div class="grid gap-4 rounded-md border p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">{activePrompt.label}</p>
                  <p class="text-xs text-muted-foreground">{activePrompt.bpm} BPM</p>
                </div>
                <p class="text-sm text-muted-foreground">{liveProgress}%</p>
              </div>
              <Progress value={liveProgress} max={100} />
              <OnScreenKeyboard
                router={runtime.router}
                notes={activePrompt.noteLabels}
                onAccepted={playAccepted}
              />
            </div>
          {/if}
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
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>

      <aside class="grid min-w-0 content-start gap-4">
        <Card.Root class="min-w-0">
          <Card.Header>
            <Card.Description>Tempo ladder</Card.Description>
            <Card.Title>{currentTempo} BPM target</Card.Title>
          </Card.Header>
          <Card.Content class="grid gap-2">
            {#each tempoLadder as rung}
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
          </Card.Content>
        </Card.Root>
        <Card.Root class="min-w-0">
          <Card.Header class="gap-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Card.Description>Reference</Card.Description>
                <Card.Title>{tonicLabel} {scaleLabel} on {INSTRUMENT_LABELS[scaleInstrument]}</Card.Title>
              </div>
              <SegmentedControl
                size="sm"
                ariaLabel="Scale instrument"
                options={VIEWABLE_INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
                value={scaleInstrument}
                onChange={(v) => (scaleInstrument = v as InstrumentId)}
              />
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
  {/if}
</PracticeScreen>
