<script lang="ts">
  // Create: a song is a beat and melodies on one loop at one tempo, so a
  // backing track can be built and jammed over. The song bar holds what
  // applies to the whole song, the tracks list what applies to one track, and
  // the editor below edits the selected track. Songs save as you work.
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Plus from "lucide-svelte/icons/plus";
  import Minus from "lucide-svelte/icons/minus";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import * as Menu from "@repo/ui/dropdown-menu";
  import { scoreToMidi } from "@repo/music-core/io/midi-file";
  import BeatGrid from "$lib/music/hubs/create/BeatGrid.svelte";
  import PianoRoll from "$lib/music/hubs/create/PianoRoll.svelte";
  import Tracks from "$lib/music/hubs/create/Tracks.svelte";
  import { MAX_SONG_BARS, session } from "$lib/music/hubs/create/session.svelte";
  import { docToScore, scoreToDoc } from "$lib/music/hubs/create/roll";
  import { download } from "$lib/music/hubs/create/files";
  import { fileStem, takeToScore, type MidiTake } from "$lib/music/takes";
  import { audio, db } from "$lib/music/runtime";
  import { bench } from "$lib/music/bench.svelte";
  import { btn, btnPrimary } from "$lib/music/components/ui";

  let status = $state("");
  const announce = (msg: string) => (status = msg);
  let ready = $state(false);
  let confirmDelete = $state(false);
  let busy = $state(false);

  const bars = (n: number) => `${n} ${n === 1 ? "bar" : "bars"}`;
  const melody = $derived(session.doc.voices.find((v) => v.id === session.selected));

  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });

  onMount(async () => {
    await session.ready;
    ready = true;
    const q = page.url.searchParams;
    if (q.get("take")) await openTake(q.get("take")!);
    else if (q.get("mode") === "roll" && session.doc.voices[0]) session.selected = session.doc.voices[0].id;
  });
  onDestroy(() => session.stop());

  /** Record's "Open in piano roll": the take becomes a new melody. */
  async function openTake(id: string) {
    const take = (await db.midiTakes.get(id)) as MidiTake | undefined;
    void goto("?", { replaceState: true, noScroll: true, keepFocus: true });
    if (!take) return announce("That take is no longer in Record.");
    const voice = scoreToDoc(takeToScore(take, { bpm: session.bpm, snap: true })).voices[0];
    session.addMelodyFrom({ ...voice, id: crypto.randomUUID(), name: take.name });
    announce(`Added ${take.name} as a new melody, ${voice.notes.length} notes snapped to sixteenths at ${session.bpm} BPM.`);
  }

  async function playAll() {
    const was = session.playing;
    const ok = await session.toggle();
    if (!ok) return announce("Sound is blocked. Tap Enable sound in the strip above, then play again.");
    announce(was ? "Stopped." : `Playing ${session.songName}: ${bars(session.loopBars)} at ${session.bpm} BPM, on a loop.`);
  }

  function setBars(n: number) {
    const before = session.doc.voices.reduce((k, v) => k + v.notes.length, 0);
    session.setBars(n);
    const lost = before - session.doc.voices.reduce((k, v) => k + v.notes.length, 0);
    announce(`The song is ${bars(session.bars)}.${lost ? ` ${lost} ${lost === 1 ? "note" : "notes"} past the end went with the bar.` : ""}`);
  }

  async function openSong(id: string) {
    const song = await session.openSong(id);
    if (song) announce(`Opened ${song.name}.`);
  }
  async function newSong() {
    await session.newSong();
    announce(`Started ${session.songName}: an empty beat and one empty melody. Your other songs are in the Songs menu.`);
  }
  async function duplicate() {
    const copy = await session.duplicateSong();
    announce(`Made ${copy.name}. Changes now go to the copy.`);
  }
  async function deleteSong(e: Event) {
    if (!confirmDelete) {
      e.preventDefault();
      confirmDelete = true;
      return;
    }
    confirmDelete = false;
    const gone = session.songName;
    await session.deleteSong();
    announce(`Deleted ${gone}. Opened ${session.songName}.`);
  }

  function exportMidi() {
    const n = session.doc.voices.reduce((k, v) => k + v.notes.length, 0);
    if (!n) return announce("The melodies have no notes yet. MIDI export covers the melodies.");
    const name = `${fileStem(session.songName, "song")}.mid`;
    download(scoreToMidi(docToScore({ ...session.doc, title: session.songName }, crypto.randomUUID())), name, "audio/midi");
    announce(`Downloading ${name}: ${session.doc.voices.length} ${session.doc.voices.length === 1 ? "track" : "tracks"}, ${n} notes.`);
  }
  async function exportWav() {
    const notes = session.notes();
    if (!notes.length) return announce("Add a few notes or beats first.");
    busy = true;
    announce("Rendering the WAV…");
    try {
      const name = `${fileStem(session.songName, "song")}.wav`;
      download(await audio.renderWav(notes, session.passSec), name, "audio/wav");
      announce(`Downloading ${name}, one pass of the song with the beat.`);
    } catch (e) {
      announce(`The WAV could not be rendered: ${(e as Error).message}`);
    } finally {
      busy = false;
    }
  }

  // Space plays and stops when focus is not on a control.
  function windowKey(e: KeyboardEvent) {
    if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey) return;
    const t = e.target as HTMLElement;
    if (t !== document.body && t.closest("button, input, select, textarea, a, [contenteditable], [role=application], [role=menu]")) return;
    e.preventDefault();
    void playAll();
  }

  const field = "min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm";
  const step = "grid size-11 place-items-center rounded-full border border-ws-line bg-ws-surface hover:bg-ws-raised disabled:opacity-40";
</script>

<svelte:head><title>Create | Woodshed</title></svelte:head>
<svelte:window onkeydown={windowKey} />

<div class="mx-auto flex max-w-6xl flex-col gap-5">
  <header class="min-w-0">
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Create</h1>
    <p class="mt-1 max-w-prose text-ws-soft">
      Build a beat and melodies that loop together, then jam over them.
      <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/record">Record a take</a>
    </p>
  </header>

  <section class="z-20 sm:sticky sm:top-[7.25rem] flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-ws-line bg-ws-surface/95 p-3 shadow-sm backdrop-blur" aria-label="Song">
    <button type="button" class="{btnPrimary} min-h-12 px-6 font-display text-base" aria-pressed={session.playing} onclick={playAll}>
      {#if session.playing}<Square class="size-5" aria-hidden="true" />Stop{:else}<Play class="size-5" aria-hidden="true" />Play all{/if}
    </button>
    <label class="flex min-w-0 flex-1 basis-40 items-center">
      <span class="sr-only">Song name</span>
      <input class="{field} w-full min-w-0 font-display text-base font-semibold" aria-label="Song name" bind:value={session.songName} />
    </label>
    <Menu.Root onOpenChange={(open) => !open && (confirmDelete = false)}>
      <Menu.Trigger class={btn} aria-label="Songs">Songs<ChevronDown class="size-4" aria-hidden="true" /></Menu.Trigger>
      <Menu.Content align="end" class="w-64">
        <Menu.Label class="text-xs font-normal text-muted-foreground">Songs save as you work.</Menu.Label>
        <Menu.RadioGroup value={session.songId} onValueChange={openSong}>
          {#each session.songs as s (s.id)}
            <Menu.RadioItem value={s.id}>{s.name}</Menu.RadioItem>
          {/each}
        </Menu.RadioGroup>
        <Menu.Separator />
        <Menu.Item onSelect={newSong}>New song</Menu.Item>
        <Menu.Item onSelect={duplicate}>Duplicate this song</Menu.Item>
        <Menu.Separator />
        <Menu.Item onSelect={exportMidi}>Export melodies as MIDI</Menu.Item>
        <Menu.Item disabled={busy} onSelect={exportWav}>Export as WAV</Menu.Item>
        <Menu.Separator />
        <Menu.Item variant="destructive" onSelect={deleteSong}>{confirmDelete ? `Delete ${session.songName}?` : "Delete this song"}</Menu.Item>
      </Menu.Content>
    </Menu.Root>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label class="flex items-center gap-2 text-sm">
        <span class="text-ws-soft">Tempo</span>
        <input type="number" min="40" max="200" class="{field} tnum w-20" value={session.bpm} onchange={(e) => session.setBpm(e.currentTarget.valueAsNumber)} />
        <span class="sr-only">BPM</span>
      </label>
      <div class="flex items-center gap-1 text-sm" role="group" aria-label="Song length">
        <button type="button" class={step} aria-label="Remove the song's last bar" disabled={session.bars <= 1} onclick={() => setBars(session.bars - 1)}><Minus class="size-4" aria-hidden="true" /></button>
        <span class="tnum w-16 text-center font-semibold">{bars(session.bars)}</span>
        <button type="button" class={step} aria-label="Add a bar to the song" disabled={session.bars >= MAX_SONG_BARS} onclick={() => setBars(session.bars + 1)}><Plus class="size-4" aria-hidden="true" /></button>
      </div>
    </div>
  </section>
  <p role="status" class="-my-2 min-h-5 text-sm font-medium">{status}</p>

  <Tracks {announce} />
  <div class="min-w-0">
      {#if !ready}
        <div class="stage h-80 rounded-3xl" aria-hidden="true"></div>
      {:else if melody}
        {#key melody.id}<PianoRoll {announce} />{/key}
      {:else}
        <BeatGrid {announce} />
      {/if}
  </div>
</div>
