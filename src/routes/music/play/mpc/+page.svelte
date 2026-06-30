<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

  import type {
    MpcSingleStrokeAnswer,
    MpcSingleStrokePrompt,
  } from "@repo/music-core/exercises/mpc-single-stroke";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import HudTile from "../../_components/HudTile.svelte";
  import MpcPadGrid, { MPC_PAD_MIDI } from "../../_components/MpcPadGrid.svelte";
  import PracticeDrillShell from "../../_components/PracticeDrillShell.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SessionFeedback from "../../_components/SessionFeedback.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const padOptions = MPC_PAD_MIDI.flat().sort((left, right) => left - right);
  const hitCountOptions = [
    { value: "8", label: "8 hits" },
    { value: "16", label: "16 hits" },
  ];
  const tempoOptions = [60, 80, 100, 120].map((tempo) => ({
    value: String(tempo),
    label: `${tempo} BPM`,
  }));

  let leftPadMidi = $state("36");
  let rightPadMidi = $state("38");
  let hitCount = $state("8");
  let bpm = $state("80");
  let ready = $state(false);
  let pending = $state(false);
  let captured = false;
  let status = $state("Preparing MPC practice.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;

  const prompt = $derived(
    sessionState?.currentPrompt && "targetSequence" in sessionState.currentPrompt
      ? (sessionState.currentPrompt as MpcSingleStrokePrompt)
      : undefined,
  );
  const summary = $derived(sessionState?.summary);
  const result = $derived(summary?.results[0]);
  const answer = $derived(result?.result.answer as MpcSingleStrokeAnswer | undefined);
  const totalHits = $derived(prompt?.hitCount ?? Number(hitCount));
  const completedHits = $derived(
    Math.min(totalHits, Math.round((sessionState?.live?.progress ?? 0) * totalHits)),
  );
  const nextPad = $derived(prompt?.targetSequence[completedHits]);
  const runningScore = $derived(
    Math.round((sessionState?.live?.runningScore ?? 0) * 100),
  );
  const midiStatus = $derived(
    midiEnabled
      ? `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`
      : runtime.midi.state.error ?? "MIDI permission has not been requested.",
  );

  void initialize();

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
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
        if (state.error) status = state.error;
        if (state.summary && !captured) {
          captured = true;
          const completed = state.summary.results[0];
          const detail = completed?.result.answer as MpcSingleStrokeAnswer | undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument: "mpc",
            tags: ["mpc", "rudiment", "single-strokes"],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `MPC single strokes · ${detail.playedPads.length} hits at ${completed && "bpm" in completed.prompt ? completed.prompt.bpm : Number(bpm)} BPM · ${Math.round(detail.padAccuracy * 100)}% pads · ${Math.round(detail.meanTimingErrorMs)}ms timing`
              : "MPC single strokes",
          });
        }
      });
      ready = true;
      status = "Ready for alternating single strokes.";
    } catch (error) {
      status = message(error, "MPC practice could not be prepared.");
    }
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function start(): Promise<void> {
    if (!ready || pending || !session) return;
    if (leftPadMidi === rightPadMidi) {
      status = "Choose two different MPC pads.";
      return;
    }

    pending = true;
    captured = false;
    status = "";
    try {
      await session.startMpcRudiment({
        leftPadMidi: Number(leftPadMidi),
        rightPadMidi: Number(rightPadMidi),
        hitCount: Number(hitCount) as 8 | 16,
        bpm: Number(bpm),
      });
      status = `Alternate pads ${leftPadMidi} and ${rightPadMidi}.`;
    } catch (error) {
      status = message(error, "The MPC rudiment could not be started.");
    } finally {
      pending = false;
    }
  }

  function cancel(): void {
    session?.abandon();
    status = "Rudiment cancelled. You can start again.";
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  onMount(() => {
    runtime.setActiveInstrument("mpc");
  });

  onDestroy(() => {
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
  <PracticeScreenHeader
    title="MPC Rudiments"
    subtitle="Build even alternating strokes on hardware MIDI or the on-screen Bank A pad grid."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI · MPC" : "On-screen pads"}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <PracticeDrillShell>
    {#snippet setup()}
      <Card.Root>
        <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Card.Description>Alternating eighth notes</Card.Description>
            <Card.Title>Single strokes</Card.Title>
          </div>
          <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
            {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
          </Button>
        </Card.Header>

        <Card.Content class="grid gap-6">
          <fieldset
            disabled={sessionState?.status === "active"}
            class="grid gap-4 disabled:opacity-70"
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="mpc-left-pad">Left pad</Label>
                <select
                  id="mpc-left-pad"
                  aria-label="Left pad"
                  bind:value={leftPadMidi}
                  class="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {#each padOptions as midi}
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
                  class="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {#each padOptions as midi}
                    <option value={String(midi)}>Pad {midi}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="flex flex-wrap gap-3">
              <SegmentedControl
                ariaLabel="Hit count"
                options={hitCountOptions}
                bind:value={hitCount}
              />
              <SegmentedControl ariaLabel="Tempo" options={tempoOptions} bind:value={bpm} />
            </div>
          </fieldset>
        </Card.Content>

        <Card.Footer class="flex-wrap gap-3">
          {#if sessionState?.status === "active"}
            <Button type="button" variant="outline" onclick={cancel}>Cancel rudiment</Button>
          {:else}
            <Button type="button" disabled={!ready || pending} onclick={start}>
              {pending ? "Starting..." : summary ? "Repeat rudiment" : "Start rudiment"}
            </Button>
          {/if}
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>
    {/snippet}

    {#snippet stage()}
      <PracticeStage instrument="mpc" class="space-y-2 overflow-x-auto p-4">
        <p class="eyebrow">Bank A pads</p>
        <MpcPadGrid router={runtime.router} />
      </PracticeStage>
    {/snippet}

    {#snippet feedback()}
      {#if summary && answer}
        <SessionFeedback
          kind={summary.correct === summary.total ? "correct" : "wrong"}
          message="Rudiment complete"
          detail={`${Math.round((result?.result.score ?? 0) * 100)}% total · ${Math.round(answer.padAccuracy * 100)}% pad accuracy · ${Math.round(answer.meanTimingErrorMs)}ms mean timing error · ${Math.round(answer.velocityConsistency * 100)}% velocity consistency`}
          xp={summary.xp}
        />
      {/if}
    {/snippet}

    {#snippet rail()}
      <div class="grid grid-cols-2 gap-3">
        <HudTile label="Next pad" value={nextPad ?? leftPadMidi} tone="accent" />
        <HudTile label="Hits" value={completedHits} unit={`/${totalHits}`} />
        <HudTile label="Quality" value={runningScore} unit="%" tone="good" />
        <HudTile label="Tempo" value={bpm} unit="BPM" />
      </div>
      {#if prompt}
        <div class="grid gap-3 rounded-lg border bg-card p-4">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-medium">{prompt.label}</span>
            <span class="tabular-nums text-muted-foreground">
              {completedHits}/{prompt.hitCount}
            </span>
          </div>
          <Progress value={completedHits} max={prompt.hitCount} />
          <div class="flex flex-wrap gap-2" aria-label="Target sequence">
            {#each prompt.targetSequence as midi, index}
              <span
                class="grid size-9 place-items-center rounded-md border text-xs font-semibold
                  {index < completedHits
                  ? 'border-success/30 bg-success/10 text-success'
                  : index === completedHits
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground'}"
              >
                {midi}
              </span>
            {/each}
          </div>
          <p class="text-sm text-muted-foreground" aria-live="polite">
            {sessionState?.live?.feedback[0]?.message ?? status}
          </p>
        </div>
      {/if}
      <p class="text-xs text-muted-foreground" aria-live="polite">{midiStatus}</p>
    {/snippet}
  </PracticeDrillShell>
</PracticeScreen>
