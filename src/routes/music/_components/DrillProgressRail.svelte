<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "@repo/ui/utils";

  // The drill progress rail: compact labelled stats (current rep, remaining,
  // weak spot, next target, average offset, …) for the side column. Data-driven
  // so the same component serves the prompt / sequence / timing / intonation
  // variants — the route picks the items; richer visuals (timing meter, pitch
  // trace) go in `children`.
  export interface RailItem {
    label: string;
    value: string | number;
    hint?: string;
  }

  let {
    title,
    items = [],
    children,
    class: cls = "",
  }: {
    title?: string;
    items?: RailItem[];
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<div class={cn("grid content-start gap-3", cls)}>
  {#if title}
    <p class="eyebrow">{title}</p>
  {/if}
  {#each items as item (item.label)}
    <div class="flex items-baseline justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <span class="text-sm text-muted-foreground">{item.label}</span>
      <span class="text-right">
        <span class="text-lg font-bold leading-none tabular-nums">{item.value}</span>
        {#if item.hint}
          <span class="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span>
        {/if}
      </span>
    </div>
  {/each}
  {#if children}
    {@render children()}
  {/if}
</div>
