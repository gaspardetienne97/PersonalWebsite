<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Trash2 from "lucide-svelte/icons/trash-2";

  import {
    BOOM_BAP_KIT,
    StepSequencer,
    type StepSequencerPattern,
  } from "@repo/music-core/engines/sequencer";
  import type { SoundPatternStep } from "@repo/music-core/engines/sound";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";

  const STEPS = 16;
  const STUDIO_PATTERN_ID = "music.studio.boom-bap";
  let { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
  const sequencer = new StepSequencer(BOOM_BAP_KIT, STEPS);

  // A seeded boom-bap groove so the grid isn't empty on first load.
  [
    [0, 0],
    [0, 6],
    [0, 10],
    [1, 4],
    [1, 12],
    [2, 0],
    [2, 2],
    [2, 4],
    [2, 6],
    [2, 8],
    [2, 10],
    [2, 12],
    [2, 14],
  ].forEach(([row, step]) => sequencer.toggle(row!, step!));

  let grid = $state(snapshot());
  let playing = $state(false);
  let activeStep = $state(-1);
  let patternStatus = $state("Pattern changes save locally.");
  let stepTimer: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    const steps = patternSteps(grid);
    const durationSec = patternDurationSec();
    runtime.setPlaybackSource({
      label: "Studio boom-bap pattern",
      durationSec,
      play: () => playPattern(steps, durationSec),
      stop: () => stopPattern(),
    });
  });

  onMount(() => {
    void loadSavedPattern();
  });

  function snapshot(): boolean[][] {
    return sequencer.rows.map((_, rowIndex) => sequencer.rowPattern(rowIndex));
  }

  function toggleCell(rowIndex: number, step: number): void {
    sequencer.toggle(rowIndex, step);
    grid = snapshot();
    void savePattern();
  }

  function clearGrid(): void {
    if (playing) stopPattern();
    sequencer.clear();
    grid = snapshot();
    void savePattern();
  }

  async function togglePlay(): Promise<void> {
    if (playing) {
      stopPattern();
      return;
    }
    await playPattern();
  }

  async function playPattern(
    steps: SoundPatternStep[] = patternSteps(),
    durationSec = patternDurationSec(),
  ): Promise<void> {
    if (!(await runtime.enableAudio())) return;
    stopPattern();
    runtime.sound.startPatternLoop(steps, durationSec, 0.9);
    startStepIndicator(durationSec);
    playing = true;
  }

  function stopPattern(): void {
    runtime.sound.stopPatternLoop();
    stopStepIndicator();
    playing = false;
  }

  function patternSteps(rows = grid): SoundPatternStep[] {
    const secondsPerStep = secondsPerSixteenth();
    const steps: SoundPatternStep[] = [];
    for (let step = 0; step < STEPS; step += 1) {
      const pads = sequencer.rows.filter((_, rowIndex) => rows[rowIndex]?.[step] ?? false);
      if (pads.length === 0) continue;
      steps.push({
        midiNotes: pads.map((pad) => pad.midi),
        offsetSeconds: step * secondsPerStep,
        durationSeconds: Math.min(0.16, secondsPerStep * 0.9),
      });
    }
    return steps;
  }

  function patternDurationSec(): number {
    return secondsPerSixteenth() * STEPS;
  }

  function secondsPerSixteenth(): number {
    return 60 / Math.max(1, runtime.transportBpm) / 4;
  }

  function startStepIndicator(durationSec: number): void {
    stopStepIndicator();
    activeStep = 0;
    let step = 0;
    stepTimer = setInterval(() => {
      step = (step + 1) % STEPS;
      activeStep = step;
    }, Math.max(20, (durationSec / STEPS) * 1000));
  }

  function stopStepIndicator(): void {
    if (stepTimer !== undefined) clearInterval(stepTimer);
    stepTimer = undefined;
    activeStep = -1;
  }

  async function loadSavedPattern(): Promise<void> {
    const saved = await runtime.readLocalState<StepSequencerPattern>(STUDIO_PATTERN_ID);
    if (!isStepSequencerPattern(saved)) return;
    sequencer.applyPattern(saved);
    grid = snapshot();
    patternStatus = "Loaded saved local pattern.";
  }

  async function savePattern(): Promise<void> {
    try {
      await runtime.writeLocalState(STUDIO_PATTERN_ID, sequencer.toPattern());
      patternStatus = "Saved locally.";
    } catch (error) {
      patternStatus = error instanceof Error ? error.message : "Pattern could not be saved.";
    }
  }

  function isStepSequencerPattern(value: unknown): value is StepSequencerPattern {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<StepSequencerPattern>;
    return (
      candidate.steps === STEPS &&
      Array.isArray(candidate.rows) &&
      candidate.rows.every(
        (row) =>
          row &&
          typeof row === "object" &&
          typeof row.id === "string" &&
          Array.isArray(row.steps) &&
          row.steps.every((step) => Number.isInteger(step)),
      )
    );
  }

  onDestroy(() => {
    stopPattern();
    runtime.setPlaybackSource(undefined);
  });
</script>

<svelte:head>
  <title>Studio | Musicianship OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Studio"
    subtitle="DAW-lite for the MPC pads — sequence a pattern and play it back. Complements your gear, doesn't replace it."
  >
    {#snippet controls()}
      <Button type="button" variant="outline" onclick={clearGrid}>
        <Trash2 class="size-4" aria-hidden="true" />Clear
      </Button>
      <Button type="button" onclick={() => void togglePlay()}>
        {#if playing}
          <Pause class="size-4" aria-hidden="true" />Stop
        {:else}
          <Play class="size-4" aria-hidden="true" />Play
        {/if}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  <Card.Root>
    <Card.Header class="flex-row items-center justify-between gap-2">
      <Card.Description>Sequencer · Boom Bap</Card.Description>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <span class="text-xs text-muted-foreground">{patternStatus}</span>
        <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          {STEPS} steps · 1 bar
        </span>
      </div>
    </Card.Header>
    <Card.Content>
      <div class="overflow-x-auto">
        <div class="min-w-[640px] space-y-1.5">
          <!-- step ruler -->
          <div class="flex items-center gap-1 pl-24">
            {#each Array(STEPS) as _, step}
              <div
                class="flex-1 text-center text-[10px] font-semibold {activeStep === step
                  ? 'text-primary'
                  : 'text-muted-foreground'}"
              >
                {step % 4 === 0 ? step / 4 + 1 : ""}
              </div>
            {/each}
          </div>

          {#each sequencer.rows as row, rowIndex}
            <div class="flex items-center gap-1">
              <div class="flex w-24 items-center gap-2 pr-2">
                <span class="size-2 rounded-full bg-primary/60"></span>
                <span class="truncate text-xs font-semibold">{row.name}</span>
              </div>
              {#each Array(STEPS) as _, step}
                <button
                  type="button"
                  aria-label="{row.name} step {step + 1}"
                  aria-pressed={grid[rowIndex]?.[step] ?? false}
                  onclick={() => toggleCell(rowIndex, step)}
                  class="aspect-square flex-1 rounded-md border transition-colors {grid[rowIndex]?.[
                    step
                  ]
                    ? 'border-primary bg-primary'
                    : step % 4 === 0
                      ? 'bg-muted/60 hover:bg-muted'
                      : 'bg-background hover:bg-muted'} {activeStep === step
                    ? 'ring-2 ring-primary/40'
                    : ''}"
                ></button>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header><Card.Description>Pad bank · Boom Bap</Card.Description></Card.Header>
    <Card.Content class="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {#each sequencer.rows as row}
        <button
          type="button"
          onclick={() => runtime.audioEnabled && runtime.sound.playNote(row.midi, 0.15, undefined, 0.9)}
          class="grid aspect-square place-items-center rounded-xl bg-primary/15 text-sm font-bold text-primary transition-transform hover:scale-105 active:scale-95"
        >
          {row.name}
        </button>
      {/each}
    </Card.Content>
  </Card.Root>
</PracticeScreen>
