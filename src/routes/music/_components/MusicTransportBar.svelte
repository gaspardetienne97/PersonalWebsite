<script lang="ts">
  import Metronome from "lucide-svelte/icons/circle-gauge";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Repeat from "lucide-svelte/icons/repeat";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import SkipForward from "lucide-svelte/icons/skip-forward";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import Waveform from "lucide-svelte/icons/audio-waveform";

  let {
    bpm,
    onBpm,
    running = false,
    onToggle,
    audioEnabled = false,
    audioPending = false,
    onEnableAudio,
    countIn = "1 Bar",
    onTap,
  }: {
    bpm: number;
    onBpm?: (value: number) => void;
    running?: boolean;
    onToggle?: () => void;
    audioEnabled?: boolean;
    audioPending?: boolean;
    onEnableAudio?: () => void;
    countIn?: string;
    onTap?: () => void;
  } = $props();
</script>

<div
  class="sticky bottom-0 z-30 flex flex-wrap items-center gap-x-6 gap-y-3 border-t bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-6"
  aria-label="Transport"
>
  <!-- left: tempo + count-in -->
  <div class="flex items-center gap-3">
    <span class="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
      <Metronome class="size-4" aria-hidden="true" />
    </span>
    <div class="flex flex-col">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tempo</span>
      <span class="text-sm font-bold tabular-nums">{bpm}<span class="ml-1 text-xs font-normal text-muted-foreground">bpm</span></span>
    </div>
    <input
      type="range"
      min="40"
      max="220"
      value={bpm}
      aria-label="Tempo"
      class="h-1 w-28 cursor-pointer accent-primary"
      oninput={(event) => onBpm?.(Number(event.currentTarget.value))}
    />
    <div class="hidden flex-col sm:flex">
      <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Count in</span>
      <span class="text-sm font-semibold">{countIn}</span>
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

  <!-- right: volume + tap + audio -->
  <div class="flex items-center gap-3">
    <Volume2 class="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
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
