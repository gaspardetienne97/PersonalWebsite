<script lang="ts">
  // The last 64 pitch samples against the target line; with a drone, the drone
  // gets its own lane so the interval reads as distance.
  import { noteName } from "@repo/music-core";
  import { m } from "@repo/i18n/messages.js";

  interface Props {
    /** Rolling MIDI samples, NaN = silence. */
    values: number[];
    target: number;
    drone?: number | null;
    label: string;
    /** How notes are spelled, so the lane agrees with the page's chart (C#6, not Db6). */
    name?: (midi: number) => string;
  }
  let { values, target, drone = null, label, name = (midi: number) => noteName(midi) }: Props = $props();
  const W = 320;
  const H = 110;
  const lo = $derived(Math.min(target, drone ?? target) - 4);
  const hi = $derived(Math.max(target, drone ?? target) + 4);
  const y = (m: number) => H - 8 - ((Math.min(hi, Math.max(lo, m)) - lo) / (hi - lo)) * (H - 16);
  const dots = $derived(values.map((v, i) => ({ x: W - (values.length - 1 - i) * (W / 63), m: v })).filter((d) => Number.isFinite(d.m)));
  const now = $derived(values[values.length - 1]);
</script>

<figure class="rounded-xl bg-ws-stage-ink/6 p-3">
  <figcaption class="mb-1 flex items-baseline justify-between text-sm text-ws-stage-soft">
    <span>{drone !== null ? m.music_winds_pitch_label_drone({ note: name(drone) }) : m.music_winds_pitch_label()}</span>
    <span class="tnum font-semibold text-ws-stage-ink">
      {#if Number.isFinite(now)}{name(now)}{#if now === target}<span class="ml-1 text-success-stage" aria-label={m.music_winds_pitch_on_target()}>✓</span>{/if}{:else}{m.music_winds_pitch_silent()}{/if}
    </span>
  </figcaption>
  <div class="relative">
  <svg viewBox="0 0 {W} {H}" class="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
    {#if drone !== null}
      <rect x="0" y={y(drone) - 5} width={W} height="10" class="drone" />
    {/if}
    <line x1="0" x2={W} y1={y(target)} y2={y(target)} class="target" />
    {#each dots as d, i (i)}
      <rect x={d.x - 2.5} y={y(d.m) - 2.5} width="5" height="5" rx="1.5" class="dot" data-on={d.m === target || undefined} />
    {/each}
  </svg>
  {#if drone !== null}<span class="cap" style:top="{((y(drone) - 20) / H) * 100}%">{m.music_winds_pitch_drone({ note: name(drone) })}</span>{/if}
  <span class="cap" style:top="{((y(target) - 19) / H) * 100}%">{name(target)}</span>
  </div>
</figure>

<style>
  .drone {
    fill: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
  }
  .target {
    stroke: var(--instr);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
    vector-effect: non-scaling-stroke;
  }
  .cap {
    position: absolute;
    left: 0.25rem;
    font-size: 0.8125rem;
    color: var(--ws-stage-soft);
    pointer-events: none;
  }
  .dot {
    fill: var(--ws-stage-soft);
  }
  .dot[data-on] {
    fill: var(--instr);
  }
  .text-success-stage {
    color: color-mix(in oklch, var(--success) 60%, white);
  }
</style>
