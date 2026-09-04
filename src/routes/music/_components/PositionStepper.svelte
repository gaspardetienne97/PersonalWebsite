<script lang="ts">
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";

  import { Button } from "@repo/ui/button";

  // Step through the generated positions of one chord: "Position 2 of 4 ·
  // Barre at fret 3 · frets 2 to 6". Real buttons, one group, disabled at the ends.
  let {
    label = "Position",
    index,
    count,
    detail,
    disabled = false,
    onChange,
  }: {
    label?: string;
    /** Zero-based. */
    index: number;
    count: number;
    detail?: string;
    disabled?: boolean;
    onChange: (index: number) => void;
  } = $props();
</script>

<div class="grid gap-2">
  <p class="text-sm font-medium">{label}</p>
  <div
    role="group"
    aria-label={label}
    class="inline-flex items-center gap-1 rounded-lg border bg-card p-1"
    data-testid="position-stepper"
  >
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="size-8"
      aria-label="Previous position"
      disabled={disabled || index <= 0}
      onclick={() => onChange(index - 1)}
    >
      <ChevronLeft class="size-4" aria-hidden="true" />
    </Button>
    <span class="min-w-40 px-2 text-sm tabular-nums" aria-live="polite">
      <span class="font-semibold">Position {index + 1} of {count}</span>
      {#if detail}<span class="text-muted-foreground"> · {detail}</span>{/if}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="size-8"
      aria-label="Next position"
      disabled={disabled || index >= count - 1}
      onclick={() => onChange(index + 1)}
    >
      <ChevronRight class="size-4" aria-hidden="true" />
    </Button>
  </div>
</div>
