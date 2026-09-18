<script lang="ts">
  import Music2 from "lucide-svelte/icons/music-2";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import Upload from "lucide-svelte/icons/upload";

  import type { BackingSelection, BackingTrackState } from "@repo/music-core/engines/backing-track";
  import type { JamProgression } from "@repo/music-core/engines/jam";
  import type { MediaUsage } from "@repo/music-core/engines/media-library";
  import type { ImportedBackingTrackRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import * as Dialog from "@repo/ui/dialog";
  import { Slider } from "@repo/ui/slider";
  import { Toggle } from "@repo/ui/toggle";

  import SegmentedControl from "./SegmentedControl.svelte";

  type GeneratedSelection = Extract<BackingSelection, { kind: "generated" }>;

  let {
    state: backingState,
    progressions = [],
    importedTracks = [],
    usage,
    defaultBpm = 96,
    onSelectNone,
    onSelectGenerated,
    onSelectImported,
    onImport,
    onPlay,
    onPause,
    onStop,
    onSeek,
    onLoop,
    onVolume,
    onDeleteImported,
  }: {
    state: BackingTrackState;
    progressions?: JamProgression[];
    importedTracks?: ImportedBackingTrackRow[];
    usage?: MediaUsage;
    defaultBpm?: number;
    onSelectNone?: () => void;
    onSelectGenerated?: (selection: GeneratedSelection) => void;
    onSelectImported?: (track: ImportedBackingTrackRow, loop: boolean) => void;
    onImport?: (file: File) => void | Promise<void>;
    onPlay?: () => void | Promise<void>;
    onPause?: () => void;
    onStop?: () => void;
    onSeek?: (positionMs: number) => void;
    onLoop?: (loop: boolean) => void;
    onVolume?: (volume: number) => void;
    onDeleteImported?: (track: ImportedBackingTrackRow) => void | Promise<void>;
  } = $props();

  let importError = $state("");
  let deleteCandidate = $state<ImportedBackingTrackRow | undefined>();

  const MODES = [
    { value: "none", label: "No backing" },
    { value: "generated", label: "Generated backing" },
    { value: "imported", label: "Imported backing" },
  ];

  let mode = $derived<string>(backingState.selection.kind);
  const currentLoop = $derived(backingState.selection.kind !== "none" ? backingState.selection.loop : false);
  const currentProgression = $derived(
    backingState.selection.kind === "generated"
      ? backingState.selection.progressionId
      : (progressions[0]?.id ?? ""),
  );
  const currentBpm = $derived(
    backingState.selection.kind === "generated" ? backingState.selection.bpm : defaultBpm,
  );
  const canPlay = $derived(backingState.selection.kind !== "none" && backingState.status !== "loading");
  const isPlaying = $derived(backingState.status === "playing");
  const selectedImportedId = $derived(
    backingState.selection.kind === "imported" ? backingState.selection.track.id : undefined,
  );

  function selectMode(next: string): void {
    if (next === "none") {
      onSelectNone?.();
      return;
    }
    if (next === "generated") {
      emitGenerated(currentProgression, currentBpm, currentLoop);
      return;
    }
    const selected =
      importedTracks.find((track) => track.id === selectedImportedId) ?? importedTracks[0];
    if (selected) onSelectImported?.(selected, currentLoop);
  }

  function emitGenerated(progressionId: string, bpm: number, loop: boolean): void {
    if (!progressionId) return;
    onSelectGenerated?.({ kind: "generated", progressionId, bpm, loop });
  }

  function handleProgression(event: Event): void {
    emitGenerated((event.currentTarget as HTMLSelectElement).value, currentBpm, currentLoop);
  }

  function handleBpm(event: Event): void {
    emitGenerated(currentProgression, Number((event.currentTarget as HTMLInputElement).value), currentLoop);
  }

  function handleLoop(next: boolean): void {
    if (backingState.selection.kind === "generated") {
      emitGenerated(backingState.selection.progressionId, backingState.selection.bpm, next);
    }
    onLoop?.(next);
  }

  function handleImport(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    importError = "";
    if (!file) return;
    if (!isAllowedAudioFile(file)) {
      importError = "Choose an MP3 or WAV audio file.";
      input.value = "";
      return;
    }
    void onImport?.(file);
    input.value = "";
  }

  function handleVolume(event: Event): void {
    onVolume?.(Number((event.currentTarget as HTMLInputElement).value));
  }

  function handleSeek(event: Event): void {
    onSeek?.(Number((event.currentTarget as HTMLInputElement).value));
  }

  function confirmDelete(): void {
    if (!deleteCandidate) return;
    void onDeleteImported?.(deleteCandidate);
    deleteCandidate = undefined;
  }

  function isAllowedAudioFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return (
      file.type === "audio/mpeg" ||
      file.type === "audio/mp3" ||
      file.type === "audio/wav" ||
      file.type === "audio/x-wav" ||
      name.endsWith(".mp3") ||
      name.endsWith(".wav")
    );
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
  <Card.Header class="gap-3">
    <div class="flex items-start justify-between gap-4">
      <div>
        <Card.Title class="flex items-center gap-2 text-lg">
          <Music2 class="size-4 text-primary" aria-hidden="true" />
          Backing track
        </Card.Title>
        <Card.Description>
          Choose silence, a generated progression, or an imported audio loop.
        </Card.Description>
      </div>
      <span class="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground">
        {backingState.status}
      </span>
    </div>
  </Card.Header>
  <Card.Content class="space-y-5">
    <SegmentedControl
      options={MODES}
      bind:value={mode}
      ariaLabel="Backing source"
      class="w-full flex-wrap justify-center sm:w-fit"
      onChange={selectMode}
    />

    {#if mode === "generated"}
      <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label class="grid gap-1.5 text-sm font-medium">
          Progression
          <select
            class="h-10 rounded-md border bg-background px-3 text-sm"
            value={currentProgression}
            onchange={handleProgression}
          >
            {#each progressions as progression (progression.id)}
              <option value={progression.id}>{progression.name} · {progression.key}</option>
            {/each}
          </select>
        </label>
        <label class="grid gap-1.5 text-sm font-medium">
          BPM
          <input
            class="h-10 w-28 rounded-md border bg-background px-3 text-sm tabular-nums"
            type="number"
            min="40"
            max="220"
            value={currentBpm}
            oninput={handleBpm}
          />
        </label>
      </div>
    {:else if mode === "imported"}
      <div class="space-y-3">
        <label
          class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted/60"
        >
          <Upload class="size-4" aria-hidden="true" />
          Import MP3 or WAV
          <input
            class="sr-only"
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav"
            aria-label="Import MP3 or WAV"
            onchange={handleImport}
          />
        </label>
        {#if importError}
          <p class="text-sm text-destructive" role="alert">{importError}</p>
        {/if}

        {#if importedTracks.length > 0}
          <div class="grid gap-2">
            {#each importedTracks as track (track.id)}
              <div
                class="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                data-selected={selectedImportedId === track.id}
              >
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  aria-label={`Use imported backing ${track.name}`}
                  onclick={() => onSelectImported?.(track, currentLoop)}
                >
                  <span class="block truncate text-sm font-semibold">{track.name}</span>
                  <span class="text-xs text-muted-foreground"
                    >{formatDuration(track.durationMs)} · {formatBytes(track.size)}</span
                  >
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete imported backing ${track.name}`}
                  onclick={() => (deleteCandidate = track)}
                >
                  <Trash2 class="size-4" aria-hidden="true" />
                </Button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
            Imported loops will appear here after upload.
          </p>
        {/if}
      </div>
    {:else}
      <p class="rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
        No backing track is selected. Your free-practice notes and takes can still be captured.
      </p>
    {/if}

    <div class="grid gap-4 rounded-xl border bg-muted/20 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!canPlay}
          aria-label={isPlaying ? "Pause backing" : "Play backing"}
          onclick={() => (isPlaying ? onPause?.() : void onPlay?.())}
        >
          {#if isPlaying}
            <Pause class="size-4" aria-hidden="true" />
            Pause
          {:else}
            <Play class="size-4" aria-hidden="true" />
            Play
          {/if}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={mode === "none"} onclick={onStop}>
          Stop
        </Button>
        <Toggle
          pressed={currentLoop}
          variant="outline"
          size="sm"
          disabled={mode === "none"}
          aria-label="Loop backing"
          onPressedChange={handleLoop}
        >
          Loop
        </Toggle>
      </div>

      <label class="grid gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Position
        <input
          type="range"
          min="0"
          max={Math.max(0, backingState.durationMs)}
          value={Math.min(backingState.positionMs, backingState.durationMs)}
          disabled={backingState.durationMs <= 0}
          class="h-1 w-full accent-primary"
          aria-label="Backing position"
          oninput={handleSeek}
        />
        <span class="text-right text-[11px] font-normal normal-case tracking-normal"
          >{formatDuration(backingState.positionMs)} / {formatDuration(backingState.durationMs)}</span
        >
      </label>

      <label class="grid gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Backing volume
        <div class="relative">
          <Slider aria-hidden="true" value={[backingState.volume]} min={0} max={1} step={0.05} />
          <input
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={backingState.volume}
            aria-label="Backing volume"
            oninput={handleVolume}
          />
        </div>
      </label>
    </div>

    {#if usage}
      <p class="text-xs text-muted-foreground">
        Media used: {formatBytes(usage.totalBytes)} of {formatBytes(usage.effectiveBudgetBytes)}
      </p>
    {/if}

    {#if backingState.message}
      <p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        {backingState.message}
      </p>
    {/if}
  </Card.Content>
</Card.Root>

<Dialog.Root open={deleteCandidate !== undefined} onOpenChange={(open) => !open && (deleteCandidate = undefined)}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Delete backing track?</Dialog.Title>
      <Dialog.Description>
        This removes {deleteCandidate?.name ?? "the backing track"} from local media storage.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button type="button" variant="outline" onclick={() => (deleteCandidate = undefined)}>Cancel</Button>
      <Button type="button" variant="destructive" onclick={confirmDelete}>Delete</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
