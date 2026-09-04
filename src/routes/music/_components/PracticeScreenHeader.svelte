<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    subtitle,
    controls,
    compact = false,
    level = 1,
    class: cls = "",
  }: {
    title: string;
    subtitle?: string;
    controls?: Snippet;
    /** Drill pages: a smaller title on one row with the controls, no subtitle. */
    compact?: boolean;
    /** Heading level: 1 for a route, 2 for a view embedded under a route's h1 (Library tabs). */
    level?: 1 | 2;
    class?: string;
  } = $props();
</script>

<header class="flex flex-wrap {compact ? 'items-center gap-3' : 'items-start gap-4'} {cls}">
  <div class="min-w-0 flex-1">
    <svelte:element
      this={level === 2 ? "h2" : "h1"}
      class={compact
        ? "font-display text-2xl font-semibold tracking-tight"
        : "font-display text-3xl font-semibold tracking-tight sm:text-4xl"}
    >
      {title}
    </svelte:element>
    {#if level === 1}
      <!-- Instrument hue underline: identity, never data. -->
      <span class="mt-1.5 block h-0.5 w-10 rounded-full bg-instr" aria-hidden="true"></span>
    {/if}
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
