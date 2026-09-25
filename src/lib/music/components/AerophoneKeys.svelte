<script lang="ts">
  // Aerophone key layout (sax fingering mode, written pitch) with the
  // fingering for `midi` pressed. Responsive SVG: viewBox + width 100%.
  import fingerings from "@repo/music-core/data/aerophone-fingerings.json";
  import { noteName } from "@repo/music-core";

  interface Props {
    midi: number | null;
    /** Highlight the held note's fingering in a second colour. */
    heldMidi?: number | null;
    label?: string;
    compact?: boolean;
  }
  let { midi, heldMidi = null, label, compact = false }: Props = $props();

  type Shape = { x: number; y: number; r?: number; w?: number; h?: number };
  const LAYOUT: Record<string, Shape> = {
    octave: { x: 22, y: 34, r: 7 },
    palm1: { x: 86, y: 22, w: 14, h: 7 },
    palm2: { x: 90, y: 33, w: 14, h: 7 },
    palm3: { x: 86, y: 44, w: 14, h: 7 },
    palm4: { x: 90, y: 55, w: 14, h: 7 },
    front: { x: 38, y: 50, w: 12, h: 7 },
    k1: { x: 60, y: 70, r: 10 },
    bisBb: { x: 60, y: 87, r: 4 },
    k2: { x: 60, y: 104, r: 10 },
    k3: { x: 60, y: 130, r: 10 },
    gsharp: { x: 28, y: 138, w: 14, h: 8 },
    lowCsharp: { x: 22, y: 152, w: 14, h: 8 },
    lowB: { x: 30, y: 164, w: 14, h: 8 },
    lowBb: { x: 22, y: 176, w: 14, h: 8 },
    k4: { x: 60, y: 186, r: 10 },
    k5: { x: 60, y: 212, r: 10 },
    k6: { x: 60, y: 238, r: 10 },
    sideE: { x: 93, y: 176, w: 8, h: 14 },
    sideC: { x: 93, y: 194, w: 8, h: 14 },
    sideBb: { x: 93, y: 212, w: 8, h: 14 },
    eb: { x: 32, y: 256, w: 14, h: 8 },
    lowC: { x: 28, y: 270, w: 16, h: 9 },
    blackL1: { x: 8, y: 96, w: 6, h: 12 },
    blackL2: { x: 8, y: 112, w: 6, h: 12 },
    blackL3: { x: 8, y: 128, w: 6, h: 12 },
    blackR1: { x: 108, y: 96, w: 6, h: 12 },
    blackR2: { x: 108, y: 112, w: 6, h: 12 },
    blackR3: { x: 108, y: 128, w: 6, h: 12 },
  };

  const fingeringFor = (m: number | null) =>
    m === null ? null : (fingerings.fingeringsByMidi as Record<string, { keys: string[]; octave: boolean }>)[m] ?? null;
  const target = $derived(fingeringFor(midi));
  const held = $derived(fingeringFor(heldMidi));
  const keyLabel = (id: string) => fingerings.keys.find((k) => k.id === id)?.label ?? id;
  const pressed = (id: string, f: { keys: string[]; octave: boolean } | null) =>
    !!f && (id === "octave" ? f.octave : f.keys.includes(id));
  const description = $derived(
    midi === null
      ? "No note"
      : target
        ? `${noteName(midi, "flat")}: ${[target.octave ? "octave key" : "", ...target.keys.map(keyLabel)].filter(Boolean).join(", ") || "all keys open"}`
        : `${noteName(midi, "flat")}: outside the charted range, Bb3 to F#5`,
  );
</script>

<figure class="flex flex-col items-center gap-2" class:max-w-40={compact} class:max-w-56={!compact}>
  <svg viewBox="0 0 122 290" class="h-auto w-full" role="img" aria-label={label ?? `Fingering for ${description}`}>
    <rect x="44" y="6" width="32" height="278" rx="16" fill="#1d1b22" stroke="#ffffff22" />
    {#each Object.entries(LAYOUT) as [id, s] (id)}
      {@const on = pressed(id, target)}
      {@const h = pressed(id, held)}
      {@const reserved = id.startsWith("black")}
      {#if s.r}
        <circle
          cx={s.x}
          cy={s.y}
          r={s.r}
          class="key"
          data-on={on || undefined}
          data-held={h || undefined}
          data-reserved={reserved || undefined}
        />
      {:else}
        <rect
          x={s.x - (s.w ?? 0) / 2}
          y={s.y - (s.h ?? 0) / 2}
          width={s.w}
          height={s.h}
          rx="3"
          class="key"
          data-on={on || undefined}
          data-held={h || undefined}
          data-reserved={reserved || undefined}
        />
      {/if}
    {/each}
    <text x="22" y="54" class="cap">oct</text>
  </svg>
  {#if !compact}<figcaption class="text-center text-sm text-ws-stage-soft">{description}</figcaption>{/if}
</figure>

<style>
  .key {
    fill: #3a3742;
    stroke: #a8a2b4;
    stroke-width: 1.2;
  }
  .key[data-reserved] {
    fill: #111;
    stroke: #55505e;
    stroke-dasharray: 2 2;
  }
  .key[data-on] {
    fill: var(--instr);
    stroke: white;
    stroke-width: 1.6;
  }
  .key[data-held]:not([data-on]) {
    fill: var(--destructive);
  }
  .key[data-held][data-on] {
    stroke: var(--success);
    stroke-width: 3;
  }
  .cap {
    fill: #a8a2b4;
    font-size: 7px;
    text-anchor: middle;
  }
</style>
