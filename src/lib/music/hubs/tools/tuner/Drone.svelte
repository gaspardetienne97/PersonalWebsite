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

  <div class="mt-4">
    <DroneScope {midi} {timbre} {playing} />
  </div>

  <div class="mt-4">
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
  </div>
</section>
