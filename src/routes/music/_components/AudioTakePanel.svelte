<script lang="ts">
  import Download from "lucide-svelte/icons/download";
  import Mic from "lucide-svelte/icons/mic";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import Trash2 from "lucide-svelte/icons/trash-2";

  import type {
    AudioTakeRecorderState,
    AudioTakeRecording,
  } from "@repo/music-core/engines/audio-recording";
  import type { MediaUsage } from "@repo/music-core/engines/media-library";
  import type { AudioTakeRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import * as Dialog from "@repo/ui/dialog";
  import { Slider } from "@repo/ui/slider";

  let {
    recorderState,
    devices = [],
    armed = false,
    takes = [],
    selectedTake,
    usage,
    performanceVolume = 1,
    backingVolume = 1,
    unsavedTake,
    playingTakeId,
    onArm,
    onDisarm,
    onDevice,
    onSelectTake,
    onPlayTake,
    onPauseTake,
    onPerformanceVolume,
    onBackingVolume,
    onDownloadTake,
    onDeleteTake,
    onRetrySave,
  }: {
    recorderState: AudioTakeRecorderState;
    devices?: MediaDeviceInfo[];
    armed?: boolean;
    takes?: AudioTakeRow[];
    selectedTake?: AudioTakeRow;
    usage?: MediaUsage;
    performanceVolume?: number;
    backingVolume?: number;
    unsavedTake?: AudioTakeRecording;
    playingTakeId?: string;
    onArm?: (deviceId?: string) => void | Promise<void>;
    onDisarm?: () => void | Promise<void>;
    onDevice?: (deviceId: string) => void;
    onSelectTake?: (take: AudioTakeRow) => void;
    onPlayTake?: (take: AudioTakeRow) => void | Promise<void>;
    onPauseTake?: (take: AudioTakeRow) => void;
    onPerformanceVolume?: (volume: number) => void;
    onBackingVolume?: (volume: number) => void;
    onDownloadTake?: (take: AudioTakeRow) => void | Promise<void>;
    onDeleteTake?: (take: AudioTakeRow) => void | Promise<void>;
    onRetrySave?: (take: AudioTakeRecording) => void | Promise<void>;
  } = $props();

  let deleteCandidate = $state<AudioTakeRow | undefined>();

  const selectedDeviceId = $derived(recorderState.deviceId ?? devices[0]?.deviceId ?? "");
  const selected = $derived(selectedTake ?? takes[0]);
  const selectedIsPlaying = $derived(Boolean(selected && playingTakeId === selected.id));
  const canUseTake = $derived(Boolean(selected));

  function handleArm(): void {
    if (armed) {
      void onDisarm?.();
      return;
    }
    void onArm?.(selectedDeviceId || undefined);
  }

  function handleDevice(event: Event): void {
    onDevice?.((event.currentTarget as HTMLSelectElement).value);
  }

  function handlePerformanceVolume(event: Event): void {
    onPerformanceVolume?.(Number((event.currentTarget as HTMLInputElement).value));
  }

  function handleBackingVolume(event: Event): void {
    onBackingVolume?.(Number((event.currentTarget as HTMLInputElement).value));
  }

  function confirmDelete(): void {
    if (!deleteCandidate) return;
    void onDeleteTake?.(deleteCandidate);
    deleteCandidate = undefined;
  }

  function playOrPause(): void {
    if (!selected) return;
    if (selectedIsPlaying) {
      onPauseTake?.(selected);
      return;
    }
    void onPlayTake?.(selected);
  }

  function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.round(ms / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

<Card.Root class="overflow-hidden">
  <Card.Header>
    <div class="flex items-start justify-between gap-4">
      <div>
        <Card.Title class="flex items-center gap-2 text-lg">
          <Mic class="size-4 text-primary" aria-hidden="true" />
          Audio takes
        </Card.Title>
        <Card.Description>
          Arm a microphone, review synchronized takes, and balance performance against backing.
        </Card.Description>
      </div>
      <span class="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground">
        {recorderState.status}
      </span>
    </div>
  </Card.Header>
  <Card.Content class="space-y-5">
    <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
      <label class="grid gap-1.5 text-sm font-medium">
        Audio input
        <select
          class="h-10 min-w-0 rounded-md border bg-background px-3 text-sm"
          value={selectedDeviceId}
          aria-label="Audio input"
          onchange={handleDevice}
        >
          {#if devices.length === 0}
            <option value="">Default microphone</option>
          {:else}
            {#each devices as device (device.deviceId)}
              <option value={device.deviceId}>{device.label || "Audio input"}</option>
            {/each}
          {/if}
        </select>
      </label>

      <Button
        type="button"
        class="self-end"
        variant={armed ? "secondary" : "default"}
        aria-label={armed ? "Disarm microphone" : "Arm microphone"}
        onclick={handleArm}
        disabled={recorderState.status === "requesting" || recorderState.status === "stopping"}
      >
        <Mic class="size-4" aria-hidden="true" />
        {armed ? "Armed" : "Arm"}
      </Button>
    </div>

    {#if recorderState.message}
      <p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        {recorderState.message}
      </p>
    {/if}

    {#if unsavedTake}
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div>
          <p class="text-sm font-semibold">Unsaved take ready</p>
          <p class="text-xs text-muted-foreground">
            {formatDuration(unsavedTake.durationMs)} · {formatBytes(unsavedTake.size)}
          </p>
        </div>
        <Button type="button" size="sm" aria-label="Retry save" onclick={() => void onRetrySave?.(unsavedTake)}>
          <RotateCcw class="size-4" aria-hidden="true" />
          Retry save
        </Button>
      </div>
    {/if}

    <div class="grid gap-2">
      {#if takes.length > 0}
        {#each takes as take (take.id)}
          {@const playing = playingTakeId === take.id}
          <div
            class="flex items-center gap-2 rounded-lg border pr-2 transition-colors {selected?.id ===
            take.id
              ? 'border-primary/40 bg-primary/5'
              : 'bg-background'}"
          >
            <!-- Play lives on the card: a take is something you listen to, not a row you select. -->
            <Button
              type="button"
              size="icon"
              variant={playing ? "default" : "ghost"}
              class="ml-1 size-11 shrink-0 rounded-full"
              aria-label={`${playing ? "Pause" : "Play"} take ${take.name}`}
              onclick={() => {
                onSelectTake?.(take);
                if (playing) onPauseTake?.(take);
                else void onPlayTake?.(take);
              }}
            >
              {#if playing}
                <Pause class="size-4" aria-hidden="true" />
              {:else}
                <Play class="size-4" aria-hidden="true" />
              {/if}
            </Button>
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left hover:bg-muted/40"
              aria-label={`Select take ${take.name}`}
              onclick={() => onSelectTake?.(take)}
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold">{take.name}</span>
                <span class="text-xs text-muted-foreground">
                  <Mic class="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />Audio ·
                  {formatDuration(take.durationMs)} · {formatBytes(take.size)} · {take.instrument}
                </span>
              </span>
              {#if take.backingKind}
                <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
                  {take.backingKind}
                </span>
              {/if}
            </button>
          </div>
        {/each}
      {:else}
        <p class="rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          Saved dry takes will appear here after recording.
        </p>
      {/if}
    </div>

    <div class="grid gap-4 rounded-xl border bg-muted/20 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!canUseTake}
          aria-label="Play synchronized take"
          onclick={playOrPause}
        >
          {#if selectedIsPlaying}
            <Pause class="size-4" aria-hidden="true" />
            Pause take
          {:else}
            <Play class="size-4" aria-hidden="true" />
            Play take
          {/if}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canUseTake}
          aria-label="Download take"
          onclick={() => selected && void onDownloadTake?.(selected)}
        >
          <Download class="size-4" aria-hidden="true" />
          Download
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canUseTake}
          aria-label="Delete take"
          onclick={() => (deleteCandidate = selected)}
        >
          <Trash2 class="size-4" aria-hidden="true" />
          Delete
        </Button>
      </div>

      <label class="grid gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Performance volume
        <div class="relative">
          <Slider aria-hidden="true" value={[performanceVolume]} min={0} max={1} step={0.05} />
          <input
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={performanceVolume}
            aria-label="Performance volume"
            oninput={handlePerformanceVolume}
          />
        </div>
      </label>

      <label class="grid gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Backing volume
        <div class="relative">
          <Slider aria-hidden="true" value={[backingVolume]} min={0} max={1} step={0.05} />
          <input
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={backingVolume}
            aria-label="Backing volume"
            oninput={handleBackingVolume}
          />
        </div>
      </label>
    </div>

    {#if usage}
      <p class="text-xs text-muted-foreground">
        Take storage: {formatBytes(usage.takeBytes)} · Remaining media budget:
        {formatBytes(usage.remainingBytes)}
      </p>
    {/if}
  </Card.Content>
</Card.Root>

<Dialog.Root open={deleteCandidate !== undefined} onOpenChange={(open) => !open && (deleteCandidate = undefined)}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Delete take?</Dialog.Title>
      <Dialog.Description>
        This removes {deleteCandidate?.name ?? "the selected take"} from local media storage.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button type="button" variant="outline" onclick={() => (deleteCandidate = undefined)}>Cancel</Button>
      <Button type="button" variant="destructive" onclick={confirmDelete}>Delete</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
