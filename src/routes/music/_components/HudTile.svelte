<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    value,
    unit,
    tone = "default",
    size = "md",
    icon,
    class: cls = "",
  }: {
    label: string;
    value: string | number;
    unit?: string;
    tone?: "default" | "good" | "accent";
    /** `sm` is the compact tile used for run details under the stage. */
    size?: "md" | "sm";
    icon?: Snippet;
    class?: string;
  } = $props();

  const valueClass = $derived(
    tone === "good" ? "text-success" : tone === "accent" ? "text-primary" : "text-foreground",
  );
</script>

<div
  data-hud-tile={size}
  class="flex flex-col rounded-xl border bg-card {size === 'sm' ? 'gap-0.5 px-3 py-2' : 'gap-1 px-4 py-3'} {cls}"
>
  <span class="flex items-center gap-1.5 eyebrow">
    {#if icon}{@render icon()}{/if}
    {label}
  </span>
  <span class="{size === 'sm' ? 'text-lg' : 'text-2xl'} font-bold leading-none tabular-nums {valueClass}">
    {value}{#if unit}<span class="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>{/if}
  </span>
</div>
