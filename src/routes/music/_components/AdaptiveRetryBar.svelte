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

  // Keyboard shortcuts while the bar is mounted (i.e. at summary time).
  // Deliberately NOT letters from the QWERTY-piano map (a/w/s/e/d/f/t/g/y/h/
  // u/j/k/o/l/p/;) — drill keyboards stay mounted under summaries, and 'S'
  // would both play a D and slow the drill down. 'r' and '-' are unmapped.
  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable)
    ) {
      return;
    }
    if (event.key.toLowerCase() === "r" && onRetry) {
      event.preventDefault();
      onRetry();
    } else if (event.key === "-" && onSlower) {
      event.preventDefault();
      onSlower();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

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
  {#if onRetry || onSlower}
    <span class="hidden text-xs text-muted-foreground sm:inline" aria-hidden="true">
      {#if onRetry}<kbd class="rounded border bg-muted px-1 font-mono">R</kbd> retry{/if}
      {#if onRetry && onSlower}·{/if}
      {#if onSlower}<kbd class="rounded border bg-muted px-1 font-mono">−</kbd> slower{/if}
    </span>
  {/if}
</div>
