<script lang="ts">
  // One quiet line on the drill: what the last hardware note became, or why
  // nothing arrives. Deliberately not a live region (the route owns the status).
  import type { Instrument } from "@repo/music-core";
  import Cable from "lucide-svelte/icons/cable";
  import { midi } from "$lib/music/runtime";
  import { explainNote, waitingReason } from "./midi-status";

  interface Props {
    instrument: Instrument;
    /** Pads: whether the app sounds hardware hits (off when the MPC makes its own). A device setting, so it lives here. */
    sound?: { value: boolean; onchange: (v: boolean) => void };
  }
  let { instrument, sound }: Props = $props();

  let last = $state<{ text: string; used: boolean; midi: number } | null>(null);

  $effect(() =>
    midi.subscribeRaw((m) => {
      const port = midi.inputs.find((p) => p.id === m.portId) ?? { id: m.portId, name: m.port, manufacturer: "" };
      const said = explainNote(m.data, port, midi.profile(m.portId));
      if (said) last = said;
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
    {#if last && midi.enabled}
      <span class={last.used ? "" : "font-medium"} title="MIDI note {last.midi}">{#if !last.used}<span class="text-warn" aria-hidden="true">⚠ </span>{/if}{last.text}</span>
    {:else}
      <span class="text-ws-soft">{waiting}</span>
    {/if}
  </p>
  {#if midi.supported && !midi.enabled}
    <button type="button" class="min-h-11 rounded-full px-3 font-medium text-instr-ink hover:bg-instr-wash" onclick={() => midi.enable()}>Turn on MIDI</button>
  {/if}
  {#if sound}
    <button
      type="button"
      class="min-h-11 rounded-full px-3 font-medium text-instr-ink hover:bg-instr-wash"
      role="switch"
      aria-checked={sound.value}
      title="Off when the MPC makes its own sound"
      onclick={() => sound.onchange(!sound.value)}>Pad sounds: {sound.value ? "on" : "off"}</button
    >
  {/if}
  <a href="/music/connect" class="flex min-h-11 items-center rounded-full px-3 font-medium text-instr-ink hover:bg-instr-wash">Connect</a>
</div>
