<script lang="ts" module>
  /** "hidden": a look-ahead mask leaves the group out of sight. */
  export type GroupState = "correct" | "wrong" | "missed" | "active" | "hidden";

  /** Props Staff and Tab both take and pass straight through. */
  export interface FrameProps {
    cursorBeat?: number | null;
    groupStates?: Record<number, GroupState>;
    selection?: BeatRange | null;
    onselect?: (sel: BeatRange) => void;
    onbarclick?: (bar: number) => void;
    snap?: Snap;
    /** Tempo for the range readout; defaults to the score's. */
    bpm?: number;
    maxHeight?: string;
    onfallback?: (reason: string) => void;
    /** Ranges tinted like a selection (the sections a run covers), each named at its start. */
    highlights?: (BeatRange & { label: string })[];
    /** Engrave at least this wide: a long line stays on one row and scrolls sideways, following the cursor. */
    minWidth?: number;
    /** Notes the player played, drawn as heads at their beat and pitch (a single staff only); `wrong` ones in red with a cross. */
    played?: readonly { beat: number; midi: number; wrong?: boolean }[];
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import type { BeatRange } from "./groups";
  import { loadVexFlow, NotationError, staffOffset, spell, type Layout } from "./engrave";
  import {
    RangePicker,
    cursorAt,
    ends,
    inRange,
    readout,
    targetAt,
    targets,
    type Snap,
    type Target,
  } from "./selection.svelte";

  type VF = Awaited<ReturnType<typeof loadVexFlow>>;

  let {
    draw,
    fallback,
    label,
    scoreBpm,
    cursorBeat = null,
    groupStates = {},
    selection = $bindable(null),
    onselect,
    onbarclick,
    snap = "bar",
    bpm,
    maxHeight = "62dvh",
    onfallback,
    highlights = [],
    minWidth = 0,
    played = [],
  }: FrameProps & {
    draw: (VF: VF, host: HTMLElement, width: number) => Layout;
    fallback: (reason: string) => string;
    label: string;
    scoreBpm: number;
  } = $props();

  let VF = $state.raw<VF | null>(null);
  let host = $state<HTMLDivElement>();
  let canvas = $state<HTMLDivElement>();
  let viewport = $state<HTMLDivElement>();
  let width = $state(0);
  let layout = $state.raw<Layout | null>(null);
  let error = $state<string | null>(null);
  let focusIdx = $state(0);
  const picker = new RangePicker();

  onMount(() => {
    loadVexFlow().then(
      (m) => (VF = m),
      (e) => fail(e),
    );
  });

  function fail(e: unknown) {
    const reason =
      e instanceof NotationError ? e.message : `the engraver stopped (${(e as Error)?.message ?? e})`;
    error = reason;
    layout = null;
    host?.replaceChildren();
    onfallback?.(reason);
  }

  $effect(() => {
    if (!VF || !host || width < 40) return;
    try {
      layout = draw(VF, host, Math.max(width, minWidth));
      error = null;
    } catch (e) {
      fail(e);
    }
  });

  $effect(() => {
    if (!layout) return;
    for (const [g, els] of layout.groupEls) {
      const s = groupStates[g];
      for (const el of els) {
        if (s) el.setAttribute("data-state", s);
        else el.removeAttribute("data-state");
      }
    }
    // Beams, ties and triplet marks hide with any group they join, so the mask hides them too.
    for (const { groups, el } of layout.linked ?? []) {
      if (groups.some((g) => groupStates[g] === "hidden")) el.setAttribute("data-state", "hidden");
      else el.removeAttribute("data-state");
    }
  });

  const interactive = $derived(!!(onselect || onbarclick));
  const list = $derived(layout ? targets(layout, snap) : []);
  const shown = $derived(picker.drag ?? selection);
  const tinted = $derived(
    layout && highlights.length
      ? layout.bars.flatMap((b) => {
          const h = highlights.find((r) => b.startBeat >= r.startBeat - 1e-6 && b.startBeat < r.endBeat - 1e-6);
          return h ? [{ ...b, label: Math.abs(b.startBeat - h.startBeat) < 1e-6 ? h.label : "" }] : [];
        })
      : [],
  );
  const span = $derived(shown ? ends(list, shown) : null);
  const cursor = $derived(layout && cursorBeat != null ? cursorAt(layout, cursorBeat) : null);
  // A line wider than the box keeps its cursor near the middle, so the notes ahead are in view: it
  // scrolls once the cursor passes 60% of the box (or falls off its left edge).
  $effect(() => {
    const x = cursor?.x;
    if (x === undefined || !viewport || viewport.scrollWidth <= viewport.clientWidth + 1) return;
    const w = viewport.clientWidth;
    const left = viewport.scrollLeft;
    if (x < left + w * 0.1 || x > left + w * 0.6) {
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
      viewport.scrollTo({ left: Math.max(0, x - w * 0.4), behavior: still ? "auto" : "smooth" });
    }
  });
  const text = $derived(readout(list, shown, picker.pending, bpm ?? scoreBpm, snap));
  const marks = $derived.by(() => {
    if (!layout) return [];
    const out: { x: number; y: number; state: GroupState }[] = [];
    for (const a of layout.anchors) {
      const s = a.group === null ? undefined : groupStates[a.group];
      if (s !== "wrong" && s !== "missed" && s !== "correct") continue;
      const cell = layout.bars.find((c) => c.system === a.system);
      // Above the finger numbers when the staff prints them, so both stay readable.
      if (cell && !out.some((m) => m.x === a.x)) out.push({ x: a.x, y: cell.top - (layout.fingersAbove ? 42 : 22), state: s });
    }
    return out;
  });

  /** Each played note as a head on the staff: x at its beat, y at its pitch, with its accidental. */
  const heads = $derived.by(() => {
    const st = layout?.staff;
    if (!layout || !st || !played.length) return [];
    return played.flatMap((p, i) => {
      const cell = layout!.bars.find((c) => p.beat >= c.startBeat - 1e-6 && p.beat < c.endBeat - 1e-6);
      const at = cell && cursorAt(layout!, p.beat);
      if (!cell || !at) return [];
      const acc = spell(p.midi, st.fifths).match(/^[a-g](#|b)?/)![1];
      return [{ i, x: at.x, y: cell.top + staffOffset(p.midi, st.clef, st.fifths, (cell.bottom - cell.top) / 4), wrong: !!p.wrong, acc: acc === "#" ? "♯" : acc === "b" ? "♭" : "" }];
    });
  });

  function pick(t: Target) {
    onbarclick?.(t.bar);
    if (!onselect) return;
    const done = picker.tap(t);
    if (done) {
      selection = done;
      onselect(done);
    }
  }

  function keydown(e: KeyboardEvent, i: number) {
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? list.length - 1
              : null;
    if (e.key === "Escape") picker.pending = null;
    if (to === null) return;
    e.preventDefault();
    focusIdx = Math.max(0, Math.min(list.length - 1, to));
    canvas?.querySelectorAll<HTMLButtonElement>("button.cell")[focusIdx]?.focus();
  }

  let dragging: "start" | "end" | null = null;
  function grab(e: PointerEvent, which: "start" | "end") {
    dragging = which;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (!dragging || !canvas || !selection) return;
    const r = canvas.getBoundingClientRect();
    const t = targetAt(list, e.clientX - r.left, e.clientY - r.top);
    if (t) picker.dragTo(dragging, t, selection);
  }
  function drop() {
    const d = picker.drag;
    dragging = null;
    picker.drag = null;
    if (d) {
      selection = d;
      onselect?.(d);
    }
  }

  function rangeState(t: Target) {
    if (picker.pending?.startBeat === t.startBeat) return ", range start";
    if (span?.start === t) return ", range start";
    if (span?.end === t) return ", range end";
    return shown && inRange(t, shown) ? ", in range" : "";
  }
</script>

<div class="nt">
  {#if interactive && !error}
    <p class="readout">{text}</p>
  {/if}
  {#if layout?.notice && !error}
    <p class="notice">{layout.notice}</p>
  {/if}
  {#if error}
    <p class="fallback">{fallback(error)}</p>
  {/if}
  <div
    class="viewport"
    class:failed={!!error}
    style:max-height={maxHeight}
    bind:clientWidth={width}
    bind:this={viewport}
    role="region"
    aria-label={label}
  >
    <div
      class="canvas"
      bind:this={canvas}
      style:width={layout ? `${layout.width}px` : "100%"}
      style:height={layout ? `${layout.height}px` : undefined}
    >
      {#each tinted as b (b.startBeat)}
        <div class="tint" style:left="{b.x}px" style:top="{b.y}px" style:width="{b.width}px" style:height="{b.height}px">
          {#if b.label}<span class="tint-label">{b.label}</span>{/if}
        </div>
      {/each}
      {#if interactive && shown}
          {#each list.filter((t) => inRange(t, shown)) as t (t.startBeat)}
            <div
              class="tint"
              style:left="{t.x}px"
              style:top="{t.y}px"
              style:width="{t.width}px"
              style:height="{t.height}px"
            ></div>
          {/each}
      {/if}
      <div class="host" bind:this={host} aria-hidden="true"></div>

      {#if interactive}
        {#each list as t, i (t.startBeat)}
          <button
            type="button"
            class="cell"
            style:left="{t.x}px"
            style:top="{t.y}px"
            style:width="{t.width}px"
            style:height="{t.height}px"
            tabindex={i === focusIdx ? 0 : -1}
            aria-label="{t.label}{rangeState(t)}"
            onfocus={() => (focusIdx = i)}
            onclick={() => pick(t)}
            onkeydown={(e) => keydown(e, i)}
          ></button>
        {/each}
        {@const start = picker.pending
          ? (list.find((t) => t.startBeat === picker.pending?.startBeat) ?? picker.pending)
          : span?.start}
        {#if start}
          <div
            class="handle start"
            style:left="{start.x}px"
            style:top="{start.y}px"
            style:height="{start.height}px"
            onpointerdown={(e) => grab(e, "start")}
            onpointermove={move}
            onpointerup={drop}
            onpointercancel={drop}
            aria-hidden="true"
          >
            <span>Start, bar {start.bar}</span>
          </div>
        {/if}
        {#if span && !picker.pending}
          <div
            class="handle end"
            style:left="{span.end.x + span.end.width}px"
            style:top="{span.end.y}px"
            style:height="{span.end.height}px"
            onpointerdown={(e) => grab(e, "end")}
            onpointermove={move}
            onpointerup={drop}
            onpointercancel={drop}
            aria-hidden="true"
          >
            <span>End, bar {span.end.bar}</span>
          </div>
        {/if}
      {/if}

      {#each marks as m (`${m.x}:${m.state}`)}
        <!-- A glyph over each judged note, so the colour of the note is never the only cue. -->
        <span class="mark ws-pop {m.state}" style:left="{m.x}px" style:top="{m.y}px" aria-hidden="true"
          >{m.state === "wrong" ? "×" : m.state === "correct" ? "✓" : "○"}</span
        >
      {/each}

      {#each heads as h (h.i)}
        <!-- A note you played: a head at its pitch, a wrong one red and crossed, so colour is never the only cue. -->
        <span class="played ws-pop" class:wrong={h.wrong} style:left="{h.x}px" style:top="{h.y}px" aria-hidden="true">{#if h.acc}<i>{h.acc}</i>{/if}{#if h.wrong}×{/if}</span>
      {/each}

      {#if cursor}
        <div
          class="cursor"
          data-cursor
          style:left="{cursor.x - 1}px"
          style:top="{cursor.top}px"
          style:height="{cursor.bottom - cursor.top}px"
        >
          <span class="sr-only">Now at bar {cursor.bar}, beat {Math.floor(cursor.beatInBar) + 1}</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .nt {
    color: var(--ws-ink, currentColor);
    min-width: 0;
  }
  .readout,
  .notice,
  .fallback {
    margin: 0 0 0.5rem;
    /* A zoomed line (LineNotation) keeps its caption at caption size. */
    font-size: calc(0.8125rem / var(--nt-zoom, 1));
    line-height: 1.35;
    color: var(--ws-soft, inherit);
  }
  /* On a drill's dark stage the caption takes the stage's own soft ink. */
  :global(.stage) .readout,
  :global(.stage) .notice {
    color: var(--ws-stage-soft);
  }
  .fallback {
    color: var(--ws-ink, inherit);
    padding: 0.75rem 1rem;
    border: 1px solid var(--ws-line, currentColor);
    border-radius: 0.5rem;
  }
  /* Notation is printed paper in both themes: dark ink on light (slightly dimmed in dark mode). */
  .viewport {
    --ws-surface: oklch(0.99 0.004 285);
    --ws-ink: oklch(0.2 0.045 287);
    --ws-soft: oklch(0.45 0.03 287);
    max-width: 100%;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    background: var(--ws-surface);
    color: var(--ws-ink);
    border-radius: 0.5rem;
  }
  :global(.dark) .viewport {
    --ws-surface: oklch(0.92 0.008 285);
  }
  .viewport.failed .canvas {
    display: none;
  }
  .canvas {
    position: relative;
    overflow: clip;
  }
  .host {
    position: relative;
  }
  .host :global(svg) {
    display: block;
    fill: currentColor;
  }
  .host :global(svg :is(path, rect, text)[fill]:not([fill="none"]):not([fill="white"])) {
    fill: currentColor;
  }
  .host :global(svg [stroke]:not([stroke="none"])) {
    stroke: currentColor;
  }
  .host :global(svg rect[fill="white"]) {
    fill: var(--ws-surface, Canvas);
  }
  .host :global(g[data-state="active"]) {
    color: var(--instr-ink);
  }
  .host :global(g[data-state="correct"]) {
    color: var(--success);
  }
  .host :global(g[data-state="wrong"]) {
    color: var(--destructive);
  }
  .host :global(g[data-state="missed"]) {
    color: var(--ws-soft);
  }
  .host :global(g[data-state="hidden"]) {
    opacity: 0;
  }
  .cell {
    position: absolute;
    min-height: 44px;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .cell:hover {
    background: color-mix(in oklab, var(--instr, currentColor) 8%, transparent);
  }
  .cell:focus-visible {
    outline: 2px solid var(--instr-ink, currentColor);
    outline-offset: -2px;
  }
  .tint {
    position: absolute;
    pointer-events: none;
    background: color-mix(in oklab, var(--instr, currentColor) 12%, transparent);
  }
  .tint-label {
    position: absolute;
    left: 4px;
    top: 2px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    background: var(--instr, currentColor);
    color: var(--ws-stage, #fff);
  }
  .handle {
    position: absolute;
    width: 24px;
    margin-left: -12px;
    cursor: ew-resize;
    touch-action: none;
  }
  .handle::before {
    content: "";
    position: absolute;
    left: 10px;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 2px;
    background: var(--hc);
  }
  .handle span {
    position: absolute;
    top: 2px;
    white-space: nowrap;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    padding: 0.2rem 0.35rem;
    border-radius: 0.25rem;
    color: var(--ws-surface, white);
    background: var(--hc);
  }
  .start {
    --hc: var(--success);
  }
  .start span {
    left: 16px;
  }
  .end {
    --hc: var(--destructive);
  }
  .end span {
    right: 16px;
    top: auto;
    bottom: 2px;
  }
  .mark {
    position: absolute;
    translate: -50% 0;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
  }
  .played {
    position: absolute;
    width: 0.8rem;
    height: 0.6rem;
    translate: -50% -50%;
    rotate: -20deg;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 0.6rem;
    font-weight: 900;
    line-height: 1;
    background: color-mix(in oklch, currentColor 45%, transparent);
    pointer-events: none;
  }
  .played.wrong {
    color: white;
    background: var(--destructive);
  }
  .played i {
    position: absolute;
    right: 100%;
    rotate: 20deg;
    font-style: normal;
    font-size: 0.8rem;
  }
  .played.wrong i {
    color: var(--destructive);
  }
  .mark.wrong {
    color: var(--destructive);
  }
  .mark.correct {
    color: var(--success);
    font-size: 0.85rem;
  }
  .mark.missed {
    color: var(--ws-soft);
  }
  .cursor {
    position: absolute;
    width: 2px;
    background: var(--instr-ink, currentColor);
    pointer-events: none;
  }
</style>
