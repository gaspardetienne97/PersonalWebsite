<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { micLabel } from "#lib/music/hubs/connect/rig.ts";
  // The tap-along, offered on a timed drill's ready screen when this input and output
  // pair has no offset (runtime/calibration). One line; Tap along opens the Settings
  // panel in place, Skip remembers the pair. It never holds Start back.
  import Timer from "@lucide/svelte/icons/timer";
  import { AUDIO_INPUT } from "@repo/music-core/io/calibration";
  import CalibrationPanel from "#lib/music/hubs/tools/settings/CalibrationPanel.svelte";
  import { audio, calibration, midi, settings } from "../runtime";
  import { btn } from "./ui";

  const key = $derived(calibration.input);
  // Only once the output was read from running audio, never from the remembered one.
  const due = $derived(audio.outputMeasured && calibration.offer(key));
  let open = $state(false);
  let said = $state("");
  /** The pair was calibrated here: the line confirms it until the page is left. */
  let done = $state(false);

  const deviceId = $derived(key?.startsWith("midi:") ? key.slice(5) : undefined);
  const name = $derived(
    key === AUDIO_INPUT
      ? micLabel(settings.value.audioInputLabel) || m.music_shell_calib_the_mic()
      : deviceId
        ? midi.profile(deviceId)?.alias || midi.inputs.find((p) => p.id === deviceId)?.name || m.music_shell_calib_this_device()
        : "MIDI",
  );
</script>

{#if key && (due || done)}
  <div class="mb-2 flex flex-col gap-2 text-sm" data-testid="calibration-offer">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p class="flex min-w-0 flex-1 basis-64 items-center gap-2 text-ws-stage-soft">
        <Timer class="size-4 shrink-0" aria-hidden="true" />
        <span>
          {#if done}{m.music_shell_calib_done({ name })}{:else}{m.music_shell_calib_due({ name })}{/if}
        </span>
      </p>
      {#if !done && !open}
        <div class="flex gap-2">
          <button type="button" class={btn} onclick={() => (open = true)}>{m.music_shell_calib_tap_along()}</button>
          <button type="button" class={btn} onclick={() => calibration.skip(key)}>{m.music_shell_calib_skip()}</button>
        </div>
      {/if}
    </div>
    {#if open && !done}
      <div class="rounded-xl border border-ws-line bg-ws-surface text-ws-ink">
        <CalibrationPanel
          id="offer"
          autorun
          kind={key === AUDIO_INPUT ? "audio" : deviceId ? "device" : "midi"}
          {deviceId}
          title={name}
          blurb={m.music_shell_calib_blurb()}
          current={calibration.offset(key)}
          onsave={async (ms) => {
            await calibration.save(key, ms);
            done = true;
          }}
          onreset={() => calibration.reset(key)}
          announce={(msg) => (said = msg)}
        />
        <p class="px-4 pb-3">
          <button type="button" class="font-medium text-instr-ink underline underline-offset-4" onclick={() => ((open = false), calibration.skip(key))}>{m.music_shell_calib_skip_now()}</button>
        </p>
      </div>
    {/if}
    <p class="sr-only" role="status">{said}</p>
  </div>
{/if}
