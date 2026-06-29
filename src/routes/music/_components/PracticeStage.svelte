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
    "rounded-xl border border-stage-line bg-stage text-stage-foreground",
    cls,
  )}
>
  {@render children()}
</div>
