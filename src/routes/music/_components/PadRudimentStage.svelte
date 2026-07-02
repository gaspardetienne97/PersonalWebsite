<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { cn } from "@repo/ui/utils";

  import MpcPadGrid from "./MpcPadGrid.svelte";
  import PracticeStage from "./PracticeStage.svelte";

  let {
    router,
    targetSequence,
    completedHits = 0,
    bpm,
    onAccepted,
  }: {
    router: InputRouter;
    targetSequence: number[];
    completedHits?: number;
    bpm?: number | string;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  const nextPad = $derived(targetSequence[Math.min(completedHits, targetSequence.length - 1)]);

  function stepState(index: number): "completed" | "current" | "upcoming" {
    if (index < completedHits) return "completed";
    if (index === completedHits) return "current";
    return "upcoming";
  }
</script>

<PracticeStage instrument="mpc" class="min-w-0 space-y-5 overflow-x-auto p-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="eyebrow">Bank A pads</p>
      <h2 class="text-xl font-semibold text-stage-foreground">MPC rudiment stage</h2>
    </div>
    <div class="rounded-lg border border-practice-accent/30 bg-practice-accent/15 px-3 py-2 text-right">
      <p class="text-xs font-semibold uppercase text-practice-accent">Next pad cue</p>
      <p class="text-lg font-bold tabular-nums text-stage-foreground">
        Pad {nextPad ?? targetSequence[0] ?? "—"}
      </p>
    </div>
  </div>

  <div class="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
    <div class="justify-self-center">
      <MpcPadGrid {router} {onAccepted} />
    </div>

    <div class="grid gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="eyebrow">Rudiment sequence</p>
        {#if bpm !== undefined}
          <span class="rounded-full bg-stage-2 px-2.5 py-0.5 text-xs font-semibold text-stage-foreground">
            {bpm} BPM
          </span>
        {/if}
      </div>
      <div
        class="grid gap-2"
        style={`grid-template-columns: repeat(${Math.max(1, targetSequence.length)}, minmax(2.25rem, 1fr));`}
        aria-label="Rudiment sequence lane"
      >
        {#each targetSequence as midi, index (`${midi}-${index}`)}
          {@const state = stepState(index)}
          <div
            data-rudiment-step={index}
            data-state={state}
            class={cn(
              "grid min-h-16 min-w-9 place-items-center rounded-lg border p-2 text-center text-xs font-semibold tabular-nums",
              state === "completed" && "border-success/40 bg-success/15 text-success",
              state === "current" &&
                "border-practice-accent bg-practice-accent/20 text-stage-foreground ring-2 ring-practice-accent/30",
              state === "upcoming" && "border-stage-line bg-stage-2 text-stage-muted",
            )}
          >
            <span class="text-[10px] uppercase opacity-70">{index + 1}</span>
            <span>Pad {midi}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</PracticeStage>
