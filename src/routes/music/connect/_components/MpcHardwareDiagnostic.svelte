<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import {
    mpcControllerInitSysex,
    mpcHeartbeatSysex,
    padColorSysex,
    padLayoutSysex,
    padsOffSysex,
    padTestPalette,
  } from "@repo/music-core/engines/pad-color";
  import type { MidiDeviceSummary, RawMidiEvent } from "@repo/music-core/engines/midi";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  interface Props {
    outputs: MidiDeviceSummary[];
    sysexEnabled: boolean;
    send: (outputId: string, data: number[] | Uint8Array) => boolean;
    subscribeRaw: (listener: (event: RawMidiEvent) => void) => () => void;
  }

  let { outputs, sysexEnabled, send, subscribeRaw }: Props = $props();

  // "fire" red, captured from the MPC color picker.
  const FIRE = { r: 0x3f, g: 0x00, b: 0x00 };

  let selectedOutputId = $state("");
  let connected = $state(false);
  let status = $state("");
  let lastOutbound = $state("");
  let lastInbound = $state("");
  const defaultOutputId = $derived(preferredOutput(outputs));
  const outputId = $derived(selectedOutputId || defaultOutputId);
  const statusMessage = $derived(
    status ||
      (sysexEnabled
        ? "Put the MPC One+ in Controller Mode, pick its MIDI output, then Connect."
        : "SysEx permission is required to drive the MPC pads."),
  );

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribeRaw: (() => void) | undefined;

  onMount(() => {
    unsubscribeRaw = subscribeRaw(handleRawMidi);
  });

  function preferredOutput(devices: MidiDeviceSummary[]): string {
    return (
      devices.find((device) => /mpc|akai/i.test(`${device.manufacturer ?? ""} ${device.name}`))
        ?.id ??
      devices[0]?.id ??
      ""
    );
  }

  function handleRawMidi(event: RawMidiEvent): void {
    if (event.data[0] !== 0xf0) return;
    lastInbound = formatBytes(event.data);
  }

  function sendFrames(frames: number[][], label: string): void {
    if (!outputId || !sysexEnabled) return;
    const sent = frames.filter((frame) => send(outputId, frame)).length;
    lastOutbound = formatBytes(frames.at(-1) ?? []);
    status =
      sent === frames.length
        ? `${label}: sent ${sent} frame${sent === 1 ? "" : "s"}.`
        : `${label}: only ${sent} of ${frames.length} frames could be sent to this output.`;
  }

  function connect(): void {
    sendFrames(mpcControllerInitSysex(), "Init handshake");
    connected = true;
    stopHeartbeat();
    heartbeat = setInterval(() => send(outputId, mpcHeartbeatSysex()), 1_000);
  }

  function disconnect(): void {
    stopHeartbeat();
    sendFrames(padsOffSysex(), "All pads off");
    connected = false;
  }

  function lightPad1(): void {
    sendFrames([padColorSysex(0, FIRE)], "Light pad 1 red");
  }

  function rainbow(): void {
    sendFrames(padLayoutSysex(padTestPalette()), "Rainbow");
  }

  function allOff(): void {
    sendFrames(padsOffSysex(), "All pads off");
  }

  function stopHeartbeat(): void {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    heartbeat = undefined;
  }

  function formatBytes(data: ArrayLike<number>): string {
    return Array.from(data, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }

  onDestroy(() => {
    stopHeartbeat();
    unsubscribeRaw?.();
  });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>MPC One+ pad LEDs</Card.Title>
    <Card.Description>
      Drives the physical pad colors over the Controller Mode SysEx protocol captured from the MPC 3
      app (product 0x56).
    </Card.Description>
  </Card.Header>
  <Card.Content class="grid gap-4">
    <label class="grid gap-1.5">
      <span class="text-xs font-medium text-muted-foreground">MIDI output</span>
      <select
        aria-label="MPC MIDI output"
        class="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
        value={outputId}
        onchange={(event) => (selectedOutputId = event.currentTarget.value)}
      >
        <option value="">Select an output</option>
        {#each outputs as output (output.id)}
          <option value={output.id}>
            {output.name}{output.manufacturer ? ` · ${output.manufacturer}` : ""}
          </option>
        {/each}
      </select>
    </label>

    <div class="flex flex-wrap gap-2">
      <Button type="button" onclick={connect} disabled={!sysexEnabled || !outputId}>
        Connect (init + heartbeat)
      </Button>
      <Button type="button" variant="outline" onclick={disconnect} disabled={!connected}>
        Disconnect
      </Button>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onclick={lightPad1} disabled={!sysexEnabled || !outputId}>
        Light pad 1 red
      </Button>
      <Button type="button" variant="outline" onclick={rainbow} disabled={!sysexEnabled || !outputId}>
        Test rainbow
      </Button>
      <Button type="button" variant="outline" onclick={allOff} disabled={!sysexEnabled || !outputId}>
        All off
      </Button>
    </div>

    <p class="text-sm text-muted-foreground" aria-live="off">{statusMessage}</p>
    {#if lastOutbound}
      <p class="break-all font-mono text-xs text-muted-foreground">Last outbound: {lastOutbound}</p>
    {/if}
    {#if lastInbound}
      <p class="break-all font-mono text-xs text-muted-foreground">Last inbound: {lastInbound}</p>
    {/if}

    <p class="text-xs text-muted-foreground">
      Tip: try “Light pad 1 red” first with the MPC already in Controller Mode. If nothing lights,
      hit Connect to replay the full handshake, then try again.
    </p>
  </Card.Content>
</Card.Root>
