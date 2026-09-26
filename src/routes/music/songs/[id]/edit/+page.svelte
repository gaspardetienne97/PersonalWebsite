<script lang="ts">
  // Fix a saved song's notes in the piano roll. Only the notes, length and
  // tempo change; parts, key and sections stay as imported.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import { beforeNavigate } from "$app/navigation";
  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import Plus from "lucide-svelte/icons/plus";
  import Minus from "lucide-svelte/icons/minus";
  import { db } from "$lib/music/runtime";
  import { btn, btnPrimary } from "$lib/music/components/ui";
  import PianoRoll from "$lib/music/hubs/create/PianoRoll.svelte";
  import { ScoreEditor } from "$lib/music/hubs/library/score-editor.svelte";
  import type { Song } from "$lib/music/hubs/library/songs";

  let song = $state.raw<Song | null | undefined>(undefined);
  let editor = $state.raw<ScoreEditor | null>(null);
  let status = $state("");
  let leaving = $state(false);

  $effect(() => {
    const id = page.params.id!;
    void db.songs.get(id).then((row) => {
      if (page.params.id !== id) return;
      song = (row as unknown as Song) ?? null;
      editor = song ? new ScoreEditor(song.score) : null;
    });
  });
  onDestroy(() => editor?.stop());

  // Leaving with unsaved edits asks once.
  beforeNavigate((nav) => {
    if (!editor?.changed || leaving) return;
    nav.cancel();
    leaving = true;
    status = "You have unsaved edits. Save them, or leave again to drop them.";
  });

  async function save() {
    if (!song || !editor) return;
    editor.stop();
    const next: Song = { ...song, title: editor.doc.title || song.title, score: editor.toScore(), updatedAt: Date.now() };
    await db.songs.put($state.snapshot(next) as Song);
    song = next;
    editor = new ScoreEditor(next.score);
    leaving = false;
    status = `Saved ${next.title}: ${editor.noteCount} notes.`;
  }

  const field = "min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm";
</script>

<svelte:head><title>{song ? `Edit ${song.title}` : "Edit notes"} | Woodshed</title></svelte:head>

{#if song && editor}
  {@const e = editor}
  <div class="mx-auto flex max-w-6xl flex-col gap-4">
    <header class="min-w-0">
      <a class="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-instr-ink hover:bg-instr-wash" href="/music/songs/{song.id}"><ArrowLeft class="size-4" aria-hidden="true" />Back to the song</a>
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Edit notes</h1>
      <p class="mt-1 max-w-prose text-ws-soft">Fix wrong notes in {song.title}. Tap a part to draw on it; the parts, key and sections stay as they were.</p>
    </header>
    <div class="flex flex-wrap items-end gap-3 rounded-2xl border border-ws-line bg-ws-surface p-3">
      <label class="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
        <span class="font-medium">Title</span>
        <input class={field} value={e.doc.title} onchange={(ev) => (e.doc = { ...e.doc, title: ev.currentTarget.value })} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Tempo (BPM)</span>
        <input class="{field} tnum w-24" type="number" min="20" max="300" value={e.doc.bpm} onchange={(ev) => (e.doc = { ...e.doc, bpm: Math.min(300, Math.max(20, Math.round(ev.currentTarget.valueAsNumber) || e.doc.bpm)) })} />
      </label>
      <div class="flex items-center gap-1 text-sm" role="group" aria-label="Length">
        <button type="button" class="{btn} w-11 px-0" aria-label="Remove the last bar" disabled={e.doc.lengthBeats <= e.barBeats} onclick={() => e.setBars(e.doc.lengthBeats / e.barBeats - 1)}><Minus class="size-4" aria-hidden="true" /></button>
        <span class="tnum w-16 text-center font-medium">{Math.round(e.doc.lengthBeats / e.barBeats)} {Math.round(e.doc.lengthBeats / e.barBeats) === 1 ? "bar" : "bars"}</span>
        <button type="button" class="{btn} w-11 px-0" aria-label="Add a bar" onclick={() => e.setBars(e.doc.lengthBeats / e.barBeats + 1)}><Plus class="size-4" aria-hidden="true" /></button>
      </div>
      <span class="text-sm text-ws-soft" data-save-state>{e.changed ? "Unsaved edits" : "Saved"}</span>
      <button type="button" class={btnPrimary} disabled={!e.changed} onclick={save}>Save changes</button>
    </div>
    <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
    <PianoRoll host={e} announce={(m) => (status = m)} noun="parts" />
  </div>
{:else if song === null}
  <div class="mx-auto flex max-w-3xl flex-col items-start gap-3">
    <h1 class="font-display text-4xl font-semibold tracking-tight">Song not found</h1>
    <a class={btnPrimary} href="/music/library">Open your songs</a>
  </div>
{:else}
  <p class="text-ws-soft">Opening the song.</p>
{/if}
