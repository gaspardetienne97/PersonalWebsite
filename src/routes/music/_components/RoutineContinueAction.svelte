<script lang="ts">
  import type { DailyRoutineState } from "@repo/music-core/engines/daily-routine";
  import { Button } from "@repo/ui/button";
  import ArrowRight from "lucide-svelte/icons/arrow-right";

  let { routine }: { routine?: DailyRoutineState } = $props();
</script>

{#if routine?.status === "active" && routine.currentStep}
  <div class="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
    <div class="min-w-0 flex-1">
      <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Up next</p>
      <p class="font-semibold">{routine.currentStep.label}</p>
    </div>
    <Button href="/music/routine">
      Continue routine
      <ArrowRight class="size-4" aria-hidden="true" />
    </Button>
  </div>
{:else if routine?.status === "summary"}
  <Button href="/music/routine">
    View routine summary
    <ArrowRight class="size-4" aria-hidden="true" />
  </Button>
{/if}
