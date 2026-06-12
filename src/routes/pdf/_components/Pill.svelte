<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    accent,
    class: className = "",
    children,
  }: { accent?: string; class?: string; children: Snippet } = $props();
</script>

<span class="pill {className}" style:color={accent ?? "var(--n-fg-2)"}>
  {@render children()}
</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-family: var(--n-font-mono);
    letter-spacing: 0.02em;
    background: var(--n-bg-2);
    border: 1px solid var(--n-border-1);
    white-space: nowrap;
  }
</style>
