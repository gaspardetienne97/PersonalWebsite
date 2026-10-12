<script lang="ts">
  // What the prompt sounds like, as a picture. While you listen and answer it
  // shows only the shape in time (one bar per note or chord, lit as it plays,
  // all at one height, so it never gives the answer away). Revealed, every
  // note rises to its pitch and the drill's own picture appears: the interval
  // as an arc, a chord's stacked gaps, a cadence's numerals, degrees in their
  // colours with a melody's contour.
  import { pc, noteName } from "@repo/music-core";
  import { SCALE_DEGREES, type EarPrompt } from "@repo/music-core/content/ear";
  import { intervalBySemitones } from "@repo/music-core/theory/intervals";
  import { CADENCES_AND_QUALITIES } from "@repo/music-core/data/index";
  import { degreeColor } from "./degrees";

  let {
    prompt,
    revealed,
    active = -1,
    labels = "numbers",
  }: {
    prompt: EarPrompt;
    revealed: boolean;
    /** The playback event sounding now, or -1. */
    active?: number;
    labels?: "numbers" | "solfege";
  } = $props();

  // Drawn at the box's own pixel width; taller when the notes span more pitches.
  let W = $state(600);
  const PAD = { left: 52, right: 52, top: 34, bottom: 30 };

  const events = $derived(prompt.playback);
  const end = $derived(Math.max(...events.map((e) => e.time + e.duration)));
  const all = $derived(events.flatMap((e) => e.midi));
  const lo = $derived(Math.min(...all) - 1);
  const hi = $derived(Math.max(...all) + 1);
  const row = $derived(Math.max(5, Math.min(12, 150 / Math.max(1, hi - lo))));
  const H = $derived(PAD.top + PAD.bottom + Math.max(90, (hi - lo) * row));
  const x = (t: number) => PAD.left + (t / end) * (W - PAD.left - PAD.right);
  const yOf = (m: number) => PAD.top + ((hi - m) / Math.max(1, hi - lo)) * (H - PAD.top - PAD.bottom);
  const mid = $derived((H - PAD.bottom + PAD.top) / 2);
  const noteH = $derived(Math.max(10, Math.min(16, row * 1.6)));

  const tonic = $derived(events[0]?.midi[0] ?? 60);
  const degreeOf = (m: number) => SCALE_DEGREES[pc(m - tonic)].label;
  const usesDegrees = $derived(["scale-degree", "melody-dictation", "repertoire-transfer"].includes(prompt.drill));
  const shortInterval = (n: number) => intervalBySemitones(n % 12 || (n ? 12 : 0))?.token ?? `${n}`;

  // The drill's own marks, drawn once revealed.
  const arc = $derived.by(() => {
    if (prompt.drill !== "interval") return null;
    const notes = events.flatMap((e) => e.midi.map((m) => ({ m, t: e.time + e.duration / 2 })));
    if (notes.length < 2) return null;
    const [a, b] = [notes[0], notes[notes.length - 1]];
    const iv = intervalBySemitones(Math.abs(b.m - a.m));
    return { a, b, text: `${iv?.name ?? `${Math.abs(b.m - a.m)} semitones`}, ${Math.abs(b.m - a.m)} semitones` };
  });
  const romans = $derived(
    prompt.drill === "cadence" ? (CADENCES_AND_QUALITIES.cadences.find((c) => c.token === prompt.answer)?.romanProgression ?? []) : [],
  );
  const gaps = $derived(
    prompt.drill === "chord-quality"
      ? events.flatMap((e) => {
          const s = [...e.midi].sort((a, b) => a - b);
          return s.slice(1).map((m, i) => ({ t: e.time + e.duration, lo: s[i], hi: m, label: shortInterval(m - s[i]) }));
        })
      : [],
  );
  const contour = $derived(
    usesDegrees && events.length > 2
      ? events
          .slice(1)
          .map((e) => `${x(e.time + Math.min(e.duration, 0.3) / 2)},${yOf(e.midi[0])}`)
          .join(" ")
      : "",
  );
  const degreeText = (m: number) => {
    const d = degreeOf(m);
    return labels === "solfege" ? (SCALE_DEGREES.find((s) => s.label === d)?.solfege ?? d) : d;
  };
</script>

<div bind:clientWidth={W} class="w-full">
<svg class="ear-visual" class:revealed width={W} height={H} viewBox="0 0 {W} {H}" role="img" aria-label={revealed ? "What you heard, note by note" : "What is playing, in time"}>
  <line class="base" x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom + 6} y2={H - PAD.bottom + 6} />

  {#if revealed && contour}
    <polyline class="contour" points={contour} />
  {/if}

  {#each events as e, ei (ei)}
    {@const on = ei === active}
    {#if revealed}
      {#each e.midi as m, mi (mi)}
        {@const colour = usesDegrees ? degreeColor(degreeOf(m)) : "var(--instr)"}
        <g class="note" style:--d="{ei * 70 + mi * 30}ms">
          <rect
            x={x(e.time)}
            y={yOf(m) - noteH / 2}
            width={Math.max(8, x(e.time + e.duration) - x(e.time) - 3)}
            height={noteH}
            rx={noteH / 2}
            fill={colour}
            class:on
          />
          {#if usesDegrees}
            <text class="tag" x={x(e.time) + 4} y={yOf(m) - noteH / 2 - 4}>{degreeText(m)}</text>
          {:else if prompt.drill === "interval"}
            <!-- Note names sit left of their bar, clear of arcs and of neighbours above. -->
            <text class="tag soft" x={x(e.time) - 6} y={yOf(m) + 4} text-anchor="end">{noteName(m, "flat")}</text>
          {/if}
        </g>
      {/each}
      {#if romans[ei]}
        <text class="roman" x={x(e.time + e.duration / 2)} y={H - 6} text-anchor="middle">{romans[ei]}</text>
      {/if}
    {:else}
      <!-- One bar per event, whatever it holds: the shape in time, not the notes. -->
      <rect class="shape" class:on x={x(e.time)} y={mid - 9} width={Math.max(8, x(e.time + e.duration) - x(e.time) - 3)} height="18" rx="9" />
    {/if}
  {/each}

  {#if revealed && arc}
    {@const ax = x(arc.a.t)}
    {@const bx = x(arc.b.t)}
    {@const top = Math.min(yOf(arc.a.m), yOf(arc.b.m)) - 22}
    <path class="arc" d="M {ax} {yOf(arc.a.m) - 8} C {ax} {top}, {bx} {top}, {bx} {yOf(arc.b.m) - 8}" />
    <text class="arc-label" x={(ax + bx) / 2} y={Math.max(14, top + 2)} text-anchor="middle">{arc.text}</text>
  {/if}

  {#if revealed}
    {#each gaps as g, gi (gi)}
      <text class="gap" x={x(g.t) + 6} y={(yOf(g.lo) + yOf(g.hi)) / 2 + 4}>{g.label}</text>
    {/each}
  {/if}
</svg>
</div>

<style>
  .ear-visual {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .base {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 15%, transparent);
    stroke-width: 1;
  }
  .shape {
    fill: color-mix(in oklch, var(--ws-stage-ink) 16%, transparent);
    transition: fill 120ms;
  }
  .shape.on {
    fill: var(--instr);
    filter: drop-shadow(0 0 8px color-mix(in oklch, var(--instr) 70%, transparent));
  }
  /* Revealed: each note rises into place, one after another. */
  .note {
    animation: rise 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: var(--d);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
  }
  .note rect.on {
    filter: drop-shadow(0 0 8px currentColor) brightness(1.25);
  }
  .tag,
  .gap,
  .roman,
  .arc-label {
    font-size: 13px;
    font-weight: 700;
    fill: var(--ws-stage-ink);
  }
  .tag.soft {
    font-weight: 600;
    fill: var(--ws-stage-soft);
  }
  .roman {
    font-family: var(--font-display, inherit);
    font-size: 15px;
  }
  .gap {
    fill: var(--instr);
  }
  .arc {
    fill: none;
    stroke: var(--instr);
    stroke-width: 2;
    stroke-dasharray: 4 4;
    animation: fade 500ms 200ms both;
  }
  .arc-label {
    animation: fade 500ms 300ms both;
  }
  .contour {
    fill: none;
    stroke: color-mix(in oklch, var(--ws-stage-ink) 35%, transparent);
    stroke-width: 2;
    stroke-linejoin: round;
    animation: fade 500ms 200ms both;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .note,
    .arc,
    .arc-label,
    .contour {
      animation: none;
    }
  }
  :global(html[data-reduce-motion]) .note,
  :global(html[data-reduce-motion]) .arc,
  :global(html[data-reduce-motion]) .arc-label,
  :global(html[data-reduce-motion]) .contour {
    animation: none;
  }
</style>
