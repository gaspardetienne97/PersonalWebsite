<script lang="ts">
  import type { Snippet } from "svelte";

  // One settings row: label and help on the left, the control on the right.
  // `for` links the label to a control id; without it the row is a plain group.
  let {
    label,
    help,
    for: htmlFor,
    children,
  }: {
    label: string;
    help?: string;
    for?: string;
    children: Snippet;
  } = $props();
</script>

<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0" data-settings-row>
  <div class="min-w-0 flex-1 basis-48">
    {#if htmlFor}
      <label for={htmlFor} class="block text-sm font-medium">{label}</label>
    {:else}
      <p class="text-sm font-medium">{label}</p>
    {/if}
    {#if help}<p class="text-xs text-muted-foreground">{help}</p>{/if}
  </div>
  <div class="flex min-w-0 max-w-full shrink-0 items-center gap-2">{@render children()}</div>
</div>
