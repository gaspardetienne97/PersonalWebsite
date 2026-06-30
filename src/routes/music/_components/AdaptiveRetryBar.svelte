<script lang="ts">
  import { Button } from "@repo/ui/button";
  import { cn } from "@repo/ui/utils";

  // Post-feedback command row (flowkey's loop/slow/retry + iReal Pro's tempo
  // ramp). Each action renders only when its handler is provided, so a drill
  // exposes just the commands its engine can actually support — no boolean
  // props. `onContinue` is the primary action.
  let {
    onRetry,
    onSlower,
    onWeakItem,
    onContinue,
    retryLabel = "Retry this",
    slowerLabel = "Slow down",
    weakItemLabel = "Practice weak item",
    continueLabel = "Continue",
    class: cls = "",
  }: {
    onRetry?: () => void;
    onSlower?: () => void;
    onWeakItem?: () => void;
    onContinue?: () => void;
    retryLabel?: string;
    slowerLabel?: string;
    weakItemLabel?: string;
    continueLabel?: string;
    class?: string;
  } = $props();
</script>

<div class={cn("flex flex-wrap items-center gap-2", cls)}>
  {#if onRetry}
    <Button type="button" variant="outline" onclick={onRetry}>{retryLabel}</Button>
  {/if}
  {#if onSlower}
    <Button type="button" variant="outline" onclick={onSlower}>{slowerLabel}</Button>
  {/if}
  {#if onWeakItem}
    <Button type="button" variant="outline" onclick={onWeakItem}>{weakItemLabel}</Button>
  {/if}
  {#if onContinue}
    <Button type="button" onclick={onContinue}>{continueLabel}</Button>
  {/if}
</div>
