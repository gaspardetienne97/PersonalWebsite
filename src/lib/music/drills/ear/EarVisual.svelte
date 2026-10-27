<script lang="ts">
  // What the prompt sounds like, as a picture. While you listen and answer it
  // shows only the shape in time (one bar per note or chord, lit as it plays,
  // all at one height, so it never gives the answer away). Revealed, every
  // note rises to its pitch and the drill's own picture appears: intervals,
  // chords and cadences on a grand staff (named underneath), degrees in their
  // colours with a melody's contour.
  import { noteName, pc } from "@repo/music-core";
  import { functionLabel, functionSymbol, parseFunction, SCALE_DEGREES, type EarPrompt } from "@repo/music-core/content/ear";
  import { intervalBySemitones } from "@repo/music-core/theory/intervals";
  import { CADENCES_AND_QUALITIES } from "@repo/music-core/data/index";
  import { inversionOf } from "@repo/music-core/scoring/ear";
  import type { Score } from "@repo/music-core";
  import Staff from "$lib/music/notation/Staff.svelte";
  import { degreeColor } from "./degrees";
  import { tokenLabel } from "./session";

  let {
    prompt,
    revealed,
    active = -1,
    labels = "numbers",
    prefix,
  }: {
    prompt: EarPrompt;
    revealed: boolean;
    /** The playback event sounding now, or -1. */
    active?: number;
    labels?: "numbers" | "solfege";
    /** Leads the caption, e.g. "Played" or "You chose" when a mistake is shown beside the answer. */
    prefix?: string;
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
  const usesDegrees = $derived(["scale-degree", "melody-dictation", "repertoire-transfer", "scale", "error-detect"].includes(prompt.drill));
  const shortInterval = (n: number) => intervalBySemitones(n % 12 || (n ? 12 : 0))?.token ?? `${n}`;

  const contour = $derived(
    usesDegrees && events.length > 2
      ? events
          .slice(1)
          .map((e) => `${x(e.time + Math.min(e.duration, 0.3) / 2)},${yOf(e.midi[0])}`)
          .join(" ")
      : "",
  );
  // Intervals, chords and cadences read best as notes: a small grand staff each
  // (split at middle C, as a pianist reads it), named underneath. A comparison
  // gets one staff per interval.
  const QUALITIES = CADENCES_AND_QUALITIES.chordQualities;
  const CADENCES = CADENCES_AND_QUALITIES.cadences;
  const onStaff = $derived(["interval", "interval-compare", "chord-quality", "cadence", "chord-function", "progression", "loop", "inversion", "bass-line"].includes(prompt.drill));
  // Chords that only set the key are heard, not drawn.
  const groups = $derived(
    !onStaff
      ? []
      : prompt.drill === "interval-compare"
        ? [events.slice(0, events.length / 2), events.slice(events.length / 2)]
        : prompt.drill === "inversion"
          ? [events.slice(-1)] // the chord itself, not the notes spelled out before it
          : [events.slice(prompt.keyEvents ?? 0)],
  );
  // The prompt's key; without one, the first chord is the key's I (or i), root in the bass.
  const tonicPc = $derived((prompt as { keyPc?: number }).keyPc ?? pc(events[0].midi[0]));
  const minorKey = $derived((prompt as { minor?: boolean }).minor ?? parseFunction(prompt.answer.split(" ")[0]).minor);
  function describe(g: EarPrompt["playback"]): string {
    if (prompt.caption) return prompt.caption;
    const ms = g.flatMap((e) => e.midi);
    if (prompt.drill === "chord-quality") {
      const s = [...ms].sort((a, b) => a - b);
      const name = QUALITIES.find((q) => q.token === prompt.answer)?.label ?? prompt.answer;
      return `${name}: ${s.slice(1).map((m, i) => shortInterval(m - s[i])).join(", ")}`;
    }
    if (prompt.drill === "inversion") {
      const found = inversionOf(ms);
      if (!found) return tokenLabel(prompt.drill, prompt.answer);
      const name = QUALITIES.find((q) => q.token === found.token)?.label ?? found.token;
      const where = ["Root position", "First inversion", "Second inversion", "Third inversion"][found.position];
      // Sharp names for the roots whose major chords are spelled with sharps (B major's third is D#).
      const prefer = [2, 4, 7, 9, 11].includes(found.rootPc) ? "sharp" : "flat";
      return `${noteName(48 + found.rootPc, "flat", false)} ${name.toLowerCase()}, ${where.toLowerCase()}: ${noteName(Math.min(...ms), prefer, false)} in the bass`;
    }
    if (prompt.drill === "chord-function" || prompt.drill === "progression") {
      const key = `${noteName(48 + tonicPc, "flat", false)} ${minorKey ? "minor" : "major"}`;
      const tokens = prompt.answer.split(" ");
      const names = tokens.map((t) => functionSymbol(tonicPc, t));
      return `${tokens.map(functionLabel).join(", ")} in ${key}: ${names.join(", ")}`;
    }
    if (prompt.drill === "cadence") {
      const c = CADENCES.find((x) => x.token === prompt.answer);
      return c ? `${c.label}, ${c.romanProgression.join(" to ")}` : prompt.answer;
    }
    const semis = Math.abs(ms[ms.length - 1] - ms[0]);
    const name = semis === 0 ? "Perfect unison" : (intervalBySemitones(semis)?.name ?? `${semis} semitones`);
    return `${name}, ${semis} semitone${semis === 1 ? "" : "s"}`;
  }
  // Chords of a key are drawn in it: its signature (a minor key's is its relative major's)
  // and its spelling (Eb major's IV is Ab, not G#).
  const keyed = $derived(["chord-function", "progression", "loop", "bass-line"].includes(prompt.drill));
  const keyFifths = $derived.by(() => {
    const f = (((tonicPc + (minorKey ? 3 : 0)) % 12) * 7) % 12;
    return f > 5 ? f - 12 : f;
  });
  const lead = (k: number) => (prompt.drill === "interval-compare" ? (k === 0 ? "First" : "Second") : prefix);
  const staffScores = $derived(
    groups.map((g, k): Score => {
      const one = g.length === 1;
      return {
        id: `${prompt.id}-${k}`,
        title: "",
        bpm: 60,
        keyFifths: keyed ? keyFifths : undefined,
        meter: { beats: one ? 2 : Math.max(2, g.length), beatUnit: 4 },
        voices: [
          {
            id: "v",
            name: "Notes",
            notes: g.flatMap((e, n) => e.midi.map((midi) => ({ midi, startBeat: one ? 0 : n, durationBeats: one ? 2 : 1 }))),
          },
        ],
        lengthBeats: one ? 2 : Math.max(2, g.length),
      };
    }),
  );
  const degreeText = (m: number) => {
    const d = degreeOf(m);
    return labels === "solfege" ? (SCALE_DEGREES.find((s) => s.label === d)?.solfege ?? d) : d;
  };
</script>

{#if revealed && onStaff}
  <div class="grid gap-3 {groups.length > 1 ? 'sm:grid-cols-2' : ''}">
    {#each groups as g, k (k)}
      <figure class="staff-card flex flex-col items-center rounded-xl bg-ws-surface px-3 pb-2 pt-1 text-ws-ink" aria-label="{lead(k) ?? 'The notes'} on the staff">
        <div class="w-full max-w-72"><Staff score={staffScores[k]} grand maxHeight="14rem" /></div>
        <figcaption class="text-center text-sm font-semibold">{lead(k) ? `${lead(k)}: ` : ""}{describe(g)}</figcaption>
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
    {:else}
      <!-- One bar per event, whatever it holds: the shape in time, not the notes. -->
      <rect class="shape" class:on x={x(e.time)} y={mid - 9} width={Math.max(8, x(e.time + e.duration) - x(e.time) - 3)} height="18" rx="9" />
    {/if}
  {/each}


</svg>
{#if revealed && prefix}<p class="mt-1 text-center text-sm font-semibold">{prefix}: {tokenLabel(prompt.drill, prompt.answer, labels === "solfege" ? "solfege" : "degree")}</p>{/if}
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
  .tag {
    font-size: 13px;
    font-weight: 700;
    fill: var(--ws-stage-ink);
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
