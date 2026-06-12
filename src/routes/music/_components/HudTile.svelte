<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    value,
    unit,
    tone = "default",
    icon,
    class: cls = "",
  }: {
    label: string;
    value: string | number;
    unit?: string;
    tone?: "default" | "good" | "accent";
    icon?: Snippet;
    class?: string;
  } = $props();

  const valueClass = $derived(
    tone === "good" ? "text-success" : tone === "accent" ? "text-primary" : "text-foreground",
  );
</script>

<div class="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 {cls}">
  <span class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
    {#if icon}{@render icon()}{/if}
    {label}
  </span>
  <span class="text-2xl font-bold leading-none tabular-nums {valueClass}">
    {value}{#if unit}<span class="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>{/if}
  </span>
</div>
