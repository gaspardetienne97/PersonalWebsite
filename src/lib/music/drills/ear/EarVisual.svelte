<script lang="ts">
  // What the prompt sounds like, as a picture. While you listen and answer it
  // shows only the shape in time (one bar per note or chord, lit as it plays,
  // all at one height, so it never gives the answer away). Revealed, every
  // note rises to its pitch and the drill's own picture appears: intervals on a
  // staff, a chord's stacked gaps, a cadence's numerals, degrees in their
  // colours with a melody's contour.
  import { pc } from "@repo/music-core";
  import { SCALE_DEGREES, type EarPrompt } from "@repo/music-core/content/ear";
  import { intervalBySemitones } from "@repo/music-core/theory/intervals";
  import { CADENCES_AND_QUALITIES } from "@repo/music-core/data/index";
  import type { Score } from "@repo/music-core";
  import Staff from "$lib/music/notation/Staff.svelte";
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
  // Intervals read best as notes on a staff: each interval its own 2/4 bar,
  // two quarter notes (or one chord), named underneath.
  const onStaff = $derived(prompt.drill === "interval" || prompt.drill === "interval-compare");
  const intervals = $derived.by(() => {
    if (!onStaff) return [];
    const half = prompt.drill === "interval-compare" ? events.length / 2 : events.length;
    const groups = prompt.drill === "interval-compare" ? [events.slice(0, half), events.slice(half)] : [events];
    return groups.map((g) => {
      const ms = g.flatMap((e) => e.midi);
      const semis = Math.abs(ms[ms.length - 1] - ms[0]);
      return { events: g, semis, name: semis === 0 ? "Perfect unison" : (intervalBySemitones(semis)?.name ?? `${semis} semitones`) };
    });
  });
  // One small staff per interval (its own 2/4 bar), so each name sits under its notes.
  // Both intervals of a comparison share one clef.
  // The clef that needs the fewest ledger lines: bass covers G2 to A3, treble E4 to F5.
  const clef = $derived.by(() => {
    const ms = intervals.flatMap((iv) => iv.events.flatMap((e) => e.midi));
    const off = (lo: number, hi: number) => ms.reduce((t, m) => t + Math.max(0, lo - m) + Math.max(0, m - hi), 0);
    return off(43, 57) < off(64, 77) ? "bass" : "treble";
  });
  const staffScores = $derived(
    intervals.map(
      (iv, k): Score => ({
        id: `${prompt.id}-${k}`,
        title: "",
        bpm: 60,
        meter: { beats: 2, beatUnit: 4 },
        voices: [
          {
            id: "v",
            name: "Interval",
            clef,
            notes:
              iv.events.length === 1
                ? iv.events[0].midi.map((midi) => ({ midi, startBeat: 0, durationBeats: 2 }))
                : iv.events.map((e, n) => ({ midi: e.midi[0], startBeat: n, durationBeats: 1 })),
          },
        ],
        lengthBeats: 2,
      }),
    ),
  );
  const degreeText = (m: number) => {
    const d = degreeOf(m);
    return labels === "solfege" ? (SCALE_DEGREES.find((s) => s.label === d)?.solfege ?? d) : d;
  };
</script>

{#if revealed && onStaff}
  <div class="grid gap-3 {intervals.length > 1 ? 'sm:grid-cols-2' : ''}">
    {#each intervals as iv, k (k)}
      <figure class="staff-card flex flex-col items-center rounded-xl bg-ws-surface px-3 pb-2 pt-1 text-ws-ink" aria-label="{intervals.length > 1 ? (k === 0 ? 'First interval' : 'Second interval') : 'The interval'} on the staff">
        <div class="w-full max-w-64"><Staff score={staffScores[k]} maxHeight="10rem" /></div>
        <figcaption class="text-center text-sm font-semibold">{intervals.length > 1 ? (k === 0 ? "First: " : "Second: ") : ""}{iv.name}, {iv.semis} semitone{iv.semis === 1 ? "" : "s"}</figcaption>
      </figure>
    {/each}
  </div>
{:else}
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


  {#if revealed}
    {#each gaps as g, gi (gi)}
      <text class="gap" x={x(g.t) + 6} y={(yOf(g.lo) + yOf(g.hi)) / 2 + 4}>{g.label}</text>
    {/each}
  {/if}
</svg>
</div>
{/if}

<style>
  .staff-card {
    animation: fade 400ms both;
  }
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
  .roman {
    font-size: 13px;
    font-weight: 700;
    fill: var(--ws-stage-ink);
  }
  .roman {
    font-family: var(--font-display, inherit);
    font-size: 15px;
  }
  .gap {
    fill: var(--instr);
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
    .contour,
    .staff-card {
      animation: none;
    }
  }
  :global(html[data-reduce-motion]) .note,
  :global(html[data-reduce-motion]) .contour,
  :global(html[data-reduce-motion]) .staff-card {
    animation: none;
  }
</style>
