<script lang="ts">
  // Create: a song is a beat and melodies on one loop at one tempo, so a
  // backing track can be built and jammed over. The bar plays it; the fold-out
  // panel holds the tracks and the song's files; the beat grid and the piano
  // roll stay on the page together. Songs are saved only on Save.
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Plus from "lucide-svelte/icons/plus";
  import Minus from "lucide-svelte/icons/minus";
  import Check from "lucide-svelte/icons/check";
  import Settings2 from "lucide-svelte/icons/settings-2";
  import { scoreToMidi } from "@repo/music-core/io/midi-file";
  import BeatGrid from "$lib/music/hubs/create/BeatGrid.svelte";
  import PianoRoll from "$lib/music/hubs/create/PianoRoll.svelte";
  import Tracks from "$lib/music/hubs/create/Tracks.svelte";
  import { MAX_SONG_BARS, session } from "$lib/music/hubs/create/session.svelte";
  import { docToScore, expandLoops, scoreToDoc } from "$lib/music/hubs/create/roll";
  import { download } from "$lib/music/hubs/create/files";
  import { fileStem, takeToScore, type MidiTake } from "$lib/music/takes";
  import { audio, db } from "$lib/music/runtime";
  import { bench } from "$lib/music/bench.svelte";
  import Save from "lucide-svelte/icons/save";
  import FilePlus from "lucide-svelte/icons/file-plus";
  import FileMusic from "lucide-svelte/icons/file-music";
  import AudioLines from "lucide-svelte/icons/audio-lines";
  import Trash from "lucide-svelte/icons/trash-2";
  import { btn, btnPrimary, btnStage } from "$lib/music/components/ui";
  import Picker from "$lib/music/components/Picker.svelte";

  let status = $state("");
  const announce = (msg: string) => (status = msg);
  let ready = $state(false);
  let confirmDelete = $state(false);
  let busy = $state(false);
  let panelOpen = $state(false);
  /** New or Open waiting on what to do with unsaved changes. */
  let pending = $state<{ kind: "new" } | { kind: "open"; id: string } | null>(null);

  const bars = (n: number) => `${n} ${n === 1 ? "bar" : "bars"}`;

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
    const was = session.playing && session.only === null;
    const ok = await session.play(null);
    if (!ok) return announce("Sound is blocked. Tap Enable sound in the strip above, then play again.");
    announce(was ? "Stopped." : `Playing ${session.songName}: ${bars(session.loopBars)} at ${session.bpm} BPM, on a loop.`);
  }

  function setBars(n: number) {
    const before = session.doc.voices.reduce((k, v) => k + v.notes.length, 0);
    session.setBars(n);
    const lost = before - session.doc.voices.reduce((k, v) => k + v.notes.length, 0);
    announce(`The song is ${bars(session.bars)}.${lost ? ` ${lost} ${lost === 1 ? "note" : "notes"} past the end went with the bar.` : ""}`);
  }

  function openSong(id: string) {
    const song = session.openSong(id);
    if (song) announce(`Opened ${song.name}.`);
  }
  function newSong() {
    session.newSong();
    announce("New song: an empty beat and one empty melody. It is not saved until you press Save.");
  }
  /** New and Open ask first when there are changes that would be lost. */
  function request(next: NonNullable<typeof pending>) {
    if (session.unsaved) return void (pending = next);
    run(next);
  }
  function run(next: NonNullable<typeof pending>) {
    pending = null;
    if (next.kind === "new") newSong();
    else openSong(next.id);
  }
  async function saveThen() {
    const next = pending;
    await save();
    if (next) run(next);
  }

  async function save() {
    const was = session.saved;
    const song = await session.save();
    announce(was ? `Saved ${song.name}.` : `Saved ${song.name} to your songs.`);
  }
  async function saveCopy() {
    const song = await session.saveCopy();
    announce(`Saved a copy, ${song.name}. Changes now go to the copy.`);
  }
  async function deleteSong() {
    if (!confirmDelete) return void (confirmDelete = true);
    confirmDelete = false;
    const gone = session.songName;
    await session.deleteSong();
    announce(`Took ${gone} out of your songs. It is still open; Save puts it back.`);
  }

  function exportMidi() {
    const full = expandLoops(session.doc); // loops written out
    const n = full.voices.reduce((k, v) => k + v.notes.length, 0);
    if (!n) return announce("The melodies have no notes yet. MIDI export covers the melodies.");
    const name = `${fileStem(session.songName, "song")}.mid`;
    download(scoreToMidi(docToScore({ ...full, title: session.songName }, crypto.randomUUID())), name, "audio/midi");
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

  <section class="z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-ws-line bg-ws-surface/95 p-3 shadow-sm backdrop-blur sm:sticky sm:top-[7.25rem]" aria-label="Song">
    <button type="button" class="{btnPrimary} min-h-12 px-6 font-display text-base" aria-pressed={session.playing && session.only === null} onclick={playAll}>
      {#if session.playing && session.only === null}<Square class="size-5" aria-hidden="true" />Stop{:else}<Play class="size-5" aria-hidden="true" />Play all{/if}
    </button>
    <p class="flex min-w-0 flex-1 basis-40 flex-col leading-tight">
      <span class="truncate font-display text-base font-semibold">{session.songName}</span>
      <span class="text-xs text-ws-soft" data-save-state>{!session.saved ? "Not saved" : session.changed ? "Unsaved changes" : "Saved"}</span>
    </p>
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
    <button type="button" class={btn} disabled={session.saved && !session.changed} onclick={save}>
      {#if session.saved && !session.changed}<Check class="size-4" aria-hidden="true" />Saved{:else}<Save class="size-4" aria-hidden="true" />Save{/if}
    </button>
    <button
      type="button"
      class="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-instr-ink hover:bg-instr-wash"
      aria-expanded={panelOpen}
      aria-controls="create-panel"
      onclick={() => (panelOpen = !panelOpen)}
    >
      <Settings2 class="size-4" aria-hidden="true" />{panelOpen ? "Done" : "Tracks and song"}
    </button>
  </section>

  {#if panelOpen}
    <div id="create-panel" class="grid gap-6 rounded-2xl border border-ws-line bg-ws-raised/60 p-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <Tracks {announce} />
      <section class="flex flex-col gap-3" aria-labelledby="song-h">
        <h2 id="song-h" class="font-display text-lg font-semibold">Song</h2>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-ws-soft">Name</span>
          <input class="{field} font-medium" bind:value={session.songName} />
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" class={btn} onclick={saveCopy}>Save as a copy</button>
          <button type="button" class={btn} onclick={() => request({ kind: "new" })}><FilePlus class="size-4" aria-hidden="true" />New song</button>
        </div>
        {#if session.songs.length}
          <div class="flex flex-col gap-1 text-sm">
            <span class="text-ws-soft">Your songs</span>
            <Picker label="Your songs" placeholder="Open a song" value={session.saved ? session.songId : ""} options={session.songs.map((s) => ({ value: s.id, label: `${s.name}, ${s.bpm} BPM` }))} onchange={(id) => request({ kind: "open", id })} />
          </div>
        {/if}
        <div class="flex flex-wrap gap-2">
          <button type="button" class={btn} onclick={exportMidi}><FileMusic class="size-4" aria-hidden="true" />MIDI</button>
          <button type="button" class={btn} disabled={busy} onclick={exportWav}><AudioLines class="size-4" aria-hidden="true" />WAV</button>
        </div>
        <p class="text-xs text-ws-soft">MIDI has the melodies; WAV is one pass of everything you hear.</p>
        {#if session.saved}
          <button type="button" class="{btn} self-start {confirmDelete ? 'border-destructive text-destructive' : ''}" onblur={() => (confirmDelete = false)} onclick={deleteSong}>
            <Trash class="size-4" aria-hidden="true" />{confirmDelete ? `Remove ${session.songName}?` : "Remove from your songs"}
          </button>
        {/if}
      </section>
    </div>
  {/if}

  {#if pending}
    <div class="flex flex-wrap items-center gap-2 rounded-2xl border border-instr bg-instr-wash p-3 text-sm" role="group" aria-label="Unsaved changes">
      <p class="min-w-0 flex-1 basis-60 font-medium">{session.songName} has changes that are not saved.</p>
      <button type="button" class={btnPrimary} onclick={saveThen}>Save, then {pending.kind === "new" ? "start a new one" : "open"}</button>
      <button type="button" class={btn} onclick={() => run(pending!)}>Discard changes</button>
      <button type="button" class={btn} onclick={() => (pending = null)}>Cancel</button>
    </div>
  {/if}

  <p role="status" class="-my-2 min-h-5 text-sm font-medium">{status}</p>

  <BeatGrid {announce} />
  {#if !ready}
    <div class="stage h-80 rounded-3xl" aria-hidden="true"></div>
  {:else if session.doc.voices.length}
    <PianoRoll host={session} {announce} />
  {:else}
    <div class="stage flex flex-wrap items-center gap-3 rounded-3xl p-5">
      <p class="min-w-0 flex-1 text-ws-stage-soft">No melodies in this song.</p>
      <button type="button" class={btnStage} onclick={() => announce(`Added ${session.addMelody().name}.`)}><Plus class="size-4" aria-hidden="true" />Add a melody</button>
    </div>
  {/if}
</div>
