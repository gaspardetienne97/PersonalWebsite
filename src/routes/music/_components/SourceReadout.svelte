<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label = "Active input",
    device,
    live = false,
    icon,
    class: cls = "",
  }: {
    label?: string;
    device: string;
    live?: boolean;
    icon?: Snippet;
    class?: string;
  } = $props();
</script>

<div
  class="inline-flex items-center gap-3 rounded-xl border bg-card px-3 py-2 shadow-sm {cls}"
  aria-label="{label}: {device}"
>
  {#if icon}
    <div class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
      {@render icon()}
    </div>
  {/if}
  <div class="flex min-w-0 flex-col">
    <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
    <span class="flex items-center gap-1.5 truncate text-sm font-semibold">
      {#if live}
        <span class="inline-block size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true"></span>
      {/if}
      {device}
    </span>
  </div>
</div>
