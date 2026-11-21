<script lang="ts">
  let {
    color = "var(--n-accent-app)",
    size = 18,
    active = true,
  }: { color?: string; size?: number; active?: boolean } = $props();

  // Where each bar rests when nothing moves: paused, or with reduced motion.
  const REST = [45, 85, 60, 30];
</script>

<div class="eq" style:gap="{size * 0.14}px" style:height="{size}px" aria-hidden="true">
  {#each REST as rest, bar (bar)}
    <span
      class:moving={active}
      style:width="{size * 0.16}px"
      style:background={color}
      style:height="{rest}%"
      style:animation-delay="{bar * 130}ms"
    ></span>
  {/each}
</div>

<style>
  .eq {
    display: flex;
    align-items: flex-end;
    flex-shrink: 0;
  }
  .eq span {
    border-radius: 999px;
  }
  .moving {
    animation: n-eq 900ms ease-in-out infinite alternate;
  }
  /* The bars stay, as a still mark. */
  @media (prefers-reduced-motion: reduce) {
    .moving {
      animation: none;
    }
  }
</style>
