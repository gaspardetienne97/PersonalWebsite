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
    min-height: 44px;
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
  .btn:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }
  .btn:disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  /* The one primary look: the brand gradient. A thin dark veil over it keeps the white label
     at 4.5:1 from the blue end to the red end (bare, the blue end gives 3.3:1). */
  .primary {
    background:
      linear-gradient(var(--n-primary-veil, rgba(2, 6, 24, 0.2)) 0 0), var(--n-brand-gradient);
    /* From edge to edge, so the border does not show the gradient's other end. */
    background-origin: border-box;
    color: var(--n-on-accent, #fff);
    font-weight: 700;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  }
  .primary:hover {
    filter: brightness(1.12);
  }
  .secondary {
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    border-color: var(--n-border-2);
  }
  .secondary:hover {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
  }
  .ghost {
    background: transparent;
    color: var(--n-fg-1);
  }
  @media (prefers-reduced-motion: reduce) {
    .btn {
      transition: none;
    }
    .btn:active {
      transform: none;
    }
  }
</style>
