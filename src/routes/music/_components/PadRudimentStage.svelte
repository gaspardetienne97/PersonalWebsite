<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { cn } from "@repo/ui/utils";

  import MpcPadGrid from "./MpcPadGrid.svelte";
  import PracticeStage from "./PracticeStage.svelte";

  interface PadRudimentStageEvent {
    padMidi: number;
    accent?: "normal" | "accent";
    velocityBand?: { label: string };
  }

  let {
    router,
    targetSequence,
    targetEvents,
    completedHits = 0,
    bpm,
    onAccepted,
  }: {
    router: InputRouter;
    targetSequence: number[];
    targetEvents?: PadRudimentStageEvent[];
    completedHits?: number;
    bpm?: number | string;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  const sequenceEvents = $derived(
    targetEvents ?? targetSequence.map((padMidi) => ({ padMidi, accent: "normal" as const })),
  );
  const nextPad = $derived(
    sequenceEvents[Math.min(completedHits, sequenceEvents.length - 1)]?.padMidi,
  );

  function stepState(index: number): "completed" | "current" | "upcoming" {
    if (index < completedHits) return "completed";
    if (index === completedHits) return "current";
    return "upcoming";
  }
</script>

<PracticeStage instrument="mpc" class="min-w-0 space-y-5 p-4 sm:p-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="eyebrow">Bank A pads</p>
    <div class="rounded-lg border border-practice-accent/30 bg-practice-accent/15 px-3 py-2 text-right">
      <p class="eyebrow text-practice-accent">Next pad cue</p>
      <p class="text-lg font-bold tabular-nums text-stage-foreground">
        Pad {nextPad ?? targetSequence[0] ?? "—"}
      </p>
    </div>
  </div>

  <div class="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
    <div class="w-full max-w-xs justify-self-center lg:w-64">
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
        style={`grid-template-columns: repeat(${Math.max(1, sequenceEvents.length)}, minmax(0, 1fr));`}
        aria-label="Rudiment sequence lane"
      >
        {#each sequenceEvents as event, index (`${event.padMidi}-${index}`)}
          {@const state = stepState(index)}
          <div
            data-rudiment-step={index}
            data-state={state}
            class={cn(
              "grid min-h-14 place-items-center rounded-lg border p-1 text-center text-xs font-semibold tabular-nums sm:p-2",
              state === "completed" && "border-success/40 bg-success/15 text-success",
              state === "current" &&
                "border-practice-accent bg-practice-accent/20 text-stage-foreground ring-2 ring-practice-accent/30",
              state === "upcoming" && "border-stage-line bg-stage-2 text-stage-muted",
            )}
          >
            <span class="text-[0.625rem] uppercase opacity-70">{index + 1}</span>
            <span>Pad {event.padMidi}</span>
            {#if event.velocityBand}
              <span class="text-[0.625rem] uppercase opacity-70">
                {event.accent === "accent" ? "Accent" : "Tap"}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</PracticeStage>
