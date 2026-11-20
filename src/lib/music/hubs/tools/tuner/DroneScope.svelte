<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The drone, drawn: a live scope of what is actually sounding (tapped off
  // the drone's output), held still on each cycle so a steady tone looks
  // steady, with a glow that breathes with its level. Reduced motion redraws
  // twice a second instead of every frame.
  import { onDestroy } from "svelte";
  import { noteName } from "@repo/music-core";
  import { audio, type DroneTimbre } from "#lib/music/runtime/index.ts";
  import { pretty, scopePath } from "./tuner";

  let { midi, timbre, playing }: { midi: number; timbre: DroneTimbre; playing: boolean } = $props();

  /** Each sounding layer's part, named. */
  const ROLE: Record<string, string> = {
    tonic: m.music_hubs_tuner_role_tonic(),
    fifth: m.music_hubs_tuner_role_fifth(),
    octave: m.music_hubs_tuner_role_octave(),
    "bowed tonic": m.music_hubs_tuner_role_bowed(),
  };
  const W = 600;
  const H = 160;
  let path = $state(`M0 ${H / 2}L${W} ${H / 2}`);
  let level = $state(0);
  let raf = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const buf = new Float32Array(2048);

  const layers = $derived(
    timbre === "shruti"
      ? [
          { midi, role: "tonic" },
          { midi: midi + 7, role: "fifth" },
          { midi: midi + 12, role: "octave" },
        ]
      : [{ midi, role: timbre === "cello" ? "bowed tonic" : "tonic" }],
  );

  function draw() {
    const a = audio.drone.analyser;
    if (!a) return;
    a.getFloatTimeDomainData(buf);
    path = scopePath(buf, { width: W, height: H, samples: 1024 });
    let sum = 0;
    for (const v of buf) sum += v * v;
    level = Math.min(1, Math.sqrt(sum / buf.length) * 6);
  }

  function stop() {
    cancelAnimationFrame(raf);
    clearInterval(timer);
    raf = 0;
    timer = undefined;
  }

  $effect(() => {
    stop();
    if (!playing) {
      path = `M0 ${H / 2}L${W} ${H / 2}`;
      level = 0;
      return;
    }
    const reduced =
      document.documentElement.hasAttribute("data-reduce-motion") ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) timer = setInterval(draw, 500);
    else {
      const loop = () => {
        draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return stop;
  });

  onDestroy(stop);
</script>

<figure class="scope" data-playing={playing || undefined} style:--level={level}>
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="h-28 w-full sm:h-40" role="img" aria-label={playing ? m.music_hubs_tuner_scope_label({ note: noteName(midi) }) : m.music_hubs_tuner_scope_silent()}>
    <line x1="0" x2={W} y1={H / 2} y2={H / 2} class="axis" vector-effect="non-scaling-stroke" />
    <path d={path} class="wave glow" vector-effect="non-scaling-stroke" />
    <path d={path} class="wave" vector-effect="non-scaling-stroke" />
  </svg>
  <figcaption class="mt-3 flex flex-wrap items-center gap-2 text-sm">
    {#if playing}
      {#each layers as l (l.role)}
        <span class="layer"><span class="font-display font-semibold">{pretty(noteName(l.midi))}</span> {ROLE[l.role]}</span>
      {/each}
    {:else}
      <span class="text-ws-stage-soft">{m.music_hubs_tuner_scope_hint()}</span>
    {/if}
  </figcaption>
</figure>

<style>
  .scope {
    position: relative;
    border-radius: 1rem;
    padding: 0.75rem;
    background:
      radial-gradient(60% 90% at 50% 50%, color-mix(in oklch, var(--instr) calc(var(--level, 0) * 30%), transparent), transparent 70%),
      color-mix(in oklch, var(--ws-stage-ink) 4%, transparent);
    transition: background 200ms;
  }
  .axis {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 18%, transparent);
    stroke-dasharray: 4 6;
  }
  .wave {
    fill: none;
    stroke: var(--ws-stage-soft);
    stroke-width: 2.5;
    stroke-linejoin: round;
    opacity: 0.5;
  }
  [data-playing] .wave {
    stroke: var(--instr);
    opacity: 1;
  }
  .glow {
    stroke-width: 9;
    opacity: 0;
    filter: blur(4px);
  }
  [data-playing] .glow {
    opacity: 0.35;
  }
  .layer {
    border-radius: 999px;
    padding: 0.15rem 0.7rem;
    background: color-mix(in oklch, var(--instr) 20%, transparent);
    color: var(--ws-stage-ink);
  }
</style>
