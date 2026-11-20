<script lang="ts">
  // Create: a song is a beat and melodies on one loop at one tempo, so a
  // backing track can be built and jammed over. The bar plays it; the fold-out
  // panel holds the tracks and the song's files; the beat grid and the piano
  // roll stay on the page together. Songs are saved only on Save.
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import Plus from "@lucide/svelte/icons/plus";
  import Minus from "@lucide/svelte/icons/minus";
  import Check from "@lucide/svelte/icons/check";
  import Settings2 from "@lucide/svelte/icons/settings-2";
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Grid from "@lucide/svelte/icons/grid-3x3";
  import { scoreToMidi } from "@repo/music-core/io/midi-file";
  import BeatGrid from "#lib/music/hubs/create/BeatGrid.svelte";
  import PianoRoll from "#lib/music/hubs/create/PianoRoll.svelte";
  import Tracks from "#lib/music/hubs/create/Tracks.svelte";
  import LivePads from "#lib/music/hubs/create/LivePads.svelte";
  import { MAX_SONG_BARS, session } from "#lib/music/hubs/create/session.svelte.ts";
  import { docToScore, expandLoops, scoreToDoc } from "#lib/music/hubs/create/roll.ts";
  import { download } from "#lib/music/hubs/create/files.ts";
  import { fileStem, takeToScore, type MidiTake } from "#lib/music/takes.ts";
  import { audio, db } from "#lib/music/runtime/index.ts";
  import { bench } from "#lib/music/bench.svelte.ts";
  import Save from "@lucide/svelte/icons/save";
  import FilePlus from "@lucide/svelte/icons/file-plus";
  import FileMusic from "@lucide/svelte/icons/file-music";
  import AudioLines from "@lucide/svelte/icons/audio-lines";
  import Trash from "@lucide/svelte/icons/trash-2";
  import { btn, btnPrimary, btnStage } from "#lib/music/components/ui.ts";
  import Picker from "#lib/music/components/Picker.svelte";
  import { stripUnused } from "#lib/music/components/BenchStrip.svelte";

  let status = $state("");
  const announce = (msg: string) => (status = msg);
  let ready = $state(false);
  let confirmDelete = $state(false);
  let busy = $state(false);
  let panelOpen = $state(false);
  /** The editor a phone shows: the beat grid or the piano roll (?mode=roll). */
  let editor = $state<"beat" | "roll">(page.url.searchParams.get("mode") === "roll" ? "roll" : "beat");
  /** Play it live: record the beat from the pads, pass by pass (?live=1 opens it). */
  let live = $state(page.url.searchParams.has("live"));
  /** New or Open waiting on what to do with unsaved changes. */
  let pending = $state<{ kind: "new" } | { kind: "open"; id: string } | null>(null);

  const bars = (n: number) => `${n} ${n === 1 ? "bar" : "bars"}`;

  // The song has its own tempo and plays no click: the strip leaves those pills out.
  stripUnused("metronome", "tempo", "count-in");

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
    void goto("?", { replace: true, reset: false });
    if (!take) return announce("That take is no longer in Record.");
    const voice = scoreToDoc(takeToScore(take, { bpm: session.bpm, snap: true })).voices[0];
    session.addMelodyFrom({ ...voice, id: crypto.randomUUID(), name: take.name });
    announce(`Added ${take.name} as a new melody, ${voice.notes.length} notes snapped to sixteenths at ${session.bpm} BPM.`);
  }

  async function playAll() {
    const was = session.playing && session.only === null;
    const ok = await session.play(null);
    if (!ok) return announce("Sound is blocked. Tap for sound in the top bar, then play again.");
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
    announce("New song: an empty beat and one empty melody. It isn't saved until you press Save.");
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
    announce(`Removed ${gone} from your songs. It's still open: Save puts it back.`);
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
    const notes = session.mixedNotes();
    if (!notes.length) return announce("Add a few notes or beats first.");
    busy = true;
    announce("Rendering the WAV…");
    try {
      const name = `${fileStem(session.songName, "song")}.wav`;
      download(await audio.renderWav(notes, session.passSec), name, "audio/wav");
      announce(`Downloading ${name}, one pass of the song with the beat.`);
    } catch (e) {
      announce(`The WAV didn't render: ${(e as Error).message}. Try WAV again.`);
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

{#snippet editorToggle(cls: string)}
  <div class="grid grid-cols-2 rounded-full border border-ws-line bg-ws-surface p-0.5 {cls}" role="group" aria-label="Editor">
    {#each [{ id: "beat", label: "Beat" }, { id: "roll", label: "Melody" }] as const as t (t.id)}
      <button type="button" class="min-h-11 rounded-full px-5 text-sm font-semibold {editor === t.id ? 'bg-ws-ink text-ws-bg' : 'text-ws-soft'}" aria-pressed={editor === t.id} onclick={() => (editor = t.id)}>{t.label}</button>
    {/each}
  </div>
{/snippet}

{#snippet songLength()}
  <button type="button" class={step} aria-label="Remove the song's last bar" disabled={session.bars <= 1} onclick={() => setBars(session.bars - 1)}><Minus class="size-4" aria-hidden="true" /></button>
  <span class="tnum w-16 text-center font-semibold">{bars(session.bars)}</span>
  <button type="button" class={step} aria-label="Add a bar to the song" disabled={session.bars >= MAX_SONG_BARS} onclick={() => setBars(session.bars + 1)}><Plus class="size-4" aria-hidden="true" /></button>
{/snippet}

<svelte:head><title>Create | Woodshed</title></svelte:head>
<svelte:window onkeydown={windowKey} />

<div class="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-5">
  <header class="flex min-w-0 items-center justify-between gap-x-4 gap-y-1 sm:flex-wrap sm:items-end lg:flex-nowrap">
    <div class="min-w-0 lg:flex-1">
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Create</h1>
      <p class="max-w-prose text-ws-soft max-sm:hidden">Build a beat and melodies that loop together, then jam over them.</p>
      <!-- On a phone the song's name rides under the title, so the bar below stays one row. -->
      <p class="text-sm break-words text-ws-soft sm:hidden"><span class="font-semibold text-ws-ink">{session.songName}</span>, {!session.saved ? "not saved" : session.changed ? "unsaved changes" : "saved"}</p>
    </div>
    <!-- From sm up the editor switch rides in the title row, so every drum row fits a laptop screen. -->
    {@render editorToggle("max-sm:hidden sm:ml-auto")}
    <div class="flex shrink-0 items-center">
      <!-- On a phone the two links are icons, so the song's name and state stay on one line beside them. -->
      <a class="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-instr-ink hover:bg-instr-wash max-sm:px-0" href="/music/create/reference"><BookOpen class="size-5 sm:size-4" aria-hidden="true" /><span class="max-sm:sr-only">Chords and scales</span></a>
      <a class="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-instr-ink hover:bg-instr-wash max-sm:px-0" href="/music/record"><CircleDot class="size-5 sm:size-4" aria-hidden="true" /><span class="max-sm:sr-only">Record a take</span></a>
    </div>
  </header>

  <section class="z-20 flex min-h-14 items-center gap-x-2 rounded-2xl border border-ws-line bg-ws-surface/95 p-1.5 shadow-sm backdrop-blur sm:sticky sm:top-[calc(var(--ws-strip-h,3.5rem)+0.5rem)] sm:flex-wrap sm:gap-x-3 sm:gap-y-2 sm:p-3" aria-label="Song">
    <button type="button" class="{btnPrimary} min-h-11 shrink-0 px-4 font-display text-base sm:min-h-12 sm:px-6" aria-pressed={session.playing && session.only === null} onclick={playAll}>
      {#if session.playing && session.only === null}<Square class="size-5" aria-hidden="true" />Stop{:else}<Play class="size-5" aria-hidden="true" />Play all{/if}
    </button>
    <p class="flex min-w-0 flex-1 basis-24 flex-col leading-tight max-sm:hidden">
      <span class="truncate font-display text-base font-semibold">{session.songName}</span>
      <span class="text-[13px] text-ws-soft">Song, <span data-save-state>{!session.saved ? "Not saved" : session.changed ? "Unsaved changes" : "Saved"}</span></span>
    </p>
    <label class="flex items-center gap-1.5 text-sm max-sm:flex-1">
      <span class="text-ws-soft max-sm:sr-only">Tempo</span>
      <input type="number" min="40" max="200" class="{field} tnum w-16 sm:w-20" value={session.bpm} onchange={(e) => session.setBpm(e.currentTarget.valueAsNumber)} />
      <span class="text-ws-soft max-sm:text-[13px]" aria-hidden="true">BPM</span><span class="sr-only">BPM</span>
    </label>
    <div class="flex items-center gap-1 text-sm max-sm:hidden" role="group" aria-label="Song length">
      {@render songLength()}
    </div>
    <button type="button" class="{btn} shrink-0 max-sm:size-11 max-sm:px-0" disabled={session.saved && !session.changed} onclick={save}>
      {#if session.saved && !session.changed}<Check class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">Saved</span>{:else}<Save class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">Save</span>{/if}
    </button>
    <button
      type="button"
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-instr-ink hover:bg-instr-wash max-sm:px-0"
      aria-expanded={panelOpen}
      aria-controls="create-panel"
      onclick={() => (panelOpen = !panelOpen)}
    >
      <Settings2 class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">{panelOpen ? "Done" : "Tracks and song"}</span>
    </button>
  </section>

  <!-- On a phone one editor shows at a time; from sm up both stay on the page and the picked one comes first. -->
  {@render editorToggle("sm:hidden")}

  {#if panelOpen}
    <div id="create-panel" class="grid gap-6 rounded-2xl border border-ws-line bg-ws-raised/60 p-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <Tracks {announce} />
      <section class="flex flex-col gap-3" aria-labelledby="song-h">
        <h2 id="song-h" class="font-display text-lg font-semibold">Song</h2>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-ws-soft">Name</span>
          <input class="{field} font-medium" bind:value={session.songName} />
        </label>
        <!-- On a phone the song's length lives here, out of the one-row bar. -->
        <div class="flex items-center gap-2 text-sm sm:hidden" role="group" aria-label="Song length">
          <span class="text-ws-soft">Length</span>
          {@render songLength()}
        </div>
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
        <p class="text-[13px] text-ws-soft">MIDI has the melodies. WAV is one pass of everything you hear.</p>
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
      <p class="min-w-0 flex-1 basis-60 font-medium">{session.songName} has unsaved changes.</p>
      <button type="button" class={btnPrimary} onclick={saveThen}>Save, then {pending.kind === "new" ? "start a new one" : "open"}</button>
      <button type="button" class={btn} onclick={() => run(pending!)}>Discard changes</button>
      <button type="button" class={btn} onclick={() => (pending = null)}>Cancel</button>
    </div>
  {/if}

  <p role="status" class="-my-3 text-sm font-medium empty:sr-only">{status}</p>

  <!-- ?mode=roll opens on the melody editor: on a laptop it comes first. -->
  <div class="flex flex-col gap-5">
  <div class="flex flex-col gap-5 {editor === 'beat' ? '' : 'max-sm:hidden'}">
    {#if live && ready}<LivePads {announce} />{/if}
    <BeatGrid {announce}>
      {#snippet extra()}
        <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-full border border-ws-line px-4 text-sm font-semibold hover:bg-ws-raised {live ? 'bg-instr-wash text-instr-ink' : ''}" aria-pressed={live} onclick={() => (live = !live)}>
          <Grid class="size-4" aria-hidden="true" />{live ? "Close the pads" : "Play it live"}
        </button>
      {/snippet}
    </BeatGrid>
  </div>
  <div class="flex flex-col {editor === 'roll' ? 'sm:order-first' : 'max-sm:hidden'}">
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
  </div>
</div>
