<script lang="ts" module>
  export interface HighwayLane {
    id: string;
    label: string;
    /** A shorter label for a narrow stage (a slice number), when the label would be cut. */
    short?: string;
    color: string;
    /** The pad that plays the lane (bank A note): named, and shown on a small map of the 16 pads. */
    pad?: number;
    /** The lane's sample as a filled outline (`wavePath`), `w` columns wide: drawn beside its chip. */
    wave?: { d: string; w: number };
  }
  export interface HighwayNote {
    lane: number;
    /** ms from the downbeat */
    atMs: number;
    kind: "accent" | "normal" | "ghost";
    /** A note that rings or is held (a slice, a roll): drawn as a line this long. */
    durMs?: number;
    /** A letter inside the note (R or L, the sticking). */
    text?: string;
  }
</script>

<script lang="ts">
  // The lanes view, as Melodics draws it: one lane per pad, labelled and in
  // its colour, the notes sliding right to left onto the hit line on the
  // clock the drill runs on, the bars, clicks and steps faint behind (any
  // meter, triplets too), accents big and ghosts small and hollow, each note
  // judged as it passes. The pad grid sits beside it (the `pads` snippet) on
  // a wide stage and under it on a phone.
  import type { Snippet } from "svelte";
  import { JUDGEMENT_TEXT, clusterMarks, gridLines, highwayScale, padCell, xAt, type Judgement } from "./lanes";
  import { padLabel } from "./midi-status";
  import { m } from "@repo/i18n/messages.js";

  let {
    lanes,
    notes,
    now,
    beatMs,
    beatsPerBar = 4,
    stepsPerBeat = 4,
    aheadBars = 1,
    lengthMs,
    judged = {},
    flash = null,
    countIn = null,
    label = m.music_winds_highway_label(),
    pads,
    extras = [],
    fill = false,
    alone = null,
  }: {
    lanes: HighwayLane[];
    notes: HighwayNote[];
    /** ms from the downbeat, at the hit line. */
    now: number;
    beatMs: number;
    beatsPerBar?: number;
    /** Steps a click on the faint grid: 4 sixteenths, 3 triplets, 2 eighths. */
    stepsPerBeat?: number;
    /** How far ahead the lanes read, in bars. */
    aheadBars?: number;
    lengthMs: number;
    judged?: Record<number, Judgement>;
    /** The latest judgement, shown on the row it was for (`lane`), just past the hit line; `key` restarts its animation. */
    flash?: { judgement: Judgement | "extra"; ms?: number; key: number; lane?: number } | null;
    /** Beats left in the count-in. */
    countIn?: number | null;
    label?: string;
    /** The pad grid, beside the lanes. */
    pads?: Snippet;
    /** Hits no note claimed, marked in the lane of the pad that was hit (ms from the downbeat). */
    extras?: readonly { lane: number; atMs: number }[];
    /** A live run: the pads beside the lanes widen toward the height the lanes fill. */
    fill?: boolean;
    /** On a narrow stage, one part alone (before a run, so the whole surface sits above the docked Start). */
    alone?: "pads" | "lanes" | null;
  } = $props();

  let width = $state(600);
  // Before a run the hit line waits a beat ahead of the first note: the view reaches that much further, so the
  // whole first bar shows (sixteen slices never run off the right edge). The count-in and the run use the set view.
  const lead = $derived(countIn === null && now < 0 ? -now / (beatsPerBar * beatMs) : 0);
  const scale = $derived(highwayScale(width, beatMs, beatsPerBar, aheadBars + lead));
  const x = (ms: number) => xAt(ms, now, scale);
  const fromMs = $derived(now - scale.behindMs);
  const toMs = $derived(now + scale.aheadMs);
  const visible = $derived(notes.map((n, i) => ({ ...n, i })).filter((n) => n.atMs + (n.durMs ?? 0) > fromMs - beatMs && n.atMs < toMs + beatMs));
  const lines = $derived(gridLines(fromMs, toMs, beatMs, beatsPerBar, stepsPerBeat, scale.pxPerMs));
  /** The least a lane is tall: fewer lanes, taller lanes, sixteen slices at 22 px or more. A live run's box grows
   *  (data-grow) and the lanes share its height. */
  // The lanes together are never under 9rem (with the bar numbers, 168 px), so a phone reads them and a short
  // groove still sits above the docked Start.
  const laneRem = $derived(Math.max(9 / Math.max(1, lanes.length), lanes.length <= 2 ? 4.5 : lanes.length <= 4 ? 3.4 : lanes.length <= 7 ? 2.6 : lanes.length <= 10 ? 2 : 1.4));
  /** Stray hits in view, those that would overlap in a lane (closer than a mark's width) drawn as one mark with their count. */
  const shownExtras = $derived(clusterMarks(extras.filter((e) => e.lane >= 0 && e.atMs > fromMs - beatMs && e.atMs < toMs), 20 / scale.pxPerMs));
</script>

<!-- The region a live stage grows (DrillShell, S3): the lanes share its height, the pads sit beside or under them. -->
<div class="wrap" data-grow>
  <!-- `grid` tells the stage's rules (DrillShell) this already lays out as a grid. -->
  <div class="view grid" class:with-pads={!!pads} class:fill class:pads-only={alone === "pads" && !!pads} class:lanes-only={alone === "lanes"}>
    <div class="highway" class:slim={lanes.every((l) => l.short)} class:waves={lanes.some((l) => l.wave)} role="img" aria-label={label} style:--lanes={lanes.length} style:--lane-base="{laneRem}rem" style:--name-lines={laneRem >= 2.6 ? 2 : 1}>
      <div class="labels" aria-hidden="true">
        {#each lanes as l (l.id)}
          {@const cell = l.pad === undefined ? null : padCell(l.pad)}
          <span class="lane-label" style:--c={l.color}>
            {#if l.short}
              <!-- A slice: its number in a chip the colour of its pad's strip. -->
<span class="sr-only">{l.label.replace(l.short, "")}</span><span class="chip">{l.short}</span>
            {:else if cell}
              <span class="map">
                {#each Array.from({ length: 16 }, (_, k) => k) as k (k)}<i class:on={k === cell.row * 4 + cell.col}></i>{/each}
              </span>
            {:else}
              <span class="dot"></span>
            {/if}
            {#if l.wave}<svg class="lane-wave" viewBox="0 -1 {l.wave.w} 2" preserveAspectRatio="none"><path d={l.wave.d} /></svg>{/if}
            {#if l.short}
              {#if l.pad !== undefined}<span class="pad">{padLabel(l.pad)}</span>{/if}
            {:else}
              <span class="name">{l.label}</span>
              {#if l.pad !== undefined && lanes.length <= 8}<span class="pad">{padLabel(l.pad)}</span>{/if}
            {/if}
          </span>
        {/each}
      </div>
      <div class="track" bind:clientWidth={width} style:--step="{Math.max(6, (beatMs / stepsPerBeat) * scale.pxPerMs)}px">
        {#each lanes as l, li (l.id)}
          <div class="lane" style:--c={l.color} style:top="calc({li} * var(--lane))"></div>
        {/each}
        {#each lines as g (g.ms)}
          <span class="line" data-kind={g.kind} style:left="{x(g.ms)}px"></span>
          <!-- Bars are numbered only inside the piece: past its end line there is no bar 2 of a one-bar groove. -->
          {#if g.kind === "bar" && g.bar && g.bar > 0 && g.ms < lengthMs - 1}<span class="bar-no" style:left="{x(g.ms)}px">{g.bar}</span>{/if}
        {/each}
        {#if lengthMs > fromMs && lengthMs < toMs}<span class="line" data-kind="end" style:left="{x(lengthMs)}px"></span>{/if}
        {#each visible as n (n.i)}
          {@const c = lanes[n.lane]?.color}
          {#if n.durMs}
            <span class="hold" style:--c={c} style:left="{x(n.atMs)}px" style:width="{n.durMs * scale.pxPerMs}px" style:top="calc(({n.lane} + 0.5) * var(--lane))"></span>
          {/if}
          <span class="note" data-kind={n.kind} data-judged={judged[n.i]} style:--c={c} style:left="{x(n.atMs)}px" style:top="calc(({n.lane} + 0.5) * var(--lane))">{#if n.text && n.kind !== "ghost"}<b aria-hidden="true">{n.text}</b>{/if}</span>
        {/each}
        {#each shownExtras as e, k (k)}
          <span class="extra" style:left="{x(e.atMs)}px" style:top="calc(({e.lane} + 0.5) * var(--lane) + min(1.7rem, var(--lane) * 0.3))" aria-hidden="true">✕{#if e.n > 1}<b>{e.n}</b>{/if}</span>
        {/each}
        <span class="hitline" style:left="{scale.hitX}px" aria-hidden="true"></span>
        {#if flash && flash.judgement !== "extra"}
          {#key flash.key}
            <span class="flash" data-kind={flash.judgement} style:left="{scale.hitX + 10}px" style:top={flash.lane === undefined || flash.lane < 0 ? undefined : `calc((${flash.lane} + 0.5) * var(--lane) + var(--head))`} data-row={flash.lane !== undefined && flash.lane >= 0 ? "" : undefined} aria-live="polite">
              <span aria-hidden="true">{flash.judgement === "perfect" ? "✓ " : flash.judgement === "miss" ? "✕ " : ""}</span>{JUDGEMENT_TEXT[flash.judgement]()}{#if flash.ms !== undefined && (flash.judgement === "early" || flash.judgement === "late")}<small> {Math.abs(Math.round(flash.ms))} ms</small>{/if}
            </span>
          {/key}
        {/if}
        {#if countIn}
          {#key countIn}<span class="count" aria-live="assertive">{countIn}</span>{/key}
        {/if}
      </div>
    </div>
    {#if pads}<div class="side">{@render pads()}</div>{/if}
  </div>
</div>

<style>
  .wrap {
    container: hw / inline-size;
    display: flex;
    flex-direction: column;
  }
  /* The lanes take the height the box has (a live run's grows); the pads keep theirs. */
  .view {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr;
    gap: 1rem;
  }
  .view.with-pads {
    grid-template-rows: 1fr auto;
  }
  /* A wide stage puts the pads beside the lanes, as the play-along apps do; in a run they widen toward the
     height the lanes fill. */
  @container hw (min-width: 50rem) {
    .view.with-pads {
      grid-template-rows: 1fr;
      grid-template-columns: minmax(0, 1fr) 18rem;
    }
    .view.with-pads.fill {
      grid-template-columns: minmax(0, 1fr) clamp(18rem, 34%, 28rem);
    }
  }
  /* Under the lanes (a phone) the pads stay a size the thumbs reach and the screen holds with the lanes; before
     the run they stand alone, so the whole surface sits above the docked Start. */
  @container hw (max-width: 49.99rem) {
    .view.with-pads .side {
      width: min(100%, 16rem);
      justify-self: center;
    }
    .view.pads-only {
      grid-template-rows: auto;
    }
    .view.pads-only .highway,
    .view.lanes-only .side {
      display: none;
    }
    .view.lanes-only {
      grid-template-rows: 1fr;
    }
  }
  .highway {
    --head: 1.5rem;
    display: grid;
    grid-template-columns: 7.6rem minmax(0, 1fr);
    min-height: calc(var(--lanes) * var(--lane-base) + var(--head));
    border-radius: 1rem;
    overflow: hidden;
    background: linear-gradient(180deg, var(--ws-stage-2), var(--ws-stage));
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--ws-stage-ink) 10%, transparent),
      0 8px 24px oklch(0 0 0 / 0.25);
    color: var(--ws-stage-ink);
  }
  /* Slices are numbered chips: a narrower label column. */
  .highway.slim {
    grid-template-columns: 5.25rem minmax(0, 1fr);
  }
  /* With each slice's waveform beside its chip, room to read its shape. */
  .highway.slim.waves {
    grid-template-columns: 9.5rem minmax(0, 1fr);
  }
  .lane-wave {
    flex: 1;
    min-width: 0;
    height: min(1.5rem, 80%);
    fill: color-mix(in oklch, var(--c) 80%, var(--ws-stage-ink));
  }
  @container hw (max-width: 30rem) {
    .highway {
      grid-template-columns: 4.6rem minmax(0, 1fr);
    }
    .highway.slim,
    .highway.slim.waves {
      grid-template-columns: 3rem minmax(0, 1fr);
    }
    .highway .lane-wave,
    .highway .map,
    .highway .pad {
      display: none;
    }
  }
  .labels {
    display: grid;
    grid-template-rows: repeat(var(--lanes), minmax(0, 1fr));
    padding-top: var(--head);
    border-right: 1px solid color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
    background: color-mix(in oklch, var(--ws-stage) 60%, transparent);
  }
  .lane-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    padding-inline: 0.5rem 0.4rem;
    font-size: 0.8125rem;
    line-height: 1.1;
  }
  /* A slice's number on its pad's colour, in the stage's dark ink (as the sticking letters are). */
  .chip {
    flex: none;
    display: grid;
    place-items: center;
    min-width: 1.75rem;
    height: 1.25rem;
    padding-inline: 0.3rem;
    border-radius: 0.4rem;
    background: var(--c);
    color: #140a10;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  /* Two lines when the lane is tall enough ("Mid tom" whole, not "Mid..."), else one. */
  .name {
    flex: 1;
    min-width: 0;
    font-weight: 700;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--name-lines, 1);
    line-clamp: var(--name-lines, 1);
    overflow-wrap: anywhere;
  }
  .pad {
    font-size: 0.8125rem;
    color: var(--ws-stage-soft);
    font-variant-numeric: tabular-nums;
  }
  .dot {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 3px;
    background: var(--c);
  }
  /* Where the lane's pad sits on the 16, A01 bottom left. */
  .map {
    flex: none;
    display: grid;
    grid-template-columns: repeat(4, 3px);
    gap: 1px;
  }
  .map i {
    width: 3px;
    height: 3px;
    border-radius: 1px;
    background: color-mix(in oklch, var(--ws-stage-ink) 18%, transparent);
  }
  .map i.on {
    background: var(--c);
    box-shadow: 0 0 4px var(--c);
  }
  /* The track's height is the lanes' box: each lane is a share of it (container units, so nothing here feeds
     back into the height). */
  .track {
    --lane: calc((100cqh - var(--head)) / var(--lanes));
    container: lane / size;
    position: relative;
    padding-top: var(--head);
    overflow: hidden;
  }
  .lane {
    position: absolute;
    inset-inline: 0;
    height: var(--lane);
    margin-top: var(--head);
    border-bottom: 1px solid color-mix(in oklch, var(--ws-stage-ink) 6%, transparent);
    background: linear-gradient(90deg, color-mix(in oklch, var(--c) 14%, transparent), transparent 35%);
  }
  .line {
    position: absolute;
    top: var(--head);
    bottom: 0;
    width: 1px;
    background: color-mix(in oklch, var(--ws-stage-ink) 5%, transparent);
  }
  .line[data-kind="beat"] {
    background: color-mix(in oklch, var(--ws-stage-ink) 13%, transparent);
  }
  .line[data-kind="bar"] {
    top: 0.2rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 32%, transparent);
  }
  .line[data-kind="end"] {
    top: 0;
    width: 3px;
    background: color-mix(in oklch, var(--ws-stage-ink) 60%, transparent);
  }
  .bar-no {
    position: absolute;
    top: 0.05rem;
    padding-left: 0.3rem;
    font-size: 0.8125rem;
    line-height: 1.3rem;
    font-weight: 700;
    color: var(--ws-stage-soft);
    font-variant-numeric: tabular-nums;
  }
  /* The notes: squares in the lane's colour; accents bigger with a ring, ghosts small and hollow. */
  .note {
    /* Never wider than a step, so close notes stay apart. */
    --size: min(2rem, calc(var(--lane) * 0.5), calc(var(--step) * 0.8));
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-top: var(--head);
    transform: translate(-50%, -50%);
    border-radius: 0.3rem;
    background: var(--c);
    box-shadow: 0 0 10px color-mix(in oklch, var(--c) 50%, transparent);
  }
  /* The sticking letter, centred in the note in the stage's dark ink. */
  .note b {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: calc(var(--size) * 0.62);
    font-weight: 900;
    line-height: 1;
    color: #140a10;
  }
  .note[data-kind="accent"] {
    --size: min(2.5rem, calc(var(--lane) * 0.7), calc(var(--step) * 1));
    box-shadow:
      0 0 16px color-mix(in oklch, var(--c) 75%, transparent),
      inset 0 0 0 2px color-mix(in oklch, var(--ws-stage-ink) 70%, transparent);
  }
  .note[data-kind="ghost"] {
    --size: min(0.85rem, calc(var(--lane) * 0.36), calc(var(--step) * 0.5));
    background: color-mix(in oklch, var(--c) 18%, transparent);
    box-shadow: inset 0 0 0 2px var(--c);
  }
  .hold {
    position: absolute;
    height: 4px;
    margin-top: var(--head);
    transform: translateY(-50%);
    border-radius: 2px;
    background: color-mix(in oklch, var(--c) 55%, transparent);
  }
  .note[data-judged="perfect"] {
    background: color-mix(in oklch, var(--c) 35%, var(--ws-stage-ink));
    box-shadow: 0 0 18px color-mix(in oklch, var(--c) 90%, transparent);
  }
  .note[data-judged="early"] {
    box-shadow: 0 0 0 2px var(--early, var(--warn));
  }
  .note[data-judged="late"] {
    box-shadow: 0 0 0 2px var(--late, var(--warn));
  }
  /* A hit nothing asked for: a cross in its pad's lane, when it was played, under the row of notes so it never
     covers one. */
  .extra {
    position: absolute;
    margin-top: var(--head);
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
    grid-auto-flow: column;
    gap: 0.15rem;
    min-width: 1.1rem;
    height: 1.1rem;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 900;
    line-height: 1;
    color: white;
    background: var(--destructive);
    box-shadow: 0 0 0 1.5px var(--ws-stage);
  }
  /* Several stray hits in one place: one mark with their count. */
  .extra:has(b) {
    padding-inline: 0.3rem;
  }
  .extra b {
    font-variant-numeric: tabular-nums;
  }
  .note[data-judged="miss"] {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--destructive);
    opacity: 0.55;
  }
  .hitline {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    transform: translateX(-50%);
    background: var(--ws-stage-ink);
    box-shadow: 0 0 12px color-mix(in oklch, var(--instr) 80%, transparent);
  }
  /* The latest judgement, on the row it was for just past the hit line (in the header when it has no row). */
  .flash {
    position: absolute;
    top: 0.15rem;
    z-index: 2;
    padding: 0.15rem 0.7rem;
    border-radius: 999px;
    background: var(--ws-stage);
    line-height: 1.3rem;
    font-weight: 800;
    font-size: 1rem;
    letter-spacing: 0.02em;
    pointer-events: none;
    animation: pop 900ms ease-out both;
    white-space: nowrap;
  }
  /* On its row, above the row's notes (as far as the lane has room), so the pill never covers the note just
     judged or the next one coming. */
  .flash[data-row] {
    transform: translateY(calc(-50% - min(1.9rem, var(--lane) * 0.4)));
    animation-name: pop-row;
  }
  .flash small {
    font-size: 0.8125rem;
    font-weight: 600;
  }
  /* A solid pill in the judgement's colour, lifted toward the stage ink so it reads on the dark stage in both themes. */
  .flash {
    --k: var(--ws-stage-ink);
    color: color-mix(in oklch, var(--k) 55%, var(--ws-stage-ink));
    background: color-mix(in oklch, var(--k) 28%, var(--ws-stage));
    box-shadow: inset 0 0 0 1.5px var(--k);
  }
  .flash[data-kind="perfect"] {
    --k: var(--success);
  }
  .flash[data-kind="early"] {
    --k: var(--early, var(--warn));
  }
  .flash[data-kind="late"] {
    --k: var(--late, var(--warn));
  }
  .flash[data-kind="miss"] {
    --k: var(--destructive);
  }
  .count {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 3.5rem;
    font-weight: 900;
    color: var(--ws-stage-ink);
    text-shadow: 0 0 24px color-mix(in oklch, var(--instr) 70%, transparent);
    animation: count 500ms ease-out both;
    pointer-events: none;
  }
  .side {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.75rem;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.9);
    }
    15% {
      opacity: 1;
      transform: none;
    }
    75% {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  /* Opacity only: the pill keeps the place its transform gives it. */
  @keyframes pop-row {
    from {
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    75% {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes count {
    from {
      opacity: 0;
      transform: scale(1.6);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  /* A phone's notes stay big enough to aim at (after the base sizes, so this wins): a plain note may fill
     more of a step, never under 12 px. */
  @container hw (max-width: 30rem) {
    .note:not([data-kind]),
    .note[data-kind="normal"] {
      --size: max(0.75rem, min(1.5rem, calc(var(--lane) * 0.62), calc(var(--step) * 0.92)));
    }
    .note[data-kind="accent"] {
      --size: max(0.9rem, min(1.75rem, calc(var(--lane) * 0.78), calc(var(--step) * 1.1)));
    }
  }
  /* The notes still move (they are the clock); the pops and glows hold still. */
  @media (prefers-reduced-motion: reduce) {
    .flash,
    .count {
      animation: none;
    }
  }
  :global(html[data-reduce-motion]) .flash,
  :global(html[data-reduce-motion]) .count {
    animation: none;
  }
</style>
