<script lang="ts" module>
  import type { RollDoc as Doc, RollVoice } from "./roll";
  /** What the roll edits and plays: Create's session, or a song being fixed. */
  export interface RollHost {
    doc: Doc;
    /** The voice new notes go on. */
    selected: string;
    /** The voices shown and played together. */
    picked: string[];
    pick(id: string): "picked" | "editing" | "dropped" | "last";
    updateVoice(id: string, fn: (v: RollVoice) => RollVoice): void;
    readonly playing: boolean;
    /** The playhead in beats, or -1. */
    readonly rollBeat: number;
    /** The picked voices are what is playing (the play button shows Stop). */
    readonly pickedPlaying: boolean;
    /** Play the picked voices, or stop them; false when sound is blocked. */
    playPicked(): Promise<boolean>;
    /** Beats in a bar; 4 when not given. */
    readonly barBeats?: number;
  }
</script>

<script lang="ts">
  // The melodies' note editor, over the canonical score. Tap melodies to pick
  // the ones you hear and see; you draw on one of them, the others show as
  // ghosts. The grid scrolls inside its own box (it never widens the page) and
  // follows the playhead; a cursor gives it a keyboard path.
  import { onMount } from "svelte";
  import Pencil from "lucide-svelte/icons/pencil";
  import MoveH from "lucide-svelte/icons/move-horizontal";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import { isBlackKey, noteName } from "@repo/music-core";
  import { audio } from "$lib/music/runtime";
  import { btnPrimary, btnStage } from "$lib/music/components/ui";
  import { noteAt, resizeNote, rollRange, soundOf, setVelocity, toggleNote, trackColour, type RollDoc } from "./roll";
  import { STEP_BEATS } from "$lib/music/takes";

  let {
    host,
    announce,
    noun = "melodies",
  }: { host: RollHost; announce: (msg: string) => void; /** What the voices are called: melodies, parts. */ noun?: string } = $props();
  const BAR_BEATS = $derived(host.barBeats ?? 4);
  const barSteps = $derived(Math.round(BAR_BEATS / STEP_BEATS));
  const Noun = $derived(noun.replace(/^./, (c) => c.toUpperCase()));

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

  // The roll edits the host's document; `doc` is read-only here, `set` writes.
  const doc = $derived(host.doc);
  let tool = $state<"draw" | "resize">("draw");
  let noteLen = $state(0.5);
  let stepW = $state(22);
  let cursor = $state({ midi: 60, step: 0 });
  const playing = $derived(host.playing);
  const playBeat = $derived(host.rollBeat);
  let grid: HTMLDivElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();

  // Turn the page when the playhead reaches the edge of the view, in one jump:
  // a smooth scroll restarted every frame only crawls, and the playhead outruns it.
  $effect(() => {
    const s = scroller;
    if (!s || playBeat < 0) return;
    const px = KEY_W + x(playBeat);
    if (px > s.scrollLeft + s.clientWidth - stepW || px < s.scrollLeft + KEY_W)
      s.scrollLeft = px - KEY_W - stepW;
  });

  const soloing = $derived(host.pickedPlaying);
  async function playMelodies() {
    const ok = await host.playPicked();
    if (!ok) return announce("Sound is blocked. Tap Enable sound in the strip above, then play again.");
    const names = doc.voices.filter((v) => host.picked.includes(v.id)).map((v) => v.name);
    announce(host.playing ? `Playing ${names.join(" and ")} on ${names.length === 1 ? "its" : "their"} own.` : "Stopped.");
  }

  function tap(v: { id: string; name: string }) {
    const r = host.pick(v.id);
    if (r === "picked") announce(`${v.name} picked: you hear it with the ${noun}, and new notes go on it.`);
    else if (r === "editing") announce(`New notes go on ${v.name}.`);
    else if (r === "dropped") announce(`${v.name} put down: Play ${noun} leaves it out.`);
    else announce(`${v.name} is the only one picked. Pick another before putting it down.`);
  }

  const range = $derived(rollRange(doc));
  const rows = $derived(Array.from({ length: range.high - range.low + 1 }, (_, i) => range.high - i));
  const steps = $derived(Math.round(doc.lengthBeats / STEP_BEATS));
  const activeIndex = $derived(Math.max(0, doc.voices.findIndex((v) => v.id === host.selected)));
  const active = $derived(doc.voices[activeIndex]);
  const x = (beat: number) => (beat / STEP_BEATS) * stepW;
  const y = (midi: number) => (range.high - midi) * ROW_H;
  const where = (midi: number, beat: number) => `${noteName(midi)}, bar ${Math.floor(beat / BAR_BEATS) + 1} beat ${Math.floor(beat % BAR_BEATS) + 1}${beat % 1 ? ` and ${Math.round((beat % 1) / STEP_BEATS)} sixteenths` : ""}`;
  const under = $derived(noteAt(active.notes, cursor.midi, cursor.step * STEP_BEATS));

  onMount(() => scroller?.scrollTo({ top: y(72) - 8 }));

  function set(next: RollDoc) {
    host.doc = next;
  }

  function toggleAt(midi: number, step: number) {
    const beat = step * STEP_BEATS;
    const had = noteAt(active.notes, midi, beat) >= 0;
    set(toggleNote(doc, active.id, midi, beat, noteLen));
    if (!had && !playing) void audio.unlock().then(() => audio.playNote(midi, 0.4, active.velocity, soundOf(active)));
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
    set(resizeNote(doc, active.id, drag.index, Math.ceil((c.beat - drag.start) / STEP_BEATS) * STEP_BEATS));
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

  const field = "min-h-11 rounded-lg border border-ws-stage-ink/15 bg-ws-stage-ink/8 px-3 text-sm text-ws-stage-ink";
  const lineBg = $derived(
    `repeating-linear-gradient(to right, transparent 0 ${stepW * barSteps - 2}px, color-mix(in oklch, var(--ws-stage-ink) 30%, transparent) ${stepW * barSteps - 2}px ${stepW * barSteps}px), repeating-linear-gradient(to right, transparent 0 ${stepW * 4 - 1}px, color-mix(in oklch, var(--ws-stage-ink) 12%, transparent) ${stepW * 4 - 1}px ${stepW * 4}px)`,
  );
</script>

<section class="stage rounded-3xl p-3 sm:p-4" aria-label="Melody editor">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button type="button" class={btnPrimary} aria-pressed={soloing} onclick={playMelodies}>
        {#if soloing}<Square class="size-4 fill-current" aria-hidden="true" />Stop{:else}<Play class="size-4 fill-current" aria-hidden="true" />Play {noun}{/if}
      </button>
      <div class="flex min-w-0 flex-1 basis-60 flex-wrap gap-1.5" role="group" aria-label="{Noun} to hear and see">
        {#each doc.voices as v, i (v.id)}
          {@const on = host.picked.includes(v.id)}
          {@const editing = v.id === active.id}
          <button
            type="button"
            class="chip flex min-h-10 max-w-48 items-center gap-2 rounded-full px-3 text-sm"
            class:on
            class:editing
            style:--c={trackColour(i)}
            aria-pressed={on}
            onclick={() => tap(v)}
          >
            <span class="dot size-2.5 shrink-0 rounded-full" aria-hidden="true"></span>
            <span class="truncate">{v.name}</span>
            {#if editing}<Pencil class="size-3.5 shrink-0" aria-hidden="true" /><span class="sr-only">(drawing on it)</span>{/if}
          </button>
        {/each}
      </div>
      <div class="flex rounded-full bg-ws-stage-ink/10 p-1" role="group" aria-label="Tool">
        <button type="button" class="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm {tool === 'draw' ? 'bg-ws-stage-ink text-ws-stage font-semibold' : ''}" aria-pressed={tool === "draw"} onclick={() => (tool = "draw")}><Pencil class="size-4" aria-hidden="true" />Draw</button>
        <button type="button" class="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm {tool === 'resize' ? 'bg-ws-stage-ink text-ws-stage font-semibold' : ''}" aria-pressed={tool === "resize"} onclick={() => (tool = "resize")}><MoveH class="size-4" aria-hidden="true" />Resize</button>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <span class="text-ws-stage-soft">Note</span>
        <select class="{field} px-2" bind:value={noteLen}>
          {#each LENGTHS as l (l.beats)}<option value={l.beats}>{l.label}</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <span class="text-ws-stage-soft">Zoom</span>
        <input type="range" min="12" max="48" step="2" bind:value={stepW} class="w-24 accent-[var(--instr)]" aria-valuetext="{stepW} pixels per sixteenth" />
      </label>
    </div>

    <div bind:this={scroller} class="roll relative max-h-[30rem] overflow-auto rounded-xl">
      <div class="relative" style:width="{KEY_W + steps * stepW}px">
        <div class="ruler sticky top-0 z-20 flex h-7" aria-hidden="true">
          <div class="sticky left-0 z-10 shrink-0 bg-ws-stage" style:width="{KEY_W}px"></div>
          {#each Array.from({ length: Math.ceil(doc.lengthBeats / BAR_BEATS) }, (_, b) => b) as b (b)}
            <div class="shrink-0 border-l border-ws-stage-ink/25 pl-1 text-xs font-semibold text-ws-stage-soft" style:width="{barSteps * stepW}px">{b + 1}</div>
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
              {#if v.id !== active.id && host.picked.includes(v.id)}
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
    <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
      <label class="flex items-center gap-2">
        <span class="text-ws-stage-soft">New notes' velocity <span class="tnum text-ws-stage-ink">{Math.round(active.velocity * 127)}</span></span>
        <input type="range" min="0.1" max="1" step="0.05" class="min-h-11 w-36 accent-[var(--instr)]" value={active.velocity} oninput={(e) => host.updateVoice(active.id, (v) => ({ ...v, velocity: e.currentTarget.valueAsNumber }))} />
      </label>
      <button type="button" class={btnStage} disabled={!active.notes.length} onclick={() => {
        host.updateVoice(active.id, (v) => ({ ...v, notes: v.notes.map((n) => ({ ...n, velocity: v.velocity })) }));
        announce(`Every note on ${active.name} now has velocity ${Math.round(active.velocity * 127)}.`);
      }}>Apply to all its notes</button>
    </div>
</section>

<style>
  .chip {
    color: var(--ws-stage-soft);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ws-stage-ink) 18%, transparent);
  }
  .chip:hover {
    color: var(--ws-stage-ink);
  }
  .chip .dot {
    box-shadow: inset 0 0 0 2px var(--c);
  }
  .chip.on {
    color: var(--ws-stage-ink);
    background: color-mix(in oklch, var(--c) 22%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--c) 55%, transparent);
  }
  .chip.on .dot {
    background: var(--c);
  }
  .chip.editing {
    font-weight: 600;
    box-shadow: inset 0 0 0 2px var(--c);
  }
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
