<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    description,
    xp,
    href,
    icon,
    class: cls = "",
  }: {
    title: string;
    description: string;
    xp?: number;
    href: string;
    icon?: Snippet;
    class?: string;
  } = $props();
</script>

<a
  {href}
  class="group flex flex-col gap-3 rounded-2xl border bg-card p-5 transition-[transform,box-shadow,border-color] duration-200
    hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg {cls}"
>
  {#if icon}
    <div class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
      {@render icon()}
    </div>
  {/if}
  <h4 class="text-base font-semibold">{title}</h4>
  <p class="flex-1 text-sm leading-snug text-muted-foreground">{description}</p>
  <div class="mt-auto flex items-center justify-between pt-2">
    {#if xp}
      <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
        >+{xp} XP</span
      >
    {/if}
    <span
      class="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground group-hover:bg-primary/90"
    >
      Start
    </span>
  </div>
</a>
