<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "@repo/ui/utils";

  // Shared drill layout. Goes *inside* PracticeScreen (after the header) and
  // composes a drill's regions into the common anatomy: setup + stage + feedback
  // in the main column, a progress rail on the side, and a summary that replaces
  // the body when the run is complete. Layout only — it holds no scoring or
  // session state; routes pass rendered regions as snippets.
  let {
    setup,
    stage,
    feedback,
    rail,
    summary,
    children,
    class: cls = "",
  }: {
    setup?: Snippet;
    stage?: Snippet;
    feedback?: Snippet;
    rail?: Snippet;
    /** When provided, replaces setup/stage/rail with the completed-run summary. */
    summary?: Snippet;
    children?: Snippet;
    class?: string;
  } = $props();
</script>

{#if summary}
  <div class={cn("space-y-4", cls)}>{@render summary()}</div>
{:else}
  <div class={cn("grid gap-6", rail ? "lg:grid-cols-[minmax(0,1fr)_18rem]" : "", cls)}>
    <div class="min-w-0 space-y-4">
      {#if setup}{@render setup()}{/if}
      {#if stage}{@render stage()}{/if}
      {#if feedback}{@render feedback()}{/if}
      {#if children}{@render children()}{/if}
    </div>
    {#if rail}
      <aside class="grid content-start gap-4">{@render rail()}</aside>
    {/if}
  </div>
{/if}
