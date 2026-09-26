<script lang="ts">
  // Import a score (MIDI, MusicXML, .mxl) or transcribe an audio file into a
  // draft, preview it, fix it, save it to repertoire.
  import Upload from "lucide-svelte/icons/upload";
  import Plus from "lucide-svelte/icons/plus";
  import X from "lucide-svelte/icons/x";
  import Volume from "lucide-svelte/icons/volume-2";
  import { noteName, parseNote, type Score } from "@repo/music-core";
  import { transcribe } from "@repo/music-core/signal/transcribe";
  import Staff from "$lib/music/notation/Staff.svelte";
  import { btn, btnPrimary, panel } from "$lib/music/components/ui";
  import { audio, db } from "$lib/music/runtime";
  import RollThumb from "./RollThumb.svelte";
  import {
    SCORE_ACCEPT,
    barsText,
    durationText,
    importScoreFile,
    rangeText,
    rowsToScore,
    scoreFacts,
    scoreToRows,
    songFromScore,
    type NoteRow,
    type Song,
  } from "./songs";

  let { onstatus }: { onstatus?: (s: string) => void } = $props();

  let mode = $state<"score" | "audio">("score");
  let error = $state("");
  let busy = $state(false);
  let dragging = $state(false);
  let preview = $state.raw<{ score: Score; file: string } | null>(null);
  let title = $state("");
  let composer = $state("");
  let saved = $state.raw<Song | null>(null);

  // Transcription draft
  let rows = $state<NoteRow[]>([]);
  let draftOpen = $state(false);
  let draftTitle = $state("");
  let draftBpm = $state(90);
  let rowError = $state("");
  const draftScore = $derived(rowsToScore(rows, draftTitle, draftBpm));

  function fail(msg: string) {
    error = msg;
    onstatus?.(msg);
  }

  async function takeScore(file: File | undefined) {
    if (!file) return;
    error = "";
    saved = null;
    busy = true;
    try {
      const score = await importScoreFile(file.name, new Uint8Array(await file.arrayBuffer()));
      preview = { score, file: file.name };
      title = score.title;
      composer = score.composer ?? "";
      onstatus?.(`Read ${file.name}: ${scoreFacts(score).notes} notes. Check the preview, then save.`);
    } catch (e) {
      preview = null;
      fail((e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function takeAudio(file: File | undefined) {
    if (!file) return;
    error = "";
    saved = null;
    busy = true;
    onstatus?.(`Listening through ${file.name}.`);
    try {
      const ctx = new AudioContext();
      let buf: AudioBuffer;
      try {
        buf = await ctx.decodeAudioData(await file.arrayBuffer());
      } catch {
        throw new Error(`"${file.name}" could not be decoded as audio. Try a WAV or MP3.`);
      } finally {
        void ctx.close();
      }
      const mono = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
      }
      // ponytail: runs on the main thread; move to a worker if long files freeze the page.
      const score = transcribe(mono, buf.sampleRate, { bpm: draftBpm, title: file.name.replace(/\.[^.]+$/, "") });
      rows = scoreToRows(score);
      draftTitle = score.title;
      draftOpen = true;
      onstatus?.(rows.length ? `Found ${rows.length} notes. Fix any that are wrong, then save.` : "No clear notes were found. Add them by hand below.");
    } catch (e) {
      fail((e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function save(score: Score, meta: { composer?: string; source?: string }) {
    const song = songFromScore(score, meta);
    await db.songs.put(song);
    saved = song;
    onstatus?.(`Saved ${song.title} to your songs.`);
  }

  async function saveImport() {
    if (!preview) return;
    await save({ ...preview.score, title: title.trim() || preview.score.title, composer: composer.trim() || undefined }, { composer: composer.trim(), source: preview.file });
    preview = null;
  }

  async function saveDraft() {
    if (!draftScore.voices[0].notes.length) return (rowError = "Add at least one note before saving.");
    await save(draftScore, { source: "transcribed" });
    draftOpen = false;
    rows = [];
  }

  function drop(e: DragEvent, handle: (f: File | undefined) => void) {
    e.preventDefault();
    dragging = false;
    handle(e.dataTransfer?.files[0]);
  }

  function setNote(i: number, text: string) {
    const m = parseNote(text);
    if (m === null || m < 0 || m > 127) {
      rowError = `Row ${i + 1}: "${text}" is not a note name. Write it like C4, F#3 or Bb5.`;
      return;
    }
    rowError = "";
    rows[i].midi = m;
  }
  function addRow() {
    const last = rows.at(-1);
    rows.push({ midi: last?.midi ?? 60, startBeat: last ? last.startBeat + last.durationBeats : 0, durationBeats: 1 });
  }
  async function hear(midi: number) {
    await audio.unlock();
    audio.playNote(midi, 0.5);
  }
</script>

<div class="flex flex-col gap-5">
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex rounded-full border border-ws-line bg-ws-surface p-1" role="group" aria-label="What to import">
      {#each [["score", "Score file"], ["audio", "Transcribe audio"]] as const as [id, label] (id)}
        <button
          type="button"
          class="min-h-10 rounded-full px-4 text-sm font-medium {mode === id ? 'bg-ws-ink text-ws-bg' : 'text-ws-soft hover:text-ws-ink'}"
          aria-pressed={mode === id}
          onclick={() => ((mode = id), (error = ""))}>{label}</button
        >
      {/each}
    </div>
    <p class="text-sm text-ws-soft">
      {mode === "score" ? "MusicXML (.musicxml, .xml or .mxl) is best: it keeps the parts, key and bar lines as written. MIDI works too, but its timing and voices are often rougher." : "One instrument, one note at a time: a sung line, a whistle, a single-note riff."}
    </p>
  </div>

  {#if saved}
    <div class="{panel} flex flex-wrap items-center gap-3">
      <p class="min-w-0 flex-1 font-medium">{saved.title} is in your songs.</p>
      <a class={btnPrimary} href="/music/songs/{saved.id}">Open in Song Studio</a>
      <a class={btn} href="?tab=songs">See all songs</a>
    </div>
  {/if}

  <div class="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
    {#if mode === "score"}
      <label
        class="drop"
        class:dragging
        ondragover={(e) => {
          e.preventDefault();
          dragging = true;
        }}
        ondragleave={() => (dragging = false)}
        ondrop={(e) => drop(e, takeScore)}
      >
        <Upload class="size-7" aria-hidden="true" />
        <span class="font-display text-lg font-semibold">{busy ? "Reading the score" : "Drop a score here, or choose a file"}</span>
        <span class="text-sm text-ws-soft">MusicXML preferred (.musicxml, .xml, .mxl); .mid and .midi work too</span>
        <input class="sr-only" type="file" accept={SCORE_ACCEPT} aria-label="Score file" data-testid="score-file" onchange={(e) => takeScore(e.currentTarget.files?.[0])} />
      </label>
    {:else}
      <div class="flex flex-col gap-3">
        <p class="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          <strong>Monophonic and untuned.</strong> Transcription follows one note at a time, so chords come out as a single line, and its settings have not been tuned on real recordings yet. Expect to fix notes by hand in the editor.
        </p>
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Tempo of the recording (BPM)</span>
            <input class="min-h-11 w-32 rounded-lg border border-ws-line bg-ws-surface px-3" type="number" min="20" max="300" bind:value={draftBpm} />
          </label>
          <button type="button" class={btn} onclick={() => ((draftOpen = true), (draftTitle ||= "My transcription"), rows.length || addRow())}>Type notes by hand instead</button>
        </div>
        <label
          class="drop"
          class:dragging
          ondragover={(e) => {
            e.preventDefault();
            dragging = true;
          }}
          ondragleave={() => (dragging = false)}
          ondrop={(e) => drop(e, takeAudio)}
        >
          <Upload class="size-7" aria-hidden="true" />
          <span class="font-display text-lg font-semibold">{busy ? "Listening" : "Drop an audio file here, or choose one"}</span>
          <span class="text-sm text-ws-soft">WAV, MP3, M4A or OGG</span>
          <input class="sr-only" type="file" accept="audio/*" aria-label="Audio file to transcribe" onchange={(e) => takeAudio(e.currentTarget.files?.[0])} />
        </label>
      </div>
    {/if}
    <div class="min-h-6">
      {#if error}
        <p role="alert" class="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium">
          <span aria-hidden="true">✕ </span>{error}
        </p>
      {/if}
    </div>
  </div>

  {#if preview && mode === "score"}
    {@const f = scoreFacts(preview.score)}
    <section class="{panel} flex flex-col gap-4" aria-labelledby="preview-h">
      <h2 id="preview-h" class="font-display text-xl font-semibold">Preview</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm"><span class="font-medium">Title</span><input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={title} /></label>
        <label class="flex flex-col gap-1 text-sm"><span class="font-medium">Composer</span><input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={composer} placeholder="Optional" /></label>
      </div>
      <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div><dt class="text-ws-soft">Tempo</dt><dd class="tnum font-semibold">{preview.score.bpm} BPM</dd></div>
        <div><dt class="text-ws-soft">Meter</dt><dd class="font-semibold">{f.meter}</dd></div>
        <div><dt class="text-ws-soft">Key</dt><dd class="font-semibold">{f.key ?? "Not marked"}</dd></div>
        <div><dt class="text-ws-soft">Length</dt><dd class="tnum font-semibold">{barsText(f.bars)}, {durationText(f.seconds)}</dd></div>
        <div><dt class="text-ws-soft">Notes</dt><dd class="tnum font-semibold">{f.notes}</dd></div>
        <div><dt class="text-ws-soft">Range</dt><dd class="font-semibold">{rangeText(f)}</dd></div>
        <div class="col-span-2"><dt class="text-ws-soft">Voices</dt><dd class="font-semibold">{preview.score.voices.map((v) => v.name).join(", ")}</dd></div>
      </dl>
      <div class="stage rounded-xl p-3"><RollThumb score={preview.score} height={80} /></div>
      <Staff score={preview.score} maxHeight="22rem" />
      <div class="flex flex-wrap gap-2">
        <button type="button" class={btnPrimary} onclick={saveImport}>Save to songs</button>
        <button type="button" class={btn} onclick={() => (preview = null)}>Discard</button>
      </div>
    </section>
  {/if}

  {#if draftOpen && mode === "audio"}
    <section class="{panel} flex flex-col gap-4" aria-labelledby="draft-h">
      <h2 id="draft-h" class="font-display text-xl font-semibold">Draft notes</h2>
      <label class="flex max-w-md flex-col gap-1 text-sm"><span class="font-medium">Title</span><input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={draftTitle} /></label>
      <div class="stage rounded-xl p-3"><RollThumb score={draftScore} height={80} /></div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="overflow-x-auto" role="region" aria-label="Note rows" tabindex="0">
        <table class="w-full min-w-[30rem] text-sm">
          <thead class="text-left text-ws-soft">
            <tr><th scope="col" class="py-2 pr-2 font-medium">Note</th><th scope="col" class="px-2 font-medium">Starts on beat</th><th scope="col" class="px-2 font-medium">Beats long</th><th scope="col"><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {#each rows as r, i (i)}
              <tr class="border-t border-ws-line">
                <td class="py-1.5 pr-2">
                  <input class="min-h-11 w-24 rounded-lg border border-ws-line bg-ws-surface px-2" aria-label="Row {i + 1} note" value={noteName(r.midi, "sharp")} onchange={(e) => setNote(i, e.currentTarget.value)} />
                </td>
                <td class="px-2"><input class="tnum min-h-11 w-24 rounded-lg border border-ws-line bg-ws-surface px-2" type="number" min="0" step="0.25" aria-label="Row {i + 1} start beat" bind:value={r.startBeat} /></td>
                <td class="px-2"><input class="tnum min-h-11 w-24 rounded-lg border border-ws-line bg-ws-surface px-2" type="number" min="0.125" step="0.25" aria-label="Row {i + 1} length in beats" bind:value={r.durationBeats} /></td>
                <td class="whitespace-nowrap pl-2 text-right">
                  <button type="button" class="{btn} px-3" aria-label="Hear row {i + 1}" onclick={() => hear(r.midi)}><Volume class="size-4" aria-hidden="true" /></button>
                  <button type="button" class="{btn} px-3" aria-label="Remove row {i + 1}" onclick={() => rows.splice(i, 1)}><X class="size-4" aria-hidden="true" /></button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if rowError}<p class="text-sm font-medium text-destructive">{rowError}</p>{/if}
      <div class="flex flex-wrap gap-2">
        <button type="button" class={btn} onclick={addRow}><Plus class="size-4" aria-hidden="true" />Add a note</button>
        <button type="button" class={btnPrimary} onclick={saveDraft}>Save to songs</button>
      </div>
    </section>
  {/if}
</div>

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
</style>
