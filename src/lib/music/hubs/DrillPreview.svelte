<script lang="ts">
  // A still picture of what a drill link plays: the scale on the keys, the chord box, the strum's
  // arrows, the groove's first bar, the staff it reads. Never interactive, never a score: a preview
  // of the target only (drill-preview.ts reads the link). Small ones are decoration beside a title;
  // medium ones carry a caption that says what is drawn.
  import { isBlackKey, noteName, type Instrument } from "@repo/music-core";
  import ChordDiagram from "../components/ChordDiagram.svelte";
  import CircleOfFifths from "../components/CircleOfFifths.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { settings } from "../runtime";
  import { HUE_ICON } from "./hue-icons";
  import { drillPreview } from "./drill-preview";

  let {
    href,
    size = "sm",
    instrument,
    class: cls = "",
  }: { href: string; size?: "sm" | "md"; instrument?: Instrument; class?: string } = $props();

  const strip = $derived(instrument ?? settings.value.activeInstrument);
  const p = $derived(drillPreview(href, strip));
  const hue = $derived(hueForRoute(href.split("?")[0], strip));
  const Icon = $derived(HUE_ICON[hue]);
  const md = $derived(size === "md");

  // Keys
  const keyRange = (low: number, high: number) => Array.from({ length: high - low + 1 }, (_, i) => low + i);
  // Staff: diatonic steps from the bottom line (E4 treble, G2 bass), 4.5 units a step.
  const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const step = (m: number) => Math.floor(m / 12) * 7 + LETTER[m % 12];
  const flat = (m: number) => isBlackKey(m);
</script>

{#snippet picture()}
  {#if p.kind === "keys"}
    {@const keys = keyRange(p.low, p.high)}
    {@const whites = keys.filter((k) => !isBlackKey(k))}
    {@const w = 160 / whites.length}
    <svg viewBox="0 0 160 80" class="h-full w-full" aria-hidden="true">
      {#each whites as k, i (k)}
        <rect x={i * w + 0.5} y="2" width={w - 1} height="76" rx="2" class="white" class:lit={p.notes.includes(k)} />
      {/each}
      {#each keys.filter(isBlackKey) as k (k)}
        {@const i = whites.findIndex((x) => x === k - 1)}
        <rect x={(i + 1) * w - w * 0.31} y="2" width={w * 0.62} height="46" rx="1.5" class="black" />
      {/each}
      <!-- A dot in the drill's hue on each key to play, its degree or name inside on a medium preview. -->
      {#each p.notes as k (k)}
        {@const black = isBlackKey(k)}
        {@const i = black ? whites.findIndex((x) => x === k - 1) + 1 : whites.findIndex((x) => x === k)}
        {@const cx = black ? i * w : i * w + w / 2}
        {@const cy = black ? 38 : 64}
        {@const r = Math.min(black ? w * 0.28 : w * 0.36, 7)}
        <circle {cx} {cy} {r} class="hit" />
        {#if md && p.labels?.[k]}<text x={cx} y={cy + 3.2} class="onhit" text-anchor="middle">{p.labels[k]}</text>{/if}
      {/each}
    </svg>
  {:else if p.kind === "staff"}
    {@const base = p.clef === "treble" ? step(64) : step(43)}
    {@const gap = 110 / Math.max(1, p.notes.length)}
    <svg viewBox="0 0 160 80" class="h-full w-full" aria-hidden="true">
      {#each [0, 1, 2, 3, 4] as l (l)}<line x1="2" x2="158" y1={58 - l * 9} y2={58 - l * 9} class="line" />{/each}
      <text x="4" y={p.clef === "treble" ? 62 : 49} class="clef" font-size={p.clef === "treble" ? 46 : 30}>{p.clef === "treble" ? "𝄞" : "𝄢"}</text>
      {#each p.notes as m, i (i)}
        {@const s = step(m) - base}
        {@const x = 42 + gap * i + gap / 2}
        {@const y = 58 - s * 4.5}
        {#each Array.from({ length: 6 }, (_, j) => j) as j (j)}
          {@const below = -2 - j * 2}
          {@const above = 10 + j * 2}
          {#if s <= below}<line x1={x - 7} x2={x + 7} y1={58 - below * 4.5} y2={58 - below * 4.5} class="line" />{/if}
          {#if s >= above}<line x1={x - 7} x2={x + 7} y1={58 - above * 4.5} y2={58 - above * 4.5} class="line" />{/if}
        {/each}
        {#if flat(m)}<text x={x - 11} y={y + 3.5} class="acc" text-anchor="middle">♭</text>{/if}
        <ellipse cx={x} cy={y} rx="5.4" ry="3.9" transform="rotate(-20 {x} {y})" class="head" style:fill={i === 0 ? "var(--h)" : undefined} />
        {#if p.notes.length > 1}
          {#if s < 4}<line x1={x + 5} x2={x + 5} y1={y - 1} y2={y - 26} class="stem" />{:else}<line x1={x - 5} x2={x - 5} y1={y + 1} y2={y + 26} class="stem" />{/if}
        {/if}
      {/each}
    </svg>
  {:else if p.kind === "rhythm"}
    {@const cell = 148 / p.steps}
    <svg viewBox="0 0 160 80" class="h-full w-full" aria-hidden="true">
      {#if p.chords?.length && md}
        {#each p.chords as c, i (i)}<text x={6 + (i * 148) / p.chords.length} y="11" class="chordname">{c}</text>{/each}
      {/if}
      {#each Array.from({ length: p.steps }, (_, i) => i) as i (i)}
        <rect x={6 + i * cell + 1} y="18" width={cell - 2} height="40" rx="3" class={i % p.perBeat === 0 ? "beat" : "off"} />
        {#if md}<text x={6 + i * cell + cell / 2} y="72" class="count" text-anchor="middle"
            >{i % p.perBeat === 0 ? i / p.perBeat + 1 : p.perBeat === 2 ? "&" : ""}</text
          >{/if}
      {/each}
      {#each p.hits as h, i (i)}
        {@const cx = 6 + h.step * cell + cell / 2}
        {#if h.stroke === "down"}
          <path d="M {cx} 24 L {cx} 48 M {cx - 6} 41 L {cx} 50 L {cx + 6} 41" class="arrow" class:accent={h.accent} />
        {:else if h.stroke === "up"}
          <path d="M {cx} 52 L {cx} 28 M {cx - 6} 35 L {cx} 26 L {cx + 6} 35" class="arrow" class:accent={h.accent} />
        {:else if h.stroke === "mute"}
          <path d="M {cx - 5} 33 L {cx + 5} 43 M {cx + 5} 33 L {cx - 5} 43" class="arrow" />
        {:else}
          <circle {cx} cy="38" r={h.accent ? 8 : 6} class="hit" />
        {/if}
      {/each}
    </svg>
  {:else if p.kind === "lanes"}
    {@const cell = 116 / p.steps}
    {@const rowH = Math.min(22, 72 / p.lanes.length)}
    <svg viewBox="0 0 160 80" class="h-full w-full" aria-hidden="true">
      {#each p.lanes as lane, r (lane.name)}
        {@const y = 4 + r * rowH}
        <text x="2" y={y + rowH / 2 + 3} class="lane">{lane.name}</text>
        {#each Array.from({ length: p.steps }, (_, i) => i) as i (i)}
          <rect x={42 + i * cell + 1} y={y + 1} width={cell - 2} height={rowH - 2} rx="2.5" class={lane.hits.includes(i) ? "hit" : i % p.perBeat === 0 ? "beat" : "off"} />
        {/each}
      {/each}
    </svg>
  {:else if p.kind === "chord"}
    <div class="h-full w-auto" style:aspect-ratio="120 / 150" aria-hidden="true"><ChordDiagram frets={p.frets} fingers={p.fingers} label="" numbers={md} /></div>
  {:else if p.kind === "frets"}
    {@const cols = p.to - p.from + 1}
    {@const fw = 136 / cols}
    {@const sg = 64 / Math.max(1, p.strings - 1)}
    <svg viewBox="0 0 160 80" class="h-full w-full" aria-hidden="true">
      <rect x="18" y="6" width="136" height="68" rx="3" class="wood" />
      {#each Array.from({ length: cols + 1 }, (_, i) => i) as i (i)}
        <line x1={18 + i * fw} x2={18 + i * fw} y1="6" y2="74" class={i === 0 && p.from <= 1 ? "nut" : "wire"} />
      {/each}
      {#each Array.from({ length: p.strings }, (_, s) => s) as s (s)}
        <line x1="10" x2="154" y1={8 + s * sg} y2={8 + s * sg} class="string" />
      {/each}
      {#if p.from > 1 && md}<text x="18" y="80" class="count">{p.from}</text>{/if}
      {#each p.dots as d, i (i)}
        {@const y = 8 + (d.string - 1) * sg}
        {#if d.fret === 0}
          <circle cx="10" cy={y} r="4.5" class="open" />
        {:else}
          {@const cx = 18 + (d.fret - p.from + 0.5) * fw}
          <circle {cx} cy={y} r={Math.min(7.5, sg * 0.45 + 1)} class="hit" />
          {#if md && d.label}<text x={cx} y={y + 3.2} class="onhit" text-anchor="middle">{d.label}</text>{/if}
        {/if}
      {/each}
    </svg>
  {:else if p.kind === "changes"}
    {@const w = 150 / p.chords.length}
    <svg viewBox="0 0 160 80" class="h-full w-full" aria-hidden="true">
      {#each p.chords as c, i (i)}
        <rect x={5 + i * w + 2} y="20" width={w - 4} height="40" rx="8" class={i === 0 ? "hit" : "beat"} />
        <text x={5 + i * w + w / 2} y="46" class="big" class:onhit={i === 0} text-anchor="middle">{c}</text>
      {/each}
    </svg>
  {:else if p.kind === "pads"}
    <svg viewBox="0 0 160 80" class="h-full w-full" aria-hidden="true">
      {#each Array.from({ length: 16 }, (_, i) => i) as i (i)}
        <rect x={44 + (i % 4) * 18.5} y={4 + Math.floor(i / 4) * 18.5} width="16" height="16" rx="3" class={p.lit.includes(i) ? "hit" : "beat"} />
      {/each}
    </svg>
  {:else if p.kind === "circle"}
    <div class="h-full" style:aspect-ratio="1" aria-hidden="true"><CircleOfFifths selected={0} numerals={md} label="" /></div>
  {:else if p.kind === "eq"}
    <svg viewBox="0 0 160 80" class="h-full w-full" aria-hidden="true">
      <line x1="6" x2="154" y1="48" y2="48" class="line" />
      {#each [20, 40, 60, 80, 100, 120, 140] as x (x)}<line x1={x} x2={x} y1="10" y2="72" class="off-line" />{/each}
      <path d="M 6 48 L 70 48 C 82 48 84 16 96 16 C 108 16 110 48 122 48 L 154 48" class="curve" />
    </svg>
  {:else}
    <span class="tile grid size-full place-items-center rounded-xl"><Icon class={md ? "size-10" : "size-6"} /></span>
  {/if}
{/snippet}

{#if md && p.kind !== "icon"}
  <figure class="preview flex min-w-0 flex-col gap-1.5 {cls}" style:--h={hueVar(hue)}>
    <div class="flex h-28 items-center justify-center rounded-2xl bg-ws-raised/60 p-2">{@render picture()}</div>
    <figcaption class="text-sm text-ws-soft">{p.caption}</figcaption>
  </figure>
{:else}
  <span class="preview flex shrink-0 items-center justify-center {md ? 'h-28' : 'h-14 w-24'} {cls}" style:--h={hueVar(hue)} aria-hidden="true">
    {@render picture()}
  </span>
{/if}

<style>
  /* Keys and frets are material (ivory, ebony, wood); the marks take the drill's hue. */
  .white.lit {
    fill: color-mix(in oklch, var(--h) 22%, var(--ws-stage-ink));
  }
  .white {
    fill: var(--ws-stage-ink);
    stroke: color-mix(in oklch, var(--ws-stage) 35%, transparent);
    stroke-width: 0.8;
  }
  .black {
    fill: var(--ws-stage);
  }
  .line,
  .stem {
    stroke: var(--ws-soft);
    stroke-width: 1;
  }
  .off-line {
    stroke: var(--ws-line);
    stroke-width: 1;
  }
  .head {
    fill: var(--ws-ink);
  }
  .clef,
  .acc {
    fill: var(--ws-ink);
    font-family: "Apple Symbols", "Noto Music", "Segoe UI Symbol", "Bravura Text", serif;
  }
  .acc {
    font-size: 13px;
  }
  .beat {
    fill: color-mix(in oklch, var(--h) 16%, var(--ws-surface));
  }
  .off {
    fill: color-mix(in oklch, var(--h) 7%, var(--ws-surface));
  }
  .hit {
    fill: var(--h);
  }
  .arrow {
    fill: none;
    stroke: var(--ws-ink);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .arrow.accent {
    stroke: var(--h);
    stroke-width: 3.4;
  }
  .count,
  .lane {
    font: 500 8.5px var(--font-sans, sans-serif);
    fill: var(--ws-soft);
  }
  .chordname {
    font: 700 10px var(--font-sans, sans-serif);
    fill: var(--ws-ink);
  }
  .big {
    font: 700 14px var(--font-sans, sans-serif);
    fill: var(--ws-ink);
  }
  .big.small {
    font-size: 0.8125rem;
  }
  .onhit {
    fill: var(--ws-stage);
    font: 700 9px var(--font-sans, sans-serif);
  }
  .big.onhit {
    font-size: 14px;
  }
  .big.small.onhit {
    font-size: 0.8125rem;
  }
  .wood {
    fill: color-mix(in oklch, var(--h) 18%, var(--ws-stage));
  }
  .wire {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 70%, transparent);
    stroke-width: 1.2;
  }
  .nut {
    stroke: var(--ws-stage-ink);
    stroke-width: 4;
  }
  .string {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 85%, var(--ws-stage));
    stroke-width: 1;
  }
  .open {
    fill: none;
    stroke: var(--h);
    stroke-width: 2;
  }
  .curve {
    fill: none;
    stroke: var(--h);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .tile {
    background: color-mix(in oklch, var(--h) 22%, transparent);
    color: color-mix(in oklch, var(--h), black 42%);
  }
  :global(.dark) .tile {
    color: var(--h);
  }
</style>
