<script lang="ts">
  let { color = "#1291FA", size = 18, active = true }: { color?: string; size?: number; active?: boolean } = $props();
</script>

<div class="eq" style:gap="{size * 0.14}px" style:height="{size}px" aria-hidden="true">
  {#each [0, 1, 2, 3] as bar (bar)}
    <span
      style:width="{size * 0.16}px"
      style:background={color}
      style:height={active ? "40%" : "30%"}
      style:animation={active ? `n-eq 900ms ${bar * 130}ms ease-in-out infinite alternate` : "none"}
    ></span>
  {/each}
</div>

<style>
  .eq {
    display: flex;
    align-items: flex-end;
  }
  .eq span {
    border-radius: 999px;
  }
</style>
