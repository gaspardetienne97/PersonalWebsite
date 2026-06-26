<script lang="ts">
  import { onDestroy } from "svelte";

  import type { MidiDeviceSummary } from "@repo/music-core/engines/midi";
  import {
    kitPadColors,
    mpcControllerInitSysex,
    mpcHeartbeatSysex,
    padIndexForMidi,
    padLayoutSysex,
    padsOffSysex,
  } from "@repo/music-core/engines/pad-color";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import type { MusicRuntime } from "../../_runtime.svelte";
  import type { ActiveSampleKit } from "./sample-kit-playback";

  let { runtime, activeKit }: { runtime: MusicRuntime; activeKit?: ActiveSampleKit } = $props();

  let outputs = $state<MidiDeviceSummary[]>([]);
  let selectedOutputId = $state("");
  let lit = $state(false);
  let status = $state("");
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    outputs = runtime.midi?.state?.outputs ?? [];
    return runtime.midi?.subscribeState((state) => {
      outputs = state.outputs;
    });
  });

  // The MPC One+ drives pad LEDs on its "Private" port; prefer it, then any MPC/Akai.
  const preferredOutputId = $derived(
    outputs.find(
      (output) =>
        /private/i.test(output.name) &&
        /mpc|akai/i.test(`${output.manufacturer ?? ""} ${output.name}`),
    )?.id ??
      outputs.find((output) => /mpc|akai/i.test(`${output.manufacturer ?? ""} ${output.name}`))
        ?.id ??
      outputs[0]?.id ??
      "",
  );
  const outputId = $derived(selectedOutputId || preferredOutputId);

  // A pad is "assigned" when it carries a real sample (playable or export-only).
  const assignedIndexes = $derived(
    (activeKit?.pads ?? [])
      .filter((pad) => pad.status !== "missing")
      .map((pad) => padIndexForMidi(pad.midiNote)),
  );

  function send(frames: number[][]): void {
    if (outputId) frames.forEach((frame) => runtime.midi?.send(outputId, frame));
  }

  function sendColors(): void {
    send(padLayoutSysex(kitPadColors(assignedIndexes)));
  }

  async function lightPads(): Promise<void> {
    const enabled = await runtime.midi?.enable();
    if (!enabled) {
      status = "Enable MIDI and grant SysEx access to drive the pads.";
      return;
    }
    if (!outputId) {
      status = "No MIDI output found — connect the MPC One+ in Controller Mode.";
      return;
    }
    send(mpcControllerInitSysex());
    stopHeartbeat();
    heartbeat = setInterval(() => runtime.midi?.send(outputId, mpcHeartbeatSysex()), 1_000);
    sendColors();
    lit = true;
    status = `Lit ${assignedIndexes.length} assigned pad${assignedIndexes.length === 1 ? "" : "s"}.`;
  }

  function padsOff(): void {
    stopHeartbeat();
    send(padsOffSysex());
    lit = false;
    status = "Pads off.";
  }

  function stopHeartbeat(): void {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    heartbeat = undefined;
  }

  // Re-push colors when the active kit changes while the pads are lit.
  $effect(() => {
    const _ = assignedIndexes;
    if (lit) sendColors();
  });

  onDestroy(() => {
    if (lit) send(padsOffSysex());
    stopHeartbeat();
  });
</script>

<Card.Root>
  <Card.Header>
    <Card.Description>MPC pad LEDs</Card.Description>
    <Card.Title class="text-base">Light the active kit on your pads</Card.Title>
  </Card.Header>
  <Card.Content class="grid gap-3">
    {#if outputs.length > 0}
      <label class="grid gap-1.5">
        <span class="text-xs font-medium text-muted-foreground">MIDI output</span>
        <select
          aria-label="MPC MIDI output"
          class="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
          value={outputId}
          onchange={(event) => (selectedOutputId = event.currentTarget.value)}
        >
          {#each outputs as output (output.id)}
            <option value={output.id}>
              {output.name}{output.manufacturer ? ` · ${output.manufacturer}` : ""}
            </option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="flex flex-wrap gap-2">
      <Button type="button" onclick={lightPads} disabled={!activeKit}>
        {lit ? "Re-light pads" : "Light pads"}
      </Button>
      <Button type="button" variant="outline" onclick={padsOff} disabled={!lit}>Pads off</Button>
    </div>

    <p class="text-sm text-muted-foreground" aria-live="polite">
      {status ||
        (activeKit
          ? "Lights assigned pads green on the MPC One+ (Controller Mode). Needs MIDI + SysEx."
          : "Activate a sample kit to light its pads.")}
    </p>
  </Card.Content>
</Card.Root>
