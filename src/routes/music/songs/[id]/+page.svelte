<script lang="ts">
  import { page } from "$app/state";
  import { m } from "@repo/i18n/messages.js";
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

<svelte:head><title>{song ? m.music_runtime_songs_head_title({ title: song.title }) : m.music_runtime_songs_head_title_plain()}</title></svelte:head>

<!-- Song practice is a session screen: dark in both themes, like a drill page (woodshed.css keys the palette on
     [data-drill-page]; the class makes `dark:` variants and components' own dark rules apply in the light theme). -->
<div class="dark" data-drill-page>
{#if song}
  {#key song.id}<Studio {song} />{/key}
{:else if song === null}
  <div class="mx-auto flex max-w-3xl flex-col items-start gap-3">
    <h1 class="font-display text-4xl font-semibold tracking-tight">{m.music_runtime_songs_not_found()}</h1>
    <p class="text-ws-soft">{m.music_runtime_songs_not_here()}</p>
    <a class={btnPrimary} href="/music/studio">{m.music_runtime_songs_open_yours()}</a>
  </div>
{:else}
  <p class="text-ws-soft">{m.music_runtime_songs_opening()}</p>
{/if}
</div>
