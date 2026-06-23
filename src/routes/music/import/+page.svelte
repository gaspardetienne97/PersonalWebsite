<script lang="ts">
  import { browser } from "$app/environment";
  import Upload from "lucide-svelte/icons/upload";

  import {
    parseMidiFile,
    pianoRoll,
    type ImportedNote,
    type ImportedSong,
  } from "@repo/music-core/engines/import";
  import { SongLibrary } from "@repo/music-core/engines/song-library";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { onDestroy } from "svelte";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";

  interface SongSaver {
    saveImportedSong(song: ImportedSong): Promise<{ id: string; title: string }>;
  }

  const {
    runtime = useMusicRuntime(),
    library = browser ? new SongLibrary(new PracticeStore()) : undefined,
  }: {
    runtime?: MusicRuntime;
    library?: SongSaver;
  } = $props();

  const PROJECTIONS = [
    { value: "piano", label: "Piano" },
    { value: "guitar", label: "Guitar" },
    { value: "wind", label: "Wind" },
    { value: "drums", label: "Drums" },
  ];

  let song = $state<ImportedSong | undefined>();
  let status = $state("Drop a MIDI file, or browse to import one.");
  let projection = $state("piano");
  let saving = $state(false);
  let savedSongId = $state<string | undefined>();
  let fileInput: HTMLInputElement;

  const roll = $derived(song ? pianoRoll(song, 600) : []);
  const rollBounds = $derived(computeBounds(roll));

  // The transport Play button plays the imported file (first bars).
  $effect(() => {
    if (!song) {
      runtime.setPlaybackSource(undefined);
      return;
    }
    const steps = pianoRoll(song, 200).map((note) => ({
      midiNotes: [note.midi],
      offsetSeconds: note.time,
      durationSeconds: Math.min(note.duration, 1),
    }));
    runtime.setPlaybackSource({
      label: song.name,
      durationSec: Math.min(song.durationSec, 20),
      play: () => runtime.sound.playPattern(steps),
    });
  });

  onDestroy(() => runtime.setPlaybackSource(undefined));

  function computeBounds(notes: ImportedNote[]) {
    if (notes.length === 0) return { minMidi: 48, maxMidi: 84, duration: 1 };
    const midis = notes.map((note) => note.midi);
    const end = Math.max(...notes.map((note) => note.time + note.duration));
    return {
      minMidi: Math.min(...midis) - 1,
      maxMidi: Math.max(...midis) + 1,
      duration: end || 1,
    };
  }

  async function importFile(file: File): Promise<void> {
    status = `Parsing ${file.name}…`;
    try {
      const buffer = await file.arrayBuffer();
      song = parseMidiFile(buffer, file.name.replace(/\.midi?$/i, ""));
      savedSongId = undefined;
      status = `Imported "${song.name}" in ${song.totalNotes > 0 ? "a moment" : "no time"}.`;
    } catch (error) {
      song = undefined;
      status = error instanceof Error ? `Could not parse that file: ${error.message}` : "Import failed.";
    }
  }

  function onFiles(files: FileList | null): void {
    const file = files?.[0];
    if (file) void importFile(file);
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    onFiles(event.dataTransfer?.files ?? null);
  }

  async function saveToRepertoire(): Promise<void> {
    if (!song || !library || saving) return;
    saving = true;
    try {
      const saved = await library.saveImportedSong(song);
      savedSongId = saved.id;
      status = "Saved to repertoire.";
    } catch (error) {
      status = error instanceof Error ? `Could not save song: ${error.message}` : "Could not save song.";
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Import & Play | Musicianship OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Import & Play-Along"
    subtitle="Drop a MIDI file — we detect key, tempo, and notes, then project them onto your instrument."
  />

  <!-- Drop zone -->
  <button
    type="button"
    class="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-card p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
    ondragover={(event) => event.preventDefault()}
    ondrop={onDrop}
    onclick={() => fileInput.click()}
  >
    <span class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
      <Upload class="size-5" aria-hidden="true" />
    </span>
    <span class="font-semibold">Drop a MIDI file, or browse</span>
    <span class="text-sm text-muted-foreground">.mid / .midi · parsed locally, never uploaded</span>
  </button>
  <input
    bind:this={fileInput}
    type="file"
    accept=".mid,.midi,audio/midi"
    class="hidden"
    aria-label="MIDI file"
    onchange={(event) => onFiles(event.currentTarget.files)}
  />

  <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>

  {#if song}
    <!-- Parsed summary -->
    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-2">
        <Card.Title class="truncate">{song.name}</Card.Title>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <span class="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
            Analysis complete
          </span>
          <Button size="sm" disabled={!library || saving} onclick={saveToRepertoire}>
            {saving ? "Saving..." : "Save to repertoire"}
          </Button>
          {#if savedSongId}
            <Button size="sm" variant="outline" href="/music/songs">Open songs</Button>
          {/if}
        </div>
      </Card.Header>
      <Card.Content class="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {#each [["Key", song.keyEstimate ?? "—"], ["Tempo", `${Math.round(song.bpm)} bpm`], ["Time", song.timeSignature.join(" / ")], ["Notes", String(song.totalNotes)], ["Length", `${song.durationSec.toFixed(1)}s`]] as [label, value]}
          <div class="rounded-xl border p-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
            <div class="mt-1 text-lg font-bold tabular-nums">{value}</div>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>

    <!-- Projection + piano roll -->
    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-2">
        <Card.Description>Projection</Card.Description>
        <SegmentedControl size="sm" options={PROJECTIONS} value={projection} onChange={(value) => (projection = value)} />
      </Card.Header>
      <Card.Content>
        <div class="overflow-hidden rounded-xl border bg-muted/30">
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            class="h-44 w-full"
            role="img"
            aria-label="Piano roll preview"
          >
            {#each roll as note}
              {@const x = (note.time / rollBounds.duration) * 100}
              {@const w = Math.max((note.duration / rollBounds.duration) * 100, 0.4)}
              {@const y =
                40 -
                ((note.midi - rollBounds.minMidi) / (rollBounds.maxMidi - rollBounds.minMidi || 1)) * 40}
              <rect {x} y={y - 0.6} width={w} height="1.2" rx="0.3" class="fill-primary" opacity={0.35 + note.velocity * 0.55} />
            {/each}
          </svg>
        </div>
        <p class="mt-3 text-sm text-muted-foreground">
          {#if projection === "drums"}
            Percussion tracks map onto the MPC pad grid for play-along.
          {:else if projection === "guitar"}
            Melody projects to single-note tab; chords to shapes (tab rendering is a Phase 3 add).
          {:else if projection === "wind"}
            The melody line only — winds are monophonic — transposed into range.
          {:else}
            Full two-hand piano roll across {song.tracks.length} track{song.tracks.length === 1 ? "" : "s"}.
          {/if}
        </p>
      </Card.Content>
    </Card.Root>

    <!-- Tracks -->
    <Card.Root>
      <Card.Header><Card.Description>Tracks</Card.Description></Card.Header>
      <Card.Content class="grid gap-2">
        {#each song.tracks as track}
          <div class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span class="truncate font-medium">{track.name}</span>
            <span class="text-muted-foreground tabular-nums">{track.notes.length} notes</span>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}
</PracticeScreen>
