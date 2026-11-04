<script lang="ts">
  // Saved repertoire. The most recently touched song leads, wide, as the one
  // to pick up again; the rest follow as object cards with their facts.
  import { onMount } from "svelte";
  import { db, settings } from "$lib/music/runtime";
  import { practice } from "$lib/music/practice.svelte";
  import { LEARNING_PATHS, PATH_FOR_INSTRUMENT } from "@repo/music-core/progress/paths";
  import { btn } from "$lib/music/components/ui";
  import Upload from "lucide-svelte/icons/upload";
  import { registerSearchItems } from "$lib/music/search";
  import { btnPrimary } from "$lib/music/components/ui";
  import Play from "lucide-svelte/icons/play";
  import Trash from "lucide-svelte/icons/trash-2";
  import Dots from "lucide-svelte/icons/ellipsis";
  import * as Menu from "@repo/ui/dropdown-menu";
  import RollThumb from "./RollThumb.svelte";
  import type { Score } from "@repo/music-core";
  import { barsText, durationText, plainTeaches, rangeText, scoreFacts, shelfScore, shelfTags, songHistory, type Song } from "./songs";

  let { onstatus }: { onstatus?: (s: string) => void } = $props();
  let songs = $state.raw<Song[] | null>(null);
  /** The song whose Delete is waiting for its second tap. */
  let confirming = $state<string | null>(null);

  async function remove(song: Song, e?: Event) {
    if (confirming !== song.id) {
      e?.preventDefault(); // keep the menu open for the second tap
      return void (confirming = song.id);
    }
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

  // Starter songs: the shelf of the strip instrument's path, only scores this server has
  // downloaded (fetched when opened, never bundled), not already in your songs.
  let downloaded = $state<Set<string> | null>(null);
  onMount(() => {
    void fetch("/api/music/scores")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { key: string }[]) => (downloaded = new Set(list.map((x) => x.key))))
      .catch(() => (downloaded = new Set()));
  });
  const pathId = $derived(PATH_FOR_INSTRUMENT[settings.value.activeInstrument]);
  const starters = $derived.by(() => {
    if (!downloaded || !songs) return [];
    const have = new Set(songs.flatMap((s) => (s.shelf ? [s.shelf] : [])));
    const path = LEARNING_PATHS[pathId];
    return (path.levels ?? [])
      .flatMap((level, li) => level.shelf.map((song) => ({ song, level: li + 1, levelTitle: level.title, key: `${pathId}/${song.id}` })))
      .filter((x) => downloaded!.has(x.key) && !have.has(x.key));
  });
  const starterTotal = $derived(starters.length);
  // The starters by level, so the level names its group once instead of tagging every card.
  const starterLevels = $derived(
    starters.slice(0, 6).reduce<{ level: number; title: string; items: typeof starters }[]>((out, x) => {
      const last = out.at(-1);
      if (last?.level === x.level) last.items.push(x);
      else out.push({ level: x.level, title: x.levelTitle, items: [x] });
      return out;
    }, []),
  );
  // Each starter's score, read from the server once, drawn as a small roll on its card.
  let thumbs = $state.raw<Record<string, Score>>({});
  $effect(() => {
    for (const x of starters.slice(0, 6))
      if (!(x.key in thumbs))
        void shelfScore(x.key, x.song.title)
          .then(({ score }) => (thumbs = { ...thumbs, [x.key]: score }))
          .catch(() => {});
  });
  const runs = $derived(practice.sessions.flatMap((x) => x.runs));
  const dateText = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  // Each cover gets its own light, picked from the song's title, so the shelf does not read as one picture repeated.
  const TINTS = ["piano", "guitar", "ear", "reading", "create", "voice", "rhythm"];
  const tint = (title: string) => `var(--hue-${TINTS[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length]})`;

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
  <!-- One line: the shelf below is the content; the banner only points to Import. -->
  <section class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-ws-line bg-ws-surface px-4 py-2">
    <h2 class="min-w-0 flex-1 basis-56 text-sm"><span class="font-semibold">No songs of your own yet.</span> <span class="text-ws-soft">{starters.length ? "Start with one from your path, or bring in a score." : "Bring in a MIDI or MusicXML score."}</span></h2>
    <a href="?tab=import" class={starters.length ? btn : btnPrimary}><Upload class="size-4" aria-hidden="true" />Import a score</a>
  </section>
{:else}
  <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Saved songs">
    {#each songs as song, i (song.id)}
      {@const f = scoreFacts(song.score)}
      {@const h = songHistory(runs, song)}
      <li
        class="flex flex-col overflow-hidden rounded-2xl border border-ws-line bg-ws-surface hover:border-instr-ink focus-within:border-instr-ink {i === 0 ? 'sm:col-span-2' : ''}"
        class:lead={i === 0}
      >
        <a href="/music/songs/{song.id}" class="group flex flex-1 flex-col focus-visible:outline-offset-[-2px]">
          <div class="stage cover relative px-3 pb-2 pt-10" style:--tint={tint(song.title)}>
            <RollThumb score={song.score} height={i === 0 ? 120 : 64} beats={i === 0 ? undefined : 16} />
            <!-- Where you stand with it, on the cover: a best score, or not started yet. -->
            <span class="tnum absolute left-3 top-2 rounded-full px-2.5 py-0.5 text-[13px] font-semibold {h.best !== null ? 'bg-success text-success-foreground' : 'bg-ws-stage-ink/15 text-ws-stage-ink'}">{h.best !== null ? `Best ${Math.round(h.best * 100)}%` : h.lastAt !== null ? "In progress" : "Not started"}</span>
            <span class="absolute right-3 top-2 rounded-full bg-ws-stage-ink/10 px-2.5 py-0.5 text-[13px] text-ws-stage-soft">{sourceLabel(song)}</span>
          </div>
          <div class="flex flex-1 flex-col gap-2 p-4 pb-3">
            {#if i === 0}<p class="text-sm font-medium text-instr-ink">{h.lastAt !== null ? "Pick up where you left off" : "Added most recently"}</p>{/if}
            <h3 id="song-{song.id}" class="font-display font-semibold leading-tight {i === 0 ? 'text-2xl' : 'text-lg'} group-hover:underline group-hover:underline-offset-4">{song.title}</h3>
            {#if song.composer}<p class="-mt-1 text-sm text-ws-soft">{song.composer}</p>{/if}
            <p class="text-sm" data-testid="song-history">
              {#if h.lastAt !== null}
                {#if h.best !== null}<span class="tnum font-semibold">Best {Math.round(h.best * 100)}%</span><span class="text-ws-soft">, </span>{/if}<span class="text-ws-soft">last played {dateText(h.lastAt)}, {h.runs} run{h.runs === 1 ? "" : "s"}</span>
              {:else}
                <span class="text-ws-soft">Not played yet</span>
              {/if}
            </p>
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
          <!-- Delete lives in the card's menu, two taps, away from Practise. -->
          <Menu.Root onOpenChange={(open) => !open && confirming === song.id && (confirming = null)}>
            <Menu.Trigger class="grid size-11 shrink-0 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink" aria-label="Options for {song.title}"><Dots class="size-5" aria-hidden="true" /></Menu.Trigger>
            <Menu.Content align="end" class="w-64">
              <Menu.Item class={confirming === song.id ? "text-destructive" : ""} onSelect={(e) => remove(song, e)}
                ><Trash class="size-4" aria-hidden="true" />{confirming === song.id ? `Delete ${song.title}? Tap again to delete` : `Delete ${song.title}`}</Menu.Item
              >
            </Menu.Content>
          </Menu.Root>
        </div>
      </li>
    {/each}
  </ul>
{/if}

{#if starters.length}
  <section class="flex flex-col gap-3" aria-labelledby="starters-h">
    <div class="flex flex-wrap items-end justify-between gap-x-4">
      <div class="min-w-0">
        <h2 id="starters-h" class="font-display text-xl font-semibold">From the {LEARNING_PATHS[pathId].title}</h2>
        <p class="text-sm text-ws-soft">Songs on your path's shelf, easiest level first. Opening one adds it to your songs.</p>
      </div>
      {#if starterTotal > 6}<a class="inline-flex min-h-11 items-center text-sm font-semibold text-instr-ink underline underline-offset-4" href="/music?tab=paths">See all {starterTotal} on the path</a>{/if}
    </div>
    {#each starterLevels as g (g.level)}
      <h3 class="font-display text-base font-semibold">Level {g.level}: {g.title}</h3>
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Songs from level {g.level} of your path">
        {#each g.items as x (x.key)}
          <li class="flex flex-col overflow-hidden rounded-2xl border border-ws-line bg-ws-surface">
            <div class="stage cover px-3 pb-2 pt-3" style:--tint={tint(x.song.title)}>
              {#if thumbs[x.key]}<RollThumb score={thumbs[x.key]} height={56} beats={16} />{:else}<div class="h-14" aria-hidden="true"></div>{/if}
            </div>
            <div class="flex flex-1 flex-col gap-2 p-4">
              <h4 class="font-display text-lg leading-tight font-semibold">{x.song.title}</h4>
              <p class="-mt-1 text-sm text-ws-soft">{x.song.artist}</p>
              <p class="text-sm">{plainTeaches(x.song.teaches)}</p>
              <ul class="flex flex-wrap gap-1.5" aria-label="About {x.song.title}">
                {#each shelfTags(x.song) as t (t)}<li class="rounded-full bg-ws-raised px-2.5 py-0.5 text-[13px] font-medium">{t}</li>{/each}
              </ul>
              <a class="{btnPrimary} mt-auto self-start" href="/music/songs/shelf/{x.key}" aria-label="Practise {x.song.title}"><Play class="size-4 fill-current" aria-hidden="true" />Practise</a>
            </div>
          </li>
        {/each}
      </ul>
    {/each}
  </section>
{/if}

<style>
  .cover {
    background:
      radial-gradient(90% 120% at 15% 0%, color-mix(in oklch, var(--tint) 30%, transparent), transparent 65%),
      var(--ws-stage);
  }
  .lead .stage:not(.cover) {
    background:
      radial-gradient(90% 120% at 15% 0%, color-mix(in oklch, var(--instr) 28%, transparent), transparent 65%),
      var(--ws-stage);
  }
</style>
