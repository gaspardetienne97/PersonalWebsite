<script lang="ts">
  import { tick } from "svelte";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import Lock from "lucide-svelte/icons/lock-keyhole";
  import Piano from "lucide-svelte/icons/piano";
  import Timer from "lucide-svelte/icons/timer";

  import { INSTRUMENT_LABELS, type InstrumentId } from "@repo/music-core/domain";
  import { Button } from "@repo/ui/button";
  import * as Popover from "@repo/ui/popover";

  import MetronomeIcon from "./MetronomeIcon.svelte";

  const TEMPO_PRESETS = [50, 70, 92, 112, 140, 180];
  const COUNT_IN_OPTIONS = [0, 1, 2] as const;

  let {
    instrument,
    instruments,
    instrumentPinned = false,
    bpm,
    countInBars,
    metronomeEnabled,
    metronomeRunning,
    performancePending = false,
    phase,
    activeBeat,
    beatsPerBar,
    onInstrument,
    onToggleMetronome,
    onBpm,
    onCountIn,
  }: {
    instrument: InstrumentId;
    instruments: readonly InstrumentId[];
    instrumentPinned?: boolean;
    bpm: number;
    countInBars: number;
    metronomeEnabled: boolean;
    metronomeRunning: boolean;
    performancePending?: boolean;
    phase: "idle" | "count-in" | "running";
    activeBeat: number;
    beatsPerBar: number;
    onInstrument?: (instrument: InstrumentId) => void;
    onToggleMetronome?: () => void;
    onBpm?: (bpm: number) => void;
    onCountIn?: (bars: 0 | 1 | 2) => void;
  } = $props();

  let instrumentOpen = $state(false);
  let bpmOpen = $state(false);
  let countInOpen = $state(false);
  let instrumentTrigger = $state<HTMLButtonElement | null>(null);
  let bpmTrigger = $state<HTMLButtonElement | null>(null);
  let countInTrigger = $state<HTMLButtonElement | null>(null);

  const controlsLocked = $derived(performancePending || phase !== "idle");
  const metronomePressed = $derived(phase === "idle" ? metronomeRunning : metronomeEnabled);
  const instrumentLocked = $derived(controlsLocked || instrumentPinned);
  const countInLabel = $derived(
    countInBars === 0 ? "Off" : `${countInBars} ${countInBars === 1 ? "bar" : "bars"}`,
  );

  $effect(() => {
    const focusTarget = instrumentLocked && instrumentOpen
      ? instrumentTrigger
      : controlsLocked && bpmOpen
        ? bpmTrigger
        : controlsLocked && countInOpen
          ? countInTrigger
          : null;
    if (!focusTarget) return;
    instrumentOpen = false;
    bpmOpen = false;
    countInOpen = false;
    void tick().then(() => focusTarget.focus());
  });

  function guardLocked(event: Event, locked: boolean): void {
    if (!locked) return;
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
  }
</script>

<div
  class="flex max-w-[calc(100vw-1rem)] flex-nowrap items-center gap-1 rounded-full border bg-background/95 p-1.5 shadow-lg backdrop-blur"
  aria-label="Practice controls"
  data-practice-controls
>
  <Popover.Root bind:open={instrumentOpen}>
    <Popover.Trigger
      bind:ref={instrumentTrigger}
      data-practice-control="instrument"
      aria-label={`Practice instrument: ${INSTRUMENT_LABELS[instrument]}${instrumentPinned ? " (pinned)" : ""}`}
      aria-disabled={instrumentLocked}
      onclick={(event) => guardLocked(event, instrumentLocked)}
      onkeydown={(event) => guardLocked(event, instrumentLocked)}
      class="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-2 text-sm font-medium hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:px-3"
    >
      {#if instrumentPinned}<Lock class="size-4" aria-hidden="true" />{:else}<Piano class="size-4" aria-hidden="true" />{/if}
      <span class="hidden sm:inline">{INSTRUMENT_LABELS[instrument]}</span>
      {#if instrumentPinned}<span class="hidden text-xs text-muted-foreground lg:inline">Pinned</span>{/if}
      <ChevronDown class="size-3.5 opacity-60" aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Content class="w-44 p-1.5" side="bottom" align="start">
      <p class="px-2 py-1 eyebrow">Practice instrument</p>
      {#each instruments as option (option)}
        <button
          type="button"
          onclick={() => {
            onInstrument?.(option);
            instrumentOpen = false;
          }}
          class="flex w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted {instrument === option
            ? 'font-semibold text-primary'
            : ''}"
        >
          {INSTRUMENT_LABELS[option]}
        </button>
      {/each}
    </Popover.Content>
  </Popover.Root>

  <Button
    data-practice-control="metronome"
    size="sm"
    variant={metronomePressed ? "secondary" : "ghost"}
    aria-label={metronomePressed ? "Turn metronome off" : "Turn metronome on"}
    aria-pressed={metronomePressed}
    onclick={onToggleMetronome}
    class="h-9 shrink-0 rounded-full px-2 sm:px-3"
  >
    <MetronomeIcon class="size-4" />
    <span class="hidden sm:inline">Metronome</span>
  </Button>

  <Popover.Root bind:open={bpmOpen}>
    <Popover.Trigger
      bind:ref={bpmTrigger}
      data-practice-control="bpm"
      aria-label={`Tempo: ${bpm} BPM`}
      aria-disabled={controlsLocked}
      onclick={(event) => guardLocked(event, controlsLocked)}
      onkeydown={(event) => guardLocked(event, controlsLocked)}
      class="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-semibold tabular-nums hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:px-3"
    >
      {bpm}<span class="hidden text-xs font-normal text-muted-foreground sm:inline">BPM</span>
      <ChevronDown class="size-3.5 opacity-60" aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Content class="w-64 space-y-3" side="bottom" align="center">
      <div class="flex items-center justify-between">
        <p class="eyebrow">Common tempos</p>
        <strong class="text-sm tabular-nums">{bpm} BPM</strong>
      </div>
      <input
        type="range"
        min="40"
        max="220"
        value={bpm}
        aria-label="Tempo in beats per minute"
        class="w-full accent-primary"
        oninput={(event) => onBpm?.(Number(event.currentTarget.value))}
      />
      <div class="grid grid-cols-3 gap-1">
        {#each TEMPO_PRESETS as preset (preset)}
          <button
            type="button"
            onclick={() => onBpm?.(preset)}
            class="rounded-md px-2 py-1.5 text-xs tabular-nums hover:bg-muted {bpm === preset
              ? 'bg-primary/15 font-semibold text-primary'
              : ''}"
          >
            {preset}
          </button>
        {/each}
      </div>
    </Popover.Content>
  </Popover.Root>

  <Popover.Root bind:open={countInOpen}>
    <Popover.Trigger
      bind:ref={countInTrigger}
      data-practice-control="count-in"
      aria-label={`Count in: ${countInLabel}`}
      aria-disabled={controlsLocked}
      onclick={(event) => guardLocked(event, controlsLocked)}
      onkeydown={(event) => guardLocked(event, controlsLocked)}
      class="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-2 text-sm font-medium hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:px-3"
    >
      <Timer class="size-4" aria-hidden="true" />
      <span class="hidden sm:inline">Count-in</span>
      <span class="tabular-nums">{countInBars === 0 ? "Off" : countInBars}</span>
    </Popover.Trigger>
    <Popover.Content class="w-40 p-1.5" side="bottom" align="end">
      <p class="px-2 py-1 eyebrow">Count in</p>
      {#each COUNT_IN_OPTIONS as bars (bars)}
        <button
          type="button"
          onclick={() => {
            onCountIn?.(bars);
            countInOpen = false;
          }}
          class="flex w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted {countInBars === bars
            ? 'font-semibold text-primary'
            : ''}"
        >
          {bars === 0 ? "Off" : `${bars} ${bars === 1 ? "bar" : "bars"}`}
        </button>
      {/each}
    </Popover.Content>
  </Popover.Root>

  <div
    class="ml-1 hidden items-center gap-1 px-1 md:flex"
    aria-label={activeBeat >= 0 ? `Beat ${activeBeat + 1} of ${beatsPerBar}` : "Beat idle"}
  >
    {#each Array.from({ length: beatsPerBar }) as _, beat (beat)}
      <span
        class="size-1.5 rounded-full {beat === activeBeat ? 'bg-primary' : 'bg-muted-foreground/30'}"
        aria-hidden="true"
      ></span>
    {/each}
  </div>
</div>
