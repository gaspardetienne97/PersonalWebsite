<script lang="ts">
  import Download from "lucide-svelte/icons/download";
  import Music2 from "lucide-svelte/icons/music-2";
  import Play from "lucide-svelte/icons/play";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import Trash2 from "lucide-svelte/icons/trash-2";

  import { buildTakeDensity, type Take } from "@repo/music-core/engines/recording";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  let {
    takes = [],
    selectedTake,
    title = "MIDI takes",
    description = "Review note density, range, and duration from MIDI or on-screen takes.",
    emptyLabel = "Recorded MIDI takes will appear here.",
    onSelectTake,
    onPlayTake,
    onDownloadTake,
    onDeleteTake,
    onPracticeTake,
    onOpenInPianoRoll,
  }: {
    takes?: Take[];
    selectedTake?: Take;
    title?: string;
    description?: string;
    emptyLabel?: string;
    onSelectTake?: (take: Take) => void;
    onPlayTake?: (take: Take) => void | Promise<void>;
    onDownloadTake?: (take: Take) => void | Promise<void>;
    onDeleteTake?: (take: Take) => void | Promise<void>;
    onPracticeTake?: (take: Take) => void | Promise<void>;
    onOpenInPianoRoll?: (take: Take) => void | Promise<void>;
  } = $props();

  const selected = $derived(selectedTake ?? takes[0]);
  const density = $derived(selected ? buildTakeDensity(selected, 16) : []);
  const range = $derived(selected ? pitchRange(selected) : "No range");

  function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.round(ms / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function pitchRange(take: Take): string {
    if (take.notes.length === 0) return "No range";
    const values = take.notes.map((note) => note.midi);
    const low = Math.min(...values);
    const high = Math.max(...values);
    return low === high ? midiToNote(low) : `${midiToNote(low)}-${midiToNote(high)}`;
  }
</script>

<Card.Root class="overflow-hidden">
  <Card.Header>
    <div class="flex items-start justify-between gap-4">
      <div>
        <Card.Title class="flex items-center gap-2 text-lg">
          <Music2 class="size-4 text-primary" aria-hidden="true" />
          {title}
        </Card.Title>
        <Card.Description>{description}</Card.Description>
      </div>
      <span class="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        {takes.length}
      </span>
    </div>
  </Card.Header>
  <Card.Content class="space-y-5">
    <div class="grid gap-2">
      {#if takes.length > 0}
        {#each takes as take (take.id)}
          <button
            type="button"
            class={[
              "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50",
              selected?.id === take.id ? "border-primary/40 bg-primary/5" : "bg-background",
            ]}
            aria-label={`Select MIDI take ${take.name}`}
            onclick={() => onSelectTake?.(take)}
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold">{take.name}</span>
              <span class="text-xs text-muted-foreground">
                {formatDuration(take.durationMs)} · {take.notes.length}
                {take.notes.length === 1 ? "note" : "notes"} · {take.source}
              </span>
            </span>
            <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {pitchRange(take)}
            </span>
          </button>
        {/each}
      {:else}
        <p class="rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      {/if}
    </div>

    <div class="grid gap-4 rounded-xl border bg-muted/20 p-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <div>
          <p class="text-2xl font-bold tabular-nums">{selected?.notes.length ?? 0}</p>
          <p class="text-xs text-muted-foreground">notes</p>
        </div>
        <div>
          <p class="text-2xl font-bold tabular-nums">{selected ? formatDuration(selected.durationMs) : "0:00"}</p>
          <p class="text-xs text-muted-foreground">duration</p>
        </div>
        <div>
          <p class="text-2xl font-bold tabular-nums">{range}</p>
          <p class="text-xs text-muted-foreground">range</p>
        </div>
      </div>

      <div class="grid gap-2">
        <div class="flex items-center justify-between gap-3">
          <span class="eyebrow">Density timeline</span>
          <span class="text-xs text-muted-foreground">{selected?.name ?? "No take selected"}</span>
        </div>
        <div class="flex h-14 items-end gap-1 rounded-lg border bg-background p-2" aria-label="MIDI take density timeline">
          {#each density as bucket (bucket.index)}
            <span
              data-density-bucket={bucket.index}
              class="min-h-1 flex-1 rounded-sm bg-primary/70"
              style:height={`${Math.max(8, bucket.intensity * 100)}%`}
              aria-label={`${bucket.count} notes from ${bucket.startMs}ms to ${bucket.endMs}ms`}
            ></span>
          {/each}
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!selected} onclick={() => selected && void onPlayTake?.(selected)}>
          <Play class="size-4" aria-hidden="true" />
          Play take
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selected}
          onclick={() => selected && void onPracticeTake?.(selected)}
        >
          <RotateCcw class="size-4" aria-hidden="true" />
          Practice idea
        </Button>
        {#if onOpenInPianoRoll}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selected}
            onclick={() => selected && void onOpenInPianoRoll?.(selected)}
          >
            <Music2 class="size-4" aria-hidden="true" />
            Open in Piano Roll
          </Button>
        {/if}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selected || !onDownloadTake}
          onclick={() => selected && void onDownloadTake?.(selected)}
        >
          <Download class="size-4" aria-hidden="true" />
          Export MIDI
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!selected}
          aria-label="Delete MIDI take"
          onclick={() => selected && void onDeleteTake?.(selected)}
        >
          <Trash2 class="size-4" aria-hidden="true" />
          Delete
        </Button>
      </div>
    </div>
  </Card.Content>
</Card.Root>
