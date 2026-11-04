<script lang="ts">
  // A mastery ring: the arc is the share (0 to 1), dashed when there is no figure yet.
  // `stroke` is a colour (a judgement token such as var(--success)); the centre is the caller's.
  import type { Snippet } from "svelte";

  let {
    value,
    stroke = "var(--instr)",
    class: cls = "size-14",
    children,
  }: { value?: number; stroke?: string; class?: string; children?: Snippet } = $props();
</script>

<span class="relative grid shrink-0 place-items-center {cls}">
  <svg viewBox="0 0 36 36" class="absolute inset-0 -rotate-90" aria-hidden="true">
    <circle
      cx="18"
      cy="18"
      r="16"
      fill="none"
      stroke-width={value === undefined ? 2 : 3}
      class={value === undefined ? "stroke-ws-soft/60" : "stroke-ws-raised"}
      stroke-dasharray={value === undefined ? "2 2.2" : undefined}
    />
    {#if value !== undefined && value > 0}
      <circle
        cx="18"
        cy="18"
        r="16"
        fill="none"
        stroke-width="3.5"
        stroke={stroke}
        stroke-linecap="round"
        pathLength="100"
        stroke-dasharray="{Math.max(2, value * 100)} 100"
        class="ws-fill"
      />
    {/if}
  </svg>
  {@render children?.()}
</span>
