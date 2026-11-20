<script lang="ts">
  // A path's shelf song by its shelf key: opens the library copy in Song Studio, after adding the
  // downloaded score when there is none. ?bars=3-4 opens just those bars in Performance (a riff);
  // other keys are Song Studio's setup.
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { m } from "@repo/i18n/messages.js";
  import { LEARNING_PATHS, type PathId } from "@repo/music-core/progress/paths";
  import { btnPrimary } from "#lib/music/components/ui.ts";
  import { addShelfSong, shelfSong } from "#lib/music/hubs/library/songs.ts";

  const key = $derived(`${page.params.path}/${page.params.song}`);
  const entry = $derived(
    LEARNING_PATHS[page.params.path as PathId]?.levels?.flatMap((l) => l.shelf).find((s) => s.id === page.params.song),
  );
  let error = $state("");

  $effect(() => {
    const k = key;
    const meta = entry;
    void (async () => {
      try {
        const song = (await shelfSong(k)) ?? (await addShelfSong(k, meta?.title ?? page.params.song!, meta?.artist));
        // Song Studio's setup keys pass through (?mode=sight-read&tap=true); ?tempo=70 is 70% of the score's tempo.
        const q = new URLSearchParams(page.url.search);
        q.delete("bars");
        const tempo = Number(q.get("tempo"));
        q.delete("tempo");
        if (tempo > 0) q.set("bpm", String(Math.max(20, Math.round((song.score.bpm * tempo) / 100))));
        const bars = page.url.searchParams.get("bars")?.match(/^(\d+)-(\d+)$/);
        if (bars) {
          const perBar = (song.score.meter.beats * 4) / song.score.meter.beatUnit;
          if (!q.has("mode")) q.set("mode", "performance");
          q.set("range", "custom");
          q.set("rangeStart", String((Number(bars[1]) - 1) * perBar));
          q.set("rangeEnd", String(Number(bars[2]) * perBar));
        }
        await goto(`/music/songs/${song.id}${q.size ? `?${q}` : ""}`, { replace: true });
      } catch (e) {
        error = (e as Error).message;
      }
    })();
  });
</script>

<svelte:head><title>{m.music_runtime_songs_shelf_head_title({ title: entry?.title ?? m.music_runtime_songs_shelf_song() })}</title></svelte:head>

{#if error}
  <div class="mx-auto flex max-w-3xl flex-col items-start gap-3">
    <h1 class="font-display text-4xl font-semibold tracking-tight">{m.music_runtime_songs_shelf_missing({ title: entry?.title ?? m.music_runtime_songs_shelf_this_song() })}</h1>
    <p class="text-ws-soft">{m.music_runtime_songs_shelf_import_hint({ error })}</p>
    <a class={btnPrimary} href="/music/studio?tab=import&shelf={encodeURIComponent(key)}&for={encodeURIComponent(entry?.title ?? '')}">{m.music_runtime_songs_shelf_import()}</a>
  </div>
{:else}
  <p class="text-ws-soft">{entry?.title ? m.music_runtime_songs_shelf_opening({ title: entry.title }) : m.music_runtime_songs_shelf_opening_song()}</p>
{/if}
