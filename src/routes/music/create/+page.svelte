<script lang="ts">
  // Create: the beat and the piano roll on one page, on one loop, so a backing
  // track can be built and jammed over. Songs save the whole thing.
  import { onDestroy, onMount, tick } from "svelte";
  import { page } from "$app/state";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Save from "lucide-svelte/icons/save";
  import FilePlus from "lucide-svelte/icons/file-plus";
  import BeatGrid from "$lib/music/hubs/create/BeatGrid.svelte";
  import PianoRoll from "$lib/music/hubs/create/PianoRoll.svelte";
  import KitPanel from "$lib/music/hubs/create/KitPanel.svelte";
  import { session } from "$lib/music/hubs/create/session.svelte";
  import { bench } from "$lib/music/bench.svelte";
  import { btn, btnPrimary } from "$lib/music/components/ui";

  let status = $state("");
  const announce = (msg: string) => (status = msg);
  let confirmNew = $state(false);

  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });

  onMount(async () => {
    await session.ready;
    // Old links (Record's "Open in piano roll") land on the roll.
    if (page.url.searchParams.get("mode") === "roll") {
      await tick();
      document.getElementById("roll")?.scrollIntoView({ block: "start" });
    }
  });
  onDestroy(() => session.stop());

  async function playAll() {
    const was = session.playing;
    const ok = await session.toggle();
    if (!ok) return announce("Sound is blocked. Tap Enable sound in the strip above, then play again.");
    announce(was ? "Stopped." : `Playing ${session.songName}: ${session.loopBars}-bar loop at ${session.bpm} BPM.`);
  }

  async function saveSong() {
    const song = await session.saveSong();
    announce(`Saved the song ${song.name}: the beat, ${song.doc.voices.length} ${song.doc.voices.length === 1 ? "voice" : "voices"} and the tempo.`);
  }

  function openSong(id: string) {
    const song = session.openSong(id);
    if (song) announce(`Opened ${song.name}.`);
  }

  function newSong() {
    if (!confirmNew) return void (confirmNew = true);
    confirmNew = false;
    session.newSong();
    announce("New song: an empty beat and one empty voice. Save the old one first if you want to keep it.");
  }

  const field = "min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm";
</script>

<svelte:head><title>Create | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Create</h1>
      <p class="mt-1 max-w-prose text-ws-soft">
        Build a beat and melodies that loop together, then jam over them.
        <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/record">Record a take</a>
      </p>
    </div>
  </header>

  <section class="sticky top-[7.25rem] z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-ws-line bg-ws-surface/95 p-3 shadow-sm backdrop-blur" aria-label="Song">
    <button type="button" class="{btnPrimary} min-h-12 px-6 font-display text-base" aria-pressed={session.playing} onclick={playAll}>
      {#if session.playing}<Square class="size-5" aria-hidden="true" />Stop{:else}<Play class="size-5" aria-hidden="true" />Play all{/if}
    </button>
    <label class="flex items-center gap-2 text-sm">
      <span class="text-ws-soft">Tempo</span>
      <input type="number" min="40" max="200" class="{field} tnum w-20" value={session.bpm} onchange={(e) => session.setBpm(e.currentTarget.valueAsNumber)} />
      <span class="text-ws-soft">BPM</span>
    </label>
    <span class="tnum text-sm text-ws-soft">{session.loopBars}-bar loop</span>
    <span class="flex-1"></span>
    <label class="flex min-w-0 basis-44 items-center gap-2 text-sm">
      <span class="sr-only">Song name</span>
      <input class="{field} w-full min-w-0 font-medium" aria-label="Song name" bind:value={session.songName} />
    </label>
    <button type="button" class={btn} onclick={saveSong}><Save class="size-4" aria-hidden="true" />Save song</button>
    {#if session.songs.length}
      <select class={field} aria-label="Open a saved song" value="" onchange={(e) => openSong(e.currentTarget.value)}>
        <option value="" disabled>Open song</option>
        {#each session.songs as s (s.id)}<option value={s.id}>{s.name}, {s.bpm} BPM</option>{/each}
      </select>
    {/if}
    <button
      type="button"
      class="{btn} {confirmNew ? 'border-destructive text-destructive' : ''}"
      onclick={newSong}
      onblur={() => (confirmNew = false)}
    ><FilePlus class="size-4" aria-hidden="true" />{confirmNew ? "Start fresh?" : "New song"}</button>
  </section>
  <p role="status" class="-mt-3 min-h-6 text-sm font-medium">{status}</p>

  <div id="beat" class="scroll-mt-48"><BeatGrid {announce} /></div>

  <div id="roll" class="flex scroll-mt-48 flex-col gap-3">
    <h2 class="font-display text-2xl font-semibold tracking-tight">Melodies</h2>
    <PianoRoll {announce} />
  </div>

  <div id="kit" class="scroll-mt-48"><KitPanel {announce} /></div>
</div>
