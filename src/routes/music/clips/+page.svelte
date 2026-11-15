<script lang="ts">
  // Test recordings: the 42 detection clips recorded through every ticked input
  // at once, each to an uncompressed WAV in a folder the player picks. A tool
  // page, reached from Settings. It writes files only: no session, no take, no
  // setting and nothing in the app's database.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import Mic from "lucide-svelte/icons/mic";
  import Square from "lucide-svelte/icons/square";
  import Play from "lucide-svelte/icons/play";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import Check from "lucide-svelte/icons/check";
  import FolderOpen from "lucide-svelte/icons/folder-open";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import TriangleAlert from "lucide-svelte/icons/triangle-alert";
  import Headphones from "lucide-svelte/icons/headphones";
  import Speaker from "lucide-svelte/icons/speaker";
  import { encodeWavFloat } from "@repo/music-core/io/wav";
  import { levelAdvice, LEVEL_FLOOR_DB } from "@repo/music-core/signal/level";
  import { writtenOffset } from "@repo/music-core/theory/transposition";
  import { btn, btnPrimary, btnStage, panel } from "$lib/music/components/ui";
  import { audio, settings, type MetronomeHandle, type SequenceHandle, type SequenceNote } from "$lib/music/runtime";
  import ClipVisual from "$lib/music/clips/ClipVisual.svelte";
  import { CLIPS, SECTIONS, clipFile, exampleSeconds, inputSlug, pad2, type Clip } from "$lib/music/clips/clips";
  import { CLIP_DB, ClipInput, listInputs, type RawTake } from "$lib/music/clips/capture.svelte";
  import {
    canPickFolder,
    canWrite,
    download,
    emptyNotes,
    mergeManifest,
    pickFolder,
    readTake,
    rememberFolder,
    rememberedFolder,
    scanFolder,
    writeJson,
    writeTake,
    type ClipNotes,
    type FolderHandle,
    type Manifest,
    type TakeEntry,
  } from "$lib/music/clips/folder";

  const PREROLL_MS = 1000;
  const TICKED_KEY = "woodshed.clips.inputs";

  // ---- The clip in view -------------------------------------------------
  const fromUrl = Number(page.url.searchParams.get("clip"));
  let current = $state(CLIPS.some((c) => c.n === fromUrl) ? fromUrl : 1);
  const clip = $derived(CLIPS[current - 1]);
  let panelEl: HTMLElement | undefined = $state();

  function open(n: number) {
    if (n === current || busy) return;
    stopDemo();
    stopClick();
    current = n;
    phase = "idle";
    takes = [];
    status = "";
    const url = new URL(page.url);
    url.searchParams.set("clip", String(n));
    try {
      replaceState(url, page.state);
    } catch {
      // before the router starts: the address keeps the old clip
    }
    panelEl?.scrollIntoView({ block: "nearest" });
  }

  // ---- Inputs -----------------------------------------------------------
  let inputs = $state.raw<ClipInput[]>([]);
  let listed = $state(false);
  let inputError = $state("");
  let ticked = $state<string[]>([]);
  const live = $derived(inputs.filter((i) => i.state === "on"));

  /** Folder names by device, a number added when two inputs share a label. */
  const slugs = $derived.by(() => {
    const out = new Map<string, string>();
    const used = new Map<string, number>();
    for (const i of inputs) {
      const base = inputSlug(i.label);
      const count = (used.get(base) ?? 0) + 1;
      used.set(base, count);
      out.set(i.deviceId, count > 1 ? `${base}-${count}` : base);
    }
    return out;
  });
  const slugOf = (i: ClipInput) => slugs.get(i.deviceId) ?? inputSlug(i.label);

  async function refreshInputs() {
    const found = await listInputs();
    const next = found.map((d) => inputs.find((i) => i.deviceId === d.deviceId) ?? new ClipInput(d.deviceId, d.label));
    for (const old of inputs) if (!next.includes(old)) old.close();
    inputs = next;
    listed = found.length > 0;
    // Inputs ticked last time open again, so their meters are live at once.
    for (const i of next) if (ticked.includes(i.label) && i.state === "off") void i.open();
  }

  async function allow() {
    inputError = "";
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("none");
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      await refreshInputs();
      if (!listed) inputError = "No audio input found. Plug one in, then try again.";
    } catch (e) {
      const name = (e as DOMException).name;
      inputError =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access is blocked. Allow the microphone for this site (the icon in the address bar), then try again."
          : "No audio input found. Plug one in, then try again.";
    }
  }

  function tick(i: ClipInput, on: boolean) {
    ticked = on ? [...new Set([...ticked, i.label])] : ticked.filter((l) => l !== i.label);
    try {
      localStorage.setItem(TICKED_KEY, JSON.stringify(ticked));
    } catch {
      // not remembered
    }
    if (on) void i.open();
    else i.close();
  }

  // ---- Folder, manifest, notes -------------------------------------------
  const picker = canPickFolder();
  let folder = $state.raw<FolderHandle | null>(null);
  /** A folder remembered from last time that the browser wants confirmed again. */
  let asleep = $state.raw<FolderHandle | null>(null);
  let manifest = $state.raw<Manifest | null>(null);
  let found = $state<Record<string, number[]>>({});
  let notes = $state<ClipNotes>(emptyNotes());
  let folderError = $state("");
  let notesTimer: ReturnType<typeof setTimeout> | undefined;
  let notesSaved = $state(false);

  async function useFolder(dir: FolderHandle) {
    folderError = "";
    try {
      const state = await scanFolder(dir);
      folder = dir;
      asleep = null;
      manifest = state.manifest;
      found = state.found;
      if (state.notes) notes = { ...emptyNotes(), ...state.notes, clips: { ...state.notes.clips } };
      void rememberFolder(dir);
    } catch (e) {
      folderError = `That folder couldn't be read: ${(e as Error).message}`;
    }
  }
  async function chooseFolder() {
    try {
      const dir = await pickFolder();
      if (dir) await useFolder(dir);
    } catch (e) {
      folderError = `The folder didn't open: ${(e as Error).message}`;
    }
  }
  async function wake() {
    if (asleep && (await canWrite(asleep, true))) await useFolder(asleep);
  }

  function notesChanged() {
    notesSaved = false;
    clearTimeout(notesTimer);
    if (folder) notesTimer = setTimeout(() => void saveNotes(), 600);
  }
  async function saveNotes() {
    clearTimeout(notesTimer);
    if (!folder) return;
    try {
      await writeJson(folder, "notes.json", $state.snapshot(notes));
      notesSaved = true;
    } catch (e) {
      folderError = `The notes didn't save: ${(e as Error).message}`;
    }
  }

  // ---- The grid -----------------------------------------------------------
  const columns = $derived.by(() => {
    const cols = inputs.map((i) => ({ slug: slugOf(i), label: i.label, connected: true }));
    const known = new Set([...Object.keys(found), ...(manifest?.takes.map((t) => t.inputSlug) ?? [])]);
    for (const slug of [...known].sort())
      if (!cols.some((c) => c.slug === slug))
        cols.push({ slug, label: manifest?.takes.find((t) => t.inputSlug === slug)?.inputLabel ?? slug, connected: false });
    return cols;
  });
  const has = (slug: string, n: number) => !!found[slug]?.includes(n);
  const doneCount = (slug: string) => found[slug]?.length ?? 0;
  const bySection = SECTIONS.map((s) => ({ section: s, clips: CLIPS.filter((c) => c.section === s) }));

  // ---- Hear it and the metronome -------------------------------------------
  let demo: SequenceHandle | null = $state.raw(null);
  let demoStep = $state<number | null>(null);
  let demoSlot = $state<number | null>(null);
  let click: MetronomeHandle | null = $state.raw(null);
  // The Aerophone's notes are written pitch; the example sounds what the instrument sounds.
  const concert = (c: Clip, midi: number) => (c.section === "Aerophone" ? midi - writtenOffset("aerophone", settings.value) : midi);
  const toSequence = (c: Clip, notes: Clip["example"]): SequenceNote[] =>
    notes.map((n) => ({ midi: n.voice ? n.midi : concert(c, n.midi), time: n.time, duration: n.duration, velocity: n.velocity, voice: n.voice, sound: c.sound }));

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoStep = demoSlot = null;
  }
  function stopClick() {
    click?.stop();
    click = null;
  }
  async function hear() {
    if (demo) return stopDemo();
    if (!clip.example.length) return;
    await audio.unlock();
    stopClick();
    const c = clip;
    const notes = toSequence(c, c.example);
    // A clip with a tempo is heard against its click, so the rhythm reads.
    const pitched = c.example.length;
    if (c.bpm && !c.example.some((n) => n.voice === "click")) {
      const beats = Math.ceil((exampleSeconds(c) * c.bpm) / 60 - 0.01);
      for (let i = 0; i < beats; i++) notes.push({ midi: 0, time: (i * 60) / c.bpm, duration: 0.05, velocity: i % 4 === 0 ? 1 : 0.7, voice: "click" });
    }
    const handle = audio.playSequence(notes, {
      onNote: (i) => {
        if (demo !== handle || i >= pitched || c.example[i].voice === "click") return;
        demoStep = c.example[i].step;
        demoSlot = c.example[i].slot ?? null;
      },
    });
    demo = handle;
    demoStep = 0;
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }
  /** One step picked by hand: its first notes only. */
  async function hearStep(step: number) {
    stopDemo();
    const mine = clip.example.filter((n) => n.step === step && !n.voice);
    if (!mine.length) return;
    await audio.unlock();
    const t0 = mine[0].time;
    audio.playSequence(toSequence(clip, mine.filter((n) => n.time < t0 + 0.2).map((n) => ({ ...n, time: n.time - t0, duration: Math.min(n.duration, 1.5) }))));
  }
  async function toggleClick() {
    if (click) return stopClick();
    if (!clip.bpm) return;
    stopDemo();
    await audio.unlock();
    click = audio.metronome.start({ bpm: clip.bpm, audible: () => true });
  }

  // ---- Recording -----------------------------------------------------------
  type Phase = "idle" | "confirm" | "recording" | "stopping" | "review" | "saving";
  interface Take extends RawTake {
    label: string;
    slug: string;
    bytes: Uint8Array;
  }
  let phase = $state<Phase>("idle");
  let takes = $state.raw<Take[]>([]);
  let status = $state("");
  let startedAt = 0;
  let elapsed = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  let playback: SequenceHandle | null = $state.raw(null);
  let playingSlug = $state<string | null>(null);
  const busy = $derived(phase === "recording" || phase === "stopping" || phase === "saving");
  /** Ticked inputs that already hold this clip: recording again replaces those files. */
  const saved = $derived(live.filter((i) => has(slugOf(i), clip.n)));
  const cue = $derived(elapsed < PREROLL_MS ? "Wait" : "Play");
  const clock = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  function record() {
    if (!live.length || busy) return;
    if (phase === "idle" && saved.length) {
      phase = "confirm";
      return;
    }
    stopDemo();
    stopPlayback();
    takes = [];
    status = "";
    startedAt = performance.now();
    elapsed = 0;
    for (const i of live) i.startRecording();
    phase = "recording";
    clearInterval(timer);
    timer = setInterval(() => (elapsed = performance.now() - startedAt), 100);
  }

  async function stop() {
    if (phase !== "recording") return;
    phase = "stopping";
    clearInterval(timer);
    const c = clip;
    const got = await Promise.all(live.map(async (i) => ({ input: i, take: await i.stopRecording() })));
    takes = got.flatMap(({ input, take }) =>
      take ? [{ ...take, label: input.label, slug: slugOf(input), bytes: encodeWavFloat(take.channels, take.sampleRate) }] : [],
    );
    if (!takes.length) {
      phase = "idle";
      status = "Nothing was recorded. Check that an input is ticked and its meter moves, then record again.";
      return;
    }
    phase = "review";
    status = `Clip ${pad2(c.n)}: listen back, then save the take or record again.`;
  }

  function stopPlayback() {
    playback?.stop();
    playback = null;
    playingSlug = null;
  }
  async function playBack(t: Take) {
    const was = playingSlug;
    stopPlayback();
    if (was === t.slug) return;
    await audio.unlock();
    try {
      const handle = await audio.playBlob(new Blob([t.bytes as Uint8Array<ArrayBuffer>], { type: "audio/wav" }));
      playback = handle;
      playingSlug = t.slug;
      void handle.done.then(() => {
        if (playback === handle) stopPlayback();
      });
    } catch (e) {
      status = `The take didn't play: ${(e as Error).message}`;
    }
  }
  /** A saved take read back from the folder. */
  async function playSaved(slug: string) {
    if (!folder) return;
    const was = playingSlug;
    stopPlayback();
    if (was === slug) return;
    await audio.unlock();
    try {
      const handle = await audio.playBlob(await readTake(folder, slug, clipFile(clip)));
      playback = handle;
      playingSlug = slug;
      void handle.done.then(() => {
        if (playback === handle) stopPlayback();
      });
    } catch (e) {
      status = `The saved take didn't play: ${(e as Error).message}`;
    }
  }

  function again() {
    if (phase !== "review") return;
    stopPlayback();
    takes = [];
    phase = "confirm"; // already agreed to replace: record() starts at once
    record();
  }

  async function save() {
    if (phase !== "review") return;
    stopPlayback();
    if (picker && !folder) {
      if (asleep) await wake();
      else await chooseFolder();
      if (!folder) {
        status = "Choose a folder to save the take in.";
        return;
      }
    }
    phase = "saving";
    const c = clip;
    const file = clipFile(c);
    const at = new Date();
    const entries: TakeEntry[] = takes.map((t) => ({
      file: `${t.slug}/${file}`,
      clip: c.n,
      title: c.title,
      inputLabel: t.label,
      inputSlug: t.slug,
      sampleRate: t.sampleRate,
      channels: t.channels.length,
      durationSec: t.durationSec,
      peakDbfs: t.peakDbfs,
      recordedAt: at.toISOString(),
    }));
    try {
      if (folder) {
        for (const t of takes) await writeTake(folder, t.slug, file, t.bytes);
        // The file on disk is the truth: read it again in case it changed outside this page.
        manifest = mergeManifest((await scanFolder(folder)).manifest ?? manifest, entries, at);
        await writeJson(folder, "manifest.json", manifest);
        await saveNotes();
      } else {
        for (const t of takes) download(`${t.slug}--${file}`, t.bytes as Uint8Array<ArrayBuffer>, "audio/wav");
        manifest = mergeManifest(manifest, entries, at);
      }
      for (const t of takes) found[t.slug] = [...new Set([...(found[t.slug] ?? []), c.n])].sort((a, b) => a - b);
      takes = [];
      phase = "idle";
      const next = CLIPS[c.n];
      if (next) open(next.n);
      status = `Take saved: ${file}${next ? `. Next: clip ${pad2(next.n)}.` : ". That was the last clip."}`;
    } catch (e) {
      phase = "review";
      status = `The take didn't save: ${(e as Error).message}. Choose the folder again, then save the take.`;
    }
  }

  // A ticked checkbox keeps the focus: Space still records there, it never unticks an input.
  const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.("input:not([type=checkbox]), textarea, select, [contenteditable], [role=dialog]");
  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      if (phase === "idle" || phase === "confirm") record();
      else if (phase === "recording") void stop();
    } else if (phase === "confirm" && e.key === "Escape") phase = "idle";
    else if (phase === "review" && e.key === "Enter" && !(e.target as HTMLElement).closest("button, a")) {
      e.preventDefault();
      void save();
    } else if (phase === "review" && e.key.toLowerCase() === "r") again();
  }
  // A focused button would also click on Space's key-up: the key belongs to recording here.
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space" && !typing(e)) e.preventDefault();
  };

  onMount(() => {
    try {
      ticked = JSON.parse(localStorage.getItem(TICKED_KEY) ?? "[]");
    } catch {
      ticked = [];
    }
    void refreshInputs();
    const changed = () => void refreshInputs();
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    if (picker)
      void rememberedFolder().then(async (dir) => {
        if (!dir) return;
        if (await canWrite(dir, false)) await useFolder(dir);
        else asleep = dir;
      });
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
      clearInterval(timer);
      clearTimeout(notesTimer);
      for (const i of inputs) i.close();
      stopDemo();
      stopClick();
      stopPlayback();
    };
  });

  const TONE = { good: "bg-success", quiet: "bg-ws-soft", hot: "bg-warn", clipping: "bg-destructive" } as const;
  const fill = (db: number) => ((Math.max(LEVEL_FLOOR_DB, Math.min(0, db)) - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB) * 100;
  const adviceOf = (i: ClipInput) => (i.clipping ? { tone: "clipping" as const, label: "Clipping" } : levelAdvice(i.held));
  const adviceText = (i: ClipInput) => {
    const a = adviceOf(i);
    return a.tone === "clipping" ? "Clipping: turn this input down" : a.label;
  };
  const dB = (v: number) => `${v <= LEVEL_FLOOR_DB ? "under −60" : v.toFixed(1).replace("-", "−")} dB`;
  const rate = (hz: number) => `${Math.round(hz / 100) / 10} kHz`;
  // The stage's buttons, sized to be found from a metre away.
  const big = "inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-7 text-lg font-semibold disabled:opacity-50";
  const primary = "bg-instr-strong text-on-instr hover:brightness-105";
  const onStage = "bg-ws-stage-ink/10 text-ws-stage-ink hover:bg-ws-stage-ink/20";
  const field = "mt-1 w-full rounded-lg border border-ws-line bg-ws-surface px-3 py-2 text-base placeholder:text-ws-soft";
</script>

<svelte:head><title>Test recordings | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} onkeyup={onKeyUp} />

{#snippet meter(i: ClipInput, stage: boolean)}
  {@const a = adviceOf(i)}
  <div
    class="relative h-2.5 overflow-hidden rounded-full {stage ? 'bg-ws-stage-ink/15' : 'bg-ws-raised'}"
    role="meter"
    aria-label="Level, {i.label}"
    aria-valuemin={LEVEL_FLOOR_DB}
    aria-valuemax="0"
    aria-valuenow={Math.round(i.level)}
    aria-valuetext="{Math.round(i.held)} dB, {adviceText(i)}"
  >
    <div class="h-full rounded-full transition-[width] duration-75 {TONE[a.tone]}" style:width="{fill(i.level)}%"></div>
    <span class="absolute inset-y-0 w-0.5 {stage ? 'bg-ws-stage-ink' : 'bg-ws-ink'}" style:left="calc({fill(i.held)}% - 2px)" aria-hidden="true"></span>
  </div>
{/snippet}

<div class="mx-auto flex max-w-6xl flex-col gap-5">
  <header>
    <h1 class="font-display text-4xl font-semibold tracking-tight">Test recordings</h1>
    <p class="mt-1 max-w-[80ch] text-ws-soft">
      42 short clips for testing how Woodshed hears your instruments. Each take records every ticked input at once and saves as WAV files in your folder. Nothing here counts as practice.
      <a class="font-medium text-instr-ink underline underline-offset-4" href="/music/settings#input">Back to Settings</a>
    </p>
  </header>

  <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
    <div class="contents lg:flex lg:flex-col lg:gap-5">
    <section class="{panel} order-1" aria-labelledby="inputs-h" data-testid="clip-inputs">
      <h2 id="inputs-h" class="font-display text-xl font-semibold">Inputs</h2>
      {#if !listed}
        <p class="mt-1 text-ws-soft">Allow the microphone and Woodshed lists every input by name.</p>
        <button type="button" class="{btnPrimary} mt-3" onclick={allow}><Mic class="size-4" aria-hidden="true" />Allow microphone</button>
      {:else}
        <p class="mt-1 text-ws-soft">Tick the inputs to record. Play at your loudest and keep every meter out of the red.</p>
        <ul class="mt-3 flex flex-col gap-3">
          {#each inputs as i (i.deviceId)}
            {@const on = i.state === "on" || i.state === "starting"}
            <li class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <input id="in-{i.deviceId}" type="checkbox" class="mt-1 size-5 accent-[var(--instr-ink)]" checked={ticked.includes(i.label)} disabled={busy} onchange={(e) => tick(i, e.currentTarget.checked)} />
              <div class="min-w-0">
                <label for="in-{i.deviceId}" class="font-medium">{i.label}</label>
                <p class="text-sm text-ws-soft">
                  Folder <span class="font-medium text-ws-ink">{slugOf(i)}</span>{#if i.state === "on"}, {rate(i.sampleRate)}, {i.channels} {i.channels === 1 ? "channel" : "channels"}{/if}, {doneCount(slugOf(i))} of {CLIPS.length} saved
                </p>
                {#if i.state === "error"}
                  <p class="mt-1 text-sm font-medium text-destructive">{i.error}</p>
                {:else if on}
                  <div class="mt-1.5">
                    {@render meter(i, false)}
                    <p class="tnum mt-1 text-sm {adviceOf(i).tone === 'clipping' ? 'font-semibold text-destructive' : 'text-ws-soft'}">
                      {#if adviceOf(i).tone === "clipping"}<TriangleAlert class="mr-1 inline size-4 align-text-bottom" aria-hidden="true" />{/if}{i.state === "starting" ? "Starting…" : `${dB(i.held)}, ${adviceText(i)}`}
                    </p>
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        {#if columns.some((c) => !c.connected)}
          <p class="mt-3 text-sm text-ws-soft">
            Not connected today: {columns.filter((c) => !c.connected).map((c) => `${c.label} (${doneCount(c.slug)} of ${CLIPS.length} saved)`).join(", ")}. Plug it in to record its missing clips.
          </p>
        {/if}
      {/if}
      {#if inputError}<p class="mt-2 text-sm font-medium text-destructive" role="alert">{inputError}</p>{/if}
    </section>

    <section class="{panel} order-2" aria-labelledby="folder-h" data-testid="clip-folder">
      <h2 id="folder-h" class="font-display text-xl font-semibold">Folder and notes</h2>
      {#if !picker}
        <p class="mt-1 text-ws-soft">This browser can't save into a folder. Each take downloads as a WAV file. Move the files into <span class="font-medium text-ws-ink">.recordings/detection</span> yourself.</p>
        {#if manifest}<button type="button" class="{btn} mt-3" onclick={() => download("manifest.json", JSON.stringify(manifest, null, 2), "application/json")}>Download manifest.json</button>{/if}
      {:else if folder}
        <p class="mt-1 text-ws-soft">Saving in <span class="font-medium text-ws-ink" data-testid="clip-folder-name">{folder.name}</span>, one folder per input.</p>
        <button type="button" class="{btn} mt-3" onclick={chooseFolder}><FolderOpen class="size-4" aria-hidden="true" />Change folder</button>
      {:else}
        <p class="mt-1 text-ws-soft">Choose <span class="font-medium text-ws-ink">.recordings/detection</span> in the project. Takes already in it show in the grid.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          {#if asleep}<button type="button" class={btnPrimary} onclick={wake}><FolderOpen class="size-4" aria-hidden="true" />Open {asleep.name} again</button>{/if}
          <button type="button" class={asleep ? btn : btnPrimary} onclick={chooseFolder}><FolderOpen class="size-4" aria-hidden="true" />Choose folder</button>
        </div>
      {/if}
      {#if folderError}<p class="mt-2 text-sm font-medium text-destructive" role="alert">{folderError}</p>{/if}

      <details class="mt-4 border-t border-ws-line pt-3" open={!!(notes.micPosition || notes.pianoModel || notes.aerophone)}>
        <summary class="flex min-h-11 cursor-pointer items-center font-medium">Notes for the whole set</summary>
        <div class="flex flex-col gap-3 pb-1">
          <label class="text-sm font-medium">Microphone position<input class={field} bind:value={notes.micPosition} oninput={notesChanged} placeholder="Laptop on the desk, 60 cm from the guitar" /></label>
          <label class="text-sm font-medium">Piano model<input class={field} bind:value={notes.pianoModel} oninput={notesChanged} /></label>
          <label class="text-sm font-medium">Aerophone tone and transpose<input class={field} bind:value={notes.aerophone} oninput={notesChanged} placeholder="Alto sax, transpose Eb" /></label>
          <p class="text-sm text-ws-soft">
            {#if !folder}{picker ? "Saved to notes.json once you choose a folder." : ""}{:else if notesSaved}Notes saved to notes.json.{:else}Saves to notes.json as you type.{/if}
          </p>
          {#if !picker}<button type="button" class="{btn} self-start" onclick={() => download("notes.json", JSON.stringify($state.snapshot(notes), null, 2), "application/json")}>Download notes.json</button>{/if}
        </div>
      </details>
    </section>

    <!-- The grid: clips down the side, one column per input that is connected or has takes in the folder. -->
    <section class="{panel} order-4" aria-labelledby="grid-h">
      <h2 id="grid-h" class="font-display text-xl font-semibold">Clips</h2>
      <table class="mt-2 w-full border-collapse" data-testid="clips-grid">
        <thead>
          <tr>
            <th scope="col" class="pb-2 text-left align-bottom text-sm font-medium text-ws-soft">{columns.length ? "Saved, by input" : "Allow the microphone to see a column for each input."}</th>
            {#each columns as c (c.slug)}
              <th scope="col" class="w-11 pb-2 align-bottom text-sm font-medium {c.connected ? '' : 'text-ws-soft'}" title="{c.label}{c.connected ? '' : ', not connected today'}">
                <span class="col-name">{c.slug}</span>
                <span class="sr-only">{c.connected ? "" : ", not connected today"}</span>
              </th>
            {/each}
          </tr>
        </thead>
        {#each bySection as g (g.section)}
          <tbody>
            <tr>
              <th scope="rowgroup" colspan={columns.length + 1} class="pt-3 pb-1 text-left font-display text-base font-semibold">{g.section}</th>
            </tr>
            {#each g.clips as c (c.n)}
              <tr class="border-t border-ws-line {c.n === current ? 'bg-instr-wash' : ''}" data-current={c.n === current || undefined}>
                <th scope="row" class="p-0 text-left font-normal">
                  <button type="button" class="flex min-h-11 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm hover:bg-ws-raised disabled:opacity-60" disabled={busy} aria-current={c.n === current ? "true" : undefined} onclick={() => open(c.n)}>
                    <span class="tnum font-semibold">{pad2(c.n)}</span>
                    <span class="min-w-0 flex-1 leading-tight">{c.title}</span>
                  </button>
                </th>
                {#each columns as col (col.slug)}
                  {@const done = has(col.slug, c.n)}
                  <td class="p-0 text-center">
                    <button type="button" class="grid size-11 place-items-center rounded-md hover:bg-ws-raised disabled:opacity-60" disabled={busy} data-done={done || undefined} aria-label="Clip {pad2(c.n)}, {c.title}, {col.label}: {done ? 'saved' : 'not recorded'}" onclick={() => open(c.n)}>
                      {#if done}
                        <span class="grid size-6 place-items-center rounded-full bg-success text-success-foreground"><Check class="size-4" strokeWidth={3} aria-hidden="true" /></span>
                      {:else}
                        <span class="size-3 rounded-full border-2 {col.connected ? 'border-ws-soft' : 'border-ws-line'}"></span>
                      {/if}
                    </button>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        {/each}
      </table>
    </section>
    </div>

    <!-- One clip: what to play, the stage that records it, and the picture of it. On a wide screen it stays in view beside the grid. -->
    <section class="{panel} order-3 flex min-w-0 scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)] flex-col gap-4 lg:sticky lg:top-[calc(var(--ws-strip-h,3.75rem)+1rem)] lg:max-h-[calc(100dvh-var(--ws-strip-h,3.75rem)-2rem)] lg:overflow-y-auto" aria-labelledby="clip-h" data-testid="clip-panel" bind:this={panelEl}>
      <div class="flex items-start gap-3">
        <p class="tnum font-display text-5xl leading-none font-semibold text-instr-ink" aria-hidden="true">{pad2(clip.n)}</p>
        <div class="min-w-0 flex-1">
          <h2 id="clip-h" class="font-display text-2xl leading-tight font-semibold"><span class="sr-only">Clip {pad2(clip.n)}: </span>{clip.title}</h2>
          <p class="text-sm text-ws-soft">{clip.section}, target length {clip.seconds} s{clip.bpm ? `, ${clip.bpm} BPM` : ""}</p>
        </div>
        <div class="flex shrink-0 gap-1.5">
          <button type="button" class="{btn} px-3" disabled={busy || current === 1} aria-label="Previous clip" onclick={() => open(current - 1)}><ChevronLeft class="size-5" aria-hidden="true" /></button>
          <button type="button" class="{btn} px-3" disabled={busy || current === CLIPS.length} aria-label="Next clip" onclick={() => open(current + 1)}><ChevronRight class="size-5" aria-hidden="true" /></button>
        </div>
      </div>
      <p class="max-w-prose text-lg leading-snug" data-testid="clip-play">{clip.play}</p>

      <!-- The stage: dark in both themes, so the cue reads from across the room. -->
      <div class="rounded-2xl bg-ws-stage p-4 text-ws-stage-ink sm:p-5" data-testid="clip-stage" data-phase={phase}>
        {#if phase === "recording" || phase === "stopping"}
          <div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
            <p class="cue font-display font-semibold" data-testid="clip-cue" data-cue={cue}>{cue}</p>
            <p class="tnum font-display text-6xl leading-none font-semibold whitespace-nowrap" role="timer" aria-label="Recording time">{clock(elapsed)}<span class="ml-3 text-2xl font-medium text-ws-stage-soft">of {clock(clip.seconds * 1000)}</span></p>
          </div>
          <div class="mt-4 h-3 overflow-hidden rounded-full bg-ws-stage-ink/15" aria-hidden="true">
            <div class="h-full rounded-full {elapsed >= clip.seconds * 1000 ? 'bg-success' : 'bg-instr'}" style:width="{Math.min(100, (elapsed / (clip.seconds * 1000)) * 100)}%"></div>
          </div>
          <div class="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p class="min-w-0 flex-1 basis-64 text-xl text-ws-stage-soft">{cue === "Wait" ? "A second of silence first." : elapsed >= clip.seconds * 1000 ? "Let the last note die away, then press Space." : "Press Space when the last note has died away."}</p>
            <button type="button" class="{big} {onStage}" disabled={phase === "stopping"} onclick={stop}><Square class="size-5" aria-hidden="true" />Stop<kbd class="key">Space</kbd></button>
          </div>
        {:else if phase === "review" || phase === "saving"}
          <p class="font-display text-2xl font-semibold">Take recorded</p>
          <ul class="mt-2 flex flex-col gap-2">
            {#each takes as t (t.slug)}
              {@const clipped = t.peakDbfs >= CLIP_DB}
              <li class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-ws-stage-ink/8 px-3 py-2" data-testid="clip-take">
                <button type="button" class="{btnStage} px-3" aria-label="{playingSlug === t.slug ? 'Stop' : 'Play it back'}, {t.label}" onclick={() => playBack(t)}>
                  {#if playingSlug === t.slug}<Square class="size-4" aria-hidden="true" />Stop{:else}<Play class="size-4" aria-hidden="true" />Play it back{/if}
                </button>
                <p class="min-w-0 flex-1 basis-40 font-medium">{t.label}</p>
                <p class="tnum text-sm text-ws-stage-soft">{t.durationSec.toFixed(1)} s, {rate(t.sampleRate)}, {t.channels.length} {t.channels.length === 1 ? "channel" : "channels"}, peak {dB(t.peakDbfs)}</p>
                {#if clipped}
                  <p class="flex basis-full items-center gap-1.5 text-sm font-semibold text-warn"><TriangleAlert class="size-4" aria-hidden="true" />Clipped. Turn this input down and record again.</p>
                {:else if t.peakDbfs < -40 && clip.n > 1}
                  <p class="basis-full text-sm text-ws-stage-soft">Very quiet. Check this input heard you.</p>
                {/if}
              </li>
            {/each}
          </ul>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" class="{big} {primary}" disabled={phase === "saving"} onclick={save}>{phase === "saving" ? "Saving…" : "Save take"}<kbd class="key">Enter</kbd></button>
            <button type="button" class="{big} {onStage}" disabled={phase === "saving"} onclick={again}>Record again<kbd class="key">R</kbd></button>
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
            {#if phase === "confirm"}
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" class="{big} {primary}" onclick={record}><Mic class="size-5" aria-hidden="true" />Record over it<kbd class="key">Space</kbd></button>
                <button type="button" class="{big} {onStage}" onclick={() => (phase = "idle")}>Cancel</button>
              </div>
              <p class="min-w-0 flex-1 basis-56 text-lg" role="alert">This clip is already saved for {saved.map((i) => i.label).join(" and ")}. Recording again replaces {saved.length === 1 ? "that file" : "those files"} when you save.</p>
            {:else}
              <button type="button" class="{big} {primary}" disabled={!live.length} onclick={record}><Mic class="size-5" aria-hidden="true" />Record<kbd class="key">Space</kbd></button>
              <p class="min-w-0 flex-1 basis-56 text-lg text-ws-stage-soft">
                {#if !live.length}Tick an input above to record.{:else}Space starts and stops. Wait for the cue, play, and let the last note die away.{/if}
              </p>
            {/if}
          </div>
          {#if live.length}
            <ul class="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
              {#each live as i (i.deviceId)}
                {@const done = has(slugOf(i), clip.n)}
                <li>
                  <div class="flex items-baseline justify-between gap-2 text-sm">
                    <span class="min-w-0 truncate font-medium">{i.label}</span>
                    <span class="shrink-0 {i.clipping ? 'font-semibold text-warn' : 'text-ws-stage-soft'}">{i.clipping ? "Clipping" : done ? "Saved" : "Not recorded"}</span>
                  </div>
                  <div class="mt-1">{@render meter(i, true)}</div>
                  {#if done && folder}
                    <button type="button" class="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-4" onclick={() => playSaved(slugOf(i))}>
                      {#if playingSlug === slugOf(i)}<Square class="size-4" aria-hidden="true" />Stop{:else}<Play class="size-4" aria-hidden="true" />Play the saved take{/if}
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
        <p class="text-base text-ws-stage-soft {status ? 'mt-3' : ''}" role="status" data-testid="clip-status">{status}</p>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        {#if clip.example.length}
          <button type="button" class={btn} disabled={busy} aria-pressed={!!demo} onclick={hear}>
            {#if demo}<Square class="size-4" aria-hidden="true" />Stop{:else}<Volume2 class="size-4" aria-hidden="true" />Hear it{/if}
          </button>
        {:else}
          <p class="text-sm text-ws-soft">Nothing to hear for this clip.</p>
        {/if}
        {#if clip.bpm}
          <button type="button" class="{btn} {click ? 'border-transparent bg-instr-strong text-on-instr hover:bg-instr-strong' : ''}" aria-pressed={!!click} onclick={toggleClick}>Metronome, {clip.bpm} BPM</button>
          <p class="flex min-w-0 flex-1 basis-64 items-center gap-2 text-sm {clip.click === 'speakers' ? 'font-medium' : 'text-ws-soft'}">
            {#if clip.click === "speakers"}
              <Speaker class="size-5 shrink-0" aria-hidden="true" />Play the click through the speakers: this clip tests how the microphone hears it.
            {:else}
              <Headphones class="size-5 shrink-0" aria-hidden="true" />Wear headphones for the click, so the recording holds your playing alone.
            {/if}
          </p>
        {/if}
        {#if demo}<p class="basis-full text-sm text-ws-soft">Demo playing, not recorded.</p>{/if}
      </div>

      {#key clip.n}
        <ClipVisual {clip} step={demoStep} slot={demoSlot} onpick={hearStep} />
      {/key}

      <label class="text-sm font-medium">
        Anything you played differently in clip {pad2(clip.n)}
        <textarea class={field} rows="2" bind:value={() => notes.clips[pad2(clip.n)] ?? "", (v) => (v ? (notes.clips[pad2(clip.n)] = v) : delete notes.clips[pad2(clip.n)])} oninput={notesChanged} placeholder="A wrong note, a skipped strum"></textarea>
      </label>
    </section>
  </div>
</div>

<style>
  /* The cue is the one thing read from a metre away with an instrument in hand. */
  .cue {
    font-size: clamp(4.5rem, 10vw, 7.5rem);
    line-height: 0.85;
    letter-spacing: -0.02em;
  }
  .cue[data-cue="Play"] {
    color: var(--instr);
  }
  .col-name {
    display: inline-block;
    max-height: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  .key {
    margin-left: 0.25rem;
    border: 1px solid currentColor;
    border-radius: 0.375rem;
    padding: 0 0.375rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    opacity: 0.75;
  }
</style>
