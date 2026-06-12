<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  let {
    variant = "secondary",
    class: className = "",
    children,
    ...rest
  }: { variant?: "primary" | "secondary" | "ghost"; class?: string; children: Snippet } & HTMLButtonAttributes =
    $props();
</script>

<button class="btn {variant} {className}" {...rest}>
  {@render children()}
</button>

<style>
  .btn {
    font-family: var(--n-font-sans);
    font-weight: 600;
    font-size: 14px;
    padding: 10px 18px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 200ms var(--n-ease-out);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    line-height: 1;
    white-space: nowrap;
  }
  .btn:active {
    transform: scale(0.97);
  }
  .primary {
    background: var(--n-brand-gradient);
    color: #fff;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  }
  .secondary {
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    border-color: var(--n-border-2);
  }
  .ghost {
    background: transparent;
    color: var(--n-fg-1);
  }
</style>
