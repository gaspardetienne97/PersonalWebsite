<script lang="ts">
  import Download from "lucide-svelte/icons/download";
  import Mic from "lucide-svelte/icons/mic";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import Trash2 from "lucide-svelte/icons/trash-2";

  import {
    formatDb,
    levelAdvice,
    SILENCE_DB,
    type AudioTakeRecorderState,
    type AudioTakeRecording,
    type TakeEnvelope,
  } from "@repo/music-core/engines/audio-recording";
  import { TAKE_GAIN_DB_RANGE, type MediaUsage } from "@repo/music-core/engines/media-library";
  import type { AudioTakeRow } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import * as Dialog from "@repo/ui/dialog";
  import { Slider } from "@repo/ui/slider";

  import TakeNameInput from "./TakeNameInput.svelte";

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
    onRenameTake,
    onNoteTake,
    onGainTake,
    loadTakePeaks,
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
    onRenameTake?: (take: AudioTakeRow, name: string) => void | Promise<void>;
    onNoteTake?: (take: AudioTakeRow, note: string) => void | Promise<void>;
    onGainTake?: (take: AudioTakeRow, gainDb: number) => void | Promise<void>;
    loadTakePeaks?: (takeId: string) => Promise<TakeEnvelope | undefined>;
  } = $props();

  let deleteCandidate = $state<AudioTakeRow | undefined>();
  let envelopes = $state<Record<string, TakeEnvelope>>({});
  /** The live drag position, dropped once the stored gain catches up. */
  let gainDraft = $state<number | undefined>();
  // Plain Set: it guards the fetch, it is not state the markup reads.
  const requestedPeaks = new Set<string>();

  const selectedDeviceId = $derived(recorderState.deviceId ?? devices[0]?.deviceId ?? "");
  const selected = $derived(selectedTake ?? takes[0]);
  const selectedIsPlaying = $derived(Boolean(selected && playingTakeId === selected.id));
  const canUseTake = $derived(Boolean(selected));
  const meterAdvice = $derived(levelAdvice(recorderState.peakDb ?? SILENCE_DB));
  const storedGainDb = $derived(selected?.gainDb ?? 0);
  const selectedGainDb = $derived(gainDraft ?? storedGainDb);
  const selectedPeakDb = $derived(
    selected && envelopes[selected.id]
      ? envelopes[selected.id]!.peakDb + selectedGainDb
      : undefined,
  );

  $effect(() => {
    const load = loadTakePeaks;
    if (!load) return;
    for (const take of takes) {
      if (requestedPeaks.has(take.id)) continue;
      requestedPeaks.add(take.id);
      void load(take.id)
        .then((envelope) => {
          // A take whose blob was not there yet is retried the next time the list changes.
          if (envelope) envelopes = { ...envelopes, [take.id]: envelope };
          else requestedPeaks.delete(take.id);
        })
        .catch(() => requestedPeaks.delete(take.id));
    }
  });

  /** Map a dB reading onto the meter's 0..100% width. */
  function meterWidth(db: number): number {
    return Math.min(100, Math.max(0, ((db - SILENCE_DB) / -SILENCE_DB) * 100));
  }

  function gainedPeak(peak: number, gainDb: number): number {
    return Math.min(1, peak * 10 ** (gainDb / 20));
  }

  $effect(() => {
    void selected?.id;
    void storedGainDb;
    gainDraft = undefined;
  });

  function previewGain(event: Event): void {
    gainDraft = Number((event.currentTarget as HTMLInputElement).value);
  }

  /** One write per drag: `input` only previews, `change` persists. */
  function commitGain(event: Event): void {
    if (selected) onGainTake?.(selected, Number((event.currentTarget as HTMLInputElement).value));
  }

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

    {#if armed}
      {@const levelDb = recorderState.levelDb ?? SILENCE_DB}
      <div class="grid gap-1.5 rounded-xl border bg-muted/20 p-3">
        <div
          class="relative h-3 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label="Input level"
          aria-valuemin={SILENCE_DB}
          aria-valuemax={0}
          aria-valuenow={Math.round(levelDb)}
          aria-valuetext={meterAdvice.sentence}
        >
          <span
            class={[
              "absolute inset-y-0 left-0 rounded-full transition-[width]",
              meterAdvice.tone === "clipping"
                ? "bg-destructive"
                : meterAdvice.tone === "hot"
                  ? "bg-warn"
                  : meterAdvice.tone === "good"
                    ? "bg-success"
                    : "bg-muted-foreground",
            ]}
            style:width={`${meterWidth(levelDb)}%`}
          ></span>
          <span
            class="absolute inset-y-0 w-0.5 bg-foreground"
            style:left={`${meterWidth(recorderState.peakDb ?? SILENCE_DB)}%`}
            aria-hidden="true"
          ></span>
        </div>
        <!-- Not a live region: the route owns announcements and this text changes constantly. -->
        <p class="text-xs text-muted-foreground">{meterAdvice.sentence}</p>
      </div>
    {/if}

    <!-- Not a live region: the route owns announcements, and it renders this
         same message in the one region it owns. -->
    {#if recorderState.message}
      <p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
          {@const envelope = envelopes[take.id]}
          {@const takeGainDb = take.gainDb ?? 0}
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
              aria-pressed={playing}
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
            <div class="grid min-w-0 flex-1 gap-1 py-2">
              <TakeNameInput
                value={take.name}
                label={`Take name for ${take.name}`}
                onCommit={(name) => void onRenameTake?.(take, name)}
              />
              <button
                type="button"
                class="grid min-w-0 gap-1 rounded-md px-1.5 text-left hover:bg-muted/40"
                aria-label={`Select take ${take.name}`}
                onclick={() => onSelectTake?.(take)}
              >
                {#if envelope}
                  <svg
                    class="h-8 w-full rounded-md border bg-muted/30"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    role="img"
                    data-take-envelope={take.id}
                    aria-label={`Waveform of ${take.name}, peak ${formatDb(envelope.peakDb + takeGainDb)}`}
                  >
                    {#each envelope.peaks as peak, index (index)}
                      {@const level = gainedPeak(peak, takeGainDb)}
                      {@const height = Math.max(2, level * 100)}
                      <rect
                        x={(index * 100) / envelope.peaks.length}
                        y={(100 - height) / 2}
                        width={100 / envelope.peaks.length}
                        height={height}
                        class={level >= 1 ? "fill-destructive" : "fill-primary/70"}
                      />
                    {/each}
                  </svg>
                {/if}
                <span class="flex items-center justify-between gap-3">
                  <span class="text-xs text-muted-foreground">
                    <Mic class="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />Audio ·
                    {formatDuration(take.durationMs)} · {formatBytes(take.size)} · {take.instrument}
                    {#if envelope}
                      · peak {formatDb(envelope.peakDb + takeGainDb)}
                    {/if}
                  </span>
                  {#if take.backingKind}
                    <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
                      {take.backingKind}
                    </span>
                  {/if}
                </span>
              </button>
              <TakeNameInput
                value={take.note ?? ""}
                tone="note"
                placeholder="Add a note"
                label={`Note for ${take.name}`}
                onCommit={(note) => void onNoteTake?.(take, note)}
              />
            </div>
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
        Playback gain {formatDb(selectedGainDb)}
        <div class="relative">
          <Slider
            aria-hidden="true"
            value={[selectedGainDb]}
            min={TAKE_GAIN_DB_RANGE.min}
            max={TAKE_GAIN_DB_RANGE.max}
            step={1}
          />
          <input
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            type="range"
            min={TAKE_GAIN_DB_RANGE.min}
            max={TAKE_GAIN_DB_RANGE.max}
            step="1"
            value={selectedGainDb}
            disabled={!canUseTake}
            aria-label="Take gain"
            oninput={previewGain}
            onchange={commitGain}
          />
        </div>
      </label>
      {#if selectedPeakDb !== undefined}
        <p
          class={[
            "text-xs normal-case tracking-normal",
            selectedPeakDb >= 0 ? "font-semibold text-destructive" : "text-muted-foreground",
          ]}
        >
          {selectedPeakDb >= 0
            ? `peak ${formatDb(selectedPeakDb)}, clipping. The recording is untouched: lower the gain to hear it clean`
            : `peak ${formatDb(selectedPeakDb)} with this gain. The recording itself is untouched`}
        </p>
      {/if}

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
