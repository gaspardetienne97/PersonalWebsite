<script lang="ts">
  import { page } from "$app/state";
  import { db } from "#lib/music/runtime/index.ts";
  import { btnPrimary } from "#lib/music/components/ui.ts";
  import Studio from "#lib/music/drills/studio/Studio.svelte";
  import type { Song } from "#lib/music/hubs/library/songs.ts";

  let song = $state.raw<Song | null | undefined>(undefined);
  $effect(() => {
    const id = page.params.id!;
    void db.songs.get(id).then((row) => {
      if (page.params.id === id) song = (row as unknown as Song) ?? null;
    });
  });
</script>

<svelte:head><title>{song ? song.title : "Song Studio"} | Woodshed</title></svelte:head>

{#if song}
  {#key song.id}<Studio {song} />{/key}
{:else if song === null}
  <div class="mx-auto flex max-w-3xl flex-col items-start gap-3">
    <h1 class="font-display text-4xl font-semibold tracking-tight">Song not found</h1>
    <p class="text-ws-soft">This song isn't saved in this browser. It may have been imported somewhere else.</p>
    <a class={btnPrimary} href="/music/library">Open your songs</a>
  </div>
{:else}
  <p class="text-ws-soft">Opening the song.</p>
{/if}
