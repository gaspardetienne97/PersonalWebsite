<script lang="ts">
  import type { Snippet } from "svelte";

  // The one section heading for the hub pages: eyebrow, display-face title,
  // optional action on the right. Replaces the bare h2, the eyebrow-only h2 and
  // the Card.Title-only variants that used to coexist.
  let {
    title,
    eyebrow,
    description,
    level = 2,
    action,
    id,
    class: cls = "",
  }: {
    title: string;
    eyebrow?: string;
    /** One sentence under the title. */
    description?: string;
    level?: 2 | 3;
    action?: Snippet;
    id?: string;
    class?: string;
  } = $props();
</script>

<div class="flex flex-wrap items-end justify-between gap-3 {cls}">
  <div class="min-w-0">
    {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
    <svelte:element
      this={level === 3 ? "h3" : "h2"}
      {id}
      class="font-display {level === 3 ? 'text-lg' : 'text-xl'} font-semibold tracking-tight"
    >
      {title}
    </svelte:element>
    {#if description}<p class="mt-1 text-sm text-muted-foreground">{description}</p>{/if}
  </div>
  {#if action}
    <div class="flex min-w-0 max-w-full flex-wrap items-center gap-2">{@render action()}</div>
  {/if}
</div>
