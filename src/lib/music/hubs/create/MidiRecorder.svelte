<script lang="ts">
  // Record MIDI takes: note-ons and note-offs from MIDI, the on-screen keys and
  // the computer keyboard. Takes persist in db.midiTakes (shared with the Lab).
  import { onDestroy, onMount } from "svelte";
  import Play from "lucide-svelte/icons/play";
  import FileMusic from "lucide-svelte/icons/file-music";
  import Trash from "lucide-svelte/icons/trash-2";
  import type { NoteEvent } from "@repo/music-core";
  import { scoreToMidi } from "@repo/music-core/io/midi-file";
  import { compareTakes } from "@repo/music-core/scoring/compare";
  import { savedTakesLabel } from "./audioTakes";
  import Piano from "$lib/music/components/Piano.svelte";
  import { btn } from "$lib/music/components/ui";
  import { runInstrument } from "$lib/music/drill.svelte";
  import { INSTRUMENT_LABEL } from "$lib/music/bench.svelte";
  import { audio, db, input, midi, type SequenceHandle } from "$lib/music/runtime";
  import RecordButton from "./RecordButton.svelte";
  import TakeThumb from "./TakeThumb.svelte";
  import { download } from "./files";
  import { clock, fileStem, takeLength, pairNotes, TAKE_LIMIT_MS, takeToScore, takeToSequence, type MidiTake } from "$lib/music/takes";
  import Picker from "$lib/music/components/Picker.svelte";

  let { announce }: { announce: (msg: string) => void } = $props();

  let takes = $state<MidiTake[]>([]);
  let recording = $state(false);
  let elapsed = $state(0);
  let liveCount = $state(0);
  let confirmDelete = $state<string | null>(null);
  let savedSong = $state<Record<string, string>>({});
  let player = $state<{ id: string; handle: SequenceHandle; from: number } | null>(null);
  // A clock for the playback cursor, ticking only while something plays.
  let now = $state(0);
  $effect(() => {
    if (!player) return;
    let raf = requestAnimationFrame(function tick() {
      now = performance.now();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });
  function progress(take: MidiTake): number | null {
    const at =
      player?.id === take.id ? player.from * 1000 + Math.max(0, now - player.handle.startPerf) : paused[take.id] !== undefined ? paused[take.id] * 1000 : null;
    return at === null ? null : Math.min(1, at / Math.max(1, take.durationMs));
  }
  let paused = $state<Record<string, number>>({});
  let cmpA = $state("");
  let cmpB = $state("");

  let t0 = 0;
  let events: NoteEvent[] = [];
  let off: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    void db.midiTakes
      .orderBy("createdAt")
      .reverse()
      .toArray()
      .then((rows) => {
        takes = (rows as unknown as MidiTake[]).filter((t) => Array.isArray(t.notes));
        [cmpA, cmpB] = [takes[1]?.id ?? "", takes[0]?.id ?? ""];
      });
    // On-screen keys sound through the input layer; hardware makes its own sound.
  });

  async function toggle() {
    if (recording) return stop();
    await audio.unlock();
    stopPlayback();
    events = [];
    liveCount = 0;
    t0 = performance.now();
    recording = true;
    off = input.subscribe((e) => {
      if ((e.kind === "noteon" || e.kind === "noteoff") && e.source !== "audio" && e.source !== "click" && e.at >= t0) {
        events.push(e);
        if (e.kind === "noteon") liveCount++;
      }
    });
    timer = setInterval(() => {
      elapsed = performance.now() - t0;
      if (elapsed >= TAKE_LIMIT_MS) void stop("The take reached the 60-minute limit and was saved.");
    }, 200);
    announce("Recording. Play, then press Stop.");
  }

  async function stop(reason?: string) {
    if (!recording) return;
    recording = false;
    off?.();
    off = null;
    clearInterval(timer);
    const end = performance.now();
    const notes = pairNotes(events, t0, end);
    if (!notes.length) return announce("Nothing was played, so no take was saved.");
    const take: MidiTake = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      name: `Take ${takes.length + 1}`,
      notes,
      durationMs: Math.round(end - t0),
      instrument: runInstrument(events),
      note: "",
    };
    try {
      await db.midiTakes.put({ ...take });
    } catch (e) {
      return announce(`The take didn't save: ${(e as Error).message}. Record it again.`);
    }
    takes = [take, ...takes];
    [cmpA, cmpB] = [takes[1]?.id ?? "", take.id];
    announce(reason ?? `Saved ${take.name}: ${notes.length} notes, ${takeLength(take.durationMs)}.`);
  }

  function stopPlayback() {
    player?.handle.stop();
    player = null;
  }

  async function play(take: MidiTake) {
    if (player?.id === take.id) {
      const pos = (performance.now() - player.handle.startPerf) / 1000 + player.from;
      stopPlayback();
      paused = { ...paused, [take.id]: pos };
      return announce(`Paused ${take.name} at ${clock(pos * 1000)}.`);
    }
    stopPlayback();
    await audio.unlock();
    const from = paused[take.id] ?? 0;
    const seq = takeToSequence(take)
      .filter((n) => n.time + n.duration > from)
      .map((n) => ({ ...n, time: Math.max(0, n.time - from) }));
    const handle = audio.playSequence(seq);
    player = { id: take.id, handle, from };
    announce(`Playing ${take.name}${from ? ` from ${clock(from * 1000)}` : ""}.`);
    void handle.done.then(() => {
      if (player?.handle === handle) {
        player = null;
        const { [take.id]: _, ...rest } = paused;
        paused = rest;
      }
    });
  }

  async function patch(take: MidiTake, change: Partial<MidiTake>) {
    await db.midiTakes.update(take.id, change);
    takes = takes.map((t) => (t.id === take.id ? { ...t, ...change } : t));
  }

  function exportMidi(take: MidiTake) {
    const name = `${fileStem(take.name)}.mid`;
    download(scoreToMidi(takeToScore(take)), name, "audio/midi");
    announce(`Downloading ${name}.`);
  }

  async function toSongStudio(take: MidiTake) {
    const score = takeToScore(take, { snap: true });
    const now = Date.now();
    const id = crypto.randomUUID();
    await db.songs.put({ id, title: take.name, createdAt: now, updatedAt: now, score: { ...score, id }, source: "Recorded take" });
    savedSong = { ...savedSong, [take.id]: id };
    announce(`${take.name} is saved to Song practice, snapped to sixteenths at ${score.bpm} BPM.`);
  }

  async function remove(take: MidiTake) {
    if (confirmDelete !== take.id) return void (confirmDelete = take.id);
    confirmDelete = null;
    if (player?.id === take.id) stopPlayback();
    await db.midiTakes.delete(take.id);
    takes = takes.filter((t) => t.id !== take.id);
    announce(`Deleted ${take.name}.`);
  }

  const cmp = $derived.by(() => {
    const a = takes.find((t) => t.id === cmpA);
    const b = takes.find((t) => t.id === cmpB);
    if (!a || !b || a === b) return null;
    const on = (t: MidiTake) => t.notes.map((n) => ({ midi: n.midi, at: n.startMs }));
    return { a, b, ...compareTakes(on(a), on(b)) };
  });

  const when = (ms: number) =>
    new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  onDestroy(() => {
    if (recording) void stop();
    stopPlayback();
  });
</script>

<section class="stage relative flex flex-col gap-4 overflow-hidden rounded-3xl p-4 sm:p-6" aria-label="MIDI recorder">
  <div class="flex flex-wrap items-center gap-5">
    <RecordButton {recording} onclick={toggle} />
    <div class="min-w-0 flex-1">
      <p class="tnum font-display text-5xl font-semibold tracking-tight sm:text-6xl" aria-label="Elapsed {clock(elapsed)}">{clock(recording ? elapsed : 0)}</p>
      <p class="text-sm text-ws-stage-soft">
        {#if recording}{liveCount} {liveCount === 1 ? "note" : "notes"} so far. Takes stop by themselves at 60 minutes.{:else}Record from a MIDI keyboard or pads, the keys below, or your computer keyboard.{/if}
      </p>
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-2 text-sm text-ws-stage-soft">
    {#if !midi.supported}
      <span>Web MIDI is unavailable in this browser. Play the keys below or your computer keyboard.</span>
    {:else if !midi.enabled}
      <span>MIDI is off.</span>
      <button type="button" class="min-h-11 rounded-full bg-ws-stage-ink/10 px-4 font-semibold text-ws-stage-ink hover:bg-ws-stage-ink/20" onclick={() => midi.enable()}>Turn on MIDI</button>
    {:else}
      <span>MIDI on: {midi.inputs.map((i) => midi.profile(i.id)?.alias ?? i.name).join(", ") || "no device connected yet"}.</span>
      <a class="font-semibold text-ws-stage-ink underline underline-offset-4" href="/music/connect">Devices</a>
    {/if}
  </div>
  <Piano low={48} high={84} label="On-screen keys for recording" />
</section>

<section aria-labelledby="midi-takes" class="flex flex-col gap-3">
  <h2 id="midi-takes" class="font-display text-2xl font-semibold tracking-tight">MIDI takes <span class="tnum text-base font-normal text-ws-soft">{savedTakesLabel(takes.length)}</span></h2>
  {#if takes.length}
    <ul class="divide-y divide-ws-line rounded-2xl border border-ws-line bg-ws-surface">
      {#each takes as take (take.id)}
        {@const isPlaying = player?.id === take.id}
        <li class="flex flex-col gap-3 p-3 sm:p-4" data-take={take.id}>
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="grid size-12 shrink-0 place-items-center rounded-full {isPlaying ? 'bg-ws-ink text-ws-bg' : 'bg-instr text-ws-stage hover:brightness-105'}"
              aria-label="{isPlaying ? 'Pause' : 'Play'} {take.name}"
              aria-pressed={isPlaying}
              onclick={() => play(take)}
            >
              {#if isPlaying}<svg viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>{:else}<Play class="size-5" aria-hidden="true" />{/if}
            </button>
            <input
              class="min-h-11 min-w-0 flex-1 basis-40 rounded-lg border border-transparent bg-transparent px-2 font-display text-lg font-semibold hover:border-ws-line focus:border-ws-line"
              value={take.name}
              aria-label="Take name"
              onchange={(e) => patch(take, { name: e.currentTarget.value.trim() || take.name })}
            />
            <span class="text-sm text-ws-soft">
              <span class="tnum">{take.notes.length}</span> notes, <span class="tnum">{takeLength(take.durationMs)}</span>, {when(take.createdAt)}{take.instrument ? `, ${INSTRUMENT_LABEL[take.instrument]}` : ""}
            </span>
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm {confirmDelete === take.id ? 'bg-destructive font-semibold text-white' : 'text-ws-soft hover:bg-ws-raised'}"
              aria-label={confirmDelete === take.id ? `Confirm: delete ${take.name}` : `Delete ${take.name}`}
              onclick={() => remove(take)}
              onblur={() => confirmDelete === take.id && (confirmDelete = null)}
            >
              <Trash class="size-4" aria-hidden="true" />{confirmDelete === take.id ? "Delete?" : ""}
            </button>
          </div>
          <TakeThumb notes={take.notes} durationMs={take.durationMs} progress={progress(take)} />
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <input
              class="min-h-11 min-w-0 flex-1 basis-48 rounded-lg border border-ws-line bg-transparent px-2 text-sm"
              value={take.note ?? ""}
              placeholder="Add a note: what to fix next time"
              aria-label="Note for {take.name}"
              onchange={(e) => patch(take, { note: e.currentTarget.value })}
            />
            <div class="flex flex-wrap gap-1.5">
              <button type="button" class="{btn} px-3" onclick={() => exportMidi(take)}><FileMusic class="size-4" aria-hidden="true" />Export MIDI</button>
              <a class="{btn} px-3" href="/music/create?mode=roll&take={take.id}">Open in piano roll</a>
              {#if savedSong[take.id]}
                <a class="{btn} px-3 text-instr-ink" href="/music/songs/{savedSong[take.id]}">Open in Song practice</a>
              {:else}
                <button type="button" class="{btn} px-3" onclick={() => toSongStudio(take)}>Save to Song practice</button>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="rounded-2xl border border-dashed border-ws-line p-5 text-ws-soft">No MIDI takes yet. Press the record button and play.</p>
  {/if}
</section>

{#if takes.length >= 2}
  <section aria-labelledby="compare-title" class="rounded-2xl bg-ws-raised/60 p-4 sm:p-5">
    <h2 id="compare-title" class="font-display text-xl font-semibold">Compare takes</h2>
    <p class="max-w-prose text-sm text-ws-soft">Lines the second take up with the first (a slower or faster take is stretched to fit) and counts the notes that match in pitch and time.</p>
    <div class="mt-3 flex flex-wrap items-end gap-3">
      {#each [["First", "a"], ["Second", "b"]] as [label, which] (which)}
        <div class="flex min-w-0 flex-col gap-1 text-sm">
          <span class="text-ws-soft">{label}</span>
          <Picker class="min-w-40" {label} value={which === "a" ? cmpA : cmpB} options={takes.map((t) => ({ value: t.id, label: t.name }))} onchange={(v) => (which === "a" ? (cmpA = v) : (cmpB = v))} />
        </div>
      {/each}
      {#if cmp}
        <p class="flex items-baseline gap-2">
          <span class="tnum font-display text-4xl font-semibold">{Math.round(cmp.accuracy * 100)}%</span>
          <span class="text-sm text-ws-soft"><span class="tnum">{cmp.matched}</span> of <span class="tnum">{cmp.total}</span> notes line up</span>
        </p>
      {:else}
        <p class="text-sm text-ws-soft">Pick two different takes.</p>
      {/if}
    </div>
  </section>
{/if}
