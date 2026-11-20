<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // A sustained reference pitch to play against. No microphone.
  import { onDestroy } from "svelte";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import Info from "@lucide/svelte/icons/info";
  import { noteName } from "@repo/music-core";
  import Choice from "#lib/music/components/Choice.svelte";
  import { audio, type DroneTimbre } from "#lib/music/runtime/index.ts";
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
    { value: "sine", label: m.music_hubs_drone_sine(), hint: m.music_hubs_drone_sine_hint() },
    { value: "cello", label: m.music_hubs_drone_cello(), hint: m.music_hubs_drone_cello_hint() },
    { value: "shruti", label: m.music_hubs_drone_shruti(), hint: m.music_hubs_drone_shruti_hint() },
  ] as const;
  const LOW_OCTAVE = 2;
  const HIGH_OCTAVE = 4;
  function shift(by: number) {
    octave = Math.max(LOW_OCTAVE, Math.min(HIGH_OCTAVE, octave + by));
    changed();
  }
  const tonicName = $derived(pretty(noteName(tonic, "flat", false)));
  let about = $state(false);


  async function start() {
    const ok = await audio.unlock();
    if (!ok) return onstatus(m.music_hubs_drone_blocked());
    audio.drone.start(midi, timbre, volume);
    onstatus(m.music_hubs_drone_on({ note: noteName(midi), timbre: (TIMBRES.find((t) => t.value === timbre)?.label ?? timbre).toLowerCase() }));
  }

  function toggle() {
    if (playing) {
      audio.drone.stop();
      onstatus(m.music_hubs_drone_stopped());
    } else void start();
  }

  /** Changes while it sounds restart it on the new pitch or timbre. */
  function changed() {
    if (playing) void start();
  }

  onDestroy(() => audio.drone.stop());
</script>

<section class="stage ws-on-stage rounded-2xl p-4 sm:p-5" aria-label={m.music_hubs_drone_label()}>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <p class="font-display text-xl font-semibold">
        {playing ? m.music_hubs_drone_sounding() : m.music_hubs_drone_tonic()} <span class="tnum">{pretty(noteName(midi))}</span>
      </p>
      <div class="flex items-center rounded-full border border-ws-line" role="group" aria-label={m.music_hubs_drone_octave()}>
        <button type="button" class="grid size-11 place-items-center rounded-full hover:bg-ws-raised disabled:opacity-40" aria-label={m.music_hubs_drone_octave_down()} disabled={octave <= LOW_OCTAVE} onclick={() => shift(-1)}><Minus class="size-4" aria-hidden="true" /></button>
        <span class="tnum px-1 text-sm text-ws-stage-soft">{m.music_hubs_drone_octave_n({ n: octave })}</span>
        <button type="button" class="grid size-11 place-items-center rounded-full hover:bg-ws-raised disabled:opacity-40" aria-label={m.music_hubs_drone_octave_up()} disabled={octave >= HIGH_OCTAVE} onclick={() => shift(1)}><Plus class="size-4" aria-hidden="true" /></button>
      </div>
    </div>
    <!-- Volume sits beside Play and Stop, so every drone control fits the first screen on a phone. -->
    <div class="flex w-full items-end gap-3 sm:w-auto">
    <label class="flex min-w-0 flex-1 flex-col text-sm sm:w-40 sm:flex-none">
      <span class="font-medium">{m.music_hubs_drone_volume()} <span class="tnum text-ws-stage-soft">{Math.round(volume * 100)}%</span></span>
      <input type="range" min="0.05" max="1" step="0.05" bind:value={volume} onchange={changed} class="volume w-full" style:--v={(volume - 0.05) / 0.95} />
    </label>
    <button
      type="button"
      class="flex min-h-12 shrink-0 items-center gap-2 rounded-full px-6 font-display text-base font-semibold {playing
        ? 'bg-ws-stage-ink text-ws-stage'
        : 'bg-instr text-ws-stage'}"
      aria-pressed={playing}
      onclick={toggle}
    >
      {#if playing}<Square class="size-4" fill="currentColor" aria-hidden="true" />{m.music_hubs_drone_stop()}{:else}<Play class="size-5" fill="currentColor" aria-hidden="true" />{m.music_hubs_drone_play()}{/if}
    </button>
    </div>
  </div>

  <div class="mt-4">
    <!-- The scale named over its pads, one line on the degrees, the rest behind the info button. -->
    <div class="mb-2 flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="font-display text-lg font-semibold" data-testid="drone-scale">{m.music_hubs_songs_key_major({ tonic: tonicName })}</p>
        <p class="text-sm text-ws-stage-soft">{m.music_hubs_drone_scale_hint({ tonic: tonicName })}</p>
      </div>
      <button
        type="button"
        class="grid size-11 shrink-0 place-items-center rounded-full text-ws-stage-soft hover:bg-ws-stage-ink/10 hover:text-ws-stage-ink"
        aria-label={m.music_hubs_drone_what_pads()}
        aria-expanded={about}
        aria-controls="drone-about"
        onclick={() => (about = !about)}><Info class="size-5" aria-hidden="true" /></button
      >
    </div>
    {#if about}
      <p id="drone-about" class="mb-2 rounded-xl bg-ws-stage-ink/10 px-3 py-2 text-sm">
        {m.music_hubs_drone_about_before()} <span class="dot" aria-hidden="true"></span> {m.music_hubs_drone_about_after({ tonic: tonicName })}
      </p>
    {/if}
    <NotePads
      label={m.music_hubs_drone_tonic()}
      selected={tonic}
      tonic={tonic}
      onselect={(p) => {
        if (p === null) return;
        tonic = p;
        changed();
      }}
    />
  </div>

  <div class="mt-4">
    <Choice label={m.music_hubs_drone_timbre()} options={TIMBRES} bind:value={timbre} onchange={changed} />
    <p class="mt-1 text-sm text-ws-stage-soft">{TIMBRES.find((t) => t.value === timbre)?.hint}</p>
  </div>

  <!-- The waveform is a laptop extra; on a phone it would only push the controls down. -->
  <div class="mt-3 max-sm:hidden">
    <DroneScope {midi} {timbre} {playing} />
  </div>
</section>

<style>
  .dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--ws-stage-ink);
    vertical-align: 0.05em;
  }
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
    border: 3px solid var(--ws-stage);
    box-shadow: 0 0 0 1px var(--ws-line);
  }
  .volume::-moz-range-thumb {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
    background: var(--instr);
    border: 3px solid var(--ws-stage);
  }
</style>
