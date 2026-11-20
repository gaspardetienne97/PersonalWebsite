<script lang="ts">
  // The microphone tile: the one place the input device is picked (Settings
  // shows the same stored name). It starts only on a tap and stops on leaving.
  import { onDestroy } from "svelte";
  import { noteName } from "@repo/music-core";
  import { btn, btnPrimary } from "#lib/music/components/ui.ts";
  import { mic, settings } from "#lib/music/runtime/index.ts";
  import Picker from "#lib/music/components/Picker.svelte";
  import { micOptions } from "./rig";

  let { announce }: { announce: (text: string) => void } = $props();
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
    } else announce(`${d?.label || "The default input"} will be used for the microphone.`);
  }

  async function setEcho(on: boolean) {
    await settings.update({ echoCancellation: on });
    if (mic.state === "on") await start();
    else announce(`Echo cancellation ${on ? "on" : "off"}. It applies when the microphone starts.`);
  }

  async function start() {
    mine = true;
    const ok = await mic.start({ deviceId: settings.value.audioInputDeviceId });
    announce(ok ? `Microphone on (${settings.value.audioInputLabel}). Play a note to see the level.` : mic.error || "The microphone did not start.");
    if (ok) void mic.refreshDevices().catch(() => {});
  }
  function stop() {
    mic.stop({ unpin: true });
    mine = false;
    announce("Microphone off.");
  }
  onDestroy(() => {
    if (mine) mic.stop();
  });

  const ADVICE: Record<string, string> = {
    clipping: "Turn the input down or move back; clipped audio breaks pitch detection.",
    hot: "Back off a little to leave headroom for loud strums.",
    good: "Right where pitch detection works best.",
    quiet: "Move closer or raise the input gain.",
  };
  const levelPct = $derived(Math.max(0, Math.min(100, ((mic.level + 60) / 60) * 100)));
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-end gap-2">
    <div class="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
      <span class="font-medium">Input device</span>
      <Picker label="Input device" value={settings.value.audioInputDeviceId ?? ""} {options} onchange={(v) => void choose(v)} />
    </div>
    {#if mic.state === "on"}
      <button type="button" class={btn} onclick={stop}>Stop microphone</button>
    {:else}
      <button type="button" class={btnPrimary} onclick={start} disabled={mic.state === "starting"}>{mic.state === "starting" ? "Starting" : "Start microphone"}</button>
    {/if}
  </div>
  {#if !named}<p class="text-sm text-ws-soft">Start the microphone once and the browser shows each device's name.</p>{/if}

  {#if mic.state === "on"}
    <div class="flex items-center gap-3">
      <div class="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-ws-raised" role="meter" aria-label="Input level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow={Math.round(mic.level)}>
        <div class="h-full rounded-full bg-instr transition-[width] duration-75" style:width="{levelPct}%"></div>
      </div>
      <span class="tnum w-14 text-right font-display text-2xl font-semibold" aria-hidden="true">{mic.pitch ? noteName(mic.pitch.midi) : ""}</span>
    </div>
    <p class="text-sm">
      <span class="font-semibold">{mic.advice?.label ?? "Waiting for sound"}.</span>
      {mic.advice ? ADVICE[mic.advice.tone] : "Play or sing a note."}{mic.pitch ? ` Hearing ${noteName(mic.pitch.midi)}.` : ""}
      <span class="tnum text-ws-soft">{Math.round(mic.level)} dBFS, peak {Math.round(mic.peak)}.</span>
    </p>
  {:else}
    <p class="text-sm text-ws-soft">
      {mic.state === "denied" ? "Blocked: allow the microphone for this site in the browser's address bar, then try again." : mic.state === "error" ? mic.error : "Off. It only starts when you press the button."}
    </p>
  {/if}

  <label class="flex min-h-11 items-start gap-3 text-sm">
    <input type="checkbox" role="switch" class="mt-0.5 size-5 shrink-0 accent-[var(--instr-ink)]" checked={settings.value.echoCancellation} onchange={(e) => void setEcho(e.currentTarget.checked)} />
    <span><span class="font-medium">Echo cancellation.</span> <span class="text-ws-soft">Off is better for pitch and timing. Turn it on only if the speakers bleed into the mic.</span></span>
  </label>
</div>
