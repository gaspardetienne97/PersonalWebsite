<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "@repo/ui/utils";

  // The practice "stage" — the adaptive instrument-panel surface that the
  // interactive visualizers (keyboard, fretboard, staff, sequencer, gauges)
  // render on. Charcoal in dark mode, a soft neutral inset in light mode.
  // `instrument` retints `--instr` for any hue accents in the subtree.
  let {
    instrument,
    class: cls = "",
    children,
  }: {
    instrument?: string;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<div
  data-surface="stage"
  data-instr={instrument}
  class={cn(
    "relative isolate overflow-hidden rounded-xl border border-stage-line bg-stage text-stage-foreground shadow-inner",
    cls,
  )}
>
  <div
    class="pointer-events-none absolute inset-0 -z-10"
    style="background: radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--practice-accent) 14%, transparent), transparent 45%), repeating-linear-gradient(90deg, color-mix(in oklab, var(--stage-line) 18%, transparent) 0 1px, transparent 1px 3.5rem), repeating-linear-gradient(0deg, color-mix(in oklab, var(--stage-line) 12%, transparent) 0 1px, transparent 1px 3.5rem);"
    aria-hidden="true"
  ></div>
  {@render children()}
</div>
