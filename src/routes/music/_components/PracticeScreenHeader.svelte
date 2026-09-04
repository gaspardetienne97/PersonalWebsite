<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    subtitle,
    controls,
    compact = false,
    class: cls = "",
  }: {
    title: string;
    subtitle?: string;
    controls?: Snippet;
    /** Drill pages: a smaller title on one row with the controls, no subtitle. */
    compact?: boolean;
    class?: string;
  } = $props();
</script>

<header class="flex flex-wrap {compact ? 'items-center gap-3' : 'items-start gap-4'} {cls}">
  <div class="min-w-0 flex-1">
    <h1 class={compact ? "text-2xl font-semibold tracking-tight" : "text-3xl font-bold tracking-tight"}>
      {title}
    </h1>
    {#if subtitle && !compact}
      <p class="mt-1 text-muted-foreground">{subtitle}</p>
    {/if}
  </div>
  {#if controls}
    <div class="flex w-full min-w-0 flex-wrap items-center gap-2 overflow-x-auto pb-1 sm:w-auto">
      {@render controls()}
    </div>
  {/if}
</header>
