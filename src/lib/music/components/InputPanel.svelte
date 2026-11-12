<script lang="ts">
  // The practice strip's sound and input pop-up: sound on or off, MIDI and the
  // microphone on or off, and which devices they use. MIDI listens to every
  // connected input that is not ignored, each as its instrument (the same
  // profile as Connect); the microphone uses one input device.
  import Check from "lucide-svelte/icons/check";
  import type { Instrument } from "@repo/music-core";
  import { detectInstrument } from "@repo/music-core/io/devices";
  import { audio, midi, mic, settings } from "../runtime";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { instrumentOptions } from "./instrument-icons";
  import { btn, btnPrimary } from "./ui";
  import { micOptions } from "$lib/music/hubs/connect/rig";

  const INSTRUMENTS = instrumentOptions((i) => INSTRUMENT_LABEL[i]);

  let note = $state("");

  async function midiOn() {
    note = (await midi.enable()) ? "" : midi.error;
  }
  function saveMidi(id: string, patch: { ignored?: true; instrument?: Instrument }) {
    void midi.saveProfile({ ...(midi.profile(id) ?? { id }), ...patch, id });
  }

  // The same choices as Connect: before permission the browser names no inputs,
  // so the saved one stays listed under its saved name.
  const mics = $derived(micOptions(mic.devices, settings.value.audioInputDeviceId, settings.value.audioInputLabel));
  const named = $derived(mic.devices.some((d) => d.deviceId && d.deviceId !== "default"));
  const chosen = $derived(settings.value.audioInputDeviceId ?? "");
  $effect(() => void mic.refreshDevices().catch(() => {}));

  async function micOn(deviceId = settings.value.audioInputDeviceId) {
    note = (await mic.start({ deviceId, pin: true })) ? "" : mic.error || "The microphone didn't start. Allow it in the browser, then try again.";
  }
  async function pickMic(deviceId: string) {
    const label = mic.devices.find((x) => x.deviceId === deviceId)?.label ?? (deviceId ? settings.value.audioInputLabel : "Default input");
    await settings.update({ audioInputDeviceId: deviceId || undefined, audioInputLabel: label });
    if (mic.state === "on") await micOn(deviceId || undefined);
  }

  const row = "flex min-h-11 w-full items-center gap-2 rounded-md border border-ws-line px-3 text-left text-sm hover:bg-ws-raised";
  const levelPct = $derived(Math.max(0, Math.min(100, ((mic.level + 60) / 60) * 100)));
</script>

<div class="flex flex-col gap-4" data-testid="input-panel">
  <section class="flex flex-col gap-2" aria-labelledby="input-sound">
    <div class="flex items-center justify-between gap-2">
      <h2 id="input-sound" class="text-sm font-semibold">Sound</h2>
      <span class="text-[13px] text-ws-soft">{settings.value.muted ? "Off" : !audio.unlocked ? "Waiting for a tap" : "On"}</span>
    </div>
    {#if !audio.unlocked}
      <button type="button" class={btnPrimary} onclick={() => audio.unlock()}>Turn on sound</button>
    {:else if settings.value.muted}
      <button type="button" class={btnPrimary} onclick={() => settings.update({ muted: false })}>Turn on sound</button>
    {:else}
      <button type="button" class="{btn} self-start" onclick={() => settings.update({ muted: true })}>Mute</button>
    {/if}
  </section>

  <section class="flex flex-col gap-2 border-t border-ws-line pt-3" aria-labelledby="input-midi">
    <div class="flex items-center justify-between gap-2">
      <h2 id="input-midi" class="text-sm font-semibold">MIDI</h2>
      <span class="text-[13px] text-ws-soft">{midi.enabled ? "On" : "Off"}</span>
    </div>
    {#if !midi.supported}
      <p class="text-sm text-ws-soft">This browser has no MIDI. Use a Chromium browser, or the microphone.</p>
    {:else if !midi.enabled}
      <button type="button" class={btnPrimary} onclick={midiOn}>Turn on MIDI</button>
    {:else}
      {#if midi.inputs.length}
        <p class="text-[13px] text-ws-soft">Notes come from the ticked devices, each as its instrument.</p>
        <ul class="flex flex-col gap-2">
          {#each midi.inputs as port (port.id)}
            {@const p = midi.profile(port.id)}
            {@const used = !p?.ignored}
            {@const detected = detectInstrument(port.name, port.manufacturer)}
            <li class="flex flex-col gap-1">
              <button type="button" class={row} aria-pressed={used} onclick={() => saveMidi(port.id, { ignored: used ? true : undefined })}>
                <span class="grid size-5 shrink-0 place-items-center rounded border {used ? 'border-instr bg-instr text-ws-stage' : 'border-ws-line'}" aria-hidden="true">
                  {#if used}<Check class="size-3.5" />{/if}
                </span>
                <span class="min-w-0 flex-1 truncate">{midi.profile(port.id)?.alias || port.name || port.id}</span>
                {#if port.state !== "connected"}<span class="text-[13px] text-ws-soft">unplugged</span>{/if}
              </button>
              {#if used}
                <label class="flex items-center gap-2 pl-10 text-[13px] text-ws-soft">
                  Plays as
                  <select
                    class="min-h-9 min-w-0 flex-1 rounded-md border border-ws-line bg-ws-surface px-2 text-sm text-ws-ink"
                    value={p?.instrument ?? "auto"}
                    onchange={(e) => saveMidi(port.id, { instrument: e.currentTarget.value === "auto" ? undefined : (e.currentTarget.value as Instrument) })}
                  >
                    <option value="auto">Auto{detected ? ` (${INSTRUMENT_LABEL[detected]})` : ", not recognised"}</option>
                    {#each INSTRUMENTS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                  </select>
                </label>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-sm text-ws-soft">No MIDI device connected. Plug one in and it shows here.</p>
      {/if}
      <button type="button" class="self-start text-sm text-ws-soft underline underline-offset-4" onclick={() => midi.disable()}>Turn off MIDI</button>
    {/if}
  </section>

  <section class="flex flex-col gap-2 border-t border-ws-line pt-3" aria-labelledby="input-mic">
    <div class="flex items-center justify-between gap-2">
      <h2 id="input-mic" class="text-sm font-semibold">Microphone</h2>
      <span class="text-[13px] text-ws-soft">{mic.state === "on" ? "On" : mic.state === "starting" ? "Starting…" : "Off"}</span>
    </div>
    {#if mic.state === "on"}
      <div class="h-2 overflow-hidden rounded-full bg-ws-raised" role="meter" aria-label="Input level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow={Math.round(mic.level)}>
        <div class="h-full bg-instr" style:width="{levelPct}%"></div>
      </div>
    {:else}
      <button type="button" class={btnPrimary} disabled={mic.state === "starting"} onclick={() => micOn()}>Turn on the microphone</button>
      {#if mic.state === "denied" || mic.state === "error"}<p class="text-sm text-ws-soft">{mic.error}</p>{/if}
    {/if}
    <p class="text-[13px] text-ws-soft">Input device</p>
    <ul class="flex flex-col gap-1.5" aria-label="Microphone input device">
      {#each mics as d (d.value)}
        <li>
          <button type="button" class={row} aria-pressed={chosen === d.value} onclick={() => void pickMic(d.value)}>
            <span class="size-4 shrink-0 rounded-full border-2 {chosen === d.value ? 'border-instr bg-instr' : 'border-ws-line'}" aria-hidden="true"></span>
            <span class="min-w-0 flex-1 truncate">{d.label}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if !named}<p class="text-[13px] text-ws-soft">Turn the microphone on once and the browser names each device.</p>{/if}
    {#if mic.state === "on"}
      <button type="button" class="{btn} self-start" onclick={() => mic.stop({ unpin: true })}>Turn off the microphone</button>
    {/if}
  </section>

  {#if note}<p class="text-sm" role="alert">{note}</p>{/if}
  <a href="/music/connect" class="text-sm font-medium text-instr-ink underline underline-offset-4">More in Connect: pad maps, latency, MPC lights</a>
</div>
