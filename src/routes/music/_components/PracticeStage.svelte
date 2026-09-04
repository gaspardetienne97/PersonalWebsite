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
    "relative isolate overflow-hidden rounded-2xl border border-stage-line bg-stage text-stage-foreground shadow-stage stage-grain",
    cls,
  )}
>
  <!-- Hardware panel: one stage light from the top, graph-paper grid, grain (stage-grain utility). -->
  <div
    class="pointer-events-none absolute inset-0 -z-10"
    style="background: radial-gradient(ellipse 70% 45% at 50% -5%, color-mix(in oklab, var(--practice-accent) 22%, transparent), transparent 70%), repeating-linear-gradient(90deg, color-mix(in oklab, var(--stage-line) 18%, transparent) 0 1px, transparent 1px 3.5rem), repeating-linear-gradient(0deg, color-mix(in oklab, var(--stage-line) 12%, transparent) 0 1px, transparent 1px 3.5rem);"
    aria-hidden="true"
  ></div>
  <!-- Identity rail in the instrument hue (identity only, never a verdict). -->
  <div class="pointer-events-none absolute inset-x-6 top-0 h-0.5 rounded-b-sm bg-instr/80" aria-hidden="true"></div>
  {@render children()}
</div>
