<script lang="ts" module>
  import type { Instrument } from "@repo/music-core";
  /** The input an instrument reaches the app through: strings and voice by microphone, the rest by MIDI. */
  export const inputFor = (i: Instrument) => (i === "guitar" || i === "ukulele" || i === "voice" ? "mic" : "midi");
</script>

<script lang="ts">
  // One line on the instrument's input, with one button to fix it. Before a run
  // it shows only when that input is off; after a silent run it says why
  // nothing was heard. On-screen play always works, so it never blocks Start.
  import Mic from "lucide-svelte/icons/mic";
  import MicOff from "lucide-svelte/icons/mic-off";
  import Plug from "lucide-svelte/icons/plug";
  import { midi, mic, settings } from "../runtime";
  import { btn, btnPrimary } from "./ui";

  /** `required`: the drill cannot be played on screen (Start waits for the input). */
  let { after = false, required = false }: { after?: boolean; required?: boolean } = $props();
  const orScreen = $derived(required ? "" : ", or play on screen");

  const kind = $derived(inputFor(settings.value.activeInstrument));
  const off = $derived(kind === "mic" ? mic.state !== "on" : midi.supported && !midi.enabled);
  const busy = $derived(kind === "mic" && mic.state === "starting");
  let error = $state("");

  async function turnOn() {
    error = "";
    const ok = kind === "mic" ? await mic.start({ deviceId: settings.value.audioInputDeviceId, pin: true }) : await midi.enable();
    if (!ok) error = (kind === "mic" ? mic.error : midi.error) || "It did not start.";
  }

  const text = $derived(
    kind === "mic"
      ? off
        ? `The microphone is off. Turn it on${orScreen}.`
        : "The microphone is on but heard nothing. Play closer to it and watch the level in the input menu."
      : !midi.supported
        ? "This browser has no MIDI. Play on screen, or open the app in Chrome or Edge."
        : off
          ? `MIDI is off. Turn it on${orScreen}.`
          : midi.inputs.length
            ? "MIDI is on but no note arrived. Check the device is picked in the input menu."
            : "MIDI is on but no device is connected. Plug one in, or play on screen.",
  );
</script>

{#if after || off}
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 {after ? '' : 'rounded-xl border border-warn/50 bg-warn/10 px-4 py-2'}" data-testid="input-check" data-input={kind}>
    {#if !after}
      {#if kind === "mic"}<MicOff class="size-4 shrink-0" aria-hidden="true" />{:else}<Plug class="size-4 shrink-0" aria-hidden="true" />{/if}
    {/if}
    <p class="min-w-0 flex-1 basis-48 text-sm">{error || text}</p>
    {#if off}
      <button type="button" class={after ? btnPrimary : btn} disabled={busy} onclick={turnOn}>
        {#if kind === "mic"}<Mic class="size-4" aria-hidden="true" />{busy ? "Starting" : "Turn on the microphone"}{:else}<Plug class="size-4" aria-hidden="true" />Turn on MIDI{/if}
      </button>
    {:else if after && (kind === "mic" || midi.supported)}
      <a class={btn} href="/music/connect">Check inputs</a>
    {/if}
  </div>
{/if}
