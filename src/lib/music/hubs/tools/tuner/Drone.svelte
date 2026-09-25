<script lang="ts">
  // A sustained reference pitch to play against. No microphone.
  import { onDestroy } from "svelte";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import { noteName } from "@repo/music-core";
  import Choice from "$lib/music/components/Choice.svelte";
  import { audio, type DroneTimbre } from "$lib/music/runtime";
  import { DEGREES, degreeRole, pretty } from "./tuner";

  let { onstatus }: { onstatus: (s: string) => void } = $props();

  let tonic = $state(9); // A
  let octave = $state(3);
  let timbre = $state<DroneTimbre>("sine");
  let volume = $state(0.4);
  const playing = $derived(audio.drone.playing);
  const midi = $derived((octave + 1) * 12 + tonic);

  const TIMBRES = [
    { value: "sine", label: "Sine" },
    { value: "cello", label: "Cello" },
    { value: "shruti", label: "Shruti" },
  ] as const;
  const OCTAVES = [
    { value: 2, label: "Low" },
    { value: 3, label: "Middle" },
    { value: 4, label: "High" },
  ] as const;
  const ROLE_WORD = { tonic: "tonic", fifth: "fifth", scale: "in the major scale", other: "outside the major scale" };

  const describe = () => `${noteName(midi)}, ${timbre}`;

  async function start() {
    const ok = await audio.unlock();
    if (!ok) return onstatus("Sound is blocked. Click Play again to allow audio.");
    audio.drone.start(midi, timbre, volume);
    onstatus(`Drone on ${describe()}.`);
  }

  function toggle() {
    if (playing) {
      audio.drone.stop();
      onstatus("Drone stopped.");
    } else void start();
  }

  /** Changes while it sounds restart it on the new pitch or timbre. */
  function changed() {
    if (playing) void start();
  }

  onDestroy(() => audio.drone.stop());
</script>

<div class="flex flex-wrap items-end gap-4">
  <Choice label="Timbre" options={TIMBRES} bind:value={timbre} onchange={changed} />
  <Choice label="Register" options={OCTAVES} bind:value={octave} onchange={changed} />
  <label class="flex min-w-40 flex-col gap-1 text-sm">
    <span class="font-medium">Volume <span class="tnum text-ws-soft">{Math.round(volume * 100)}%</span></span>
    <input
      type="range"
      min="0.05"
      max="1"
      step="0.05"
      bind:value={volume}
      onchange={changed}
      class="min-h-11 accent-[var(--instr)]"
    />
  </label>
</div>

<section class="stage rounded-2xl p-4 sm:p-6" aria-label="Drone">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="font-display text-xl font-semibold">
      {playing ? "Sounding" : "Tonic"} <span class="tnum">{pretty(noteName(midi))}</span>
    </p>
    <p class="text-sm text-ws-stage-soft">Colours show each note's degree above the tonic.</p>
  </div>

  <div class="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12" role="group" aria-label="Tonic">
    {#each Array.from({ length: 12 }, (_, i) => i) as p (p)}
      {@const semis = (p - tonic + 12) % 12}
      {@const role = degreeRole(semis)}
      <button
        type="button"
        class="pad"
        data-role={role}
        aria-pressed={p === tonic}
        aria-label="{noteName(p, 'flat', false)}, {ROLE_WORD[role]}"
        onclick={() => {
          tonic = p;
          changed();
        }}
      >
        <span class="font-display text-xl font-semibold">{pretty(noteName(p, "flat", false))}</span>
        <span class="tnum text-xs">{DEGREES[semis]}</span>
      </button>
    {/each}
  </div>

  <div class="mt-6 flex flex-wrap items-center gap-4">
    <button
      type="button"
      class="flex min-h-14 items-center gap-2 rounded-full px-7 font-display text-lg font-semibold {playing
        ? 'bg-ws-stage-ink text-ws-stage'
        : 'bg-instr text-ws-stage'}"
      aria-pressed={playing}
      onclick={toggle}
    >
      {#if playing}<Square class="size-5" aria-hidden="true" />Stop drone{:else}<Play class="size-5" aria-hidden="true" />Play drone{/if}
    </button>
    {#if playing}<span class="pulse" aria-hidden="true"></span>{/if}
    <p class="min-w-0 flex-1 text-sm text-ws-stage-soft">
      {timbre === "shruti" ? "Shruti stacks the fifth and the octave, like a tanpura." : timbre === "cello" ? "A bowed, filtered tone with some body." : "A pure tone: the easiest to hear beats against."}
    </p>
  </div>
</section>

<style>
  .pad {
    display: flex;
    min-height: 4rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    border-radius: 0.8rem;
    border: 2px solid transparent;
    background: color-mix(in oklch, var(--ws-stage-ink) 6%, transparent);
    color: var(--ws-stage-soft);
  }
  .pad:hover {
    background: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
  }
  .pad[data-role="scale"] {
    background: color-mix(in oklch, var(--instr) 18%, transparent);
    color: var(--ws-stage-ink);
  }
  .pad[data-role="fifth"] {
    background: color-mix(in oklch, var(--instr) 40%, transparent);
    color: var(--ws-stage-ink);
  }
  .pad[data-role="tonic"] {
    background: var(--instr);
    color: var(--ws-stage);
    border-color: var(--ws-stage-ink);
  }
  .pulse {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 999px;
    background: var(--instr);
    animation: breathe 1.6s ease-in-out infinite;
  }
  @keyframes breathe {
    50% {
      transform: scale(1.6);
      opacity: 0.4;
    }
  }
</style>
