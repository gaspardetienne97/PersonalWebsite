<script lang="ts">
  import Mic from "lucide-svelte/icons/mic";
  import MicOff from "lucide-svelte/icons/mic-off";

  import {
    MICROPHONE_HINT_MESSAGE,
    type GateSessionState,
  } from "@repo/music-core/engines/audio-in";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Button } from "@repo/ui/button";

  /**
   * The route-owned microphone control. Permission is only ever requested from
   * this explicit action, and while the gate is hint-only it shows what it hears
   * without ever being the thing that advances the exercise.
   */
  let {
    state,
    supported,
    pending = false,
    onStart,
    onStop,
  }: {
    state: GateSessionState;
    supported: boolean;
    pending?: boolean;
    onStart: () => void;
    onStop: () => void;
  } = $props();

  const listening = $derived(state.status === "running" || state.status === "requesting");
  const detected = $derived(state.observed.map((midiNote) => midiToNote(midiNote)).join(" · "));
</script>

<div class="grid gap-2 rounded-lg border bg-card px-4 py-3" data-testid="microphone-gate">
  <div class="flex flex-wrap items-center gap-3">
    {#if !supported}
      <p class="text-sm text-muted-foreground">Microphone input is not supported here.</p>
    {:else if listening}
      <Button type="button" size="sm" variant="outline" onclick={onStop}>
        <MicOff class="size-4" aria-hidden="true" />
        Stop microphone
      </Button>
    {:else}
      <Button type="button" size="sm" variant="outline" disabled={pending} onclick={onStart}>
        <Mic class="size-4" aria-hidden="true" />
        Use microphone
      </Button>
    {/if}
    {#if state.message}
      <p class="text-sm text-destructive" role="alert">{state.message}</p>
    {/if}
  </div>

  {#if supported && listening && state.hintOnly}
    <p class="text-sm text-muted-foreground" data-testid="microphone-hint">
      {MICROPHONE_HINT_MESSAGE}
    </p>
  {/if}

  {#if supported && listening}
    <!-- Visible only: a per-detection announcement would talk over the route's own live region. -->
    <p class="text-sm text-muted-foreground" data-testid="microphone-detected">
      {detected ? `Detected: ${detected}` : "Listening."}
    </p>
  {/if}
</div>
