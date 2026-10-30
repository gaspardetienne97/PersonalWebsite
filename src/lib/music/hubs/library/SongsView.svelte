<script lang="ts">
  // Saved repertoire. The most recently touched song leads, wide, as the one
  // to pick up again; the rest follow as object cards with their facts.
  import { onMount } from "svelte";
  import { db } from "$lib/music/runtime";
  import { registerSearchItems } from "$lib/music/search";
  import { btnPrimary } from "$lib/music/components/ui";
  import Play from "lucide-svelte/icons/play";
  import Trash from "lucide-svelte/icons/trash-2";
  import RollThumb from "./RollThumb.svelte";
  import { barsText, durationText, rangeText, scoreFacts, type Song } from "./songs";

  let { onstatus }: { onstatus?: (s: string) => void } = $props();
  let songs = $state.raw<Song[] | null>(null);
  /** The song whose Delete is waiting for its second tap. */
  let confirming = $state<string | null>(null);

  async function remove(song: Song) {
    if (confirming !== song.id) return void (confirming = song.id);
    confirming = null;
    await db.songs.delete(song.id);
    songs = songs!.filter((x) => x.id !== song.id);
    onstatus?.(`Deleted ${song.title}. ${songs.length ? `${songs.length} song${songs.length === 1 ? "" : "s"} left.` : "No saved songs now."}`);
  }

  onMount(async () => {
    songs = (await db.songs.orderBy("updatedAt").reverse().toArray()) as unknown as Song[];
    registerSearchItems(songs.map((s) => ({ label: s.title, href: `/music/songs/${s.id}`, hint: "Song", keywords: s.composer })));
    onstatus?.(songs.length ? `${songs.length} saved song${songs.length === 1 ? "" : "s"}.` : "No saved songs yet.");
  });

  const sourceLabel = (s: Song) =>
    s.score.source?.kind === "musicxml"
      ? "MusicXML"
      : s.score.source?.kind === "midi"
        ? "MIDI"
        : s.score.source?.kind === "transcribed"
          ? "Transcribed"
          : "Score";
</script>

{#if songs === null}
  <p class="text-ws-soft">Loading your songs.</p>
{:else if !songs.length}
  <section class="stage flex flex-col items-start gap-3 rounded-2xl p-6 sm:p-8">
    <h2 class="font-display text-2xl font-semibold">No songs yet</h2>
    <p class="max-w-prose text-ws-stage-soft">
      Bring in a MIDI file or a MusicXML score and it lands here, ready to practise in Song Studio at your own tempo.
    </p>
    <a href="?tab=import" class={btnPrimary}>Import a score</a>
  </section>
{:else}
  <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Saved songs">
    {#each songs as song, i (song.id)}
      {@const f = scoreFacts(song.score)}
      <li
        class="flex flex-col overflow-hidden rounded-2xl border border-ws-line bg-ws-surface hover:border-instr-ink focus-within:border-instr-ink {i === 0 ? 'sm:col-span-2' : ''}"
        class:lead={i === 0}
      >
        <a href="/music/songs/{song.id}" class="group flex flex-1 flex-col focus-visible:outline-offset-[-2px]">
          <div class="stage relative px-3 pb-2 pt-3">
            <RollThumb score={song.score} height={i === 0 ? 120 : 64} />
            <span class="absolute right-3 top-2 rounded-full bg-ws-stage-ink/10 px-2.5 py-0.5 text-xs text-ws-stage-soft">{sourceLabel(song)}</span>
          </div>
          <div class="flex flex-1 flex-col gap-2 p-4 pb-3">
            {#if i === 0}<p class="text-sm font-medium text-instr-ink">Pick up where you left off</p>{/if}
            <h3 id="song-{song.id}" class="font-display font-semibold leading-tight {i === 0 ? 'text-2xl' : 'text-lg'} group-hover:underline group-hover:underline-offset-4">{song.title}</h3>
            {#if song.composer}<p class="-mt-1 text-sm text-ws-soft">{song.composer}</p>{/if}
            <dl class="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 text-sm {i === 0 ? 'sm:grid-cols-4' : ''}">
              <div><dt class="text-ws-soft">Tempo</dt><dd class="tnum font-medium">{song.score.bpm} BPM</dd></div>
              <div><dt class="text-ws-soft">Length</dt><dd class="tnum font-medium">{barsText(f.bars)}, {durationText(f.seconds)}</dd></div>
              <div><dt class="text-ws-soft">{f.key ? "Key and meter" : "Meter"}</dt><dd class="font-medium">{f.key ? `${f.key}, ` : ""}{f.meter}</dd></div>
              <div><dt class="text-ws-soft">Notes</dt><dd class="tnum font-medium">{f.notes} in {f.voices} voice{f.voices === 1 ? "" : "s"}, {rangeText(f)}</dd></div>
            </dl>
          </div>
        </a>
        <!-- Outside the cover's link: the action first, Delete small and apart. -->
        <div class="flex items-center justify-between gap-2 border-t border-ws-line px-3 py-2">
          <a href="/music/songs/{song.id}" aria-describedby="song-{song.id}" class="{btnPrimary} min-h-11 px-4"><Play class="size-4 fill-current" aria-hidden="true" />Practise</a>
          <button
            type="button"
            class="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold {confirming === song.id ? 'bg-destructive text-white' : 'text-ws-soft hover:bg-ws-raised hover:text-destructive'}"
            aria-label={confirming === song.id ? `Delete ${song.title}? Tap again to delete` : `Delete ${song.title}`}
            onblur={() => confirming === song.id && (confirming = null)}
            onclick={() => remove(song)}
          >
            <Trash class="size-4" aria-hidden="true" />{#if confirming === song.id}Delete?{/if}
          </button>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .lead .stage {
    background:
      radial-gradient(90% 120% at 15% 0%, color-mix(in oklch, var(--instr) 28%, transparent), transparent 65%),
      var(--ws-stage);
  }
</style>
