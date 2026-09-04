<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "@repo/ui/utils";

  import HudTile from "./HudTile.svelte";

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
  {#if items.length > 0}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each items as item (item.label)}
        <HudTile size="sm" label={item.label} value={item.value} unit={item.hint} />
      {/each}
    </div>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</div>
