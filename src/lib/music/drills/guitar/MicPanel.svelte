<script lang="ts" module>
  import { mic, settings } from "#lib/music/runtime/index.ts";
  /** Turn the microphone on as the input check does (the chosen device, kept on across pages). */
  export const startMic = () => mic.start({ deviceId: settings.value.audioInputDeviceId, pin: true });
  /** The drill shell's `unblock`: the one microphone prompt, in Start's place, while the microphone gates Start. */
  export const micUnblock = {
    label: "Turn on the microphone",
    run: async () => {
      if (!(await startMic())) throw new Error(mic.error || "The microphone didn't start. Check the browser allows it.");
    },
  };
</script>

<script lang="ts">
  // The microphone on a fretted stage: a level meter with plain advice while it
  // is on. While it is off, the one prompt to turn it on sits in Start's place
  // (the shell's input check or `unblock`), so this panel offers its own button
  // only where that prompt is not drawn (`offer`: mid-run, after a run). Silent
  // to screen readers except through its own controls (the route owns role=status).
  import Mic from "@lucide/svelte/icons/mic";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import { btnStage } from "#lib/music/components/ui.ts";

  /** `disabled` (a run is live) locks Stop and shrinks the prompt to a chip; `offer` draws the prompt while it is off. */
  let { hint = "Sit close to the sound hole, about a hand's width away.", disabled = false, offer = true }: { hint?: string; disabled?: boolean; offer?: boolean } = $props();

  const fill = $derived(Math.max(0, Math.min(1, (mic.peak + 60) / 60)));
  const toneClass = { good: "bg-success", quiet: "bg-ws-stage-soft", hot: "bg-warn", clipping: "bg-destructive" } as const;
  const advice = $derived(mic.advice ?? { tone: "quiet" as const, label: "Quiet" });
  /** Advice a player can act on: what to do, not studio slang. */
  const adviceText = $derived(advice.tone === "hot" ? "Too loud: move back a little" : advice.tone === "clipping" ? "Far too loud: move well back" : advice.label);
</script>

{#if disabled && offer && mic.state !== "on"}
  <!-- Mid-run the prompt is a chip (asked once, at setup): one tap still fixes a silent run without stopping it. -->
  <button type="button" class="{btnStage} self-start" disabled={mic.state === "starting"} onclick={() => void startMic()} title={mic.error || hint}>
    <MicOff class="size-4" aria-hidden="true" />{mic.state === "starting" ? "Starting…" : "Mic off: turn on"}
  </button>
{:else if mic.state === "on" || offer || mic.error}
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
          aria-valuetext="{Math.round(mic.peak)} dB, {adviceText}"
        >
          <div class="h-full rounded-full transition-[width] duration-75 {toneClass[advice.tone]}" style:width="{fill * 100}%"></div>
        </div>
        <span class="flex min-w-28 items-center gap-1 text-sm text-ws-stage-soft">
          {#if advice.tone === "hot" || advice.tone === "clipping"}<Volume2 class="size-4 shrink-0 text-warn" aria-hidden="true" />{/if}{adviceText}
        </span>
      </div>
      <button type="button" class={btnStage} {disabled} onclick={() => mic.stop({ unpin: true })}><MicOff class="size-4" aria-hidden="true" />Stop microphone</button>
    {:else if offer}
      <!-- Starting stays open mid-run: the player can fix a silent run without stopping it. -->
      <button type="button" class={btnStage} disabled={mic.state === "starting"} onclick={() => void startMic()}>
        <Mic class="size-4" aria-hidden="true" />{mic.state === "starting" ? "Starting…" : "Turn on the microphone"}
      </button>
      <p class="min-w-48 flex-1 text-sm text-ws-stage-soft">{mic.error || hint}</p>
    {:else}
      <p class="text-sm text-ws-stage-soft">{mic.error}</p>
    {/if}
  </div>
{/if}
