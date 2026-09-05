<script lang="ts">
  import { browser } from "$app/environment";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Upload from "lucide-svelte/icons/upload";

  import {
    parseMidiFile,
    pianoRoll,
    type ImportedNote,
    type ImportedSong,
  } from "@repo/music-core/engines/import";
  import type { Score } from "@repo/music-core/domain";
  import {
    extractCompressedMusicXml,
    parseMusicXmlScore,
  } from "@repo/music-core/engines/score-import";
  import { SongLibrary } from "@repo/music-core/engines/song-library";
  import { scoreToPattern, type SoundPatternStep } from "@repo/music-core/engines/sound";
  import {
    PracticeStore,
    type SongSource,
  } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { onDestroy } from "svelte";

  import SectionHeading from "../../_components/SectionHeading.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  interface SongSaver {
    saveImportedSong(song: ImportedSong): Promise<{ id: string; title: string }>;
    saveScore?(
      score: Score,
      source?: SongSource,
    ): Promise<{ id: string; title: string }>;
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
  let musicXmlScore = $state.raw<Score>();
  let musicXmlSource = "";
  let status = $state("Drop a MIDI file, or browse to import one.");
  let projection = $state("piano");
  let saving = $state(false);
  let savedSongId = $state<string | undefined>();
  let previewPlaying = $state(false);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let previewGeneration = 0;
  let fileInput: HTMLInputElement;

  const roll = $derived(song ? pianoRoll(song, 600) : []);
  const rollBounds = $derived(computeBounds(roll));

  onDestroy(stopPreview);

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
    stopPreview();
    status = `Parsing ${file.name}…`;
    try {
      const fallbackName = file.name.replace(/\.(midi?|musicxml|mxl|xml)$/i, "");
      if (/\.(musicxml|mxl|xml)$/i.test(file.name)) {
        const xml = /\.mxl$/i.test(file.name)
          ? await extractCompressedMusicXml(await file.arrayBuffer())
          : await file.text();
        musicXmlScore = parseMusicXmlScore(xml, {
          id: "musicxml-preview",
          fallbackName,
        });
        musicXmlSource = xml;
        song = undefined;
      } else {
        const buffer = await file.arrayBuffer();
        song = parseMidiFile(buffer, fallbackName);
        musicXmlScore = undefined;
        musicXmlSource = "";
      }
      savedSongId = undefined;
      const importedName = musicXmlScore?.title ?? song?.name ?? fallbackName;
      status = `Imported "${importedName}".`;
    } catch (error) {
      song = undefined;
      musicXmlScore = undefined;
      musicXmlSource = "";
      status = error instanceof Error ? `Could not parse that file: ${error.message}` : "Import failed.";
    }
  }

  function previewPattern(): { steps: SoundPatternStep[]; durationSec: number } | undefined {
    if (musicXmlScore) return scoreToPattern(musicXmlScore);
    if (!song) return undefined;
    const steps = pianoRoll(song, 200)
      .filter((note) => note.time < 20)
      .map((note) => ({
        midiNotes: [note.midi],
        offsetSeconds: note.time,
        durationSeconds: Math.min(note.duration, 1),
      }));
    const durationSec = steps.reduce(
      (end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds),
      0,
    );
    return { steps, durationSec };
  }

  async function togglePreview(): Promise<void> {
    if (previewPlaying) {
      stopPreview();
      status = "Preview paused.";
      return;
    }
    const pattern = previewPattern();
    if (!pattern || pattern.steps.length === 0) return;
    const generation = ++previewGeneration;
    try {
      if (!(await runtime.ensurePlaybackVoice())) {
        if (generation === previewGeneration) status = runtime.audioMessage || "Audio could not be enabled.";
        return;
      }
      if (generation !== previewGeneration) return;
      runtime.sound.playPattern(pattern.steps);
      previewPlaying = true;
      status = "Playing imported score preview.";
      previewTimer = setTimeout(finishPreview, Math.max(300, pattern.durationSec * 1_000));
    } catch (error) {
      if (generation !== previewGeneration) return;
      stopPreview();
      status = error instanceof Error ? error.message : "Imported score preview failed.";
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

  function onFiles(files: FileList | null): void {
    const file = files?.[0];
    if (file) void importFile(file);
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    onFiles(event.dataTransfer?.files ?? null);
  }

  async function saveToRepertoire(): Promise<void> {
    if ((!song && !musicXmlScore) || !library || saving) return;
    saving = true;
    try {
      const saved =
        musicXmlScore && musicXmlSource && library.saveScore
          ? await library.saveScore(musicXmlScore, {
              format: "musicxml",
              content: musicXmlSource,
            })
          : song
            ? await library.saveImportedSong(song)
            : undefined;
      if (!saved) throw new Error("MusicXML saving is unavailable.");
      savedSongId = saved.id;
      status = "Saved to repertoire.";
    } catch (error) {
      status = error instanceof Error ? `Could not save song: ${error.message}` : "Could not save song.";
    } finally {
      saving = false;
    }
  }
</script>


<div class="grid min-w-0 gap-6">
  <SectionHeading title="Import & Play-Along" description="Import MIDI or MusicXML locally, then save the canonical score to your repertoire." />

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
    <span class="font-semibold">Drop a score file, or browse</span>
    <span class="text-sm text-muted-foreground"
      >.mid / .midi / .musicxml / .mxl / .xml · parsed locally, never uploaded</span
    >
  </button>
  <input
    bind:this={fileInput}
    type="file"
    accept=".mid,.midi,.musicxml,.mxl,.xml,audio/midi,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
    class="hidden"
    aria-label="Score file"
    onchange={(event) => onFiles(event.currentTarget.files)}
  />

  <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>

  {#if musicXmlScore}
    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-2">
        <div>
          <Card.Description>MusicXML</Card.Description>
          <Card.Title class="truncate">{musicXmlScore.title ?? "Untitled"}</Card.Title>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <span class="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
            Analysis complete
          </span>
          <Button size="sm" variant="outline" onclick={() => void togglePreview()}>
            {#if previewPlaying}
              <Pause class="size-4" aria-hidden="true" />Pause
            {:else}
              <Play class="size-4" aria-hidden="true" />Play
            {/if}
          </Button>
          <Button
            size="sm"
            disabled={!library?.saveScore || saving}
            onclick={saveToRepertoire}
          >
            {saving ? "Saving..." : "Save to repertoire"}
          </Button>
          {#if savedSongId}
            <Button size="sm" variant="outline" href="/music/library?tab=songs">Open songs</Button>
          {/if}
        </div>
      </Card.Header>
      <Card.Content class="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {#each [
          ["Key", musicXmlScore.keySignature ?? "—"],
          ["Tempo", `${Math.round(musicXmlScore.tempoMap[0]?.bpm ?? 120)} bpm`],
          [
            "Time",
            `${musicXmlScore.timeSignatures[0]?.numerator ?? 4} / ${musicXmlScore.timeSignatures[0]?.denominator ?? 4}`,
          ],
          ["Notes", String(musicXmlScore.notes.length)],
          ["Parts", String(musicXmlScore.voices.length)],
        ] as [label, value]}
          <div class="rounded-xl border p-3">
            <div class="eyebrow">
              {label}
            </div>
            <div class="mt-1 text-lg font-bold tabular-nums">{value}</div>
          </div>
        {/each}
        <p class="col-span-full text-sm text-muted-foreground">
          Save this score, then open Song Studio for full MusicXML engraving and follow-along.
        </p>
      </Card.Content>
    </Card.Root>
  {/if}

  {#if song}
    <!-- Parsed summary -->
    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-2">
        <Card.Title class="truncate">{song.name}</Card.Title>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <span class="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
            Analysis complete
          </span>
          <Button size="sm" variant="outline" onclick={() => void togglePreview()}>
            {#if previewPlaying}
              <Pause class="size-4" aria-hidden="true" />Pause
            {:else}
              <Play class="size-4" aria-hidden="true" />Play
            {/if}
          </Button>
          <Button size="sm" disabled={!library || saving} onclick={saveToRepertoire}>
            {saving ? "Saving..." : "Save to repertoire"}
          </Button>
          {#if savedSongId}
            <Button size="sm" variant="outline" href="/music/library?tab=songs">Open songs</Button>
          {/if}
        </div>
      </Card.Header>
      <Card.Content class="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {#each [["Key", song.keyEstimate ?? "—"], ["Tempo", `${Math.round(song.bpm)} bpm`], ["Time", song.timeSignature.join(" / ")], ["Notes", String(song.totalNotes)], ["Length", `${song.durationSec.toFixed(1)}s`]] as [label, value]}
          <div class="rounded-xl border p-3">
            <div class="eyebrow">{label}</div>
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
</div>
