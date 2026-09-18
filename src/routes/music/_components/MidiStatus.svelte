<script lang="ts">
  import { cn } from "@repo/ui/utils";
  import { Button } from "@repo/ui/button";

  import { useMusicRuntime } from "../_runtime.svelte";

  /**
   * One MIDI line for every drill. Connect decides which devices are listened
   * to; this only reports it, and offers the first enable when this browser has
   * never granted MIDI. The trace line says what the last hardware note became,
   * so a silent pad is diagnosable without leaving the drill.
   */
  let { class: cls = "" }: { class?: string } = $props();

  const runtime = useMusicRuntime();
  const supported = $derived(runtime.midi.state.supported);
  const devices = $derived(runtime.midiListening.devices);
  const trace = $derived(runtime.lastMidi);

  async function enable(): Promise<void> {
    await runtime.midi.enable();
  }
</script>

<div class={cn("grid gap-1 text-xs text-muted-foreground", cls)} data-testid="midi-status">
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    {#if !supported}
      <span>{runtime.midi.state.error ?? "Web MIDI is unavailable in this browser."}</span>
    {:else if runtime.midiEnabled}
      <span class="inline-flex items-center gap-1.5">
        <span class="inline-block size-1.5 rounded-full bg-success" aria-hidden="true"></span>
        {#if devices.length === 0}
          MIDI on, no device listening
        {:else}
          Listening to <span class="font-medium text-foreground">{devices.join(", ")}</span>
        {/if}
        {#if runtime.midiListening.removed > 0}
          <span>· {runtime.midiListening.removed} removed</span>
        {/if}
        {#if runtime.mpcLink}
          <span>· MPC linked on {runtime.mpcLink.outputName}</span>
        {/if}
      </span>
      <a href="/music/connect" class="font-medium text-primary underline-offset-2 hover:underline">
        Change in Connect
      </a>
    {:else if runtime.midiEverEnabled}
      <span>Reconnecting MIDI</span>
      <Button type="button" size="sm" variant="outline" onclick={enable}>Reconnect now</Button>
    {:else}
      <span>{runtime.midi.state.error ?? "MIDI has not been set up in this browser."}</span>
      <Button type="button" size="sm" variant="outline" onclick={enable}>Enable MIDI</Button>
      <a href="/music/connect" class="font-medium text-primary underline-offset-2 hover:underline">
        Set up in Connect
      </a>
    {/if}
  </div>
  {#if trace}
    <p class="font-mono tabular-nums" data-testid="midi-trace">
      Last note: {trace.deviceName} sent {trace.note}{trace.canonical !== trace.note
        ? ` → pad ${trace.canonical}`
        : ""} · {trace.accepted ? "accepted" : `not used: ${trace.reason}`}
    </p>
  {/if}
</div>
