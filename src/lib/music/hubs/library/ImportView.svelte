<script lang="ts">
  // Import a score (MIDI, MusicXML, .mxl), or turn a recording or a MIDI take
  // into a draft fixed in the piano roll (TranscribeView), and save it.
  import Upload from "lucide-svelte/icons/upload";
  import type { Score } from "@repo/music-core";
  import { page } from "$app/state";
  import TranscribeView from "./TranscribeView.svelte";
  import Staff from "$lib/music/notation/Staff.svelte";
  import { btn, btnPrimary, panel } from "$lib/music/components/ui";
  import { db } from "$lib/music/runtime";
  import RollThumb from "./RollThumb.svelte";
  import {
    SCORE_ACCEPT,
    barsText,
    durationText,
    importScoreFile,
    rangeText,
    scoreFacts,
    songFromScore,
    type Song,
  } from "./songs";

  let { onstatus }: { onstatus?: (s: string) => void } = $props();

  // Record links here with ?from=audio|take&take=<id> to start from one of its takes.
  const from = page.url.searchParams.get("from");
  const start = page.url.searchParams.get("take");
  // The Paths tab links here with ?shelf=<path>/<song>&for=<title>: the saved song counts on that shelf.
  const shelf = page.url.searchParams.get("shelf") ?? undefined;
  const shelfFor = page.url.searchParams.get("for");
  let mode = $state<"score" | "audio" | "take">(from === "audio" || from === "take" ? from : "score");
  let error = $state("");
  let busy = $state(false);
  let dragging = $state(false);
  let preview = $state.raw<{ score: Score; file: string } | null>(null);
  let title = $state("");
  let composer = $state("");
  let saved = $state.raw<Song | null>(null);

  function fail(msg: string) {
    error = msg;
    onstatus?.(msg);
  }

  async function takeScore(file: File | undefined) {
    if (!file) return;
    error = "";
    saved = null;
    busy = true;
    try {
      const score = await importScoreFile(file.name, new Uint8Array(await file.arrayBuffer()));
      preview = { score, file: file.name };
      title = score.title;
      composer = score.composer ?? "";
      onstatus?.(`Read ${file.name}: ${scoreFacts(score).notes} notes. Check the preview, then save.`);
    } catch (e) {
      preview = null;
      fail((e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function save(score: Score, meta: { composer?: string; source?: string }) {
    const song = { ...songFromScore(score, meta), ...(shelf ? { shelf } : {}) };
    await db.songs.put(song);
    saved = song;
    onstatus?.(`Saved ${song.title} to your songs.`);
  }

  async function saveImport() {
    if (!preview) return;
    await save({ ...preview.score, title: title.trim() || preview.score.title, composer: composer.trim() || undefined }, { composer: composer.trim(), source: preview.file });
    preview = null;
  }

  function drop(e: DragEvent, handle: (f: File | undefined) => void) {
    e.preventDefault();
    dragging = false;
    handle(e.dataTransfer?.files[0]);
  }

</script>

<div class="flex flex-col gap-5">
  {#if shelf}
    <p class="rounded-2xl border border-ws-line bg-ws-surface px-4 py-3 text-sm">
      Importing for the path song <strong>{shelfFor ?? shelf}</strong>. Its performances in the Song editor count on that level's shelf.
    </p>
  {/if}
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex rounded-full border border-ws-line bg-ws-surface p-1" role="group" aria-label="What to import">
      <!-- Short labels on the buttons; the full name (which contains them) is read out. -->
      {#each [["score", "File", undefined], ["audio", "Audio", "Transcribe audio"], ["take", "MIDI take", "From a MIDI take"]] as const as [id, label, name] (id)}
        <button
          type="button"
          class="min-h-11 rounded-full px-4 text-sm font-medium {mode === id ? 'bg-ws-ink text-ws-bg' : 'text-ws-soft hover:text-ws-ink'}"
          aria-pressed={mode === id}
          aria-label={name}
          onclick={() => ((mode = id), (error = ""))}>{label}</button
        >
      {/each}
    </div>
    <p class="text-sm text-ws-soft">
      {mode === "score" ? "A score you already have. MusicXML keeps the parts and bar lines as written; MIDI works too." : mode === "audio" ? "A recording becomes a draft you fix in the piano roll." : "Something you played on a MIDI keyboard becomes a draft you fix in the piano roll."}
    </p>
  </div>

  {#if saved}
    <div class="{panel} flex flex-wrap items-center gap-3">
      <p class="min-w-0 flex-1 font-medium">{saved.title} is in your songs.</p>
      <a class={btnPrimary} href="/music/songs/{saved.id}">Open in the Song editor</a>
      <a class={btn} href="?tab=songs">See all songs</a>
    </div>
  {/if}

  <div class="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
    {#if mode === "score"}
      <label
        class="drop"
        class:dragging
        ondragover={(e) => {
          e.preventDefault();
          dragging = true;
        }}
        ondragleave={() => (dragging = false)}
        ondrop={(e) => drop(e, takeScore)}
      >
        <Upload class="size-7" aria-hidden="true" />
        <span class="font-display text-lg font-semibold">{#if busy}Reading the score{:else}<span class="sm:hidden">Choose a score file</span><span class="max-sm:hidden">Drop a score here, or choose a file</span>{/if}</span>
        <span class="text-sm text-ws-soft">MusicXML (.musicxml, .xml, .mxl) or MIDI (.mid, .midi)</span>
        <span class="max-w-sm text-center text-sm">No file yet? In MuseScore or a similar notation app, open a score and choose File, Export, MusicXML.</span>
        <input class="sr-only" type="file" accept={SCORE_ACCEPT} aria-label="Score file" data-testid="score-file" onchange={(e) => takeScore(e.currentTarget.files?.[0])} />
      </label>
    {:else}
      <div class="flex min-w-0 flex-col gap-4 md:col-span-2">
        {#key mode}<TranscribeView from={mode} start={mode === from ? start : null} {onstatus} onsaved={(song) => (saved = song)} />{/key}
      </div>
    {/if}
    <div class="min-h-6">
      {#if error}
        <p role="alert" class="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium">
          <span aria-hidden="true">✕ </span>{error}
        </p>
      {/if}
    </div>
  </div>

  {#if preview && mode === "score"}
    {@const f = scoreFacts(preview.score)}
    <section class="{panel} flex flex-col gap-4" aria-labelledby="preview-h">
      <h2 id="preview-h" class="font-display text-xl font-semibold">Preview</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm"><span class="font-medium">Title</span><input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={title} /></label>
        <label class="flex flex-col gap-1 text-sm"><span class="font-medium">Composer</span><input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={composer} placeholder="Optional" /></label>
      </div>
      <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div><dt class="text-ws-soft">Tempo</dt><dd class="tnum font-semibold">{preview.score.bpm} BPM</dd></div>
        <div><dt class="text-ws-soft">Meter</dt><dd class="font-semibold">{f.meter}</dd></div>
        <div><dt class="text-ws-soft">Key</dt><dd class="font-semibold">{f.key ?? "Not marked"}</dd></div>
        <div><dt class="text-ws-soft">Length</dt><dd class="tnum font-semibold">{barsText(f.bars)}, {durationText(f.seconds)}</dd></div>
        <div><dt class="text-ws-soft">Notes</dt><dd class="tnum font-semibold">{f.notes}</dd></div>
        <div><dt class="text-ws-soft">Range</dt><dd class="font-semibold">{rangeText(f)}</dd></div>
        <div class="col-span-2"><dt class="text-ws-soft">Voices</dt><dd class="font-semibold">{preview.score.voices.map((v) => v.name).join(", ")}</dd></div>
      </dl>
      <div class="stage rounded-xl p-3"><RollThumb score={preview.score} height={80} /></div>
      <Staff score={preview.score} maxHeight="22rem" />
      <div class="flex flex-wrap gap-2">
        <button type="button" class={btnPrimary} onclick={saveImport}>Save to songs</button>
        <button type="button" class={btn} onclick={() => (preview = null)}>Discard</button>
      </div>
    </section>
  {/if}

</div>

<style>
  .drop {
    display: flex;
    min-height: 11rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 1.5rem;
    text-align: center;
    border: 2px dashed color-mix(in oklch, var(--instr-ink) 45%, transparent);
    border-radius: 1.25rem;
    background: var(--instr-wash);
    cursor: pointer;
  }
  .drop:hover,
  .drop.dragging {
    background: color-mix(in oklch, var(--instr) 26%, transparent);
  }
  .drop:focus-within {
    outline: 2px solid var(--instr-ink);
    outline-offset: 2px;
  }
</style>
