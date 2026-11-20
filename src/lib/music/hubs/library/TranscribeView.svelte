<script lang="ts">
  // Turn a recording or a MIDI take into a draft song, then fix it in the
  // piano roll before saving. The listening runs in a worker, so the page
  // stays responsive, with progress and Cancel. The tempo is detected from
  // the notes; changing it, the hands split or the sensitivity re-snaps the
  // draft (and asks first once you have edited it).
  import { onDestroy, onMount } from "svelte";
  import Upload from "@lucide/svelte/icons/upload";
  import Plus from "@lucide/svelte/icons/plus";
  import Minus from "@lucide/svelte/icons/minus";
  import type { Score } from "@repo/music-core";
  import Choice from "#lib/music/components/Choice.svelte";
  import PianoRoll from "#lib/music/hubs/create/PianoRoll.svelte";
  import { btn, btnPrimary, panel } from "#lib/music/components/ui.ts";
  import { db, getBinary } from "#lib/music/runtime/index.ts";
  import { extensionFor, takeKey } from "#lib/music/hubs/create/audioTakes.ts";
  import { recentTakes, takeLength, type MidiTake } from "#lib/music/takes.ts";
  import { ScoreEditor } from "./score-editor.svelte";
  import { Transcriber, type Engine } from "./transcriber.svelte";
  import { estimateTempo, notesToScore, type HeardNote } from "./transcription";
  import { songFromScore, type Song } from "./songs";
  import { saveUserLick } from "#lib/music/user-licks.ts";

  let {
    from,
    start = null,
    onstatus,
    onsaved,
  }: {
    from: "audio" | "take";
    /** A Record take to begin with (an audio take, or a MIDI take). */
    start?: string | null;
    onstatus?: (s: string) => void;
    onsaved?: (song: Song) => void;
  } = $props();

  const transcriber = new Transcriber();
  let engine = $state<Engine>("chords");
  let error = $state("");
  let dragging = $state(false);

  // What was heard, and how it is laid on the grid.
  let heard = $state.raw<{ notes: HeardNote[]; title: string; kind: "transcribed" | "take" } | null>(null);
  let bpm = $state(90);
  let offset = $state(0);
  let split = $state(true);
  let sensitivity = $state(0.5);
  let editor = $state.raw<ScoreEditor | null>(null);
  /** A re-snap waiting for "drop my edits". */
  let pendingSnap = $state<(() => void | Promise<void>) | null>(null);

  let takes = $state.raw<MidiTake[]>([]);
  type AudioTake = { id: string; name: string; durationMs: number; mimeType: string };
  let audioTakes = $state.raw<AudioTake[]>([]);
  onMount(async () => {
    if (from === "take") {
      takes = await recentTakes(20);
      const t = start && takes.find((x) => x.id === start);
      if (t) useTake(t);
    } else {
      const rows = (await db.audioTakes.orderBy("createdAt").reverse().limit(12).toArray()) as unknown as AudioTake[];
      audioTakes = rows.filter((r) => typeof r.name === "string");
      const t = start && audioTakes.find((x) => x.id === start);
      if (t) void transcribeTake(t);
    }
  });

  /** A recording from Record, read back from storage and transcribed like a file. */
  async function transcribeTake(t: AudioTake) {
    const blob = await getBinary(takeKey(t.id));
    if (!blob) return void (error = `The audio for ${t.name} is no longer stored. Record it again.`);
    await takeAudio(new File([blob], `${t.name}.${extensionFor(t.mimeType)}`, { type: t.mimeType }));
  }
  onDestroy(() => {
    editor?.stop();
    transcriber.dispose();
  });

  const announce = (msg: string) => onstatus?.(msg);

  function build() {
    if (!heard) return;
    editor?.stop();
    editor = new ScoreEditor(notesToScore(heard.notes, { bpm, offset, title: heard.title, split }));
  }
  /** Re-snap now, or ask first if the roll has edits. */
  function resnap(apply: () => void | Promise<void>) {
    const run = async () => {
      await apply();
      build();
    };
    if (editor?.changed) pendingSnap = run;
    else void run();
  }

  function take(notes: HeardNote[], title: string, kind: "transcribed" | "take") {
    heard = { notes, title, kind };
    const t = estimateTempo(notes);
    bpm = Math.round(t.bpm);
    offset = t.offset;
    build();
    const e = editor!;
    announce(
      e.noteCount
        ? `Heard ${e.noteCount} notes at about ${bpm} BPM. Fix any in the roll, then save.`
        : "No clear notes were found. Try more sensitivity, or draw them in the roll.",
    );
  }

  async function takeAudio(file: File | undefined) {
    if (!file || transcriber.busy) return;
    error = "";
    announce(`Listening to ${file.name}. The page stays usable; Cancel stops it.`);
    try {
      const r = await transcriber.run(file, engine, sensitivity);
      take(r.notes, file.name.replace(/\.[^.]+$/, ""), "transcribed");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "cancelled") return announce("Stopped listening.");
      error = msg;
      announce(msg);
    }
  }

  function setSensitivity(v: number) {
    resnap(async () => {
      sensitivity = v;
      await renote();
    });
  }
  async function renote() {
    if (!heard || engine !== "chords") return;
    try {
      const notes = await transcriber.renote(sensitivity);
      heard = { ...heard, notes };
      build();
      announce(`${editor!.noteCount} notes at this sensitivity.`);
    } catch (e) {
      if ((e as Error).message !== "cancelled") error = (e as Error).message;
    }
  }

  function useTake(t: MidiTake) {
    take(
      t.notes.map((n) => ({ midi: n.midi, start: n.startMs / 1000, duration: n.durationMs / 1000, amplitude: n.velocity })),
      t.name,
      "take",
    );
  }

  function blank() {
    heard = null;
    editor?.stop();
    const score: Score = {
      id: crypto.randomUUID(),
      title: "My song",
      bpm,
      meter: { beats: 4, beatUnit: 4 },
      voices: [{ id: "melody", name: "Melody", notes: [] }],
      lengthBeats: 16,
      source: { kind: "transcribed" },
    };
    editor = new ScoreEditor(score);
    announce("An empty roll, four bars long. Click cells to add notes.");
  }

  async function save() {
    if (!editor) return;
    if (!editor.noteCount) return announce("Add at least one note before saving.");
    editor.stop();
    const score = { ...editor.toScore(), id: crypto.randomUUID(), source: { kind: heard?.kind ?? "transcribed" } } as Score;
    const song = songFromScore(score, { source: heard?.kind === "take" ? "MIDI take" : "transcribed" });
    await db.songs.put(song);
    announce(`Saved ${song.title} to your songs.`);
    editor = null;
    heard = null;
    onsaved?.(song);
  }

  /** The first four bars of the top part as a lick, to drill in Phrases in any key. */
  async function saveLick() {
    if (!editor?.noteCount) return announce("Add at least one note before saving a lick.");
    const score = editor.toScore();
    const id = await saveUserLick({ title: `${score.title || "Transcription"}, first bars`, from: "a transcription", bpm: score.bpm, notes: score.voices[0]?.notes ?? [] });
    announce(id ? "Saved the first four bars as a lick. Find it in Phrases under Your licks." : "The top part has no notes to save.");
  }

  const field = "min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm";
</script>

{#if from === "audio"}
  <div class="flex flex-col gap-3">
    <Choice
      label="What's in the recording"
      options={[
        { value: "chords", label: "Chords and parts", hint: "A machine-learning model (Spotify's Basic Pitch) that hears several notes at once, on any instrument. Slower, much better on piano and guitar." },
        { value: "melody", label: "One melody line", hint: "Follows one note at a time: a sung line, a whistle, a single-note riff. Fast." },
      ]}
      value={engine}
      disabled={transcriber.busy}
      onchange={(v) => (engine = v as Engine)}
    />
    <p class="max-w-prose text-sm text-ws-soft">
      Works best on one instrument recorded cleanly. A full band mix with vocals comes out rough: every sound becomes notes. If you have the song as MusicXML or MIDI, import that instead.
    </p>
    {#if transcriber.busy}
      <div class="{panel} flex flex-col gap-3" aria-live="polite">
        <div class="flex flex-wrap items-center gap-3">
          <p class="min-w-0 flex-1 font-medium">{transcriber.step}{transcriber.progress !== null ? `, ${Math.round(transcriber.progress * 100)}%` : ""}…</p>
          <button type="button" class={btn} onclick={() => transcriber.cancel()}>Cancel</button>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-ws-raised" role="progressbar" aria-label="Transcription progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={transcriber.progress === null ? undefined : Math.round(transcriber.progress * 100)}>
          <div class="h-full rounded-full bg-instr transition-[width]" class:indeterminate={transcriber.progress === null} style:width="{(transcriber.progress ?? 0.3) * 100}%"></div>
        </div>
      </div>
    {:else}
      <label
        class="drop"
        class:dragging
        ondragover={(e) => {
          e.preventDefault();
          dragging = true;
        }}
        ondragleave={() => (dragging = false)}
        ondrop={(e) => {
          e.preventDefault();
          dragging = false;
          void takeAudio(e.dataTransfer?.files[0]);
        }}
      >
        <Upload class="size-7" aria-hidden="true" />
        <span class="font-display text-lg font-semibold">Drop an audio file here, or choose one</span>
        <span class="text-sm text-ws-soft">WAV, MP3, M4A or OGG</span>
        <input class="sr-only" type="file" accept="audio/*" aria-label="Audio file to transcribe" onchange={(e) => takeAudio(e.currentTarget.files?.[0])} />
      </label>
      {#if audioTakes.length}
        <div class="flex flex-col gap-2">
          <h3 class="text-sm font-medium">Or one of your recordings from <a class="text-instr-ink underline underline-offset-4" href="/music/record">Record</a></h3>
          <ul class="grid gap-2 sm:grid-cols-2" aria-label="Audio takes">
            {#each audioTakes as t (t.id)}
              <li class="flex items-center gap-3 rounded-xl border border-ws-line bg-ws-surface p-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium">{t.name}</p>
                  <p class="text-xs text-ws-soft">{takeLength(t.durationMs)}</p>
                </div>
                <button type="button" class={btn} onclick={() => transcribeTake(t)}>Transcribe</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <div class="flex flex-col gap-3">
    <p class="max-w-prose text-sm text-ws-soft">Play it on a MIDI keyboard in <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/record">Record</a>, then turn the take into a song here. The tempo is found from your playing.</p>
    {#if takes.length}
      <ul class="grid gap-2 sm:grid-cols-2" aria-label="MIDI takes">
        {#each takes as t (t.id)}
          <li class="flex items-center gap-3 rounded-xl border border-ws-line bg-ws-surface p-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{t.name}</p>
              <p class="text-xs text-ws-soft">{t.notes.length} notes, {takeLength(t.durationMs)}</p>
            </div>
            <button type="button" class={btn} onclick={() => useTake(t)}>Use this take</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class={panel}>No MIDI takes yet. <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/record">Record one</a>, then come back.</p>
    {/if}
  </div>
{/if}

{#if error}
  <p role="alert" class="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium"><span aria-hidden="true">✕ </span>{error}</p>
{/if}

{#if !editor && !transcriber.busy}
  <button type="button" class="{btn} self-start" onclick={blank}>Start from an empty roll</button>
{/if}

{#if editor}
  {@const e = editor}
  <section class="{panel} flex flex-col gap-4" aria-labelledby="draft-h">
    <h2 id="draft-h" class="font-display text-xl font-semibold">Draft</h2>
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
        <span class="font-medium">Title</span>
        <input class={field} value={e.doc.title} onchange={(ev) => (e.doc = { ...e.doc, title: ev.currentTarget.value })} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Tempo (BPM){heard ? ", detected" : ""}</span>
        <input
          class="{field} tnum w-28"
          type="number"
          min="30"
          max="240"
          value={heard ? bpm : e.doc.bpm}
          onchange={(ev) => {
            const v = Math.min(240, Math.max(30, Math.round(ev.currentTarget.valueAsNumber) || bpm));
            if (!heard) return void (e.doc = { ...e.doc, bpm: v });
            resnap(() => void (bpm = v));
          }}
        />
      </label>
      {#if heard}
        <label class="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" class="size-4 accent-[var(--instr)]" checked={split} onchange={(ev) => { const v = ev.currentTarget.checked; resnap(() => void (split = v)); }} />
          Split into two hands at middle C
        </label>
      {/if}
      {#if heard?.kind === "transcribed" && engine === "chords"}
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Sensitivity</span>
          <span class="flex items-center gap-2 text-xs text-ws-soft">Fewer<input type="range" min="0" max="1" step="0.1" class="w-32 accent-[var(--instr)]" value={sensitivity} disabled={transcriber.busy} onchange={(ev) => setSensitivity(ev.currentTarget.valueAsNumber)} aria-label="Sensitivity" aria-valuetext="{Math.round(sensitivity * 10)} of 10" />More notes</span>
        </label>
      {/if}
      <div class="flex items-center gap-1 text-sm" role="group" aria-label="Length">
        <button type="button" class="{btn} w-11 px-0" aria-label="Remove the last bar" disabled={e.doc.lengthBeats <= e.barBeats} onclick={() => e.setBars(e.doc.lengthBeats / e.barBeats - 1)}><Minus class="size-4" aria-hidden="true" /></button>
        <span class="tnum w-16 text-center font-medium">{Math.round(e.doc.lengthBeats / e.barBeats)} {Math.round(e.doc.lengthBeats / e.barBeats) === 1 ? "bar" : "bars"}</span>
        <button type="button" class="{btn} w-11 px-0" aria-label="Add a bar" onclick={() => e.setBars(e.doc.lengthBeats / e.barBeats + 1)}><Plus class="size-4" aria-hidden="true" /></button>
      </div>
    </div>
    {#if pendingSnap}
      <div class="flex flex-wrap items-center gap-2 rounded-xl border border-instr bg-instr-wash p-3 text-sm" role="group" aria-label="Re-snap the draft">
        <p class="min-w-0 flex-1 font-medium">Re-snapping rebuilds the draft from what was heard, and drops your edits in the roll.</p>
        <button type="button" class={btnPrimary} onclick={async () => { const run = pendingSnap!; pendingSnap = null; await run(); }}>Re-snap</button>
        <button type="button" class={btn} onclick={() => (pendingSnap = null)}>Keep my edits</button>
      </div>
    {/if}
    <PianoRoll host={e} {announce} noun="parts" />
    <div class="flex flex-wrap gap-2">
      <button type="button" class={btnPrimary} onclick={save}>Save to songs</button>
      <button type="button" class={btn} onclick={saveLick}>Save the first bars as a lick</button>
      <button type="button" class={btn} onclick={() => { e.stop(); editor = null; heard = null; }}>Discard</button>
    </div>
  </section>
{/if}

<style>
  .drop {
    display: flex;
    min-height: 11rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 1.5rem;
    text-align: center;
    border: 2px dashed color-mix(in oklch, var(--instr-ink) 45%, transparent);
    border-radius: 1.25rem;
    background: var(--instr-wash);
    cursor: pointer;
  }
  .drop:hover,
  .drop.dragging {
    background: color-mix(in oklch, var(--instr) 26%, transparent);
  }
  .drop:focus-within {
    outline: 2px solid var(--instr-ink);
    outline-offset: 2px;
  }
  .indeterminate {
    animation: slide 1.2s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(340%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .indeterminate {
      animation: none;
    }
  }
</style>
