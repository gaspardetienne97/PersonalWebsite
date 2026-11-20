<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The microphone tile: the one place the input device is picked (Settings
  // shows the same stored name). It starts only on a tap and stops on leaving.
  import { onDestroy } from "svelte";
  import { noteName } from "@repo/music-core";
  import { btn, btnPrimary } from "#lib/music/components/ui.ts";
  import { mic, settings } from "#lib/music/runtime/index.ts";
  import Picker from "#lib/music/components/Picker.svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { inputName, micOptions } from "./rig";

  /** `primary`: the microphone is the next setup step, so Start is the page's one filled button. */
  let { announce, primary = false }: { announce: (text: string) => void; primary?: boolean } = $props();
  let mine = false;

  // Lists inputs without asking for anything; names come once the mic is allowed.
  void mic.refreshDevices().catch(() => {});
  const options = $derived(micOptions(mic.devices, settings.value.audioInputDeviceId, settings.value.audioInputLabel));
  const named = $derived(mic.devices.some((d) => d.deviceId && d.deviceId !== "default"));

  async function choose(deviceId: string) {
    const d = mic.devices.find((x) => x.deviceId === deviceId);
    await settings.update({ audioInputDeviceId: deviceId || undefined, audioInputLabel: d?.label || "Default input" });
    if (mic.state === "on") {
      await start();
    } else announce(d?.label ? m.music_hubs_mic_will_use({ name: d.label }) : m.music_hubs_mic_default_will_use());
  }

  async function setEcho(on: boolean) {
    await settings.update({ echoCancellation: on });
    if (mic.state === "on") await start();
    else announce(on ? m.music_hubs_mic_echo_on() : m.music_hubs_mic_echo_off());
  }

  async function start() {
    mine = true;
    const ok = await mic.start({ deviceId: settings.value.audioInputDeviceId });
    announce(
      ok
        ? m.music_hubs_mic_on({ name: inputName(settings.value.audioInputDeviceId, settings.value.audioInputLabel) })
        : mic.error || m.music_hubs_mic_failed(),
    );
    if (ok) void mic.refreshDevices().catch(() => {});
  }
  function stop() {
    mic.stop({ unpin: true });
    mine = false;
    announce(m.music_hubs_mic_off());
  }
  onDestroy(() => {
    if (mine) mic.stop();
  });

  const ADVICE: Record<string, string> = {
    clipping: m.music_hubs_mic_advice_clipping(),
    hot: m.music_hubs_mic_advice_hot(),
    good: m.music_hubs_mic_advice_good(),
    quiet: m.music_hubs_mic_advice_quiet(),
  };
  const levelPct = $derived(mic.state === "on" ? Math.max(0, Math.min(100, ((mic.level + 60) / 60) * 100)) : 0);
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-end gap-2">
    <div class="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
      <span class="font-medium">{m.music_hubs_mic_input_device()}</span>
      <Picker label={m.music_hubs_mic_input_device()} value={settings.value.audioInputDeviceId ?? ""} {options} onchange={(v) => void choose(v)} />
    </div>
    {#if mic.state === "on"}
      <button type="button" class={btn} onclick={stop}>{m.music_hubs_mic_stop()}</button>
    {:else}
      <!-- Filled only as the next step, so it never competes with Enable MIDI. -->
      <button type="button" class={primary ? btnPrimary : btn} onclick={start} disabled={mic.state === "starting"}>{mic.state === "starting" ? m.music_hubs_mic_starting() : m.music_hubs_mic_start()}</button>
    {/if}
  </div>
  {#if !named}<p class="text-sm text-ws-soft">{m.music_hubs_mic_names_hint()}</p>{/if}

  <!-- The meter and the note slot show before Start too, empty: this is where the proof will appear. -->
  <div class="flex items-center gap-3">
    <div class="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-ws-raised" role="meter" aria-label={m.music_hubs_mic_level()} aria-valuemin="-60" aria-valuemax="0" aria-valuenow={mic.state === "on" ? Math.round(mic.level) : -60}>
      <div class="h-full rounded-full bg-instr transition-[width] duration-75" style:width="{levelPct}%"></div>
    </div>
    <span class="tnum w-14 text-right font-display text-2xl font-semibold {mic.state === 'on' && mic.pitch ? '' : 'text-ws-soft'}" aria-hidden="true">{mic.state === "on" && mic.pitch ? noteName(mic.pitch.midi) : "--"}</span>
  </div>
  {#if mic.state === "on"}
    <p class="text-sm">
      <span class="font-semibold">{mic.advice?.label ?? m.music_hubs_mic_waiting()}.</span>
      {mic.advice ? ADVICE[mic.advice.tone] : m.music_hubs_mic_play_or_sing_note()}{mic.pitch ? m.music_hubs_mic_hearing({ note: noteName(mic.pitch.midi) }) : ""}
      <span class="tnum text-ws-soft">{m.music_hubs_mic_dbfs({ level: Math.round(mic.level), peak: Math.round(mic.peak) })}</span>
    </p>
  {:else}
    <p class="text-sm text-ws-soft">
      {mic.state === "denied" ? m.music_hubs_mic_blocked() : mic.state === "error" ? mic.error : m.music_hubs_mic_off_hint()}
    </p>
  {/if}

  <details class="group text-sm" open={settings.value.echoCancellation || undefined}>
    <summary class="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 font-medium [&::-webkit-details-marker]:hidden">
      <span class="flex items-center gap-2 whitespace-nowrap"><ChevronRight class="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />{m.music_hubs_mic_options()}</span>
      {#if settings.value.echoCancellation}<span class="font-normal whitespace-nowrap text-ws-soft">{m.music_hubs_mic_echo_on_label()}</span>{/if}
    </summary>
    <label class="flex min-h-11 items-start gap-3 pl-6">
      <input type="checkbox" role="switch" class="mt-0.5 size-5 shrink-0 accent-[var(--instr-ink)]" checked={settings.value.echoCancellation} onchange={(e) => void setEcho(e.currentTarget.checked)} />
      <span><span class="font-medium">{m.music_hubs_mic_echo()}</span> <span class="text-ws-soft">{m.music_hubs_mic_echo_hint()}</span></span>
    </label>
  </details>
</div>
