<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";

  import { scorePlaybackPattern, SongLibrary } from "@repo/music-core/engines/song-library";
  import { PracticeStore, type SongRow } from "@repo/music-core/engines/store";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Empty } from "@repo/ui/empty";
  import { Skeleton } from "@repo/ui/skeleton";

  import SectionHeading from "../../_components/SectionHeading.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  interface SongLibraryLike {
    list(): Promise<SongRow[]>;
    get(id: string): Promise<SongRow | undefined>;
  }

  const {
    runtime = useMusicRuntime(),
    library = browser ? new SongLibrary(new PracticeStore()) : undefined,
  }: {
    runtime?: MusicRuntime;
    library?: SongLibraryLike;
  } = $props();

  let songs = $state<SongRow[]>([]);
  let selectedId = $state("");
  let status = $state("Loading repertoire.");
  let loading = $state(true);
  let practicing = $state(false);
  let previewPlaying = $state(false);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let previewGeneration = 0;

  const selected = $derived(songs.find((song) => song.id === selectedId) ?? songs[0]);
  const selectedScore = $derived(selected?.score);
  const noteCount = $derived(selectedScore?.notes.length ?? 0);
  const durationBeats = $derived(selectedScore?.sections[0]?.endBeat ?? 0);

  onMount(() => {
    void loadSongs();
  });

  $effect(() => {
    void selectedId;
    stopPreview();
  });

  onDestroy(stopPreview);

  async function loadSongs(): Promise<void> {
    if (!library) {
      loading = false;
      status = "Song storage is unavailable.";
      return;
    }
    try {
      songs = await library.list();
      selectedId = songs[0]?.id ?? "";
      status = songs.length === 0 ? "No saved songs yet." : "Repertoire ready.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Could not load repertoire.";
    } finally {
      loading = false;
    }
  }

  async function openSong(id: string): Promise<void> {
    selectedId = id;
    if (!library) return;
    const existing = songs.find((song) => song.id === id);
    if (existing?.score) return;
    const loaded = await library.get(id);
    if (!loaded) return;
    songs = songs.map((song) => (song.id === id ? loaded : song));
  }

  async function playSelected(): Promise<void> {
    if (previewPlaying) {
      stopPreview();
      status = "Preview paused.";
      return;
    }
    const score = selectedScore;
    if (!score) return;
    const generation = ++previewGeneration;
    try {
      if (!(await runtime.ensurePlaybackVoice())) {
        if (generation === previewGeneration) status = runtime.audioMessage || "Audio could not be enabled.";
        return;
      }
      if (generation !== previewGeneration) return;
      const pattern = scorePlaybackPattern(score);
      const durationSec = pattern.reduce(
        (end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds),
        0,
      );
      runtime.sound.playPattern(pattern);
      previewPlaying = true;
      status = `Playing ${selected?.title ?? "song"}.`;
      previewTimer = setTimeout(finishPreview, Math.max(300, durationSec * 1_000));
    } catch (error) {
      if (generation !== previewGeneration) return;
      stopPreview();
      status = error instanceof Error ? error.message : "Song preview failed.";
    }
  }

  function finishPreview(): void {
    runtime.sound.stopPattern();
    previewTimer = undefined;
    previewPlaying = false;
    status = "Preview complete.";
  }

  function stopPreview(): void {
    previewGeneration += 1;
    if (previewTimer !== undefined) clearTimeout(previewTimer);
    previewTimer = undefined;
    runtime.sound.stopPattern();
    previewPlaying = false;
  }

  async function logPractice(): Promise<void> {
    if (!selected || practicing) return;
    practicing = true;
    try {
      await runtime.recordPractice({
        source: "song",
        tags: ["song", selected.id],
        xpEarned: 10,
        note: `Song practice · ${selected.title}`,
      });
      status = "Song practice logged.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Could not log song practice.";
    } finally {
      practicing = false;
    }
  }
</script>


<div class="grid min-w-0 gap-6">
  <SectionHeading title="Song Library" description="Saved repertoire from imported MIDI files. Reopen, replay, and log song practice." />

  <section class="grid min-w-0 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
    <Card.Root class="min-w-0">
      <Card.Header>
        <Card.Description>Repertoire</Card.Description>
        <Card.Title>{songs.length} saved song{songs.length === 1 ? "" : "s"}</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-2">
        {#if loading}
          {#each [0, 1, 2, 3] as i (i)}
            <Skeleton class="h-14 w-full" />
          {/each}
        {:else if songs.length === 0}
          <Empty
            title="No saved songs yet"
            description="Import a MIDI file, then save it to your repertoire."
          >
            {#snippet icon()}<ListMusic aria-hidden="true" />{/snippet}
            <Button href="/music/library?tab=import" variant="outline">Import a song</Button>
          </Empty>
        {:else}
          {#each songs as song (song.id)}
            <button
              type="button"
              aria-label={`Open ${song.title}`}
              class={[
                "min-w-0 rounded-md border p-3 text-left transition-colors hover:bg-muted",
                song.id === selected?.id && "border-primary/60 bg-primary/5",
              ]}
              onclick={() => void openSong(song.id)}
            >
              <span class="block truncate font-medium">{song.title}</span>
              <span class="text-xs text-muted-foreground">
                {song.score?.keySignature ?? "Imported MIDI"} · {song.score?.notes.length ?? 0} notes
              </span>
            </button>
          {/each}
        {/if}
      </Card.Content>
    </Card.Root>

    <div class="min-w-0 space-y-4">
      {#if selected && selectedScore}
        <Card.Root>
          <Card.Header class="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <Card.Description>Selected song</Card.Description>
              <Card.Title class="truncate">{selected.title}</Card.Title>
            </div>
            <Badge variant="secondary">{selectedScore.origin.toUpperCase()}</Badge>
          </Card.Header>
          <Card.Content class="grid gap-3 sm:grid-cols-4">
            <div class="rounded-md border p-3">
              <p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Key</p>
              <p class="mt-1 font-bold">{selectedScore.keySignature ?? "Unknown"}</p>
            </div>
            <div class="rounded-md border p-3">
              <p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tempo</p>
              <p class="mt-1 font-bold">{Math.round(selectedScore.tempoMap[0]?.bpm ?? 120)} bpm</p>
            </div>
            <div class="rounded-md border p-3">
              <p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes</p>
              <p class="mt-1 font-bold">{noteCount} notes</p>
            </div>
            <div class="rounded-md border p-3">
              <p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Length</p>
              <p class="mt-1 font-bold">{durationBeats.toFixed(1)} beats</p>
            </div>
          </Card.Content>
          <Card.Footer class="flex-wrap gap-2">
            <Button href={`/music/songs/${selected.id}`} variant="outline">
              Open Song Studio
            </Button>
            <Button onclick={playSelected}>
              {#if previewPlaying}
                <Pause class="size-4" aria-hidden="true" />Pause preview
              {:else}
                <Play class="size-4" aria-hidden="true" />Play preview
              {/if}
            </Button>
            <Button variant="outline" disabled={practicing} onclick={logPractice}>
              <ListMusic class="size-4" aria-hidden="true" />
              {practicing ? "Logging..." : "Log practice"}
            </Button>
          </Card.Footer>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Description>Voices</Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-2">
            {#each selectedScore.voices as voice (voice.id)}
              <div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span class="truncate font-medium">{voice.name}</span>
                <span class="text-muted-foreground">{voice.role}</span>
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {:else}
        <Card.Root>
          <Card.Content class="grid justify-items-center gap-3 py-10 text-center">
            <ListMusic class="size-8 text-muted-foreground" aria-hidden="true" />
            <p class="font-semibold">No song selected</p>
            <p class="max-w-md text-sm text-muted-foreground">{status}</p>
          </Card.Content>
        </Card.Root>
      {/if}

      <p class="text-sm text-muted-foreground" role="status">{status}</p>
    </div>
  </section>
</div>
