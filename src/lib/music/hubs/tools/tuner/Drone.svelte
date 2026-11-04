<script lang="ts">
  // A sustained reference pitch to play against. No microphone.
  import { onDestroy } from "svelte";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import { noteName } from "@repo/music-core";
  import Choice from "$lib/music/components/Choice.svelte";
  import { audio, type DroneTimbre } from "$lib/music/runtime";
  import { pretty } from "./tuner";
  import NotePads from "./NotePads.svelte";
  import DroneScope from "./DroneScope.svelte";

  let { onstatus }: { onstatus: (s: string) => void } = $props();

  let tonic = $state(9); // A
  let octave = $state(3);
  let timbre = $state<DroneTimbre>("sine");
  let volume = $state(0.4);
  const playing = $derived(audio.drone.playing);
  const midi = $derived((octave + 1) * 12 + tonic);

  const TIMBRES = [
    { value: "sine", label: "Sine", hint: "A pure tone: the easiest to hear beats against." },
    { value: "cello", label: "Cello", hint: "A bowed, filtered tone with some body." },
    { value: "shruti", label: "Shruti", hint: "Stacks the fifth and the octave, like a tanpura." },
  ] as const;
  const OCTAVES = [
    { value: 2, label: "Low" },
    { value: 3, label: "Middle" },
    { value: 4, label: "High" },
  ] as const;
  // Each register names the note it sounds: "Middle, A3".
  const registers = $derived(OCTAVES.map((o) => ({ ...o, label: `${o.label}, ${pretty(noteName((o.value + 1) * 12 + tonic))}` })));

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

<section class="stage rounded-2xl p-4 sm:p-5" aria-label="Drone">
  <NotePads
    label="Tonic"
    selected={tonic}
    tonic={tonic}
    onselect={(p) => {
      if (p === null) return;
      tonic = p;
      changed();
    }}
  />

  <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
    <p class="font-display text-xl font-semibold">
      {playing ? "Sounding" : "Tonic"} <span class="tnum">{pretty(noteName(midi))}</span>
    </p>
    <button
      type="button"
      class="flex min-h-12 items-center gap-2 rounded-full px-6 font-display text-base font-semibold {playing
        ? 'bg-ws-stage-ink text-ws-stage'
        : 'bg-instr text-ws-stage'}"
      aria-pressed={playing}
      onclick={toggle}
    >
      {#if playing}<Square class="size-5" aria-hidden="true" />Stop drone{:else}<Play class="size-5" aria-hidden="true" />Play drone{/if}
    </button>
  </div>

  <div class="mt-3">
    <DroneScope {midi} {timbre} {playing} />
  </div>
</section>

<div class="grid gap-4 sm:grid-cols-2">
  <div class="flex flex-col gap-1.5">
    <Choice label="Timbre" options={TIMBRES} bind:value={timbre} onchange={changed} />
    <p class="text-sm text-ws-soft">{TIMBRES.find((t) => t.value === timbre)?.hint}</p>
  </div>
  <Choice label="Register" options={registers} bind:value={octave} onchange={changed} />
  <label class="flex flex-col gap-1 text-sm sm:col-span-2">
    <span class="font-medium">Volume <span class="tnum text-ws-soft">{Math.round(volume * 100)}%</span></span>
    <input type="range" min="0.05" max="1" step="0.05" bind:value={volume} onchange={changed} class="volume w-full" style:--v={(volume - 0.05) / 0.95} />
  </label>
</div>

<style>
  .volume {
    appearance: none;
    height: 2.75rem;
    background: transparent;
    cursor: pointer;
  }
  .volume::-webkit-slider-runnable-track {
    height: 0.5rem;
    border-radius: 999px;
    background: linear-gradient(to right, var(--instr) calc(var(--v, 0.4) * 100%), var(--ws-raised) 0);
  }
  .volume::-moz-range-track {
    height: 0.5rem;
    border-radius: 999px;
    background: var(--ws-raised);
  }
  .volume::-moz-range-progress {
    height: 0.5rem;
    border-radius: 999px;
    background: var(--instr);
  }
  .volume::-webkit-slider-thumb {
    appearance: none;
    width: 1.75rem;
    height: 1.75rem;
    margin-top: -0.625rem;
    border-radius: 999px;
    background: var(--instr);
    border: 3px solid var(--ws-surface);
    box-shadow: 0 0 0 1px var(--ws-line);
  }
  .volume::-moz-range-thumb {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
    background: var(--instr);
    border: 3px solid var(--ws-surface);
  }
</style>
