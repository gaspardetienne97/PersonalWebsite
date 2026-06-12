<script lang="ts">
  import { browser } from "$app/environment";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import { onDestroy, onMount } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { AEROPHONE_RANGE, aerophoneChart } from "@repo/music-core/engines/aerophone-fingering";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import AerophoneFingering from "../../_components/AerophoneFingering.svelte";
  import HudTile from "../../_components/HudTile.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const chart = aerophoneChart();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const longToneDurations = [
    { value: "3000", label: "3 sec" },
    { value: "5000", label: "5 sec" },
    { value: "8000", label: "8 sec" },
  ];
  const swellDurations = [
    { value: "4000", label: "4 sec" },
    { value: "6000", label: "6 sec" },
    { value: "8000", label: "8 sec" },
  ];
  const drillModes = [
    { value: "long-tone", label: "Long tone" },
    { value: "swell", label: "Dynamic swell" },
  ];

  let selected = $state(67); // G4
  let live = $state(false);
  let drillMode = $state("long-tone");
  let durationMs = $state("5000");
  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Preparing your Aerophone practice history.");
  let breathLevel = $state(0);
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiStatus = $state(midiMessage());
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeRouter: (() => void) | undefined;
  let unsubscribeSession: (() => void) | undefined;
  let captured = false;

  const summary = $derived(sessionState?.summary);
  const longTonePrompt = $derived(
    sessionState?.currentPrompt && "holdMs" in sessionState.currentPrompt
      ? sessionState.currentPrompt
      : undefined,
  );
  const swellPrompt = $derived(
    sessionState?.currentPrompt && "durationMs" in sessionState.currentPrompt
      ? sessionState.currentPrompt
      : undefined,
  );
  const activePrompt = $derived(longTonePrompt ?? swellPrompt);
  const liveProgress = $derived(Math.round((sessionState?.live?.progress ?? 0) * 100));
  const liveControl = $derived(Math.round((sessionState?.live?.runningScore ?? 0) * 100));
  const targetMidi = $derived(activePrompt?.targetMidi ?? selected);
  const targetLabel = $derived(midiToNote(targetMidi));
  const durationOptions = $derived(
    drillMode === "swell" ? swellDurations : longToneDurations,
  );
  const trainerTitle = $derived(
    drillMode === "swell" ? "Dynamic Swell Trainer" : "Long Tone Trainer",
  );
  const controlLabel = $derived(drillMode === "swell" ? "Shape" : "Steadiness");
  const startLabel = $derived(
    drillMode === "swell" ? "Start dynamic swell" : "Start long tone",
  );
  const cancelLabel = $derived(
    drillMode === "swell" ? "Cancel dynamic swell" : "Cancel long tone",
  );

  void initialize();

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
    midiStatus = midiMessage();
  });

  function select(midi: number, fromInput = false): void {
    selected = midi;
    live = fromInput;
  }

  function step(delta: number): void {
    const next = selected + delta;
    if (next >= AEROPHONE_RANGE.lowestMidi && next <= AEROPHONE_RANGE.highestMidi) {
      select(next);
      if (runtime.audioEnabled) runtime.sound.playNote(next, 0.4);
    }
  }

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
        if (state.summary && !captured) {
          captured = true;
          const result = state.summary.results[0];
          const isSwell = result?.prompt && "durationMs" in result.prompt;
          const score = Math.round((result?.result.score ?? 0) * 100);
          void runtime.recordPractice({
            source: "drill",
            instrument: "aerophone",
            tags: ["aerophone", isSwell ? "dynamic-swell" : "long-tone", "breath"],
            scoringEvents: state.summary.results.map((result) => result.event),
            xpEarned: state.summary.xp,
            note: isSwell
              ? `Aerophone dynamic swell · ${score}% control`
              : `Aerophone long tone · ${Math.round(state.summary.breathSteadiness * 100)}% steadiness`,
          });
        }
      });
      ready = true;
      status = "Ready for Aerophone breath practice.";
    } catch (error) {
      status = message(error, "Aerophone practice history could not be loaded.");
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

  function selectDrillMode(value: string): void {
    if (sessionState?.status === "active") return;
    drillMode = value;
    durationMs = value === "swell" ? "6000" : "5000";
    status =
      value === "swell"
        ? "Shape a smooth soft-loud-soft breath curve."
        : "Hold the target with steady breath.";
  }

  async function startDrill(): Promise<void> {
    if (!ready || pending || !session) return;
    pending = true;
    captured = false;
    breathLevel = 0;
    status = "";

    try {
      if (drillMode === "swell") {
        await session.startSwell({
          targetMidi: selected,
          durationMs: Number(durationMs),
          breathController: 2,
        });
        status = `Shape ${midiToNote(selected)} from soft to loud and back to soft.`;
      } else {
        await session.startLongTone({
          targetMidi: selected,
          holdMs: Number(durationMs),
          breathController: 2,
        });
        status = `Hold ${midiToNote(selected)} with steady breath until the timer completes.`;
      }
    } catch (error) {
      status = message(error, "The Aerophone drill could not be started.");
    } finally {
      pending = false;
    }
  }

  function cancelDrill(): void {
    session?.abandon();
    breathLevel = 0;
    status = "Drill cancelled. Choose a target and start again.";
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  onMount(() => {
    runtime.setActiveInstrument("aerophone");
    unsubscribeRouter = runtime.router.subscribe((event: NoteEvent) => {
      if (event.type === "noteOn") select(event.midiNote, true);
      if (event.type === "cc" && event.controller === 2) {
        breathLevel = Math.round(event.value * 100);
      }
    });
  });

  onDestroy(() => {
    unsubscribeRouter?.();
    unsubscribeSession?.();
    unsubscribeMidiState();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>Aerophone Technique | Practice OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Aerophone Technique"
    subtitle="Build steady breath support with MIDI CC2 feedback, then review sax-mode fingerings across the instrument."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI · Aerophone" : "Waiting for Aerophone"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <Card.Root>
      <Card.Content class="flex flex-col items-center gap-4 py-6">
        <div class="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous note"
            disabled={selected <= AEROPHONE_RANGE.lowestMidi}
            onclick={() => step(-1)}
          >
            <ChevronLeft class="size-4" aria-hidden="true" />
          </Button>
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold {live
              ? 'bg-success/15 text-success'
              : 'bg-muted text-muted-foreground'}"
          >
            <span class="size-1.5 rounded-full {live ? 'bg-success' : 'bg-muted-foreground/50'}"></span>
            {live ? "Live" : "Preview"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next note"
            disabled={selected >= AEROPHONE_RANGE.highestMidi}
            onclick={() => step(1)}
          >
            <ChevronRight class="size-4" aria-hidden="true" />
          </Button>
        </div>
        <AerophoneFingering midi={selected} size={170} />
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
        <div class="space-y-1">
          <Card.Description>Breath CC2 · MIDI</Card.Description>
          <Card.Title>{trainerTitle}</Card.Title>
        </div>
        <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
          {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
        </Button>
      </Card.Header>
      <Card.Content class="grid gap-6">
        <SegmentedControl
          ariaLabel="Aerophone drill"
          options={drillModes}
          value={drillMode}
          onChange={selectDrillMode}
        />

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">Target {targetLabel}</p>
            <p class="text-xs text-muted-foreground" aria-live="polite">{midiStatus}</p>
          </div>
          <SegmentedControl
            ariaLabel="Drill duration"
            options={durationOptions}
            bind:value={durationMs}
            size="sm"
          />
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile label="Target" value={targetLabel} tone="accent" />
          <HudTile label="Breath" value={breathLevel} unit="%" />
          <HudTile label={controlLabel} value={liveControl} unit="%" tone="good" />
          <HudTile label="Hold" value={liveProgress} unit="%" />
        </div>

        {#if sessionState?.status === "active" && activePrompt}
          <div class="grid gap-3 rounded-lg border bg-muted/30 p-4">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="font-medium">{activePrompt.label}</span>
              <span class="tabular-nums text-muted-foreground">{liveProgress}%</span>
            </div>
            <Progress value={liveProgress} max={100} />
            {#if swellPrompt}
              <div class="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
                <span class="rounded-md border bg-background px-2 py-1.5">Soft</span>
                <span class="rounded-md border bg-primary/10 px-2 py-1.5 text-primary">Loud</span>
                <span class="rounded-md border bg-background px-2 py-1.5">Soft</span>
              </div>
            {/if}
            <div class="grid gap-2">
              <div class="flex items-center justify-between text-xs text-muted-foreground">
                <span>Live breath pressure</span>
                <span class="tabular-nums">{breathLevel}%</span>
              </div>
              <Progress value={breathLevel} max={100} />
            </div>
          </div>
        {/if}

        {#if summary}
          {@const completedResult = summary.results[0]}
          {@const completedSwell =
            completedResult?.prompt && "durationMs" in completedResult.prompt}
          <div class="grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p class="text-sm font-semibold">
              {completedSwell ? "Dynamic swell" : "Long tone"} complete · {summary.xp} XP
            </p>
            <p class="text-sm text-muted-foreground">
              {completedSwell
                ? Math.round((completedResult?.result.score ?? 0) * 100)
                : Math.round(summary.breathSteadiness * 100)}%
              {completedSwell ? "control" : "breath steadiness"} ·
              {Math.round(summary.noteAccuracy * 100)}% pitch accuracy
            </p>
            <p class="text-sm text-muted-foreground">
              {summary.results[0]?.result.feedback[0]?.message}
            </p>
          </div>
        {/if}
      </Card.Content>
      <Card.Footer class="flex-wrap gap-3">
        {#if sessionState?.status === "active"}
          <Button type="button" variant="outline" onclick={cancelDrill}>{cancelLabel}</Button>
        {:else}
          <Button type="button" disabled={!ready || pending} onclick={startDrill}>
            {pending ? "Starting..." : summary ? `Repeat ${drillMode === "swell" ? "swell" : "long tone"}` : startLabel}
          </Button>
        {/if}
        <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
      </Card.Footer>
    </Card.Root>
  </section>

  <section>
    <Card.Root>
      <Card.Header>
        <Card.Title>Fingering chart</Card.Title>
        <Card.Description>
          {midiToNote(AEROPHONE_RANGE.lowestMidi)} – {midiToNote(AEROPHONE_RANGE.highestMidi)}.
          Tap a note to focus it or set the next long-tone target.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7">
          {#each chart as fingering (fingering.midi)}
            <button
              type="button"
              aria-label={`${midiToNote(fingering.midi)} fingering`}
              aria-pressed={fingering.midi === selected}
              onclick={() => {
                select(fingering.midi);
                if (runtime.audioEnabled) runtime.sound.playNote(fingering.midi, 0.4);
              }}
              class="flex flex-col items-center rounded-xl border p-1.5 transition-colors hover:bg-muted/60 {fingering.midi ===
              selected
                ? 'border-primary bg-primary/5'
                : 'border-border'}"
            >
              <AerophoneFingering midi={fingering.midi} size={84} />
            </button>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
