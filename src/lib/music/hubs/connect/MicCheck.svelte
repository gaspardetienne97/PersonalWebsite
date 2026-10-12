<script lang="ts">
  // Start the microphone on a tap, see the level and what to do about it.
  // Stopped on leaving the page.
  import { onDestroy } from "svelte";
  import { noteName } from "@repo/music-core";
  import { btn, btnPrimary } from "$lib/music/components/ui";
  import { mic, settings } from "$lib/music/runtime";
  import Picker from "$lib/music/components/Picker.svelte";

  let { announce }: { announce: (text: string) => void } = $props();
  let mine = false;

  // Device names only appear once the browser has granted the microphone.
  void mic.refreshDevices().catch(() => {});
  const chosen = $derived(settings.value.audioInputDeviceId ?? "");
  // Before permission the browser lists inputs with empty ids and no names.
  const named = $derived(mic.devices.some((d) => d.deviceId && d.deviceId !== "default"));

  async function choose(deviceId: string) {
    const d = mic.devices.find((x) => x.deviceId === deviceId);
    await settings.update({ audioInputDeviceId: deviceId || undefined, audioInputLabel: d?.label || "Default input" });
    if (mic.state === "on") {
      mic.stop();
      await start();
    } else announce(`${d?.label || "The default input"} will be used for the microphone.`);
  }

  async function start() {
    mine = true;
    const ok = await mic.start({ deviceId: settings.value.audioInputDeviceId });
    announce(ok ? `Microphone on (${settings.value.audioInputLabel}). Play a note to see the level.` : mic.error || "The microphone did not start.");
    if (ok) void mic.refreshDevices().catch(() => {});
  }
  function stop() {
    mic.stop();
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
  <div class="flex min-w-0 flex-col gap-1 text-sm">
    <span class="font-medium">Input device</span>
    <Picker class="max-w-md" label="Input device" value={chosen} options={[{ value: "", label: "Default input" }, ...mic.devices.filter((d) => d.deviceId && d.deviceId !== "default").map((d) => ({ value: d.deviceId, label: d.label }))]} onchange={(v) => void choose(v)} />
    {#if !named}<span class="text-ws-soft">Start the microphone once and the browser shows each device's name.</span>{/if}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    {#if mic.state === "on"}
      <button type="button" class={btn} onclick={stop}>Stop microphone</button>
    {:else}
      <button type="button" class={btnPrimary} onclick={start} disabled={mic.state === "starting"}>{mic.state === "starting" ? "Starting" : "Start microphone"}</button>
    {/if}
    <span class="text-sm text-ws-soft">
      {mic.state === "denied" ? "Blocked: allow the microphone for this site in the browser's address bar, then try again." : mic.state === "error" ? mic.error : mic.state === "on" ? "Listening." : "Off. It only starts when you press the button."}
    </span>
  </div>
  {#if mic.state === "on"}
    <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div class="h-3 overflow-hidden rounded-full bg-ws-raised" role="meter" aria-label="Input level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow={Math.round(mic.level)}>
        <div class="h-full rounded-full bg-instr transition-[width] duration-75" style:width="{levelPct}%"></div>
      </div>
      <p class="tnum text-sm">{Math.round(mic.level)} dBFS, peak {Math.round(mic.peak)}</p>
    </div>
    <p class="text-sm"><span class="font-semibold">{mic.advice?.label ?? "Waiting for sound"}.</span> {mic.advice ? ADVICE[mic.advice.tone] : ""}{mic.pitch ? ` Hearing ${noteName(mic.pitch.midi)}.` : ""}</p>
  {/if}
</div>
