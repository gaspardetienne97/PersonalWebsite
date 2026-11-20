<script lang="ts">
  // The microphone step on a fretted stage: nothing listens until the player
  // presses Start microphone; then a level meter with plain advice. Silent to
  // screen readers except through its own controls (the route owns role=status).
  import Mic from "@lucide/svelte/icons/mic";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import { mic } from "#lib/music/runtime/index.ts";
  import { btnStage } from "#lib/music/components/ui.ts";

  /** `disabled` locks Stop during a run; Start is always allowed. */
  let { hint = "Sit close to the sound hole, about a hand's width away.", disabled = false }: { hint?: string; disabled?: boolean } = $props();

  const fill = $derived(Math.max(0, Math.min(1, (mic.peak + 60) / 60)));
  const toneClass = { good: "bg-success", quiet: "bg-ws-stage-soft", hot: "bg-warn", clipping: "bg-destructive" } as const;
  const advice = $derived(mic.advice ?? { tone: "quiet" as const, label: "Quiet" });
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-ws-stage-ink/8 px-3 py-2" data-mic={mic.state}>
  {#if mic.state === "on"}
    <p class="flex items-center gap-2 text-sm font-semibold"><Mic class="size-4" aria-hidden="true" />Microphone on</p>
    <div class="flex min-w-40 flex-1 items-center gap-2">
      <div
        class="h-2.5 flex-1 overflow-hidden rounded-full bg-ws-stage-ink/15"
        role="meter"
        aria-label="Input level"
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={Math.round(mic.peak)}
        aria-valuetext="{Math.round(mic.peak)} dB, {advice.label}"
      >
        <div class="h-full rounded-full transition-[width] duration-75 {toneClass[advice.tone]}" style:width="{fill * 100}%"></div>
      </div>
      <span class="w-28 text-sm text-ws-stage-soft">{advice.label}</span>
    </div>
    <button type="button" class={btnStage} {disabled} onclick={() => mic.stop({ unpin: true })}><MicOff class="size-4" aria-hidden="true" />Stop microphone</button>
  {:else}
    <!-- Starting stays open mid-run: the player can fix a silent run without stopping it. -->
    <button type="button" class={btnStage} disabled={mic.state === "starting"} onclick={() => void mic.start()}>
      <Mic class="size-4" aria-hidden="true" />{mic.state === "starting" ? "Starting" : "Start microphone"}
    </button>
    <p class="min-w-48 flex-1 text-sm text-ws-stage-soft">{mic.error || hint}</p>
  {/if}
</div>
