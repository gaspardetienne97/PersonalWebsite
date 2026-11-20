<script lang="ts">
  // The Song editor: fix a saved song's notes in the piano roll. Only the notes, length and
  // tempo change; parts, key and sections stay as imported.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import { m } from "@repo/i18n/messages.js";
  import { beforeNavigate } from "$app/navigation";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Plus from "@lucide/svelte/icons/plus";
  import Minus from "@lucide/svelte/icons/minus";
  import { db } from "#lib/music/runtime/index.ts";
  import { btn, btnPrimary } from "#lib/music/components/ui.ts";
  import PianoRoll from "#lib/music/hubs/create/PianoRoll.svelte";
  import { ScoreEditor } from "#lib/music/hubs/library/score-editor.svelte.ts";
  import type { Song } from "#lib/music/hubs/library/songs.ts";

  let song = $state.raw<Song | null | undefined>(undefined);
  let editor = $state.raw<ScoreEditor | null>(null);
  let status = $state("");
  let leaving = $state(false);

  $effect(() => {
    const id = page.params.id!;
    void db.songs.get(id).then((row) => {
      if (page.params.id !== id) return;
      song = row as unknown as Song ?? null;
      editor = song ? new ScoreEditor(song.score) : null;
    });
  });
  onDestroy(() => editor?.stop());

  // Leaving with unsaved edits asks once.
  beforeNavigate((nav) => {
    if (nav.shallow && nav.type === 'goto') return;
    if (!editor?.changed || leaving) return;
    nav.cancel();
    leaving = true;
    status = m.music_runtime_songs_edit_unsaved_leave();
  });

  async function save() {
    if (!song || !editor) return;
    editor.stop();
    const next: Song = { ...song, title: editor.doc.title || song.title, score: editor.toScore(), updatedAt: Date.now() };
    await db.songs.put($state.snapshot(next) as Song);
    song = next;
    editor = new ScoreEditor(next.score);
    leaving = false;
    status = m.music_runtime_songs_edit_saved({ title: next.title, count: editor.noteCount });
  }

  const field = "min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm";
</script>

<svelte:head><title>{song ? m.music_runtime_songs_edit_head_title({ title: song.title }) : m.music_runtime_songs_edit_head_title_plain()}</title></svelte:head>

{#if song && editor}
  {@const e = editor}
  <div class="mx-auto flex max-w-6xl flex-col gap-4">
    <header class="min-w-0">
      <a class="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-instr-ink hover:bg-instr-wash" href="/music/songs/{song.id}"><ArrowLeft class="size-4" aria-hidden="true" />{m.music_runtime_songs_edit_back()}</a>
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{m.music_runtime_songs_edit_title()}</h1>
      <p class="mt-1 max-w-prose text-ws-soft">{m.music_runtime_songs_edit_intro({ title: song.title })}</p>
    </header>
    <div class="flex flex-wrap items-end gap-3 rounded-2xl border border-ws-line bg-ws-surface p-3">
      <label class="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
        <span class="font-medium">{m.music_runtime_songs_edit_field_title()}</span>

        <input
          class={field}
          value={e.doc.title}
          onchange={(ev) => e.doc = { ...e.doc, title: ev.currentTarget.value }}
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">{m.music_runtime_songs_edit_tempo()}</span>

        <input
          class="{field} tnum w-24"
          type="number"
          min="20"
          max="300"
          value={e.doc.bpm}
          onchange={(ev) => e.doc = {
            ...e.doc,
            bpm: Math.min(300, Math.max(20, Math.round(ev.currentTarget.valueAsNumber) || e.doc.bpm))
          }}
        />
      </label>
      <div class="flex items-center gap-1 text-sm" role="group" aria-label={m.music_runtime_songs_edit_length()}>
        <button type="button" class="{btn} w-11 px-0" aria-label={m.music_runtime_songs_edit_remove_bar()} disabled={e.doc.lengthBeats <= e.barBeats} onclick={() => e.setBars(e.doc.lengthBeats / e.barBeats - 1)}><Minus class="size-4" aria-hidden="true" /></button>
        <span class="tnum w-16 text-center font-medium">{m.music_runtime_songs_edit_bars({ count: Math.round(e.doc.lengthBeats / e.barBeats) })}</span>
        <button type="button" class="{btn} w-11 px-0" aria-label={m.music_runtime_songs_edit_add_bar()} onclick={() => e.setBars(e.doc.lengthBeats / e.barBeats + 1)}><Plus class="size-4" aria-hidden="true" /></button>
      </div>
      <span class="text-sm text-ws-soft" data-save-state>{e.changed ? m.music_runtime_songs_edit_unsaved() : m.music_runtime_songs_edit_saved_state()}</span>
      <button type="button" class={btnPrimary} disabled={!e.changed} onclick={save}>{m.music_runtime_songs_edit_save()}</button>
    </div>
    <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
    <PianoRoll host={e} announce={(msg) => status = msg} noun="parts" />
  </div>
{:else if song === null}
  <div class="mx-auto flex max-w-3xl flex-col items-start gap-3">
    <h1 class="font-display text-4xl font-semibold tracking-tight">{m.music_runtime_songs_not_found()}</h1>
    <a class={btnPrimary} href="/music/studio">{m.music_runtime_songs_open_yours()}</a>
  </div>
{:else}
  <p class="text-ws-soft">{m.music_runtime_songs_opening()}</p>
{/if}
