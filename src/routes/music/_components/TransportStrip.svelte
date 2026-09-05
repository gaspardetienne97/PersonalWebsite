<script lang="ts">
  import type { Snippet } from "svelte";

  // The one control strip above a Create surface: transport on the left (Play
  // first), the surface's actions on the right. A toolbar, not a card of prose.
  let {
    label = "Transport",
    children,
    actions,
    class: cls = "",
  }: {
    label?: string;
    /** Transport controls: Play, Stop, tempo, bars. */
    children: Snippet;
    /** Surface actions: Clear, Export, Save. */
    actions?: Snippet;
    class?: string;
  } = $props();
</script>

<div
  role="toolbar"
  aria-label={label}
  class="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 {cls}"
>
  <div class="flex flex-wrap items-center gap-2">{@render children()}</div>
  {#if actions}
    <div class="ml-auto flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</div>
