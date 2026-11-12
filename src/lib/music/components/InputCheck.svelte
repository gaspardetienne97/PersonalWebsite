<script lang="ts" module>
  import type { Instrument } from "@repo/music-core";
  /** The input an instrument reaches the app through: strings and voice by microphone, the rest by MIDI. */
  export const inputFor = (i: Instrument) => (i === "guitar" || i === "ukulele" || i === "voice" ? "mic" : "midi");
</script>

<script lang="ts">
  // One line on the instrument's input, with one button to fix it. Before a run
  // (`inline`) it is a clause of the setup sentence, shown only when that input
  // is off, and the clause is its own fix; after a silent run it names the
  // device, tests it live and links to the input choice (the dock leads with
  // Again). On-screen play always works, so it never blocks Start.
  import Mic from "lucide-svelte/icons/mic";
  import MicOff from "lucide-svelte/icons/mic-off";
  import Plug from "lucide-svelte/icons/plug";
  import CircleCheck from "lucide-svelte/icons/circle-check";
  import { input, midi, mic, settings } from "../runtime";
  import { noteName } from "@repo/music-core/theory/notes";
  import { btn } from "./ui";

  /** `required`: the drill cannot be played on screen (Start waits for the input).
   *  `inline`: a setup clause on the ready screen (contract K2) instead of a banner. */
  let { after = false, required = false, inline = false }: { after?: boolean; required?: boolean; inline?: boolean } = $props();
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

  /** The device in use, by name. */
  const device = $derived.by(() => {
    if (kind === "mic") return settings.value.audioInputLabel || "Default microphone";
    const port = midi.inputs.find((p) => p.state === "connected" && !midi.profile(p.id)?.ignored);
    return port ? midi.profile(port.id)?.alias || port.name || "MIDI device" : "No MIDI device";
  });
  const levelPct = $derived(Math.max(0, Math.min(100, ((mic.level + 60) / 60) * 100)));
  /** After a silent run, a key played now proves the MIDI path: its name with a tick. */
  let keyHeard = $state("");
  $effect(() => {
    if (!after || kind !== "midi") return;
    return input.subscribe((e) => {
      if (e.kind === "noteon" && e.source === "midi") keyHeard = noteName(e.midi);
    });
  });

  /** The meter shows sound arriving (it fills from -60 dB; from here it is plainly up): the sentence beside it must
   *  not say the microphone hears nothing. Latched, so the sentence does not flicker with the level. */
  const SOUND_DB = -48;
  let soundSeen = $state(false);
  $effect(() => {
    if (after && kind === "mic" && !off && mic.level > SOUND_DB) soundSeen = true;
  });
  /** What this instrument sends, in its own words: pads are hit, a wind plays notes, a keyboard has keys. */
  const unit = $derived.by(() => {
    const i = settings.value.activeInstrument;
    return i === "mpc" ? { one: "pad hit", test: "Hit a pad", any: "Hit any pad" } : i === "aerophone" ? { one: "note", test: "Play a note", any: "Play any note" } : { one: "note", test: "Play a key", any: "Play any key" };
  });

  const text = $derived(
    kind === "mic"
      ? off
        ? `The microphone is off. Turn it on${orScreen}.`
        : soundSeen
          ? "The microphone picks up sound (the level below moves), but no playing was recognised in the run. Play louder than the room, close to the microphone."
          : "The microphone is on but the level below is flat. Play close to it and watch the level move."
      : !midi.supported
        ? "This browser has no MIDI. Play on screen, or open the app in Chrome or Edge."
        : off
          ? `MIDI is off. Turn it on${orScreen}.`
          : midi.inputs.length
            ? `MIDI is on but no ${unit.one} arrived. ${unit.test} to test it, or choose the input.`
            : "MIDI is on but no device is connected. Plug one in, or play on screen.",
  );
</script>

{#if inline}
  {#if kind === "midi" && !midi.supported}
    <span class="whitespace-normal font-medium" title={text} data-testid="input-check" data-input={kind}>no MIDI in this browser, play on screen</span>
  {:else if off}
    <!-- The clause is the fix. Its name stays the action ("Turn on the microphone"); the full sentence is its title. -->
    <button type="button" class="input-clause relative z-10 inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-md px-1 font-medium text-instr-ink hover:bg-instr-wash sm:min-h-8" title={error || text} disabled={busy} aria-busy={busy} onclick={turnOn} data-testid="input-check" data-input={kind}>
      {#if kind === "mic"}<Mic class="size-4 shrink-0" aria-hidden="true" />{busy ? "Starting" : "Turn on the microphone"}{:else}<Plug class="size-4 shrink-0" aria-hidden="true" />Turn on MIDI{/if}
    </button>{#if error}<span class="text-destructive">{" "}({error})</span>{/if}
  {/if}
{:else if after}
  <!-- After a silent run: the device by name, a live test (the level, or a tick when a key arrives), the fix. -->
  <div class="flex flex-col gap-3" data-testid="input-check" data-input={kind}>
    <p class="flex items-center gap-2 text-sm font-semibold">
      {#if kind === "mic"}<Mic class="size-4 shrink-0" aria-hidden="true" />{:else}<Plug class="size-4 shrink-0" aria-hidden="true" />{/if}
      <span class="min-w-0 truncate">{device}</span>
      <span class="shrink-0 font-normal text-ws-soft">{off ? "off" : "on"}</span>
    </p>
    <p class="text-sm">{error || text}</p>
    {#if !off && kind === "mic"}
      <div class="h-2 overflow-hidden rounded-full bg-ws-raised" role="meter" aria-label="Input level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow={Math.round(mic.level)}>
        <div class="h-full bg-instr" style:width="{levelPct}%"></div>
      </div>
    {:else if !off && midi.inputs.length}
      <p class="flex min-h-8 items-center gap-2 text-sm" aria-live="polite">
        {#if keyHeard}<CircleCheck class="size-5 text-success" aria-hidden="true" />Heard {settings.value.activeInstrument === "mpc" ? "a pad hit" : keyHeard}. Input works.{:else}<span class="size-2.5 animate-pulse rounded-full bg-ws-soft" aria-hidden="true"></span>{unit.any} to test.{/if}
      </p>
    {/if}
    <div class="flex flex-wrap items-center gap-2">
      {#if off}
        <button type="button" class={btn} disabled={busy} onclick={turnOn}>
          {#if kind === "mic"}<Mic class="size-4" aria-hidden="true" />{busy ? "Starting" : "Turn on the microphone"}{:else}<Plug class="size-4" aria-hidden="true" />Turn on MIDI{/if}
        </button>
      {/if}
      <!-- Quiet buttons: the dock's Again is the screen's one primary. -->
      <a class={btn} href="/music/connect">Choose input</a>
    </div>
  </div>
{:else if off}
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn/50 bg-warn/10 px-4 py-2" data-testid="input-check" data-input={kind}>
    {#if kind === "mic"}<MicOff class="size-4 shrink-0" aria-hidden="true" />{:else}<Plug class="size-4 shrink-0" aria-hidden="true" />{/if}
    <p class="min-w-0 flex-1 basis-48 text-sm">{error || text}</p>
    <button type="button" class={btn} disabled={busy} onclick={turnOn}>
      {#if kind === "mic"}<Mic class="size-4" aria-hidden="true" />{busy ? "Starting" : "Turn on the microphone"}{:else}<Plug class="size-4" aria-hidden="true" />Turn on MIDI{/if}
    </button>
  </div>
{/if}
