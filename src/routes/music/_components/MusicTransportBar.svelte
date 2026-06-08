<script lang="ts">
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Repeat from "lucide-svelte/icons/repeat";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import SkipForward from "lucide-svelte/icons/skip-forward";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import VolumeX from "lucide-svelte/icons/volume-x";
  import Waveform from "lucide-svelte/icons/audio-waveform";

  import * as Popover from "@repo/ui/popover";

  import MetronomeIcon from "./MetronomeIcon.svelte";

  let {
    bpm,
    onBpm,
    running = false,
    onToggle,
    audioEnabled = false,
    audioPending = false,
    onEnableAudio,
    countInBars = 1,
    onCountIn,
    muted = false,
    onToggleMute,
    metronomeLevel = 0.7,
    onMetronomeLevel,
    onTap,
  }: {
    bpm: number;
    onBpm?: (value: number) => void;
    running?: boolean;
    onToggle?: () => void;
    audioEnabled?: boolean;
    audioPending?: boolean;
    onEnableAudio?: () => void;
    countInBars?: number;
    onCountIn?: (bars: number) => void;
    muted?: boolean;
    onToggleMute?: () => void;
    metronomeLevel?: number;
    onMetronomeLevel?: (level: number) => void;
    onTap?: () => void;
  } = $props();

  // Common metronome tempos (Italian markings) — clickable presets.
  const TEMPO_PRESETS = [
    { label: "Largo", bpm: 50 },
    { label: "Adagio", bpm: 70 },
    { label: "Andante", bpm: 92 },
    { label: "Moderato", bpm: 112 },
    { label: "Allegro", bpm: 140 },
    { label: "Presto", bpm: 180 },
  ];
  const COUNT_IN_OPTIONS = [
    { bars: 0, label: "Off" },
    { bars: 1, label: "1" },
    { bars: 2, label: "2" },
  ];
</script>

<div
  class="sticky bottom-0 z-30 flex flex-wrap items-center gap-x-6 gap-y-3 border-t bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-6"
  aria-label="Transport"
>
  <!-- left: tempo + count-in -->
  <div class="flex items-center gap-3">
    <span class="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
      <MetronomeIcon class="size-4" />
    </span>

    <Popover.Root>
      <Popover.Trigger
        class="flex flex-col rounded-md px-1 text-left hover:bg-muted"
        aria-label="Tempo presets"
      >
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tempo</span>
        <span class="text-sm font-bold tabular-nums"
          >{bpm}<span class="ml-1 text-xs font-normal text-muted-foreground">bpm</span></span
        >
      </Popover.Trigger>
      <Popover.Content class="w-44 p-1.5" side="top" align="start">
        <p class="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Common tempos
        </p>
        {#each TEMPO_PRESETS as preset}
          <button
            type="button"
            onclick={() => onBpm?.(preset.bpm)}
            class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted {bpm ===
            preset.bpm
              ? 'font-semibold text-primary'
              : ''}"
          >
            <span>{preset.label}</span>
            <span class="tabular-nums text-muted-foreground">{preset.bpm}</span>
          </button>
        {/each}
      </Popover.Content>
    </Popover.Root>

    <input
      type="range"
      min="40"
      max="220"
      value={bpm}
      aria-label="Tempo"
      class="h-1 w-24 cursor-pointer accent-primary"
      oninput={(event) => onBpm?.(Number(event.currentTarget.value))}
    />

    <div class="hidden flex-col sm:flex">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Count in</span>
      <div role="group" aria-label="Count in" class="mt-0.5 flex items-center gap-0.5">
        {#each COUNT_IN_OPTIONS as option}
          <button
            type="button"
            aria-pressed={countInBars === option.bars}
            onclick={() => onCountIn?.(option.bars)}
            class="rounded px-1.5 py-0.5 text-xs font-semibold {countInBars === option.bars
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted'}"
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- center: transport controls -->
  <div class="mx-auto flex items-center gap-2">
    <button type="button" class="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Previous">
      <SkipBack class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      onclick={onToggle}
      aria-label={running ? "Pause metronome" : "Play metronome"}
      class="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95"
    >
      {#if running}
        <Pause class="size-5" aria-hidden="true" />
      {:else}
        <Play class="size-5 translate-x-0.5" aria-hidden="true" />
      {/if}
    </button>
    <button type="button" class="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Next">
      <SkipForward class="size-4" aria-hidden="true" />
    </button>
    <button type="button" class="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Repeat">
      <Repeat class="size-4" aria-hidden="true" />
    </button>
  </div>

  <!-- right: mute + metronome blend + tap + audio -->
  <div class="flex items-center gap-3">
    <button
      type="button"
      onclick={onToggleMute}
      aria-label={muted ? "Unmute audio" : "Mute audio"}
      aria-pressed={muted}
      class="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted {muted
        ? 'text-destructive'
        : ''}"
    >
      {#if muted}
        <VolumeX class="size-4" aria-hidden="true" />
      {:else}
        <Volume2 class="size-4" aria-hidden="true" />
      {/if}
    </button>
    <div class="hidden flex-col sm:flex">
      <span class="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <MetronomeIcon class="size-3" /> Blend
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={metronomeLevel}
        aria-label="Metronome blend"
        class="h-1 w-20 cursor-pointer accent-primary"
        oninput={(event) => onMetronomeLevel?.(Number(event.currentTarget.value))}
      />
    </div>
    {#if onTap}
      <button
        type="button"
        onclick={onTap}
        class="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <Waveform class="size-4" aria-hidden="true" />
        Tap
      </button>
    {/if}
    {#if !audioEnabled}
      <button
        type="button"
        onclick={onEnableAudio}
        disabled={audioPending}
        class="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {audioPending ? "Enabling…" : "Enable audio"}
      </button>
    {/if}
  </div>
</div>
