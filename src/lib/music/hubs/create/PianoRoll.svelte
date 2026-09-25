<script lang="ts">
  // A multitrack note editor over the canonical score. The grid scrolls inside
  // its own box (it never widens the page); a cursor gives it a keyboard path.
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Plus from "lucide-svelte/icons/plus";
  import Pencil from "lucide-svelte/icons/pencil";
  import MoveH from "lucide-svelte/icons/move-horizontal";
  import FileMusic from "lucide-svelte/icons/file-music";
  import AudioLines from "lucide-svelte/icons/audio-lines";
  import { isBlackKey, noteName } from "@repo/music-core";
  import { scoreToMidi } from "@repo/music-core/io/midi-file";
  import { audio, db, getSetting, putSetting, type SequenceHandle } from "$lib/music/runtime";
  import { btn, btnStage } from "$lib/music/components/ui";
  import { download } from "./files";
  import {
    BAR_BEATS,
    docToScore,
    emptyDoc,
    mapVoice,
    newVoice,
    noteAt,
    resizeNote,
    ROLL_KEY,
    rollRange,
    scoreToDoc,
    setVelocity,
    toggleNote,
    trackColour,
    type RollDoc,
  } from "./roll";
  import { fileStem, scoreToSequence, STEP_BEATS, takeToScore, type MidiTake } from "$lib/music/takes";

  let { announce }: { announce: (msg: string) => void } = $props();

  const ROW_H = 24;
  const KEY_W = 56;
  const LANE_H = 64;
  const LENGTHS = [
    { beats: 0.25, label: "1/16" },
    { beats: 0.5, label: "1/8" },
    { beats: 1, label: "1/4" },
    { beats: 2, label: "1/2" },
    { beats: 4, label: "Whole" },
  ];

  const firstVoice = crypto.randomUUID();
  let doc = $state<RollDoc>(emptyDoc(firstVoice));
  let loaded = false;
  let activeId = $state<string>(firstVoice);
  let tool = $state<"draw" | "resize">("draw");
  let noteLen = $state(0.5);
  let stepW = $state(22);
  let cursor = $state({ midi: 60, step: 0 });
  let playing = $state(false);
  let playBeat = $state(-1);
  let busy = $state(false);
  let confirm = $state<"clear" | "remove" | null>(null);
  let handle: SequenceHandle | null = null;
  let raf = 0;
  let grid: HTMLDivElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();

  const range = $derived(rollRange(doc));
  const rows = $derived(Array.from({ length: range.high - range.low + 1 }, (_, i) => range.high - i));
  const steps = $derived(Math.round(doc.lengthBeats / STEP_BEATS));
  const active = $derived(doc.voices.find((v) => v.id === activeId) ?? doc.voices[0]);
  const activeIndex = $derived(doc.voices.indexOf(active));
  const noteCount = $derived(doc.voices.reduce((n, v) => n + v.notes.length, 0));
  const x = (beat: number) => (beat / STEP_BEATS) * stepW;
  const y = (midi: number) => (range.high - midi) * ROW_H;
  const where = (midi: number, beat: number) => `${noteName(midi)}, bar ${Math.floor(beat / BAR_BEATS) + 1} beat ${Math.floor(beat % BAR_BEATS) + 1}${beat % 1 ? ` and ${Math.round((beat % 1) / STEP_BEATS)} sixteenths` : ""}`;
  const under = $derived(noteAt(active.notes, cursor.midi, cursor.step * STEP_BEATS));

  onMount(async () => {
    const stored = await getSetting<RollDoc | null>(ROLL_KEY, null);
    if (stored?.voices?.length) {
      doc = stored;
      activeId = stored.voices[0].id;
    }
    loaded = true;
    const takeId = page.url.searchParams.get("take");
    if (takeId) await openTake(takeId);
    scroller?.scrollTo({ top: y(72) - 8 });
  });

  async function openTake(id: string) {
    const take = (await db.midiTakes.get(id)) as MidiTake | undefined;
    const q = new URLSearchParams(page.url.searchParams);
    q.delete("take");
    void goto(`?${q}`, { replaceState: true, noScroll: true, keepFocus: true });
    if (!take) return announce("That take is no longer in Record.");
    const voice = scoreToDoc(takeToScore(take, { bpm: doc.bpm, snap: true })).voices[0];
    const v = { ...voice, id: crypto.randomUUID(), name: take.name };
    const end = Math.max(0, ...v.notes.map((n) => n.startBeat + n.durationBeats));
    doc = { ...doc, voices: [...doc.voices, v], lengthBeats: Math.max(doc.lengthBeats, Math.ceil(end / BAR_BEATS) * BAR_BEATS) };
    activeId = v.id;
    announce(`Opened ${take.name} as a new voice, ${v.notes.length} notes snapped to sixteenths at ${doc.bpm} BPM.`);
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snap = $state.snapshot(doc);
    if (!loaded) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void putSetting(ROLL_KEY, snap), 400);
  });

  function set(next: RollDoc) {
    doc = next;
    confirm = null;
  }

  function toggleAt(midi: number, step: number) {
    const beat = step * STEP_BEATS;
    const had = noteAt(active.notes, midi, beat) >= 0;
    set(toggleNote(doc, active.id, midi, beat, noteLen));
    if (!had) void audio.unlock().then(() => audio.playNote(midi, 0.4, active.velocity));
    announce(`${had ? "Removed" : "Added"} ${where(midi, beat)} on ${active.name}.`);
  }

  // Pointer: draw toggles cells; resize drags a note's length.
  let drag: { index: number; start: number; beat: number } | null = null;
  function cellOf(e: PointerEvent) {
    const r = grid!.getBoundingClientRect();
    const step = Math.min(steps - 1, Math.max(0, Math.floor((e.clientX - r.left) / stepW)));
    const row = Math.min(rows.length - 1, Math.max(0, Math.floor((e.clientY - r.top) / ROW_H)));
    return { step, midi: rows[row], beat: (e.clientX - r.left) / stepW * STEP_BEATS };
  }
  function down(e: PointerEvent) {
    if (e.button > 0 || !grid) return;
    const c = cellOf(e);
    cursor = { midi: c.midi, step: c.step };
    if (tool === "draw") return toggleAt(c.midi, c.step);
    const i = noteAt(active.notes, c.midi, c.step * STEP_BEATS);
    if (i < 0) return announce("Resize mode: drag a note of the selected voice to change its length. Switch to Draw to add notes.");
    grid.setPointerCapture?.(e.pointerId);
    drag = { index: i, start: active.notes[i].startBeat, beat: c.beat };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const c = cellOf(e);
    doc = resizeNote(doc, active.id, drag.index, Math.ceil((c.beat - drag.start) / STEP_BEATS) * STEP_BEATS);
  }
  function up() {
    if (!drag) return;
    const n = active.notes[drag.index];
    drag = null;
    if (n) announce(`${noteName(n.midi)} is now ${n.durationBeats / STEP_BEATS} sixteenths long.`);
  }

  function gridKey(e: KeyboardEvent) {
    const k = e.key;
    let { midi, step } = cursor;
    if (k === "ArrowUp" || k === "ArrowDown") {
      if (e.shiftKey) return;
      midi = Math.min(range.high, Math.max(range.low, midi + (k === "ArrowUp" ? 1 : -1)));
    } else if ((k === "ArrowLeft" || k === "ArrowRight") && e.shiftKey) {
      e.preventDefault();
      if (under < 0) return announce("Put the cursor on a note to change its length.");
      const n = active.notes[under];
      set(resizeNote(doc, active.id, under, n.durationBeats + (k === "ArrowRight" ? STEP_BEATS : -STEP_BEATS)));
      const after = doc.voices[activeIndex].notes[under];
      return announce(`${noteName(n.midi)} is ${after.durationBeats / STEP_BEATS} sixteenths long.`);
    } else if (k === "ArrowLeft" || k === "ArrowRight") {
      step = Math.min(steps - 1, Math.max(0, step + (k === "ArrowRight" ? 1 : -1)));
    } else if (k === "Enter" || k === " ") {
      e.preventDefault();
      return toggleAt(midi, step);
    } else if ((k === "Delete" || k === "Backspace") && under >= 0) {
      e.preventDefault();
      return toggleAt(midi, step);
    } else if ((k === "[" || k === "]") && under >= 0) {
      const n = active.notes[under];
      set(setVelocity(doc, active.id, under, (n.velocity ?? 0.8) + (k === "]" ? 0.05 : -0.05)));
      return announce(`Velocity ${Math.round((doc.voices[activeIndex].notes[under].velocity ?? 0.8) * 127)}.`);
    } else return;
    e.preventDefault();
    cursor = { midi, step };
    // Keep the cursor in view inside the roll's own scroll box.
    const s = scroller;
    if (s) {
      const cx = KEY_W + x(step * STEP_BEATS);
      const cy = y(midi) + 28;
      if (cx < s.scrollLeft + KEY_W) s.scrollLeft = cx - KEY_W - stepW;
      else if (cx + stepW > s.scrollLeft + s.clientWidth) s.scrollLeft = cx + 2 * stepW - s.clientWidth;
      if (cy < s.scrollTop + 28) s.scrollTop = cy - 28 - ROW_H;
      else if (cy + ROW_H > s.scrollTop + s.clientHeight - LANE_H) s.scrollTop = cy + 2 * ROW_H - s.clientHeight + LANE_H;
    }
  }

  // Velocity lane: press or drag over a note's bar to set it.
  let laneDrag = false;
  function laneSet(e: PointerEvent) {
    const lane = e.currentTarget as HTMLElement;
    const r = lane.getBoundingClientRect();
    const beat = ((e.clientX - r.left) / stepW) * STEP_BEATS;
    let best = -1;
    active.notes.forEach((n, i) => {
      if (n.startBeat <= beat + STEP_BEATS / 2 && (best < 0 || n.startBeat > active.notes[best].startBeat)) best = i;
    });
    if (best < 0 || beat - active.notes[best].startBeat > Math.max(active.notes[best].durationBeats, STEP_BEATS)) return;
    set(setVelocity(doc, active.id, best, 1 - (e.clientY - r.top - 4) / (LANE_H - 8)));
  }

  function tick() {
    if (!handle) return;
    const t = (performance.now() - handle.startPerf) / 1000;
    playBeat = t < 0 ? -1 : (t * doc.bpm) / 60;
    raf = requestAnimationFrame(tick);
  }
  async function play() {
    if (playing) return stop();
    if (!noteCount) return announce("Add a few notes first.");
    await audio.unlock();
    const h = audio.playSequence(scoreToSequence(docToScore(doc, "roll")));
    handle = h;
    playing = true;
    raf = requestAnimationFrame(tick);
    announce(`Playing ${doc.title}.`);
    void h.done.then(() => {
      if (handle === h) stop(false);
    });
  }
  function stop(say = true) {
    handle?.stop();
    handle = null;
    playing = false;
    cancelAnimationFrame(raf);
    playBeat = -1;
    if (say) announce("Stopped.");
  }

  function exportMidi() {
    if (!noteCount) return announce("Add a few notes first.");
    const name = `${fileStem(doc.title, "sketch")}.mid`;
    download(scoreToMidi(docToScore(doc, crypto.randomUUID())), name, "audio/midi");
    announce(`Downloading ${name}: ${doc.voices.length} ${doc.voices.length === 1 ? "track" : "tracks"}, ${noteCount} notes.`);
  }
  async function exportWav() {
    if (!noteCount) return announce("Add a few notes first.");
    busy = true;
    announce("Rendering the WAV…");
    try {
      const name = `${fileStem(doc.title, "sketch")}.wav`;
      download(await audio.renderWav(scoreToSequence(docToScore(doc, "roll")), (doc.lengthBeats * 60) / doc.bpm), name, "audio/wav");
      announce(`Downloading ${name}.`);
    } catch (e) {
      announce(`The WAV could not be rendered: ${(e as Error).message}`);
    } finally {
      busy = false;
    }
  }

  function addVoice() {
    const v = newVoice(doc.voices.length + 1, crypto.randomUUID());
    set({ ...doc, voices: [...doc.voices, v] });
    activeId = v.id;
    announce(`Added ${v.name}. New notes go on it.`);
  }
  function clearVoice() {
    if (confirm !== "clear" && active.notes.length) return void (confirm = "clear");
    set(mapVoice(doc, active.id, (v) => ({ ...v, notes: [] })));
    announce(`Cleared ${active.name}.`);
  }
  function removeVoice() {
    if (doc.voices.length < 2) return;
    if (confirm !== "remove" && active.notes.length) return void (confirm = "remove");
    const name = active.name;
    const voices = doc.voices.filter((v) => v.id !== active.id);
    set({ ...doc, voices });
    activeId = voices[Math.max(0, activeIndex - 1)].id;
    announce(`Removed ${name}.`);
  }

  onDestroy(() => {
    stop(false);
    clearTimeout(saveTimer);
    if (loaded) void putSetting(ROLL_KEY, $state.snapshot(doc));
  });

  const field = "min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3 text-sm";
  const lineBg = $derived(
    `repeating-linear-gradient(to right, transparent 0 ${stepW * 16 - 2}px, color-mix(in oklch, var(--ws-stage-ink) 30%, transparent) ${stepW * 16 - 2}px ${stepW * 16}px), repeating-linear-gradient(to right, transparent 0 ${stepW * 4 - 1}px, color-mix(in oklch, var(--ws-stage-ink) 12%, transparent) ${stepW * 4 - 1}px ${stepW * 4}px)`,
  );
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-end gap-3">
    <label class="flex min-w-0 flex-1 basis-48 flex-col gap-1 text-sm">
      <span class="text-ws-soft">Title</span>
      <input class="{field} font-medium" value={doc.title} onchange={(e) => set({ ...doc, title: e.currentTarget.value || "Sketch" })} />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-ws-soft">Tempo, BPM</span>
      <input type="number" min="40" max="240" class="{field} tnum w-24" value={doc.bpm} onchange={(e) => set({ ...doc, bpm: Math.round(Math.min(240, Math.max(40, e.currentTarget.valueAsNumber || doc.bpm))) })} />
    </label>
    <div class="flex flex-wrap gap-2">
      <button type="button" class={btn} onclick={exportMidi}><FileMusic class="size-4" aria-hidden="true" />Export MIDI</button>
      <button type="button" class={btn} disabled={busy} onclick={exportWav}><AudioLines class="size-4" aria-hidden="true" />Export WAV</button>
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Voices">
    {#each doc.voices as v, i (v.id)}
      <button
        type="button"
        class="flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm {v.id === active.id ? 'border-ws-ink bg-ws-surface font-semibold' : 'border-ws-line text-ws-soft hover:text-ws-ink'}"
        aria-pressed={v.id === active.id}
        onclick={() => {
          activeId = v.id;
          confirm = null;
        }}
      >
        <span class="size-3 rounded-full" style:background={trackColour(i)} aria-hidden="true"></span>{v.name}
        <span class="tnum text-xs font-normal text-ws-soft">{v.notes.length}</span>
      </button>
    {/each}
    <button type="button" class="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-instr-ink hover:bg-instr-wash" onclick={addVoice}><Plus class="size-4" aria-hidden="true" />Add voice</button>
  </div>

  <section class="stage rounded-3xl p-3 sm:p-4" aria-label="Piano roll">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button type="button" class="flex min-h-12 items-center gap-2 rounded-full bg-instr px-5 font-display font-semibold text-ws-stage hover:brightness-105" aria-pressed={playing} onclick={play}>
        {#if playing}<Square class="size-5" aria-hidden="true" />Stop{:else}<Play class="size-5" aria-hidden="true" />Play{/if}
      </button>
      <div class="flex rounded-full bg-ws-stage-ink/10 p-1" role="group" aria-label="Tool">
        <button type="button" class="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm {tool === 'draw' ? 'bg-ws-stage-ink text-ws-stage font-semibold' : ''}" aria-pressed={tool === "draw"} onclick={() => (tool = "draw")}><Pencil class="size-4" aria-hidden="true" />Draw</button>
        <button type="button" class="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm {tool === 'resize' ? 'bg-ws-stage-ink text-ws-stage font-semibold' : ''}" aria-pressed={tool === "resize"} onclick={() => (tool = "resize")}><MoveH class="size-4" aria-hidden="true" />Resize</button>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <span class="text-ws-stage-soft">Length</span>
        <select class="min-h-11 rounded-lg border border-ws-stage-ink/15 bg-ws-stage-ink/8 px-2 text-ws-stage-ink" bind:value={noteLen}>
          {#each LENGTHS as l (l.beats)}<option value={l.beats}>{l.label}</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <span class="text-ws-stage-soft">Zoom</span>
        <input type="range" min="12" max="48" step="2" bind:value={stepW} class="w-24 accent-[var(--instr)]" aria-valuetext="{stepW} pixels per sixteenth" />
      </label>
      <button type="button" class={btnStage} onclick={() => set({ ...doc, lengthBeats: doc.lengthBeats + BAR_BEATS })}><Plus class="size-4" aria-hidden="true" />Add bar</button>
      <span class="tnum text-sm text-ws-stage-soft">{doc.lengthBeats / BAR_BEATS} bars</span>
    </div>

    <div bind:this={scroller} class="roll relative max-h-[30rem] overflow-auto rounded-xl">
      <div class="relative" style:width="{KEY_W + steps * stepW}px">
        <div class="ruler sticky top-0 z-20 flex h-7" aria-hidden="true">
          <div class="sticky left-0 z-10 shrink-0 bg-ws-stage" style:width="{KEY_W}px"></div>
          {#each Array.from({ length: doc.lengthBeats / BAR_BEATS }, (_, b) => b) as b (b)}
            <div class="shrink-0 border-l border-ws-stage-ink/25 pl-1 text-xs font-semibold text-ws-stage-soft" style:width="{16 * stepW}px">{b + 1}</div>
          {/each}
        </div>
        <div class="relative flex" style:height="{rows.length * ROW_H}px">
          <div class="keys sticky left-0 z-10 shrink-0" style:width="{KEY_W}px" aria-hidden="true">
            {#each rows as m (m)}
              <div class="key" class:black={isBlackKey(m)} class:c={m % 12 === 0} class:cur={cursor.midi === m} style:height="{ROW_H}px">{m % 12 === 0 || cursor.midi === m ? noteName(m) : ""}</div>
            {/each}
          </div>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div
            bind:this={grid}
            class="grid-area relative shrink-0 touch-none"
            class:resize={tool === "resize"}
            style:width="{steps * stepW}px"
            style:background-image={lineBg}
            tabindex="0"
            role="application"
            aria-label="Note grid for {active.name}. Arrow keys move the cursor, Enter adds or removes a note, Shift with Left or Right changes its length, [ and ] change its velocity."
            aria-describedby="roll-cursor"
            onpointerdown={down}
            onpointermove={move}
            onpointerup={up}
            onpointercancel={up}
            onkeydown={gridKey}
          >
            {#each rows as m, r (m)}
              <div class="rowbg" class:black={isBlackKey(m)} style:top="{r * ROW_H}px" style:height="{ROW_H}px"></div>
            {/each}
            {#each doc.voices as v, vi (v.id)}
              {#if v.id !== active.id}
                {#each v.notes as n, ni (ni)}
                  {#if n.midi >= range.low && n.midi <= range.high}
                    <div class="note ghost" style:left="{x(n.startBeat)}px" style:top="{y(n.midi) + 3}px" style:width="{Math.max(4, x(n.durationBeats) - 1)}px" style:height="{ROW_H - 6}px" style:--c={trackColour(vi)}></div>
                  {/if}
                {/each}
              {/if}
            {/each}
            {#each active.notes as n, ni (ni)}
              <div
                class="note"
                data-note={n.midi}
                style:left="{x(n.startBeat)}px"
                style:top="{y(n.midi) + 2}px"
                style:width="{Math.max(6, x(n.durationBeats) - 1)}px"
                style:height="{ROW_H - 4}px"
                style:--c={trackColour(activeIndex)}
                style:--v={n.velocity ?? 0.8}
              >
                {#if tool === "resize"}<span class="handle" aria-hidden="true"></span>{/if}
              </div>
            {/each}
            <div class="cursor" style:left="{x(cursor.step * STEP_BEATS)}px" style:top="{y(cursor.midi)}px" style:width="{stepW}px" style:height="{ROW_H}px"></div>
            {#if playBeat >= 0}
              <div class="playhead" style:left="{x(playBeat)}px"></div>
            {/if}
          </div>
        </div>
        <div class="lane sticky bottom-0 z-20 flex" style:height="{LANE_H}px">
          <div style:width="{KEY_W}px" class="sticky left-0 z-10 flex shrink-0 items-center bg-ws-stage px-1 text-[0.65rem] leading-tight text-ws-stage-soft">Velocity</div>
          <div
            class="relative shrink-0 touch-none"
            style:width="{steps * stepW}px"
            role="presentation"
            onpointerdown={(e) => {
              laneDrag = true;
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              laneSet(e);
            }}
            onpointermove={(e) => laneDrag && laneSet(e)}
            onpointerup={() => (laneDrag = false)}
            onpointercancel={() => (laneDrag = false)}
          >
            {#each active.notes as n, ni (ni)}
              <div class="vel" style:left="{x(n.startBeat) + 1}px" style:width="{Math.max(4, Math.min(x(n.durationBeats), stepW) - 3)}px" style:height="{(n.velocity ?? 0.8) * (LANE_H - 8)}px" style:--c={trackColour(activeIndex)}></div>
            {/each}
          </div>
        </div>
      </div>
    </div>
    <p id="roll-cursor" class="mt-2 text-xs text-ws-stage-soft">
      Cursor on {where(cursor.midi, cursor.step * STEP_BEATS)}{under >= 0 ? `, a note of velocity ${Math.round((active.notes[under].velocity ?? 0.8) * 127)}` : ""}. {tool === "resize" ? "Drag a note to change its length." : "Click a cell to add a note, click a note to remove it."}
    </p>
  </section>

  <div class="flex flex-wrap items-end gap-3 rounded-2xl border border-ws-line bg-ws-surface p-4">
    <label class="flex min-w-0 flex-1 basis-40 flex-col gap-1 text-sm">
      <span class="flex items-center gap-2 text-ws-soft"><span class="size-3 rounded-full" style:background={trackColour(activeIndex)} aria-hidden="true"></span>Voice name</span>
      <input class="{field} font-medium" value={active.name} onchange={(e) => set(mapVoice(doc, active.id, (v) => ({ ...v, name: e.currentTarget.value || v.name })))} />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-ws-soft">Velocity for new notes <span class="tnum">{Math.round(active.velocity * 127)}</span></span>
      <input type="range" min="0.1" max="1" step="0.05" class="min-h-11 w-40 accent-[var(--instr)]" value={active.velocity} oninput={(e) => set(mapVoice(doc, active.id, (v) => ({ ...v, velocity: e.currentTarget.valueAsNumber })))} />
    </label>
    <button type="button" class={btn} disabled={!active.notes.length} onclick={() => {
      set(mapVoice(doc, active.id, (v) => ({ ...v, notes: v.notes.map((n) => ({ ...n, velocity: v.velocity })) })));
      announce(`Every note on ${active.name} now has velocity ${Math.round(active.velocity * 127)}.`);
    }}>Apply to all its notes</button>
    <button type="button" class="{btn} {confirm === 'clear' ? 'border-destructive text-destructive' : ''}" disabled={!active.notes.length} onclick={clearVoice}>{confirm === "clear" ? `Clear ${active.notes.length} notes?` : "Clear voice"}</button>
    <button type="button" class="{btn} {confirm === 'remove' ? 'border-destructive text-destructive' : ''}" disabled={doc.voices.length < 2} onclick={removeVoice}>{confirm === "remove" ? "Remove it and its notes?" : "Remove voice"}</button>
  </div>
</div>

<style>
  .roll {
    background: color-mix(in oklch, var(--ws-stage) 80%, black);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
    overscroll-behavior: contain;
  }
  .ruler {
    background: var(--ws-stage);
  }
  .key {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 0.4rem;
    font-size: 0.65rem;
    font-weight: 600;
    color: #3b3542;
    background: linear-gradient(to right, #e9e4dc, #fbf8f2);
    border-bottom: 1px solid #0002;
  }
  .key.black {
    color: #d9d4df;
    background: linear-gradient(to right, #2a272e, #17151a 70%);
  }
  .key.cur {
    box-shadow: inset -4px 0 0 var(--instr);
  }
  .rowbg {
    position: absolute;
    left: 0;
    right: 0;
    border-bottom: 1px solid color-mix(in oklch, var(--ws-stage-ink) 6%, transparent);
    pointer-events: none;
  }
  .rowbg.black {
    background: #0000002e;
  }
  .grid-area {
    cursor: crosshair;
  }
  .grid-area.resize {
    cursor: ew-resize;
  }
  .grid-area:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: -2px;
  }
  .note {
    position: absolute;
    border-radius: 4px;
    background: color-mix(in oklch, var(--c) calc(55% + var(--v) * 45%), #222);
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--c) 50%, black),
      inset 0 1px 0 #fff6;
    pointer-events: none;
  }
  .note.ghost {
    background: color-mix(in oklch, var(--c) 30%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--c) 55%, transparent);
  }
  .handle {
    position: absolute;
    right: 1px;
    top: 3px;
    bottom: 3px;
    width: 3px;
    border-radius: 2px;
    background: #fffc;
  }
  .cursor {
    position: absolute;
    border: 2px solid var(--ws-stage-ink);
    border-radius: 4px;
    pointer-events: none;
    opacity: 0.35;
  }
  .grid-area:focus-visible .cursor {
    opacity: 1;
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: white;
    box-shadow: 0 0 8px var(--instr);
    pointer-events: none;
  }
  .lane {
    background: color-mix(in oklch, var(--ws-stage) 92%, black);
    border-top: 1px solid color-mix(in oklch, var(--ws-stage-ink) 18%, transparent);
  }
  .vel {
    position: absolute;
    bottom: 4px;
    border-radius: 3px 3px 0 0;
    background: var(--c);
    pointer-events: none;
  }
</style>
