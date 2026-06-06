<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    class: cls = "",
  }: {
    children: Snippet;
    class?: string;
  } = $props();
</script>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 {cls}">
  {@render children()}
</div>
