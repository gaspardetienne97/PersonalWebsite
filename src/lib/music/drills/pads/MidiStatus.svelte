<script lang="ts">
  // One quiet line on the drill: what the last hardware note became, or why
  // nothing arrives. Deliberately not a live region (the route owns the status).
  import type { Instrument } from "@repo/music-core";
  import Cable from "@lucide/svelte/icons/cable";
  import { midi } from "#lib/music/runtime/index.ts";
  import { m } from "@repo/i18n/messages.js";
  import { explainNote, waitingReason } from "./midi-status";

  interface Props {
    instrument: Instrument;
    /** Pads: whether the app sounds hardware hits (off when the MPC makes its own). A device setting, so it lives here. */
    sound?: { value: boolean; onchange: (v: boolean) => void };
    /** performance.now() of the run's start: a note heard before it is said to be from before the run. */
    since?: number | null;
  }
  let { instrument, sound, since = null }: Props = $props();

  const portOf = (id: string, name: string) => midi.inputs.find((p) => p.id === id) ?? { id, name, manufacturer: "" };
  /** The newest note the runtime logged. The line is left out during a run, so without this a run full of pad
   *  hits would come back to "no pad hit has arrived yet". */
  function logged() {
    for (const raw of midi.rawLog) {
      const said = explainNote(raw.hex.split(" ").map((h) => parseInt(h, 16)), portOf(raw.portId, raw.port), midi.profile(raw.portId));
      if (said) return { ...said, at: raw.at };
    }
    return null;
  }
  let last = $state<{ text: string; used: boolean; midi: number; at: number } | null>(logged());
  /** A run where nothing was heard: a note from before it must not read as part of the run. The line says
   *  what the run's own events say (contradiction 11): connected, nothing arrived during it. */
  const silentRun = $derived(since !== null && (!last || last.at < since));

  $effect(() =>
    midi.subscribeRaw((raw) => {
      const said = explainNote(raw.data, portOf(raw.portId, raw.port), midi.profile(raw.portId));
      if (said) last = { ...said, at: performance.now() };
    }),
  );

  const waiting = $derived(
    waitingReason({
      supported: midi.supported,
      enabled: midi.enabled,
      instrument,
      inputs: midi.inputs,
      profiles: midi.profiles,
      link: midi.mpcLink.state,
    }),
  );
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="midi-status">
  <Cable class="size-4 shrink-0 text-ws-soft" aria-hidden="true" />
  <p class="min-w-0 flex-1 basis-60">
    {#if silentRun && midi.enabled && last}
      <span class="font-medium">{instrument === "mpc" ? m.music_winds_status_silent_run_pads() : m.music_winds_status_silent_run_notes()}</span>
    {:else if last && midi.enabled}
      <span class={last.used ? "" : "font-medium"} title={m.music_winds_status_midi_note({ midi: last.midi })}>{#if !last.used}<span class="text-warn" aria-hidden="true">⚠ </span>{/if}{last.text}</span>
    {:else}
      <span class="text-ws-soft">{waiting}</span>
    {/if}
  </p>
  {#if midi.supported && !midi.enabled}
    <button type="button" class="min-h-11 rounded-full px-3 font-medium text-instr-ink hover:bg-instr-wash" onclick={() => midi.enable()}>{m.music_winds_status_turn_on()}</button>
  {/if}
  {#if sound}
    <button
      type="button"
      class="min-h-11 rounded-full px-3 font-medium text-instr-ink hover:bg-instr-wash"
      role="switch"
      aria-checked={sound.value}
      title={m.music_winds_status_sound_title()}
      onclick={() => sound.onchange(!sound.value)}>{sound.value ? m.music_winds_status_sound_on() : m.music_winds_status_sound_off()}</button
    >
  {/if}
  <a href="/music/connect" class="flex min-h-11 items-center rounded-full px-3 font-medium text-instr-ink hover:bg-instr-wash">{m.music_winds_status_connect()}</a>
</div>
